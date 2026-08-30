import { createHmac } from "node:crypto";
import { verifyTelegramInitData } from "@/lib/telegram/verify-init-data";

export type ForwardedGameResult = {
  status: number;
  body: Record<string, unknown>;
};

export function validateTelegramRequest(initData: string, botToken: string) {
  return verifyTelegramInitData(initData, botToken);
}

export async function forwardTelegramGame(
  initData: string,
  action: string,
  payload: Record<string, unknown>,
  botToken: string,
): Promise<ForwardedGameResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return { status: 503, body: { ok: false, error: "supabase_not_configured" } };
  }

  const telegramSecret = createHmac("sha256", "WebAppData").update(botToken).digest("hex");

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/telegram-game`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TradeUP-Telegram-Secret": telegramSecret,
      },
      body: JSON.stringify({ initData, action, payload }),
      cache: "no-store",
    });

    const raw = await response.text();
    let body: Record<string, unknown>;
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : { ok: false, error: "empty_game_response" };
    } catch {
      body = { ok: false, error: "invalid_game_response" };
    }

    return { status: response.status, body };
  } catch {
    return { status: 502, body: { ok: false, error: "game_service_unavailable" } };
  }
}
