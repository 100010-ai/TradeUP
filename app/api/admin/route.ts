import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function asNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(request: Request) {
  if (!(await hasAdminSession())) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "admin_database_not_configured" }, { status: 503 });

  const url = new URL(request.url);
  const ticketId = url.searchParams.get("ticketId");
  if (ticketId) {
    const [ticketResult, messagesResult, topicsResult] = await Promise.all([
      db.from("support_tickets").select("id,user_id,topic_id,status,last_message_at,last_message_preview,last_sender_type,requested_at,joined_at,closed_at,created_at,updated_at,profiles!support_tickets_user_id_fkey(id,telegram_id,first_name,username,photo_url)").eq("id", ticketId).maybeSingle(),
      db.from("support_messages").select("id,ticket_id,sender_type,body,created_at").eq("ticket_id", ticketId).order("created_at", { ascending: true }).limit(1000),
      db.from("support_topics").select("id,title,auto_reply,sort_order,is_active").order("sort_order"),
    ]);
    if (ticketResult.error || messagesResult.error || topicsResult.error) return NextResponse.json({ ok: false, error: "admin_support_load_failed" }, { status: 500 });
    if (!ticketResult.data) return NextResponse.json({ ok: false, error: "ticket_not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, ticket: ticketResult.data, messages: messagesResult.data ?? [], topics: topicsResult.data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const onlineSince = new Date(Date.now() - 5 * 60_000).toISOString();
  const [usersCount, onlineCount, activeListingsCount, tradesCount, waitingCount, activeCount, profilesResult, ticketsResult, announcementsResult, topicsResult, tradeRowsResult] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("profiles").select("id", { count: "exact", head: true }).gte("last_seen_at", onlineSince),
    db.from("listings").select("id", { count: "exact", head: true }).eq("status", "active"),
    db.from("trades").select("id", { count: "exact", head: true }),
    db.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "waiting"),
    db.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "active"),
    db.from("profiles").select("id,telegram_id,first_name,username,photo_url,balance,rating,deals_count,total_profit,created_at,last_seen_at").order("created_at", { ascending: false }).limit(100),
    db.from("support_tickets").select("id,user_id,topic_id,status,last_message_at,last_message_preview,last_sender_type,requested_at,joined_at,created_at,updated_at,profiles!support_tickets_user_id_fkey(id,telegram_id,first_name,username,photo_url)").order("updated_at", { ascending: false }).limit(100),
    db.from("tradeup_announcements").select("id,body,is_active,published_at,created_at").order("published_at", { ascending: false }).limit(100),
    db.from("support_topics").select("id,title,auto_reply,sort_order,is_active").order("sort_order"),
    db.from("trades").select("amount,fee,seller_profit,completed_at").order("completed_at", { ascending: false }).limit(5000),
  ]);

  const fatal = [profilesResult.error, ticketsResult.error, announcementsResult.error, topicsResult.error, tradeRowsResult.error].find(Boolean);
  if (fatal) return NextResponse.json({ ok: false, error: "admin_dashboard_load_failed" }, { status: 500 });

  const tradeRows = tradeRowsResult.data ?? [];
  const volume = tradeRows.reduce((sum, row) => sum + asNumber(row.amount), 0);
  const fees = tradeRows.reduce((sum, row) => sum + asNumber(row.fee), 0);
  const profit = tradeRows.reduce((sum, row) => sum + asNumber(row.seller_profit), 0);

  return NextResponse.json({
    ok: true,
    stats: {
      users: usersCount.count ?? 0,
      online: onlineCount.count ?? 0,
      activeListings: activeListingsCount.count ?? 0,
      trades: tradesCount.count ?? 0,
      volume,
      fees,
      sellerProfit: profit,
      waitingSupport: waitingCount.count ?? 0,
      activeSupport: activeCount.count ?? 0,
    },
    users: profilesResult.data ?? [],
    tickets: ticketsResult.data ?? [],
    announcements: announcementsResult.data ?? [],
    topics: topicsResult.data ?? [],
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await hasAdminSession())) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "admin_database_not_configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "publish_announcement") {
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text || text.length > 4000) return NextResponse.json({ ok: false, error: "invalid_message" }, { status: 400 });
    const result = await db.from("tradeup_announcements").insert({ body: text, is_active: true }).select("id,body,is_active,published_at,created_at").single();
    if (result.error) return NextResponse.json({ ok: false, error: "announcement_publish_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, announcement: result.data });
  }

  if (action === "set_announcement_active") {
    const id = typeof body.id === "string" ? body.id : "";
    const isActive = body.isActive === true;
    if (!id) return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    const result = await db.from("tradeup_announcements").update({ is_active: isActive }).eq("id", id);
    if (result.error) return NextResponse.json({ ok: false, error: "announcement_update_failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "join_support") {
    const ticketId = typeof body.ticketId === "string" ? body.ticketId : "";
    if (!ticketId) return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    const current = await db.from("support_tickets").select("id,status").eq("id", ticketId).maybeSingle();
    if (current.error || !current.data) return NextResponse.json({ ok: false, error: "ticket_not_found" }, { status: 404 });
    if (current.data.status === "closed") return NextResponse.json({ ok: false, error: "ticket_closed" }, { status: 409 });
    if (current.data.status !== "active") {
      const now = new Date().toISOString();
      const update = await db.from("support_tickets").update({ status: "active", joined_at: now, admin_read_at: now, updated_at: now }).eq("id", ticketId);
      if (update.error) return NextResponse.json({ ok: false, error: "ticket_update_failed" }, { status: 500 });
      const message = await db.from("support_messages").insert({ ticket_id: ticketId, sender_type: "system", body: "Поддержка подключилась к чату." });
      if (message.error) return NextResponse.json({ ok: false, error: "support_message_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "send_support") {
    const ticketId = typeof body.ticketId === "string" ? body.ticketId : "";
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!ticketId || !text || text.length > 2000) return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    const current = await db.from("support_tickets").select("id,status").eq("id", ticketId).maybeSingle();
    if (current.error || !current.data) return NextResponse.json({ ok: false, error: "ticket_not_found" }, { status: 404 });
    if (current.data.status === "closed") return NextResponse.json({ ok: false, error: "ticket_closed" }, { status: 409 });
    if (current.data.status !== "active") {
      const now = new Date().toISOString();
      const update = await db.from("support_tickets").update({ status: "active", joined_at: now, admin_read_at: now, updated_at: now }).eq("id", ticketId);
      if (update.error) return NextResponse.json({ ok: false, error: "ticket_update_failed" }, { status: 500 });
      await db.from("support_messages").insert({ ticket_id: ticketId, sender_type: "system", body: "Поддержка подключилась к чату." });
    }
    const result = await db.from("support_messages").insert({ ticket_id: ticketId, sender_type: "admin", body: text }).select("id,ticket_id,sender_type,body,created_at").single();
    if (result.error) return NextResponse.json({ ok: false, error: "support_message_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, message: result.data });
  }

  if (action === "close_support") {
    const ticketId = typeof body.ticketId === "string" ? body.ticketId : "";
    if (!ticketId) return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    const now = new Date().toISOString();
    const update = await db.from("support_tickets").update({ status: "closed", closed_at: now, updated_at: now }).eq("id", ticketId);
    if (update.error) return NextResponse.json({ ok: false, error: "ticket_update_failed" }, { status: 500 });
    await db.from("support_messages").insert({ ticket_id: ticketId, sender_type: "system", body: "Обращение закрыто. Если появится новый вопрос, выбери тему заново." });
    return NextResponse.json({ ok: true });
  }

  if (action === "update_topic") {
    const id = typeof body.id === "string" ? body.id : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const autoReply = typeof body.autoReply === "string" ? body.autoReply.trim() : "";
    const isActive = body.isActive !== false;
    if (!id || !title || !autoReply || title.length > 80 || autoReply.length > 2000) return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    const update = await db.from("support_topics").update({ title, auto_reply: autoReply, is_active: isActive, updated_at: new Date().toISOString() }).eq("id", id);
    if (update.error) return NextResponse.json({ ok: false, error: "topic_update_failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
}
