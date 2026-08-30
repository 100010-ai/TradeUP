import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { validateTelegramRequest } from "@/lib/telegram/server-game";

export const runtime = "nodejs";

const allowedActions = new Set([
  "threads", "start_thread", "open_thread", "send_message", "mark_read",
  "open_system_chat", "support_choose_topic", "support_request_human", "support_send_message",
]);

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] ?? char));
}

async function notifySupportCall(request: Request, result: Record<string, unknown>, botToken: string) {
  if (result.shouldNotify !== true || typeof result.ticketId !== "string") return;
  const adminChatId = process.env.ADMIN_TELEGRAM_ID?.trim();
  if (!adminChatId) return;
  const requester = typeof result.requester === "object" && result.requester !== null ? result.requester as Record<string, unknown> : {};
  const name = escapeHtml(requester.firstName || "Пользователь");
  const username = requester.username ? ` @${escapeHtml(requester.username)}` : "";
  const adminUrl = new URL("/admin", request.url);
  adminUrl.searchParams.set("ticket", result.ticketId);
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: adminChatId,
        text: `<b>TradeUP Support</b>\n${name}${username} вызвал поддержку.`,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [[{ text: "Открыть обращение", url: adminUrl.toString() }]] },
      }),
      cache: "no-store",
    });
  } catch {
    // Ticket remains queued even when Telegram notification delivery fails.
  }
}

export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!botToken) return NextResponse.json({ ok: false, error: "telegram_auth_not_configured" }, { status: 503 });
  if (!supabaseUrl) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (typeof body !== "object" || body === null) return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });

  const parsed = body as { initData?: unknown; action?: unknown; payload?: unknown };
  if (typeof parsed.initData !== "string" || !parsed.initData || parsed.initData.length > 16384 || typeof parsed.action !== "string" || !allowedActions.has(parsed.action)) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const verified = validateTelegramRequest(parsed.initData, botToken);
  if (!verified.ok) return NextResponse.json({ ok: false, error: "telegram_auth_failed", reason: verified.reason }, { status: 401 });

  const telegramSecret = createHmac("sha256", "WebAppData").update(botToken).digest("hex");
  const payload = typeof parsed.payload === "object" && parsed.payload !== null ? parsed.payload as Record<string, unknown> : {};

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/telegram-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-TradeUP-Telegram-Secret": telegramSecret },
      body: JSON.stringify({ initData: parsed.initData, action: parsed.action, payload }),
      cache: "no-store",
    });
    const raw = await response.text();
    let result: Record<string, unknown>;
    try { result = raw ? JSON.parse(raw) as Record<string, unknown> : { ok: false, error: "empty_chat_response" }; }
    catch { result = { ok: false, error: "invalid_chat_response" }; }

    if (response.ok && result.ok && parsed.action === "support_request_human") {
      await notifySupportCall(request, result, botToken);
    }

    return NextResponse.json(result, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "chat_service_unavailable" }, { status: 502 });
  }
}
