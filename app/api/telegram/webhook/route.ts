import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Update = {
  pre_checkout_query?: { id?: string; from?: { id?: number }; currency?: string; total_amount?: number; invoice_payload?: string };
  message?: {
    from?: { id?: number };
    chat?: { id?: number };
    text?: string;
    successful_payment?: { currency?: string; total_amount?: number; invoice_payload?: string; telegram_payment_charge_id?: string };
  };
};

type EdgeResult = Record<string, unknown> & { ok?: boolean; error?: string };

function serverSecret(botToken: string) { return createHmac("sha256", "WebAppData").update(botToken).digest("hex"); }
function expectedWebhookSecret(botToken: string) { return createHmac("sha256", "TradeUPStarsWebhook").update(botToken).digest("hex"); }

async function edgeCall(botToken: string, action: string, payload: Record<string, unknown>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return { status: 503, body: { ok: false, error: "supabase_not_configured" } as EdgeResult };
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/telegram-store`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-TradeUP-Telegram-Secret": serverSecret(botToken) },
      body: JSON.stringify({ action, payload }),
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

async function botCall(botToken: string, method: string, payload: Record<string, unknown>) {
  await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
}

export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return NextResponse.json({ ok: false }, { status: 503 });
  const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (receivedSecret !== expectedWebhookSecret(botToken)) return NextResponse.json({ ok: false }, { status: 401 });

  let update: Update;
  try { update = await request.json() as Update; } catch { return NextResponse.json({ ok: true }); }

  const checkout = update.pre_checkout_query;
  if (checkout?.id) {
    const invoicePayload = checkout.invoice_payload ?? "";
    const telegramUserId = Number(checkout.from?.id);
    const starsAmount = Number(checkout.total_amount);
    const currencyOk = checkout.currency === "XTR";
    const validation = currencyOk && invoicePayload && Number.isSafeInteger(telegramUserId) && Number.isInteger(starsAmount)
      ? await edgeCall(botToken, "server_validate_precheckout", { invoicePayload, telegramUserId, starsAmount })
      : { body: { ok: false } as EdgeResult };
    await botCall(botToken, "answerPreCheckoutQuery", validation.body.ok
      ? { pre_checkout_query_id: checkout.id, ok: true }
      : { pre_checkout_query_id: checkout.id, ok: false, error_message: "Покупка недоступна. Обнови магазин TradeUP и попробуй ещё раз." });
    return NextResponse.json({ ok: true });
  }

  const payment = update.message?.successful_payment;
  if (payment && payment.currency === "XTR") {
    const invoicePayload = payment.invoice_payload ?? "";
    const telegramUserId = Number(update.message?.from?.id ?? update.message?.chat?.id);
    const starsAmount = Number(payment.total_amount);
    const chargeId = payment.telegram_payment_charge_id ?? "";
    if (invoicePayload && chargeId && Number.isSafeInteger(telegramUserId) && Number.isInteger(starsAmount)) {
      const confirmed = await edgeCall(botToken, "server_confirm_purchase", { invoicePayload, telegramUserId, starsAmount, chargeId });
      if (confirmed.body.ok) {
        await botCall(botToken, "sendMessage", {
          chat_id: telegramUserId,
          text: "Покупка в TradeUP подтверждена. Косметика уже добавлена в твою коллекцию.",
          reply_markup: { inline_keyboard: [[{ text: "Открыть оформление", web_app: { url: new URL("/store", request.url).toString() } }]] },
        });
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (update.message?.text?.startsWith("/start") && update.message.chat?.id) {
    await botCall(botToken, "sendMessage", {
      chat_id: update.message.chat.id,
      text: "TradeUP открыт. Покупай дешевле, продавай дороже и собирай свой профиль.",
      reply_markup: { inline_keyboard: [[{ text: "Открыть TradeUP", web_app: { url: new URL("/", request.url).toString() } }]] },
    });
  }

  return NextResponse.json({ ok: true });
}
