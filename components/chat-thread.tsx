"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/icon";
import ProductImage from "@/components/product-image";
import { useTelegramSession } from "@/components/telegram-session";
import { rubles } from "@/lib/product";

type Thread = { id: string; listing_id: string; buyer_id: string; seller_id: string; last_message_at: string | null };
type Message = { id: string; thread_id: string; sender_id: string; body: string; created_at: string };
type Profile = { id: string; first_name: string; username: string | null; photo_url: string | null; is_online: boolean; last_seen_at: string };
type ItemType = { name: string; brand: string | null; image_url: string | null; category_id: string };
type InventoryJoin = { item_types: ItemType | ItemType[] | null };
type Listing = { id: string; title: string; price: number | string; status: string; seller_id: string; inventory_items: InventoryJoin | InventoryJoin[] | null };
type OpenResult = { profileId?: string; thread?: Thread; messages?: Message[]; profiles?: Profile[]; listings?: Listing[] };

function itemType(listing: Listing | null) {
  if (!listing?.inventory_items) return null;
  const inventory = Array.isArray(listing.inventory_items) ? listing.inventory_items[0] : listing.inventory_items;
  if (!inventory?.item_types) return null;
  return Array.isArray(inventory.item_types) ? inventory.item_types[0] ?? null : inventory.item_types;
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
function dayKey(value: string) { return new Date(value).toLocaleDateString("ru-RU"); }
function dayLabel(value: string) {
  const date = new Date(value); const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Сегодня";
  if (date.toDateString() === yesterday.toDateString()) return "Вчера";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const firstLoad = useRef(true);
  const loadInFlight = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (sessionState !== "verified") { if (!silent) setLoading(false); return; }
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    try {
      const result = await callChatAction("open_thread", { threadId: id }) as OpenResult;
      const nextThread = result.thread ?? null;
      const nextMessages = result.messages ?? [];
      const nextProfiles = result.profiles ?? [];
      const nextListings = result.listings ?? [];

      setThread((current) => current?.id === nextThread?.id && current?.last_message_at === nextThread?.last_message_at ? current : nextThread);
      setMessages((current) => {
        const currentLast = current.at(-1)?.id;
        const nextLast = nextMessages.at(-1)?.id;
        return current.length === nextMessages.length && currentLast === nextLast ? current : nextMessages;
      });
      setProfiles((current) => {
        const currentKey = current.map((item) => `${item.id}:${item.is_online}:${item.last_seen_at}`).join("|");
        const nextKey = nextProfiles.map((item) => `${item.id}:${item.is_online}:${item.last_seen_at}`).join("|");
        return currentKey === nextKey ? current : nextProfiles;
      });
      setListings((current) => {
        const currentKey = current.map((item) => `${item.id}:${item.status}:${item.price}`).join("|");
        const nextKey = nextListings.map((item) => `${item.id}:${item.status}:${item.price}`).join("|");
        return currentKey === nextKey ? current : nextListings;
      });
      if (!silent) setProfileId(result.profileId ?? "");
      setError(null);
    } catch { setError("Чат недоступен"); }
    finally {
      loadInFlight.current = false;
      if (!silent) setLoading(false);
    }
  }, [id, sessionState, callChatAction]);

  useEffect(() => {
    if (sessionState !== "verified") { if (["browser","unavailable","error"].includes(sessionState)) setLoading(false); return; }
    const poll = () => { if (document.visibilityState === "visible") void load(true); };
    void load();
    const timer = window.setInterval(poll, 4_000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [sessionState, load]);

  useEffect(() => {
    if (!messages.length) return;
    endRef.current?.scrollIntoView({ behavior: firstLoad.current ? "auto" : "smooth", block: "end" });
    firstLoad.current = false;
  }, [messages.length]);

  const listing = listings.find((entry) => entry.id === thread?.listing_id) ?? null;
  const otherId = thread ? (thread.buyer_id === profileId ? thread.seller_id : thread.buyer_id) : "";
  const other = profiles.find((entry) => entry.id === otherId) ?? null;
  const type = itemType(listing);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = text.trim(); if (!body || sending) return;
    setSending(true); setText(""); setError(null);
    try {
      const result = await callChatAction("send_message", { threadId: id, body });
      const message = result.message as Message | undefined;
      if (message) setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    } catch { setText(body); setError("Сообщение не отправлено"); }
    finally { setSending(false); }
  }

  if (sessionState !== "verified" && !loading) return <div className="chatScreen"><div className="chatFlowHeader"><Link href="/messages"><Icon name="arrowLeft"/></Link><strong>Чат</strong></div><div className="flatAuth"><strong>Открой TradeUP в Telegram</strong><button onClick={openBot}>Открыть</button></div></div>;

  return (
    <div className="chatScreen">
      <header className="chatFlowHeader">
        <Link href="/messages" aria-label="Назад"><Icon name="arrowLeft"/></Link>
        <Link prefetch={false} href={listing ? `/listing/${listing.id}` : "/messages"} className="chatContext">
          <span className="chatProductThumb"><ProductImage src={type?.image_url} alt={type?.name ?? listing?.title ?? "Товар"} categoryId={type?.category_id ?? ""}/></span>
          <span className="chatContextText"><strong>{other?.first_name ?? "Сообщения"}</strong><small>{listing ? `${listing.title} · ${rubles(listing.price)}` : ""}</small></span>
        </Link>
        <span className={other?.is_online ? "chatPresence online" : "chatPresence"}>{other?.is_online ? "онлайн" : ""}</span>
      </header>

      {loading && <div className="chatLoading" />}
      {error && <div className="chatError">{error}</div>}

      {!loading && <div className="chatMessages">{messages.length === 0 && <div className="chatStart"><strong>Начните диалог</strong><span>Обсудите товар, цену или сделку.</span></div>}{messages.map((message, index) => {
        const own = message.sender_id === profileId;
        const prev = messages[index - 1]; const showDay = !prev || dayKey(prev.created_at) !== dayKey(message.created_at);
        return <div key={message.id}>{showDay && <div className="chatDay">{dayLabel(message.created_at)}</div>}<div className={own ? "chatBubbleRow own" : "chatBubbleRow"}><div className={own ? "chatBubble own" : "chatBubble"}><span>{message.body}</span><time>{timeLabel(message.created_at)}</time></div></div></div>;
      })}<div ref={endRef}/></div>}

      <form className="chatComposer" onSubmit={send}>
        <textarea value={text} onChange={(event) => setText(event.target.value.slice(0, 2000))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Сообщение" rows={1}/>
        <button type="submit" aria-label="Отправить" disabled={!text.trim() || sending}><Icon name="send" size={20}/></button>
      </form>
    </div>
  );
}
