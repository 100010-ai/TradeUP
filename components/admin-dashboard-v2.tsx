"use client";

/* Telegram avatars are arbitrary remote URLs, so native images are intentional here. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/icon";

type Stats = {
  users: number;
  online: number;
  activeListings: number;
  trades: number;
  volume: number;
  fees: number;
  sellerProfit: number;
  waitingSupport: number;
  activeSupport: number;
};
type Profile = {
  id: string;
  telegram_id: number | string;
  first_name: string;
  username: string | null;
  photo_url: string | null;
  balance: number | string;
  rating: number;
  deals_count: number;
  total_profit: number | string;
  created_at: string;
  last_seen_at: string;
};
type TicketProfile = {
  id: string;
  telegram_id: number | string;
  first_name: string;
  username: string | null;
  photo_url: string | null;
};
type Ticket = {
  id: string;
  user_id: string;
  topic_id: string | null;
  status: string;
  last_message_at: string | null;
  last_message_preview: string;
  last_sender_type: string | null;
  requested_at: string | null;
  joined_at: string | null;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
  profiles?: TicketProfile | TicketProfile[] | null;
};
type Announcement = { id: string; body: string; is_active: boolean; published_at: string; created_at: string };
type Topic = { id: string; title: string; auto_reply: string; sort_order: number; is_active: boolean };
type SupportMessage = { id: string; sender_type: string; body: string; created_at: string };
type Overview = { ok: boolean; stats: Stats; users: Profile[]; tickets: Ticket[]; announcements: Announcement[]; topics: Topic[] };
type TicketDetail = { ok: boolean; ticket: Ticket; messages: SupportMessage[]; topics: Topic[] };
type Tab = "overview" | "support" | "tradeup" | "users";
type SupportFilter = "open" | "waiting" | "active" | "closed" | "all";

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
function rub(value: number | string) { return `${money.format(Number(value) || 0)} ₽`; }
function date(value: string | null | undefined) { return value ? new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"; }
function time(value: string) { return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }); }
function profileOf(ticket: Ticket) { return Array.isArray(ticket.profiles) ? ticket.profiles[0] ?? null : ticket.profiles ?? null; }
function statusLabel(status: string) { return status === "waiting" ? "Ожидает" : status === "active" ? "В работе" : status === "closed" ? "Закрыто" : "Автоответ"; }
function senderLabel(type: string) { return type === "user" ? "Пользователь" : type === "admin" ? "Поддержка" : type === "bot" ? "Автоответ" : "Система"; }
function errorText(reason: unknown, fallback: string) { return reason instanceof Error && reason.message ? reason.message : fallback; }

function TinyAvatar({ photoUrl, name, large = false }: { photoUrl?: string | null; name?: string | null; large?: boolean }) {
  const letter = name?.trim().charAt(0).toUpperCase() || "T";
  return <span className={large ? "proTinyAvatar large" : "proTinyAvatar"}>{photoUrl ? <img src={photoUrl} alt="" loading="lazy" decoding="async" /> : letter}</span>;
}

function TopicEditor({ topic, onSaved }: { topic: Topic; onSaved: () => Promise<unknown> }) {
  const [title, setTitle] = useState(topic.title);
  const [reply, setReply] = useState(topic.auto_reply);
  const [active, setActive] = useState(topic.is_active);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(topic.title);
    setReply(topic.auto_reply);
    setActive(topic.is_active);
  }, [topic.id, topic.title, topic.auto_reply, topic.is_active]);

  async function save() {
    const nextTitle = title.trim();
    const nextReply = reply.trim();
    if (!nextTitle || !nextReply || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_topic", id: topic.id, title: nextTitle, autoReply: nextReply, isActive: active }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error ?? "Не удалось сохранить автоответ");
      await onSaved();
    } catch (reason) {
      setSaveError(errorText(reason, "Не удалось сохранить автоответ"));
    } finally {
      setSaving(false);
    }
  }

  return <div className="proTopicEditor">
    <div><input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} aria-label="Название автоответа"/><label><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)}/>Доступен</label></div>
    <textarea value={reply} maxLength={2000} onChange={(event) => setReply(event.target.value)} rows={3} aria-label="Текст автоответа"/>
    {saveError && <span className="proInlineError" role="alert">{saveError}</span>}
    <button type="button" onClick={() => void save()} disabled={saving || !title.trim() || !reply.trim()}>{saving ? "Сохраняем…" : "Сохранить"}</button>
  </div>;
}

export default function AdminDashboardV2() {
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
  const [quickReply, setQuickReply] = useState("");
  const [supportFilter, setSupportFilter] = useState<SupportFilter>("open");
  const [userQuery, setUserQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ticketRequest = useRef(0);
  const urlHandled = useRef(false);

  const checkAuth = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch("/api/admin/auth", { cache: "no-store" });
      const result = await response.json().catch(() => null) as { configured?: boolean; authenticated?: boolean } | null;
      const isConfigured = result?.configured !== false;
      const isAuthed = response.ok && result?.authenticated === true;
      setConfigured(isConfigured);
      setAuthed(isAuthed);
      return isAuthed;
    } catch {
      setError("Не удалось проверить админ-сессию");
      setAuthed(false);
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  const loadOverview = useCallback(async (silent = false) => {
    if (!silent) setOverviewLoading(true);
    try {
      const response = await fetch("/api/admin", { cache: "no-store" });
      if (response.status === 401) {
        setAuthed(false);
        return false;
      }
      const result = await response.json().catch(() => null) as (Overview & { error?: string }) | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error ?? "Не удалось загрузить панель");
      setOverview(result);
      setLastUpdatedAt(Date.now());
      if (!silent) setError(null);
      return true;
    } catch (reason) {
      if (!silent) setError(errorText(reason, "Не удалось обновить данные"));
      return false;
    } finally {
      if (!silent) setOverviewLoading(false);
    }
  }, []);

  const loadTicket = useCallback(async (id: string, silent = false) => {
    const requestId = ++ticketRequest.current;
    if (!silent) setTicketLoading(true);
    try {
      const response = await fetch(`/api/admin?ticketId=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (response.status === 401) {
        setAuthed(false);
        return false;
      }
      const result = await response.json().catch(() => null) as (TicketDetail & { error?: string }) | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error ?? "Не удалось загрузить обращение");
      if (ticketRequest.current === requestId) setDetail(result);
      return true;
    } catch (reason) {
      if (!silent && ticketRequest.current === requestId) setError(errorText(reason, "Не удалось загрузить обращение"));
      return false;
    } finally {
      if (!silent && ticketRequest.current === requestId) setTicketLoading(false);
    }
  }, []);

  const openTicket = useCallback((id: string) => {
    setSelectedTicket(id);
    setDetail(null);
    setQuickReply("");
    setSupportText("");
    setError(null);
    void loadTicket(id);
  }, [loadTicket]);

  useEffect(() => {
    void checkAuth().then((ok) => { if (ok) void loadOverview(); });
  }, [checkAuth, loadOverview]);

  useEffect(() => {
    if (!authed || urlHandled.current) return;
    urlHandled.current = true;
    const fromUrl = new URLSearchParams(window.location.search).get("ticket");
    if (!fromUrl) return;
    setTab("support");
    setSupportFilter("all");
    openTicket(fromUrl);
  }, [authed, openTicket]);

  useEffect(() => {
    if (!authed) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void loadOverview(true);
      if (selectedTicket) void loadTicket(selectedTicket, true);
    };
    const timer = window.setInterval(refresh, 8000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [authed, selectedTicket, loadOverview, loadTicket]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    if (!key || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error ?? "Неверный ключ доступа");
      setAuthed(true);
      setKey("");
      await loadOverview();
    } catch {
      setError("Неверный ключ доступа");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try { await fetch("/api/admin/auth", { method: "DELETE" }); }
    finally {
      setBusy(false);
      setAuthed(false);
      setOverview(null);
      setDetail(null);
      setSelectedTicket(null);
    }
  }

  async function action(payload: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (response.status === 401) {
        setAuthed(false);
        return false;
      }
      if (!response.ok || !result?.ok) throw new Error(result?.error ?? "Не удалось выполнить действие");
      await loadOverview(true);
      if (selectedTicket) await loadTicket(selectedTicket, true);
      return true;
    } catch (reason) {
      setError(errorText(reason, "Не удалось выполнить действие"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    const body = announcement.trim();
    if (!body) return;
    if (await action({ action: "publish_announcement", body })) setAnnouncement("");
  }

  async function sendSupport(event: React.FormEvent) {
    event.preventDefault();
    const body = supportText.trim();
    if (!body || !selectedTicket) return;
    setSupportText("");
    setQuickReply("");
    if (!(await action({ action: "send_support", ticketId: selectedTicket, body }))) setSupportText(body);
  }

  const queue = useMemo(() => [...(overview?.tickets ?? [])].sort((a, b) => {
    const rank = (status: string) => status === "waiting" ? 0 : status === "active" ? 1 : status === "bot" ? 2 : 3;
    return rank(a.status) - rank(b.status) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  }), [overview?.tickets]);
  const supportCounts = useMemo(() => ({
    all: queue.length,
    waiting: queue.filter((ticket) => ticket.status === "waiting").length,
    active: queue.filter((ticket) => ticket.status === "active").length,
    closed: queue.filter((ticket) => ticket.status === "closed").length,
    open: queue.filter((ticket) => ticket.status !== "closed").length,
  }), [queue]);
  const visibleTickets = useMemo(() => queue.filter((ticket) => supportFilter === "all" ? true : supportFilter === "open" ? ticket.status !== "closed" : ticket.status === supportFilter), [queue, supportFilter]);
  const visibleUsers = useMemo(() => {
    const query = userQuery.trim().toLocaleLowerCase("ru");
    const users = overview?.users ?? [];
    return !query ? users : users.filter((user) => `${user.first_name} ${user.username ?? ""} ${user.telegram_id}`.toLocaleLowerCase("ru").includes(query));
  }, [overview?.users, userQuery]);
  const activeDetail = detail?.ticket.id === selectedTicket ? detail : null;
  const selectedProfile = activeDetail ? profileOf(activeDetail.ticket) : null;
  const selectedTopic = activeDetail?.topics.find((topic) => topic.id === activeDetail.ticket.topic_id) ?? null;

  if (checking) return <main className="proAdminLogin"><div><span className="proAdminLogo">TU</span><strong>TradeUP Control</strong><small>Проверяем сессию…</small></div></main>;
  if (!configured) return <main className="proAdminLogin"><div><span className="proAdminLogo">TU</span><strong>Панель не настроена</strong><small>Добавь ADMIN_PANEL_KEY в Vercel.</small></div></main>;
  if (!authed) return <main className="proAdminLogin"><form onSubmit={login}><span className="proAdminLogo">TU</span><div><h1>TradeUP Control</h1><p>Закрытая панель управления</p></div><label>Ключ доступа<input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="••••••••••••" autoFocus autoComplete="current-password"/></label><button disabled={busy || !key}>{busy ? "Проверяем…" : "Войти"}</button>{error && <span className="proAdminLoginError" role="alert">{error}</span>}</form></main>;

  const title = tab === "overview" ? "Обзор" : tab === "support" ? "Поддержка" : tab === "tradeup" ? "Официальный чат" : "Пользователи";
  const updatedLabel = lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : null;

  return <main className="proAdminShell">
    <aside className="proAdminSidebar">
      <div className="proAdminBrand"><span className="proAdminLogo">TU</span><div><strong>TradeUP</strong><small>Control Center</small></div></div>
      <nav aria-label="Разделы панели">{([
        ["overview", "Обзор", "trend"],
        ["support", "Поддержка", "message"],
        ["tradeup", "TradeUP чат", "bot"],
        ["users", "Пользователи", "user"],
      ] as const).map(([id, label, icon]) => <button type="button" key={id} className={tab === id ? "active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}><Icon name={icon}/><span>{label}</span>{id === "support" && supportCounts.waiting > 0 && <i>{supportCounts.waiting}</i>}</button>)}</nav>
      <div className="proAdminSidebarFoot"><span><i/>production</span><button type="button" disabled={busy} onClick={() => void logout()}>Выйти</button></div>
    </aside>

    <section className="proAdminMain">
      <header className="proAdminTop"><div><span>TradeUP / {title}{updatedLabel ? ` · ${updatedLabel}` : ""}</span><h1>{title}</h1></div><button type="button" disabled={overviewLoading} onClick={() => void loadOverview()}><Icon name="history" size={16}/>{overviewLoading ? "Обновляем…" : "Обновить"}</button></header>
      {error && <div className="proAdminAlert" role="alert">{error}<button type="button" aria-label="Закрыть ошибку" onClick={() => setError(null)}><Icon name="close" size={14}/></button></div>}

      {tab === "overview" && !overview && overviewLoading && <div className="proAdminLoading"><i/><i/><i/><i/></div>}
      {tab === "overview" && overview && <div className="proOverview">
        <section className="proMetricGrid">{[
          ["Пользователи", overview.stats.users, "Всего аккаунтов"], ["Онлайн", overview.stats.online, "За последние 5 минут"], ["Активные лоты", overview.stats.activeListings, "Сейчас на рынке"], ["Сделки", overview.stats.trades, "За всё время"],
          ["Оборот", rub(overview.stats.volume), "Объём сделок"], ["Комиссии", rub(overview.stats.fees), "Собрано системой"], ["Ждут ответа", overview.stats.waitingSupport, "Очередь поддержки"], ["В работе", overview.stats.activeSupport, "Активные обращения"],
        ].map(([label, value, note]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</section>
        <section className="proOverviewSection"><div className="proSectionHead"><div><h2>Обращения</h2><p>Последняя активность поддержки</p></div><button type="button" onClick={() => setTab("support")}>Открыть очередь</button></div><div className="proOverviewTickets">{queue.slice(0, 8).map((ticket) => { const profile = profileOf(ticket); return <button type="button" key={ticket.id} onClick={() => { setTab("support"); setSupportFilter("all"); openTicket(ticket.id); }}><TinyAvatar photoUrl={profile?.photo_url} name={profile?.first_name}/><span><strong>{profile?.first_name ?? "Пользователь"}</strong><small>{ticket.last_message_preview || "Без сообщений"}</small></span><em className={`proStatus status-${ticket.status}`}>{statusLabel(ticket.status)}</em><time>{date(ticket.updated_at)}</time></button>; })}{queue.length === 0 && <div className="proEmpty">Обращений пока нет</div>}</div></section>
      </div>}

      {tab === "support" && <div className="proSupportPage">
        <div className="proSupportFilters" role="tablist" aria-label="Фильтр обращений">{([
          ["open", "Открытые"], ["waiting", "Ожидают"], ["active", "В работе"], ["closed", "Закрытые"], ["all", "Все"],
        ] as const).map(([id, label]) => <button type="button" role="tab" aria-selected={supportFilter === id} key={id} className={supportFilter === id ? "active" : ""} onClick={() => setSupportFilter(id)}>{label}<span>{supportCounts[id]}</span></button>)}</div>
        <div className="proSupportWorkspace">
          <aside className="proTicketColumn"><div className="proTicketColumnHead"><strong>Очередь</strong><span>{visibleTickets.length}</span></div><div className="proTicketScroll">{visibleTickets.map((ticket) => { const profile = profileOf(ticket); return <button type="button" key={ticket.id} aria-pressed={selectedTicket === ticket.id} className={selectedTicket === ticket.id ? "proTicket active" : "proTicket"} onClick={() => openTicket(ticket.id)}><TinyAvatar photoUrl={profile?.photo_url} name={profile?.first_name}/><span className="proTicketCopy"><span><strong>{profile?.first_name ?? "Пользователь"}</strong><time>{date(ticket.updated_at)}</time></span><small>{ticket.last_message_preview || "Выбран автоответ"}</small><em className={`proStatus status-${ticket.status}`}>{statusLabel(ticket.status)}</em></span></button>; })}{visibleTickets.length === 0 && <div className="proEmpty">В этой очереди пусто</div>}</div></aside>

          <section className="proSupportChat">{ticketLoading && !activeDetail ? <div className="proSupportBlank"><span className="proAdminSpinner"/><strong>Загружаем обращение</strong><span>Сообщения уже в пути.</span></div> : activeDetail && selectedTicket ? <><header><div className="proSupportPerson"><TinyAvatar large photoUrl={selectedProfile?.photo_url} name={selectedProfile?.first_name}/><div><strong>{selectedProfile?.first_name ?? "Пользователь"}</strong><small>{selectedProfile?.username ? `@${selectedProfile.username}` : `Telegram ${selectedProfile?.telegram_id ?? ""}`}</small></div></div><em className={`proStatus status-${activeDetail.ticket.status}`}>{statusLabel(activeDetail.ticket.status)}</em></header><div className="proSupportMessages">{activeDetail.messages.length === 0 && <div className="proEmpty">Сообщений пока нет</div>}{activeDetail.messages.map((message) => <div key={message.id} className={`proSupportMessage ${message.sender_type}`}><span>{senderLabel(message.sender_type)}</span><p>{message.body}</p><time>{time(message.created_at)}</time></div>)}</div><div className="proSupportComposer">{activeDetail.ticket.status !== "closed" && <><div className="proQuickReplyLine"><select value={quickReply} onChange={(event) => { const id = event.target.value; setQuickReply(id); const topic = activeDetail.topics.find((item) => item.id === id); if (topic) setSupportText(topic.auto_reply); }}><option value="">Быстрый ответ…</option>{activeDetail.topics.filter((topic) => topic.is_active).map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}</select>{activeDetail.ticket.status !== "active" && <button type="button" disabled={busy} onClick={() => void action({ action: "join_support", ticketId: selectedTicket })}>Взять в работу</button>}</div><form onSubmit={sendSupport}><textarea value={supportText} onChange={(event) => setSupportText(event.target.value.slice(0, 2000))} placeholder="Напиши ответ пользователю…" rows={2}/><button disabled={busy || !supportText.trim()} aria-label="Отправить"><Icon name="send" size={19}/></button></form><div className="proSupportBottomActions"><span>{supportText.length}/2000</span><button type="button" disabled={busy} onClick={() => void action({ action: "close_support", ticketId: selectedTicket })}>Закрыть обращение</button></div></>}</div></> : <div className="proSupportBlank"><Icon name="message" size={30}/><strong>Выбери обращение</strong><span>Переписка и данные пользователя откроются здесь.</span></div>}</section>

          <aside className="proTicketInspector">{activeDetail && selectedTicket ? <><div className="proInspectorHead"><span>Обращение</span><strong>#{selectedTicket.slice(0, 8)}</strong></div><dl><div><dt>Статус</dt><dd>{statusLabel(activeDetail.ticket.status)}</dd></div><div><dt>Тема</dt><dd>{selectedTopic?.title ?? "Не выбрана"}</dd></div><div><dt>Создано</dt><dd>{date(activeDetail.ticket.created_at)}</dd></div><div><dt>Вызов оператора</dt><dd>{date(activeDetail.ticket.requested_at)}</dd></div><div><dt>Подключение</dt><dd>{date(activeDetail.ticket.joined_at)}</dd></div></dl><div className="proInspectorUser"><span>Пользователь</span><strong>{selectedProfile?.first_name ?? "—"}</strong><small>{selectedProfile?.username ? `@${selectedProfile.username}` : `TG ${selectedProfile?.telegram_id ?? "—"}`}</small></div></> : <div className="proEmpty">Нет выбранного обращения</div>}</aside>
        </div>
        <details className="proSupportSettings"><summary><span><Icon name="edit" size={17}/>Автоответы поддержки</span><small>Редактирование сценариев</small></summary><div className="proTopicGrid">{(overview?.topics ?? []).map((topic) => <TopicEditor key={topic.id} topic={topic} onSaved={() => loadOverview(true)}/>)}</div></details>
      </div>}

      {tab === "tradeup" && <div className="proBroadcast"><section className="proBroadcastComposer"><div><h2>Новое сообщение</h2><p>Публикация появится в официальном чате и уведомлениях игроков.</p></div><form onSubmit={publish}><textarea value={announcement} onChange={(event) => setAnnouncement(event.target.value.slice(0, 4000))} placeholder="Напиши сообщение для игроков…" rows={5}/><div><span>{announcement.length}/4000</span><button disabled={busy || !announcement.trim()}>Опубликовать</button></div></form></section><section className="proBroadcastHistory"><div className="proSectionHead"><div><h2>История</h2><p>{overview?.announcements.length ?? 0} публикаций</p></div></div>{(overview?.announcements ?? []).map((item) => <article key={item.id} className={item.is_active ? "" : "disabled"}><header><strong>TradeUP</strong><time>{date(item.published_at)}</time></header><p>{item.body}</p><button type="button" disabled={busy} onClick={() => void action({ action: "set_announcement_active", id: item.id, isActive: !item.is_active })}>{item.is_active ? "Скрыть" : "Вернуть"}</button></article>)}{(overview?.announcements.length ?? 0) === 0 && <div className="proEmpty">Публикаций пока нет</div>}</section></div>}

      {tab === "users" && <section className="proUsers"><div className="proUsersTools"><div><h2>Пользователи</h2><span>{overview?.users.length ?? 0} загружено</span></div><label><Icon name="search" size={16}/><input type="search" value={userQuery} onChange={(event) => setUserQuery(event.target.value)} placeholder="Имя, username или Telegram ID" aria-label="Поиск пользователей"/></label></div><div className="proUsersTable"><header><span>Пользователь</span><span>Баланс</span><span>Рейтинг</span><span>Сделки</span><span>Прибыль</span><span>Активность</span></header>{visibleUsers.map((user) => <div key={user.id}><div className="proUserIdentity"><TinyAvatar photoUrl={user.photo_url} name={user.first_name}/><span><strong>{user.first_name}</strong><small>{user.username ? `@${user.username}` : `TG ${user.telegram_id}`}</small></span></div><span>{rub(user.balance)}</span><span>{user.rating}</span><span>{user.deals_count}</span><span>{rub(user.total_profit)}</span><time>{date(user.last_seen_at)}</time></div>)}{visibleUsers.length === 0 && <div className="proUsersEmpty">Ничего не найдено</div>}</div></section>}
    </section>
  </main>;
}
