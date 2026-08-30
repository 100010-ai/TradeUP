"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/icon";

type Stats = { users: number; online: number; activeListings: number; trades: number; volume: number; fees: number; sellerProfit: number; waitingSupport: number; activeSupport: number };
type Profile = { id: string; telegram_id: number | string; first_name: string; username: string | null; photo_url: string | null; balance: number | string; rating: number; deals_count: number; total_profit: number | string; created_at: string; last_seen_at: string };
type TicketProfile = { id: string; telegram_id: number | string; first_name: string; username: string | null; photo_url: string | null };
type Ticket = { id: string; user_id: string; topic_id: string | null; status: string; last_message_at: string | null; last_message_preview: string; last_sender_type: string | null; requested_at: string | null; joined_at: string | null; created_at: string; updated_at: string; profiles?: TicketProfile | TicketProfile[] | null };
type Announcement = { id: string; body: string; is_active: boolean; published_at: string; created_at: string };
type Topic = { id: string; title: string; auto_reply: string; sort_order: number; is_active: boolean };
type SupportMessage = { id: string; sender_type: string; body: string; created_at: string };
type Overview = { ok: boolean; stats: Stats; users: Profile[]; tickets: Ticket[]; announcements: Announcement[]; topics: Topic[] };
type TicketDetail = { ok: boolean; ticket: Ticket; messages: SupportMessage[]; topics: Topic[] };

type Tab = "overview" | "support" | "tradeup" | "users";

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
function rub(value: number | string) { return `${money.format(Number(value) || 0)} ₽`; }
function date(value: string | null) { return value ? new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""; }
function profileOf(ticket: Ticket) { return Array.isArray(ticket.profiles) ? ticket.profiles[0] ?? null : ticket.profiles ?? null; }
function statusLabel(status: string) { return status === "waiting" ? "Ждёт" : status === "active" ? "В работе" : status === "closed" ? "Закрыто" : "Бот"; }

function TopicEditor({ topic, onSaved }: { topic: Topic; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(topic.title);
  const [reply, setReply] = useState(topic.auto_reply);
  const [active, setActive] = useState(topic.is_active);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_topic", id: topic.id, title, autoReply: reply, isActive: active }) });
      if (!response.ok) throw new Error();
      await onSaved();
    } finally { setSaving(false); }
  }
  return <div className="adminTopic"><div className="adminTopicHead"><input value={title} onChange={(e) => setTitle(e.target.value)}/><label><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}/>Активен</label></div><textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3}/><button onClick={() => void save()} disabled={saving}>{saving ? "Сохраняем" : "Сохранить"}</button></div>;
}

