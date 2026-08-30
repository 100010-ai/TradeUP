import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "tradeup_admin";

function configuredKey() {
  return process.env.ADMIN_PANEL_KEY?.trim() ?? "";
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function adminIsConfigured() {
  return configuredKey().length >= 16;
}

export function verifyAdminKey(candidate: string) {
  const key = configuredKey();
  return key.length >= 16 && safeEqual(candidate, key);
}

export function adminSessionToken() {
  const key = configuredKey();
  if (!key) return "";
  return createHmac("sha256", key).update("tradeup-admin-session-v1").digest("hex");
}

export async function hasAdminSession() {
  if (!adminIsConfigured()) return false;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value ?? "";
  const expected = adminSessionToken();
  return Boolean(token && expected && safeEqual(token, expected));
}
