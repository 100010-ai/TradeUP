import { NextResponse } from "next/server";
import { forwardTelegramGame, validateTelegramRequest } from "@/lib/telegram/server-game";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ ok: false, error: "telegram_auth_not_configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const initData =
    typeof body === "object" && body !== null && "initData" in body
      ? (body as { initData?: unknown }).initData
      : null;

  if (typeof initData !== "string" || initData.length === 0 || initData.length > 16_384) {
    return NextResponse.json({ ok: false, error: "invalid_init_data" }, { status: 400 });
  }

  const verified = validateTelegramRequest(initData, botToken);
  if (!verified.ok) {
    return NextResponse.json(
      { ok: false, error: "telegram_auth_failed", reason: verified.reason },
      { status: 401 },
    );
  }

  const game = await forwardTelegramGame(initData, "bootstrap", {}, botToken);
  return NextResponse.json(game.body, {
    status: game.status,
    headers: { "Cache-Control": "no-store" },
  });
}
