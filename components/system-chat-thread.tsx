"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/icon";
import { useTelegramSession } from "@/components/telegram-session";

type Announcement = { id: string; body: string; published_at: string };
type SupportTopic = { id: string; title: string; auto_reply: string; sort_order: number };
type SupportTicket = { id: string; topic_id: string | null; status: "bot" | "waiting" | "active" | "closed"; requested_at: string | null; joined_at: string | null; updated_at: string };
type SupportMessage = { id: string; ticket_id: string; sender_type: "user" | "bot" | "admin" | "system"; body: string; created_at: string };
type OpenSystemResult = { kind?: "tradeup" | "support"; messages?: Announcement[] | SupportMessage[]; ticket?: SupportTicket | null; topics?: SupportTopic[] };

function time(value: string) { return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }); }
function day(value: string) { return new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }); }

export default function SystemChatThread({ channel }: { channel: "tradeup" | "support" }) {
  const session = useTelegramSession();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [topics, setTopics] = useState<SupportTopic[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const loadInFlight = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (session.state !== "verified") { if (!silent) setLoading(false); return; }
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    if (!silent) setLoading(true);
    try {
      const result = await session.callChatAction("open_system_chat", { channel }) as OpenSystemResult;
      if (channel === "tradeup") {
        const next = (result.messages ?? []) as Announcement[];
        setAnnouncements((current) => current.length === next.length && current.at(-1)?.id === next.at(-1)?.id ? current : next);
      } else {
        const next = (result.messages ?? []) as SupportMessage[];
        setMessages((current) => current.length === next.length && current.at(-1)?.id === next.at(-1)?.id ? current : next);
        setTicket((current) => current?.id === result.ticket?.id && current?.status === result.ticket?.status && current?.updated_at === result.ticket?.updated_at ? current : result.ticket ?? null);
        setTopics((current) => current.length === (result.topics ?? []).length ? current : result.topics ?? []);
      }
      setError(null);
    } catch { setError("Не удалось открыть чат"); }
    finally {
      loadInFlight.current = false;
      if (!silent) setLoading(false);
    }
  }, [channel, session]);

  useEffect(() => {
    if (session.state !== "verified") { if (["browser", "unavailable", "error"].includes(session.state)) setLoading(false); return; }
    const poll = () => { if (document.visibilityState === "visible") void load(true); };
    void load();
    const timer = window.setInterval(poll, channel === "support" ? 5_000 : 60_000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [session.state, channel, load]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [announcements.length, messages.length]);

  async function chooseTopic(topicId: string) {
    if (busy) return;
    setBusy(true); setError(null);
    try { await session.callChatAction("support_choose_topic", { topicId }); await load(true); }
    catch (reason) { setError(reason instanceof Error && reason.message === "support_already_requested" ? "Оператор уже вызван" : "Не удалось выбрать тему"); }
    finally { setBusy(false); }
  }

  async function callHuman() {
    if (busy) return;
    setBusy(true); setError(null);
    try { await session.callChatAction("support_request_human"); await load(true); }
    catch { setError("Не удалось вызвать поддержку"); }
    finally { setBusy(false); }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setText(""); setError(null);
    try { await session.callChatAction("support_send_message", { body }); await load(true); }
    catch { setText(body); setError("Сообщение не отправлено"); }
    finally { setBusy(false); }
  }

  if (session.state !== "verified" && !loading) return <div className="systemChatScreen"><header className="chatFlowHeader"><Link href="/messages"><Icon name="arrowLeft"/></Link><strong>{channel === "tradeup" ? "TradeUP" : "Поддержка"}</strong></header><div className="flatAuth"><strong>Открой TradeUP в Telegram</strong><button onClick={session.openBot}>Открыть</button></div></div>;

  const supportStatus = ticket?.status ?? "bot";
  const statusText = supportStatus === "active" ? "Поддержка подключилась" : supportStatus === "waiting" ? "Ожидаем оператора" : supportStatus === "closed" ? "Диалог завершён" : "Автопомощь";

  return <div className="systemChatScreen">
    <header className="chatFlowHeader systemChatHeader">
      <Link href="/messages" aria-label="Назад"><Icon name="arrowLeft"/></Link>
      <div className="systemChatIdentity"><span className={channel === "tradeup" ? "systemChatLogo tradeup" : "systemChatLogo support"}><Icon name={channel === "tradeup" ? "bot" : "message"} size={20}/></span><span><strong>{channel === "tradeup" ? "TradeUP" : "Поддержка TradeUP"}</strong><small>{channel === "tradeup" ? "Официальный чат" : statusText}</small></span></div>
    </header>

    {loading && <div className="chatLoading"/>}
    {error && <div className="chatError">{error}</div>}

    {!loading && channel === "tradeup" && <div className="chatMessages systemBroadcastFeed">
      {announcements.map((message, index) => <div className="broadcastMessage" key={message.id}><div className="broadcastMeta"><strong>TradeUP</strong><time>{day(message.published_at)} · {time(message.published_at)}</time></div><p>{message.body}</p>{index === announcements.length - 1 && <span className="broadcastOfficial"><Icon name="check" size={13}/>Официальное сообщение</span>}</div>)}
      {announcements.length === 0 && <div className="chatStart"><strong>Здесь будут новости TradeUP</strong></div>}
      <div ref={endRef}/>
    </div>}

    {!loading && channel === "support" && <>
      <div className="chatMessages supportMessages">
        {messages.length === 0 && <div className="supportIntro"><span className="supportIntroIcon"><Icon name="bot" size={24}/></span><strong>С чем помочь?</strong><p>Выбери тему. Сначала покажем быстрый ответ, а если не поможет, можно вызвать оператора.</p></div>}
        {messages.map((message) => {
          const own = message.sender_type === "user";
          const system = message.sender_type === "system";
          if (system) return <div className="supportSystemStatus" key={message.id}>{message.body}</div>;
          return <div className={own ? "chatBubbleRow own" : "chatBubbleRow"} key={message.id}><div className={own ? "chatBubble own" : "chatBubble supportAgentBubble"}><span>{message.body}</span><time>{time(message.created_at)}</time></div></div>;
        })}
        {(supportStatus === "bot" || supportStatus === "closed") && <div className="supportTopicPicker"><strong>{messages.length ? "Ещё один вопрос" : "Выбери тему"}</strong>{topics.map((topic) => <button type="button" key={topic.id} disabled={busy} onClick={() => void chooseTopic(topic.id)}><span>{topic.title}</span><Icon name="chevronRight" size={16}/></button>)}</div>}
        {supportStatus === "bot" && messages.length > 0 && <button type="button" className="callSupportButton" onClick={() => void callHuman()} disabled={busy}><Icon name="message" size={18}/>Позвать поддержку</button>}
        {supportStatus === "waiting" && <div className="supportWaiting"><i/><span>Оператор получит уведомление. Можешь дописать детали ниже.</span></div>}
        <div ref={endRef}/>
      </div>
      {["waiting", "active"].includes(supportStatus) && <form className="chatComposer supportComposer" onSubmit={send}><textarea value={text} onChange={(event) => setText(event.target.value.slice(0, 2000))} placeholder="Сообщение" rows={1}/><button type="submit" disabled={!text.trim() || busy}><Icon name="send" size={20}/></button></form>}
    </>}
  </div>;
}
