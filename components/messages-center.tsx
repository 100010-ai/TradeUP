"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/icon";
import { useTelegramSession } from "@/components/telegram-session";
import { relativeDate, rubles } from "@/lib/product";

type Thread = { id: string; listing_id: string; buyer_id: string; seller_id: string; last_message_at: string | null; last_message_preview: string; last_sender_id: string | null; buyer_read_at: string | null; seller_read_at: string | null; updated_at: string };
type ChatProfile = { id: string; first_name: string; username: string | null; photo_url: string | null; rating: number; deals_count: number; is_online: boolean; last_seen_at: string };
type ItemType = { name: string; brand: string | null; image_url: string | null; category_id: string };
type InventoryJoin = { item_types: ItemType | ItemType[] | null };
type ChatListing = { id: string; title: string; price: number | string; status: string; seller_id: string; inventory_items: InventoryJoin | InventoryJoin[] | null };
type SystemChat = { id: "tradeup" | "support"; kind: string; title: string; subtitle: string; preview: string; updatedAt: string; unread: boolean; status: string };
type ThreadsResult = { profileId?: string; threads?: Thread[]; profiles?: ChatProfile[]; listings?: ChatListing[]; systemChats?: SystemChat[] };

export default function MessagesCenter() {
  const { state: sessionState, callChatAction, openBot } = useTelegramSession();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [systemChats, setSystemChats] = useState<SystemChat[]>([]);
  const [profiles, setProfiles] = useState<ChatProfile[]>([]);
  const [listings, setListings] = useState<ChatListing[]>([]);
  const [profileId, setProfileId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadInFlight = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (sessionState !== "verified") { if (!silent) setLoading(false); return; }
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    if (!silent) setLoading(true);
    try {
      const result = await callChatAction("threads") as ThreadsResult;
      setThreads(result.threads ?? []);
      setSystemChats(result.systemChats ?? []);
      setProfiles(result.profiles ?? []);
      setListings(result.listings ?? []);
      setProfileId(result.profileId ?? "");
      setError(null);
    } catch {
      setError("Не удалось загрузить чаты");
    } finally {
      loadInFlight.current = false;
      if (!silent) setLoading(false);
    }
  }, [sessionState, callChatAction]);

  useEffect(() => {
    if (sessionState !== "verified") {
      if (["browser", "unavailable", "error"].includes(sessionState)) setLoading(false);
      return;
    }
    const poll = () => { if (document.visibilityState === "visible") void load(true); };
    void load();
    const timer = window.setInterval(poll, 10_000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [sessionState, load]);

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const listingMap = useMemo(() => new Map(listings.map((listing) => [listing.id, listing])), [listings]);
  const normalized = query.trim().toLocaleLowerCase("ru");
  const visibleSystems = useMemo(() => !normalized ? systemChats : systemChats.filter((chat) => `${chat.title} ${chat.subtitle} ${chat.preview}`.toLocaleLowerCase("ru").includes(normalized)), [systemChats, normalized]);
  const visible = useMemo(() => {
    if (!normalized) return threads;
    return threads.filter((thread) => {
      const otherId = thread.buyer_id === profileId ? thread.seller_id : thread.buyer_id;
      const other = profileMap.get(otherId);
      const listing = listingMap.get(thread.listing_id);
      return `${other?.first_name ?? ""} ${other?.username ?? ""} ${listing?.title ?? ""} ${thread.last_message_preview}`.toLocaleLowerCase("ru").includes(normalized);
    });
  }, [threads, normalized, profileId, profileMap, listingMap]);

  if (sessionState !== "verified" && !loading) {
    return <div className="flatAuth"><Icon name="message" size={32}/><strong>Чаты доступны в Telegram</strong><button type="button" onClick={openBot}>Открыть TradeUP</button></div>;
  }

  const nothing = !loading && !error && visibleSystems.length === 0 && visible.length === 0;

  return (
    <div className="messagesPage">
      <div className="flatPageTitle"><h1>Чаты</h1></div>
      <label className="messageSearch"><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск"/></label>

      {loading && <div className="messageListSkeleton" />}
      {error && <div className="flatNotice">{error}</div>}
      {nothing && <div className="flatEmpty messagesEmpty"><Icon name="message" size={30}/><strong>Ничего не найдено</strong><span>Измени запрос</span></div>}

      {!loading && !error && (visibleSystems.length > 0 || visible.length > 0) && <div className="messageList">
        {visibleSystems.map((chat) => <Link prefetch={false} href={`/messages/${chat.id}`} className={chat.unread ? "messageRow systemChatRow unread" : "messageRow systemChatRow"} key={chat.id}>
          <div className={chat.id === "tradeup" ? "messagePersonAvatar systemAvatar tradeup" : "messagePersonAvatar systemAvatar support"}><Icon name={chat.id === "tradeup" ? "bot" : "message"} size={21}/></div>
          <div className="messageMain">
            <div className="messageNameLine"><strong>{chat.title}</strong><time>{chat.updatedAt && new Date(chat.updatedAt).getTime() > 0 ? relativeDate(chat.updatedAt) : ""}</time></div>
            <div className="messagePreview">{chat.preview}</div>
            <div className="messageListingLine systemChatSubtitle">{chat.subtitle}</div>
          </div>
          {chat.unread && <i className="messageUnreadBadge">1</i>}
        </Link>)}

        {visible.map((thread) => {
          const otherId = thread.buyer_id === profileId ? thread.seller_id : thread.buyer_id;
          const other = profileMap.get(otherId);
          const listing = listingMap.get(thread.listing_id);
          const readAt = thread.buyer_id === profileId ? thread.buyer_read_at : thread.seller_read_at;
          const unread = Boolean(thread.last_message_at && thread.last_sender_id !== profileId && (!readAt || new Date(thread.last_message_at).getTime() > new Date(readAt).getTime()));
          const initial = other?.first_name?.trim().charAt(0).toUpperCase() || "T";
          return <Link prefetch={false} href={`/messages/${thread.id}`} className={unread ? "messageRow unread" : "messageRow"} key={thread.id}>
            <div className="messagePersonAvatar">{other?.photo_url ? <img src={other.photo_url} alt="" loading="lazy" decoding="async"/> : <span>{initial}</span>}{other?.is_online && <i />}</div>
            <div className="messageMain">
              <div className="messageNameLine"><strong>{other?.first_name ?? "Пользователь"}</strong><time>{thread.last_message_at ? relativeDate(thread.last_message_at) : ""}</time></div>
              <div className="messagePreview">{thread.last_message_preview || "Начните переписку"}</div>
              <div className="messageListingLine">{listing?.title ?? "Объявление"}{listing ? ` · ${rubles(listing.price)}` : ""}</div>
            </div>
            {unread && <i className="messageUnreadBadge">1</i>}
          </Link>;
        })}
      </div>}
    </div>
  );
}
