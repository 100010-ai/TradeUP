"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/icon";
import ProductImage from "@/components/product-image";
import { useTelegramSession } from "@/components/telegram-session";
import { rubles } from "@/lib/product";

type Thread = { id: string; listing_id: string; buyer_id: string; seller_id: string; last_message_at: string | null; buyer_read_at?: string | null; seller_read_at?: string | null };
type Message = { id: string; thread_id: string; sender_id: string; body: string; created_at: string; clientState?: "pending" | "failed" };
type Profile = { id: string; first_name: string; username: string | null; photo_url: string | null; is_online: boolean; last_seen_at: string };
type ItemType = { name: string; brand: string | null; image_url: string | null; category_id: string };
type InventoryJoin = { item_types: ItemType | ItemType[] | null };
type Listing = { id: string; title: string; price: number | string; status: string; seller_id: string; inventory_items: InventoryJoin | InventoryJoin[] | null };
type OpenResult = { profileId?: string; thread?: Thread; messages?: Message[]; profiles?: Profile[]; listings?: Listing[] };
type PollResult = { profileId?: string; thread?: Thread; messages?: Message[] };

function itemType(listing: Listing | null) {
  if (!listing?.inventory_items) return null;
  const inventory = Array.isArray(listing.inventory_items) ? listing.inventory_items[0] : listing.inventory_items;
  if (!inventory?.item_types) return null;
  return Array.isArray(inventory.item_types) ? inventory.item_types[0] ?? null : inventory.item_types;
}
function timeLabel(value: string) { return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }); }
function dayKey(value: string) { return new Date(value).toLocaleDateString("ru-RU"); }
function dayLabel(value: string) {
  const date = new Date(value), today = new Date(), yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Сегодня";
  if (date.toDateString() === yesterday.toDateString()) return "Вчера";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}
