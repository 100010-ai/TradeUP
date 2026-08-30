import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, adminIsConfigured, adminSessionToken, hasAdminSession, verifyAdminKey } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ configured: adminIsConfigured(), authenticated: await hasAdminSession() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!adminIsConfigured()) return NextResponse.json({ ok: false, error: "admin_not_configured" }, { status: 503 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const key = typeof body === "object" && body !== null && typeof (body as { key?: unknown }).key === "string" ? (body as { key: string }).key : "";
  if (!key || key.length > 512 || !verifyAdminKey(key)) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return NextResponse.json({ ok: false, error: "invalid_admin_key" }, { status: 401 });
  }
  const store = await cookies();
  store.set(ADMIN_COOKIE, adminSessionToken(), { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 60 * 60 * 12 });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const store = await cookies();
  store.set(ADMIN_COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  return NextResponse.json({ ok: true });
}