export default function AdminDashboard() {
  const [checking, setChecking] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [key, setKey] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [supportText, setSupportText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkAuth() {
    const response = await fetch("/api/admin/auth", { cache: "no-store" });
    const data = await response.json() as { configured?: boolean; authenticated?: boolean };
    setConfigured(data.configured !== false); setAuthed(data.authenticated === true); setChecking(false);
    return data.authenticated === true;
  }

  async function loadOverview() {
    const response = await fetch("/api/admin", { cache: "no-store" });
    if (response.status === 401) { setAuthed(false); return; }
    const data = await response.json() as Overview & { error?: string };
    if (!response.ok || !data.ok) throw new Error(data.error ?? "load_failed");
    setOverview(data); setError(null);
  }

  async function loadTicket(id: string) {
    const response = await fetch(`/api/admin?ticketId=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json() as TicketDetail & { error?: string };
    if (!response.ok || !data.ok) throw new Error(data.error ?? "ticket_load_failed");
    setDetail(data);
  }

  useEffect(() => { void checkAuth().then((ok) => { if (ok) void loadOverview(); }); }, []);
  useEffect(() => {
    if (!authed) return;
    const fromUrl = new URLSearchParams(window.location.search).get("ticket");
    if (fromUrl) { setTab("support"); setSelectedTicket(fromUrl); void loadTicket(fromUrl); }
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") { void loadOverview(); if (selectedTicket) void loadTicket(selectedTicket); } }, 8000);
    return () => window.clearInterval(timer);
  }, [authed, selectedTicket]);

  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const response = await fetch("/api/admin/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "login_failed");
      setAuthed(true); setKey(""); await loadOverview();
    } catch { setError("Неверный ключ"); }
    finally { setBusy(false); }
  }

  async function logout() { await fetch("/api/admin/auth", { method: "DELETE" }); setAuthed(false); setOverview(null); setDetail(null); }

  async function action(payload: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "action_failed");
      await loadOverview(); if (selectedTicket) await loadTicket(selectedTicket);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "action_failed"); }
    finally { setBusy(false); }
  }

  async function publish(event: React.FormEvent) {
    event.preventDefault(); const text = announcement.trim(); if (!text) return;
    await action({ action: "publish_announcement", body: text }); setAnnouncement("");
  }

  async function sendSupport(event: React.FormEvent) {
    event.preventDefault(); const text = supportText.trim(); if (!text || !selectedTicket) return;
    await action({ action: "send_support", ticketId: selectedTicket, body: text }); setSupportText("");
  }

  const tickets = overview?.tickets ?? [];
  const queue = useMemo(() => [...tickets].sort((a, b) => {
    const rank = (s: string) => s === "waiting" ? 0 : s === "active" ? 1 : s === "bot" ? 2 : 3;
    return rank(a.status) - rank(b.status) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  }), [tickets]);

  if (checking) return <main className="adminLogin"><div className="adminLoginBox"><strong>TradeUP Admin</strong><span>Проверка сессии</span></div></main>;
  if (!configured) return <main className="adminLogin"><div className="adminLoginBox"><strong>ADMIN_PANEL_KEY не настроен</strong><span>Добавь ключ в Environment Variables Vercel.</span></div></main>;
  if (!authed) return <main className="adminLogin"><form className="adminLoginBox" onSubmit={login}><div className="adminMark">TU</div><h1>TradeUP Admin</h1><p>Введи ключ доступа</p><input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Admin key" autoFocus/><button disabled={busy || !key}>{busy ? "Проверяем" : "Войти"}</button>{error && <span className="adminError">{error}</span>}</form></main>;

  return <main className="adminShell">
    <aside className="adminSidebar"><div className="adminBrand"><span>TU</span><div><strong>TradeUP</strong><small>Control</small></div></div><nav>{([['overview','Обзор','trend'],['support','Поддержка','message'],['tradeup','TradeUP чат','bot'],['users','Пользователи','user']] as const).map(([id,label,icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon name={icon}/><span>{label}</span>{id === "support" && (overview?.stats.waitingSupport ?? 0) > 0 && <i>{overview?.stats.waitingSupport}</i>}</button>)}</nav><button className="adminLogout" onClick={() => void logout()}>Выйти</button></aside>
    <section className="adminMain"><header className="adminTop"><div><h1>{tab === "overview" ? "Обзор" : tab === "support" ? "Поддержка" : tab === "tradeup" ? "TradeUP чат" : "Пользователи"}</h1><span>{new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</span></div><button onClick={() => void loadOverview()}><Icon name="history" size={18}/>Обновить</button></header>{error && <div className="adminAlert">{error}</div>}

      {tab === "overview" && overview && <>
        <div className="adminStats">{[
          ["Пользователи", overview.stats.users], ["Онлайн", overview.stats.online], ["Активные лоты", overview.stats.activeListings], ["Сделки", overview.stats.trades],
          ["Оборот", rub(overview.stats.volume)], ["Комиссии", rub(overview.stats.fees)], ["Ждут поддержку", overview.stats.waitingSupport], ["Операторов в чате", overview.stats.activeSupport],
        ].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
        <section className="adminSection"><div className="adminSectionTitle"><h2>Последние обращения</h2><button onClick={() => setTab("support")}>Все обращения</button></div><div className="adminTable">{queue.slice(0,8).map((ticket) => { const p = profileOf(ticket); return <button className="adminTableRow" key={ticket.id} onClick={() => { setTab("support"); setSelectedTicket(ticket.id); void loadTicket(ticket.id); }}><strong>{p?.first_name ?? "Пользователь"}</strong><span>{ticket.last_message_preview || "Без сообщений"}</span><em className={`status-${ticket.status}`}>{statusLabel(ticket.status)}</em><time>{date(ticket.updated_at)}</time></button>; })}{queue.length === 0 && <div className="adminEmpty">Обращений пока нет</div>}</div></section>
      </>}

      {tab === "support" && <div className="adminSupportLayout"><section className="adminTicketList"><div className="adminSectionTitle"><h2>Обращения</h2><span>{queue.length}</span></div>{queue.map((ticket) => { const p = profileOf(ticket); return <button key={ticket.id} className={selectedTicket === ticket.id ? "adminTicket active" : "adminTicket"} onClick={() => { setSelectedTicket(ticket.id); void loadTicket(ticket.id); }}><div><strong>{p?.first_name ?? "Пользователь"}</strong><em className={`status-${ticket.status}`}>{statusLabel(ticket.status)}</em></div><p>{ticket.last_message_preview || "Выбран автоответ"}</p><small>{date(ticket.updated_at)}</small></button>; })}{queue.length === 0 && <div className="adminEmpty">Очередь пустая</div>}</section>
        <section className="adminTicketChat">{detail && selectedTicket ? <><header>{(() => { const p = profileOf(detail.ticket); return <div><strong>{p?.first_name ?? "Пользователь"}</strong><span>{p?.username ? `@${p.username}` : `Telegram ${p?.telegram_id ?? ""}`}</span></div>; })()}<em className={`status-${detail.ticket.status}`}>{statusLabel(detail.ticket.status)}</em></header><div className="adminChatMessages">{detail.messages.map((message) => <div key={message.id} className={`adminMessage ${message.sender_type}`}><span>{message.sender_type === "user" ? "Пользователь" : message.sender_type === "admin" ? "Поддержка" : message.sender_type === "bot" ? "Автоответ" : "Система"}</span><p>{message.body}</p><time>{date(message.created_at)}</time></div>)}</div><div className="adminChatActions">{detail.ticket.status !== "closed" && detail.ticket.status !== "active" && <button onClick={() => void action({ action: "join_support", ticketId: selectedTicket })}>Подключиться</button>}{detail.ticket.status !== "closed" && <form onSubmit={sendSupport}><textarea value={supportText} onChange={(e) => setSupportText(e.target.value)} placeholder="Ответ пользователю"/><button disabled={busy || !supportText.trim()}><Icon name="send"/></button></form>}{detail.ticket.status !== "closed" && <button className="danger" onClick={() => void action({ action: "close_support", ticketId: selectedTicket })}>Закрыть обращение</button>}</div></> : <div className="adminEmpty large">Выбери обращение слева</div>}</section>
        <section className="adminTopics"><div className="adminSectionTitle"><h2>Быстрые ответы</h2></div>{(overview?.topics ?? []).map((topic) => <TopicEditor key={topic.id} topic={topic} onSaved={loadOverview}/>)}</section></div>}

      {tab === "tradeup" && <div className="adminBroadcast"><form onSubmit={publish}><label>Новое сообщение в официальный чат</label><textarea value={announcement} onChange={(e) => setAnnouncement(e.target.value.slice(0,4000))} placeholder="Что сообщить всем игрокам?" rows={5}/><div><span>{announcement.length}/4000</span><button disabled={busy || !announcement.trim()}>Опубликовать</button></div></form><section><h2>История сообщений</h2>{(overview?.announcements ?? []).map((item) => <article key={item.id} className={!item.is_active ? "disabled" : ""}><div><strong>TradeUP</strong><time>{date(item.published_at)}</time></div><p>{item.body}</p><button onClick={() => void action({ action: "set_announcement_active", id: item.id, isActive: !item.is_active })}>{item.is_active ? "Скрыть" : "Вернуть"}</button></article>)}</section></div>}

      {tab === "users" && <section className="adminSection"><div className="adminSectionTitle"><h2>Пользователи</h2><span>{overview?.users.length ?? 0}</span></div><div className="adminUsers">{(overview?.users ?? []).map((user) => <div key={user.id}><div className="adminUserName"><span>{user.photo_url ? <img src={user.photo_url} alt=""/> : user.first_name.charAt(0)}</span><div><strong>{user.first_name}</strong><small>{user.username ? `@${user.username}` : `TG ${user.telegram_id}`}</small></div></div><span>{rub(user.balance)}</span><span>{user.rating} elo</span><span>{user.deals_count} сделок</span><span>{rub(user.total_profit)}</span><time>{date(user.last_seen_at)}</time></div>)}</div></section>}
    </section>
  </main>;
}