function presenceLabel(profile: Profile | null) {
  if (!profile) return "";
  if (profile.is_online) return "онлайн";
  const ms = Date.now() - new Date(profile.last_seen_at).getTime();
  if (ms < 10 * 60_000) return "был недавно";
  if (ms < 60 * 60_000) return `был ${Math.max(1, Math.floor(ms / 60_000))} мин назад`;
  return `был ${new Date(profile.last_seen_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function ChatThread({ id }: { id: string }) {
  const { state: sessionState, callChatAction, openBot } = useTelegramSession();
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [profileId, setProfileId] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const firstLoad = useRef(true);
  const requestInFlight = useRef(false);
  const lastMessageAt = useRef("");

  const load = useCallback(async (silent = false) => {
    if (sessionState !== "verified") { if (!silent) setLoading(false); return; }
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    try {
      const result = await callChatAction("open_thread", { threadId: id }) as OpenResult;
      const nextMessages = result.messages ?? [];
      setThread(result.thread ?? null);
      setMessages((current) => {
        const pending = current.filter((item) => item.clientState === "pending" || item.clientState === "failed");
        const serverIds = new Set(nextMessages.map((item) => item.id));
        return [...nextMessages, ...pending.filter((item) => !serverIds.has(item.id))];
      });
      setProfiles(result.profiles ?? []); setListings(result.listings ?? []); setProfileId(result.profileId ?? "");
      lastMessageAt.current = nextMessages.at(-1)?.created_at ?? lastMessageAt.current; setError(null);
    } catch { setError("Чат временно недоступен"); }
    finally { requestInFlight.current = false; if (!silent) setLoading(false); }
  }, [id, sessionState, callChatAction]);

  const poll = useCallback(async () => {
    if (sessionState !== "verified" || document.visibilityState !== "visible" || requestInFlight.current) return;
    requestInFlight.current = true;
    try {
      const result = await callChatAction("poll_thread", { threadId: id, since: lastMessageAt.current }) as PollResult;
      if (result.thread) setThread(result.thread);
      if (result.profileId) setProfileId((current) => current || result.profileId || "");
      const incoming = result.messages ?? [];
      if (incoming.length) {
        setMessages((current) => {
          const known = new Set(current.map((item) => item.id));
          const fresh = incoming.filter((item) => !known.has(item.id));
          return fresh.length ? [...current, ...fresh] : current;
        });
        const newest = incoming.at(-1)?.created_at;
        if (newest && (!lastMessageAt.current || new Date(newest).getTime() > new Date(lastMessageAt.current).getTime())) lastMessageAt.current = newest;
      }
      setError(null);
    } catch { /* keep the current conversation visible */ }
    finally { requestInFlight.current = false; }
  }, [id, sessionState, callChatAction]);

  useEffect(() => {
    if (sessionState !== "verified") { if (["browser","unavailable","error"].includes(sessionState)) setLoading(false); return; }
    void load();
    const timer = window.setInterval(() => void poll(), 2_500);
    const onVisibility = () => { if (document.visibilityState === "visible") void load(true); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [sessionState, load, poll]);

  useEffect(() => {
    if (!messages.length) return;
    endRef.current?.scrollIntoView({ behavior: firstLoad.current ? "auto" : "smooth", block: "end" });
    firstLoad.current = false;
  }, [messages.length]);

  const listing = listings.find((entry) => entry.id === thread?.listing_id) ?? null;
  const otherId = thread ? (thread.buyer_id === profileId ? thread.seller_id : thread.buyer_id) : "";
  const other = profiles.find((entry) => entry.id === otherId) ?? null;
  const type = itemType(listing);
  const otherReadAt = thread ? (thread.buyer_id === profileId ? thread.seller_read_at : thread.buyer_read_at) : null;

  function delivery(message: Message) {
    if (message.clientState === "pending") return "pending" as const;
    if (message.clientState === "failed") return "failed" as const;
    if (otherReadAt && new Date(otherReadAt).getTime() >= new Date(message.created_at).getTime()) return "read" as const;
    return "sent" as const;
  }

  async function sendBody(body: string, localId?: string) {
    const tempId = localId ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    if (!localId) setMessages((current) => [...current, { id: tempId, thread_id: id, sender_id: profileId, body, created_at: now, clientState: "pending" }]);
    else setMessages((current) => current.map((item) => item.id === localId ? { ...item, clientState: "pending" } : item));
    try {
      const result = await callChatAction("send_message", { threadId: id, body });
      const serverMessage = result.message as Message | undefined;
      if (!serverMessage) throw new Error("missing_message");
      setMessages((current) => current.map((item) => item.id === tempId ? serverMessage : item));
      if (!lastMessageAt.current || new Date(serverMessage.created_at).getTime() > new Date(lastMessageAt.current).getTime()) lastMessageAt.current = serverMessage.created_at;
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");
    } catch {
      setMessages((current) => current.map((item) => item.id === tempId ? { ...item, clientState: "failed" } : item));
    }
  }

  function send(event: React.FormEvent) {
    event.preventDefault(); const body = text.trim(); if (!body || !profileId) return;
    setText(""); setError(null); void sendBody(body);
  }

  if (sessionState !== "verified" && !loading) return <div className="chatScreen"><div className="chatFlowHeader"><Link href="/messages"><Icon name="arrowLeft"/></Link><strong>Чат</strong></div><div className="flatAuth"><strong>Открой TradeUP в Telegram</strong><button onClick={openBot}>Открыть</button></div></div>;

  return <div className="chatScreen professionalChat">
    <header className="chatFlowHeader professionalChatHeader">
      <Link href="/messages" aria-label="Назад" className="chatBack"><Icon name="arrowLeft"/></Link>
      <div className="chatPeer">
        <div className="chatPeerAvatar">{other?.photo_url ? <img src={other.photo_url} alt=""/> : <span>{other?.first_name?.charAt(0).toUpperCase() ?? "T"}</span>}{other?.is_online && <i/>}</div>
        <div><strong>{other?.first_name ?? "Сообщения"}</strong><small className={other?.is_online ? "online" : ""}>{presenceLabel(other)}</small></div>
      </div>
      <button type="button" className="chatMore" aria-label="Ещё"><Icon name="more" size={20}/></button>
    </header>

    {listing && <Link prefetch={false} href={`/listing/${listing.id}`} className="chatListingStrip">
      <span className="chatProductThumb"><ProductImage src={type?.image_url} alt={type?.name ?? listing.title} categoryId={type?.category_id ?? ""}/></span>
      <span><strong>{listing.title}</strong><small>{rubles(listing.price)} · {listing.status === "active" ? "в продаже" : "объявление"}</small></span>
      <Icon name="chevronRight" size={17}/>
    </Link>}

    {loading && <div className="chatLoading" />}
    {error && <div className="chatError">{error}</div>}

    {!loading && <div className="chatMessages professionalChatMessages">{messages.length === 0 && <div className="chatStart"><strong>Начните диалог</strong><span>Уточните состояние, цену или детали сделки.</span></div>}{messages.map((message, index) => {
      const own = message.sender_id === profileId;
      const prev = messages[index - 1], showDay = !prev || dayKey(prev.created_at) !== dayKey(message.created_at);
      const state = own ? delivery(message) : null;
      return <div key={message.id}>{showDay && <div className="chatDay">{dayLabel(message.created_at)}</div>}<div className={own ? "chatBubbleRow own" : "chatBubbleRow"}>
        <div className={own ? `chatBubble own delivery-${state}` : "chatBubble"}>
          <span className="chatBubbleText">{message.body}</span>
          <span className="chatMessageMeta"><time>{timeLabel(message.created_at)}</time>{own && state === "pending" && <span className="chatDelivery pending"><Icon name="history" size={12}/>Ожидание</span>}{own && state === "sent" && <span className="chatDelivery sent"><Icon name="check" size={12}/>Отправлено</span>}{own && state === "read" && <span className="chatDelivery read"><span className="doubleCheck"><Icon name="check" size={12}/><Icon name="check" size={12}/></span>Прочитано</span>}{own && state === "failed" && <button type="button" className="chatDelivery failed" onClick={() => void sendBody(message.body, message.id)}>Повторить</button>}</span>
        </div>
      </div></div>;
    })}<div ref={endRef}/></div>}

    <form className="chatComposer professionalComposer" onSubmit={send}>
      <textarea value={text} onChange={(event) => setText(event.target.value.slice(0, 2000))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Сообщение" rows={1}/>
      <button type="submit" aria-label="Отправить" disabled={!text.trim()}><Icon name="send" size={20}/></button>
    </form>
  </div>;
}
