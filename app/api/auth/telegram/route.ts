import { NextResponse } from "next/server";
import { verifyTelegramInitData } from "@/lib/telegram/verify-init-data";

export const runtime = "nodejs";

type SyncedProfile = {
  id: string;
  username: string | null;
  first_name: string;
  photo_url: string | null;
  balance: number | string;
  rating: number;
  deals_count: number;
  is_online: boolean;
  last_seen_at: string;
};

async function syncProfile(initData: string, botId: string): Promise<SyncedProfile | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/telegram-profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ initData, botId }),
      cache: "no-store",
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      ok?: boolean;
      profile?: SyncedProfile;
    };

    return payload.ok && payload.profile ? payload.profile : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return NextResponse.json(
      { ok: false, error: "telegram_auth_not_configured" },
      { status: 503 },
    );
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

  const verified = verifyTelegramInitData(initData, botToken);

  if (!verified.ok) {
    return NextResponse.json(
      { ok: false, error: "telegram_auth_failed", reason: verified.reason },
      { status: 401 },
    );
  }

  const botId = botToken.split(":", 1)[0];
  const profile = /^\d+$/.test(botId) ? await syncProfile(initData, botId) : null;

  return NextResponse.json(
    {
      ok: true,
      user: verified.user,
      profile,
      profileSynced: profile !== null,
      authDate: verified.authDate,
      startParam: verified.startParam,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
