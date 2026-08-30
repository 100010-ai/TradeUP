import { createHmac, timingSafeEqual } from "node:crypto";

export type VerifiedTelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
  photo_url?: string;
};

type VerifyResult =
  | {
      ok: true;
      authDate: number;
      user: VerifiedTelegramUser;
      queryId: string | null;
      startParam: string | null;
    }
  | {
      ok: false;
      reason: "missing_hash" | "invalid_hash" | "missing_auth_date" | "expired" | "missing_user" | "invalid_user";
    };

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 60 * 60,
): VerifyResult {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");

  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    return { ok: false, reason: "missing_hash" };
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const receivedHashBuffer = Buffer.from(receivedHash, "hex");

  if (
    receivedHashBuffer.length !== calculatedHash.length ||
    !timingSafeEqual(receivedHashBuffer, calculatedHash)
  ) {
    return { ok: false, reason: "invalid_hash" };
  }

  const authDateRaw = params.get("auth_date");
  const authDate = authDateRaw ? Number(authDateRaw) : Number.NaN;

  if (!Number.isInteger(authDate)) {
    return { ok: false, reason: "missing_auth_date" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (authDate > now + 30 || now - authDate > maxAgeSeconds) {
    return { ok: false, reason: "expired" };
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    return { ok: false, reason: "missing_user" };
  }

  try {
    const user = JSON.parse(userRaw) as Partial<VerifiedTelegramUser>;

    if (
      typeof user.id !== "number" ||
      !Number.isSafeInteger(user.id) ||
      typeof user.first_name !== "string" ||
      user.first_name.length === 0
    ) {
      return { ok: false, reason: "invalid_user" };
    }

    return {
      ok: true,
      authDate,
      user: user as VerifiedTelegramUser,
      queryId: params.get("query_id"),
      startParam: params.get("start_param"),
    };
  } catch {
    return { ok: false, reason: "invalid_user" };
  }
}
