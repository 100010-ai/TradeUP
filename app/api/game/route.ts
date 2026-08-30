import { NextResponse } from "next/server";
import { forwardTelegramGame, validateTelegramRequest } from "@/lib/telegram/server-game";

export const runtime = "nodejs";

const allowedActions = new Set([
  "inventory",
  "favorites",
  "deals",
  "offers",
  "create_listing",
  "cancel_listing",
  "toggle_favorite",
  "buy_listing",
  "create_offer",
  "cancel_offer",
  "respond_offer",
]);

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

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const requestBody = body as { initData?: unknown; action?: unknown; payload?: unknown };
  if (
    typeof requestBody.initData !== "string" ||
    requestBody.initData.length === 0 ||
    requestBody.initData.length > 16_384 ||
    typeof requestBody.action !== "string" ||
    !allowedActions.has(requestBody.action)
  ) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const verified = validateTelegramRequest(requestBody.initData, botToken);
  if (!verified.ok) {
    return NextResponse.json(
      { ok: false, error: "telegram_auth_failed", reason: verified.reason },
      { status: 401 },
    );
  }

  const payload =
    typeof requestBody.payload === "object" && requestBody.payload !== null
      ? (requestBody.payload as Record<string, unknown>)
      : {};

  const game = await forwardTelegramGame(
    requestBody.initData,
    requestBody.action,
    payload,
    botToken,
  );

  return NextResponse.json(game.body, {
    status: game.status,
    headers: { "Cache-Control": "no-store" },
  });
}
