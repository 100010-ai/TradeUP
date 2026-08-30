import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { validateTelegramRequest } from "@/lib/telegram/server-game";

export const runtime = "nodejs";

const clientActions = new Set(["list", "prepare_purchase", "purchase_status", "confirm_purchase", "equip"]);

type EdgeResult = Record<string, unknown> & { ok?: boolean; error?: string };
type StarTransaction = {
  id?: string;
  amount?: number;
  source?: {
    type?: string;
    transaction_type?: string;
    invoice_payload?: string;
    user?: { id?: number };
  };
};

function telegramSecret(botToken: string) {
  return createHmac("sha256", "WebAppData").update(botToken).digest("hex");
}
function webhookSecret(botToken: string) {
  return createHmac("sha256", "TradeUPStarsWebhook").update(botToken).digest("hex");
}

async function edgeCall(botToken: string, action: string, initData: string | null, payload: Record<string, unknown> = {}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return { status: 503, body: { ok: false, error: "supabase_not_configured" } as EdgeResult };
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/telegram-store`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-TradeUP-Telegram-Secret": telegramSecret(botToken) },
      body: JSON.stringify({ ...(initData ? { initData } : {}), action, payload }),
      cache: "no-store",
    });
    const raw = await response.text();
    let body: EdgeResult;
    try { body = raw ? JSON.parse(raw) as EdgeResult : { ok: false, error: "empty_store_response" }; }
    catch { body = { ok: false, error: "invalid_store_response" }; }
    return { status: response.status, body };
  } catch {
    return { status: 502, body: { ok: false, error: "store_service_unavailable" } as EdgeResult };
  }
}

async function botCall<T = Record<string, unknown>>(botToken: string, method: string, payload: Record<string, unknown> = {}) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data = await response.json() as { ok?: boolean; result?: T; description?: string };
  if (!response.ok || !data.ok) throw new Error(data.description ?? `telegram_${method}_failed`);
  return data.result as T;
}

async function ensurePaymentWebhook(request: Request, botToken: string) {
  const desiredUrl = new URL("/api/telegram/webhook", request.url).toString();
  try {
    const info = await botCall<{ url?: string }>(botToken, "getWebhookInfo");
    const current = info?.url ?? "";
    if (!current) {
      await botCall(botToken, "setWebhook", {
        url: desiredUrl,
        secret_token: webhookSecret(botToken),
        allowed_updates: ["message", "pre_checkout_query"],
        drop_pending_updates: false,
      });
      return { ready: true, installed: true };
    }
    if (current === desiredUrl) return { ready: true, installed: false };
    return { ready: false, conflict: true, current };
  } catch {
    return { ready: false, conflict: false };
  }
}

async function findSettledTransaction(botToken: string, invoicePayload: string, telegramUserId: number, amount: number) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await botCall<{ transactions?: StarTransaction[] }>(botToken, "getStarTransactions", { offset: 0, limit: 100 });
    const match = (result.transactions ?? []).find((transaction) =>
      Number(transaction.amount) === amount &&
      transaction.source?.type === "user" &&
      transaction.source?.transaction_type === "invoice_payment" &&
      transaction.source?.invoice_payload === invoicePayload &&
      Number(transaction.source?.user?.id) === telegramUserId &&
      typeof transaction.id === "string"
    );
    if (match?.id) return match;
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 450));
  }
  return null;
}

export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return NextResponse.json({ ok: false, error: "telegram_auth_not_configured" }, { status: 503 });

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (typeof raw !== "object" || raw === null) return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  const body = raw as { initData?: unknown; action?: unknown; payload?: unknown };
  if (typeof body.initData !== "string" || !body.initData || typeof body.action !== "string" || !clientActions.has(body.action)) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }
  const verified = validateTelegramRequest(body.initData, botToken);
  if (!verified.ok) return NextResponse.json({ ok: false, error: "telegram_auth_failed", reason: verified.reason }, { status: 401 });
  const payload = typeof body.payload === "object" && body.payload !== null ? body.payload as Record<string, unknown> : {};

  if (body.action === "prepare_purchase") {
    const prepared = await edgeCall(botToken, "prepare_purchase", body.initData, payload);
    if (!prepared.body.ok) return NextResponse.json(prepared.body, { status: prepared.status });
    const starsAmount = Number(prepared.body.starsAmount);
    const invoicePayload = typeof prepared.body.invoicePayload === "string" ? prepared.body.invoicePayload : "";
    const title = typeof prepared.body.title === "string" ? prepared.body.title.slice(0, 32) : "TradeUP Cosmetic";
    const description = typeof prepared.body.description === "string" ? prepared.body.description.slice(0, 255) : "TradeUP cosmetic";
    if (!invoicePayload || !Number.isInteger(starsAmount) || starsAmount <= 0) {
      return NextResponse.json({ ok: false, error: "invalid_purchase_state" }, { status: 500 });
    }

    const webhook = await ensurePaymentWebhook(request, botToken);
    if (!webhook.ready && webhook.conflict) {
      return NextResponse.json({ ok: false, error: "payment_webhook_conflict" }, { status: 409 });
    }

    try {
      const invoiceLink = await botCall<string>(botToken, "createInvoiceLink", {
        title,
        description,
        payload: invoicePayload,
        currency: "XTR",
        prices: [{ label: title, amount: starsAmount }],
      });
      return NextResponse.json({ ...prepared.body, invoiceLink });
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "invoice_create_failed" }, { status: 502 });
    }
  }

  if (body.action === "confirm_purchase") {
    const purchaseId = typeof payload.purchaseId === "string" ? payload.purchaseId : "";
    if (!purchaseId) return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    const state = await edgeCall(botToken, "purchase_status", body.initData, { purchaseId });
    if (!state.body.ok) return NextResponse.json(state.body, { status: state.status });
    const purchase = typeof state.body.purchase === "object" && state.body.purchase !== null ? state.body.purchase as Record<string, unknown> : {};
    if (purchase.status === "paid") return NextResponse.json({ ok: true, paid: true, cosmeticId: purchase.cosmetic_id });
    const invoicePayload = typeof purchase.invoice_payload === "string" ? purchase.invoice_payload : "";
    const starsAmount = Number(purchase.stars_amount);
    if (!invoicePayload || !Number.isInteger(starsAmount)) return NextResponse.json({ ok: false, error: "invalid_purchase_state" }, { status: 500 });
    try {
      const transaction = await findSettledTransaction(botToken, invoicePayload, verified.user.id, starsAmount);
      if (!transaction?.id) return NextResponse.json({ ok: false, error: "payment_not_settled" }, { status: 409 });
      const confirmed = await edgeCall(botToken, "server_confirm_purchase", null, {
        invoicePayload,
        chargeId: transaction.id,
        telegramUserId: verified.user.id,
        starsAmount,
      });
      return NextResponse.json(confirmed.body, { status: confirmed.status });
    } catch {
      return NextResponse.json({ ok: false, error: "payment_confirmation_failed" }, { status: 502 });
    }
  }

  const forwarded = await edgeCall(botToken, body.action, body.initData, payload);
  return NextResponse.json(forwarded.body, { status: forwarded.status, headers: { "Cache-Control": "no-store" } });
}
