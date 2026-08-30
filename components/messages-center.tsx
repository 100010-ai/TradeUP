"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/icon";
import ProductImage from "@/components/product-image";
import { useTelegramSession } from "@/components/telegram-session";
import { relativeDate, rubles } from "@/lib/product";

type Thread = { id: string; listing_id: string; buyer_id: string; seller_id: string; last_message_at: string | null; last_message_preview: string; last_sender_id: string | null; buyer_read_at: string | null; seller_read_at: string | null; updated_at: string };
type ChatProfile = { id: string; first_name: string; username: string | null; photo_url: string | null; rating: number; deals_count: number; is_online: boolean; last_seen_at: string };
type ItemType = { name: string; brand: string | null; image_url: string | null; category_id: string };
type InventoryJoin = { item_types: ItemType | ItemType[] | null };
type ChatListing = { id: string; title: string; price: number | string; status: string; seller_id: string; inventory_items: InventoryJoin | InventoryJoin[] | null };
type ThreadsResult = { profileId?: string; threads?: Thread[]; profiles?: ChatProfile[]; listings?: ChatListing[] };

function getItemType(listing: ChatListing | undefined) {
  if (!listing?.inventory_items) return null;
  const inventory = Array.isArray(listing.inventory_items) ? listing.inventory_items[0] : listing.inventory_items;
  if (!inventory?.item_types) return null;
  return Array.isArray(inventory.item_types) ? inventory.item_types[0] ?? null : inventory.item_types;
}

export default function MessagesCenter() {
  const session = useTelegramSession();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [profiles, setProfiles] = useState<ChatProfile[]>([]);
  const [listings, setListings] = useState<ChatListing[]>([]);
  const [profileId, setProfileId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(silent = false) {
    if (session.state !== "verified") { if (!silent) setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const result = await session.callChatAction("threads") as ThreadsResult;
      setThreads(result.threads ?? []); setProfiles(result.profiles ?? []); setListings(result.listings ?? []); setProfileId(result.profileId ?? ""); setError(null);
    } catch { setError("Не удалось загрузить сообщения"); }
    finally { if (!silent) setLoading(false); }
  }

  useEffect(() => {
    if (session.state !== "verified") { if (["browser","unavailable","error"].includes(session.state)) setLoading(false); return; }
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 5000);
    return () => window.clearInterval(timer);
  }, [session.state]);

  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const listingMap = useMemo(() => new Map(listings.map((listing) => [listing.id, listing])), [listings]);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    if (!normalized) return threads;
    return threads.filter((thread) => {
      const otherId = thread.buyer_id === profileId ? thread.seller_id : thread.buyer_id;
      const other = profileMap.get(otherId); const listing = listingMap.get(thread.listing_id);
      return `${other?.first_name ?? ""} ${listing?.title ?? ""} ${thread.last_message_preview}`.toLocaleLowerCase("ru").includes(normalized);
    });
  }, [threads, query, profileId, profileMap, listingMap]);

  if (session.state !== "verified" && !loading) return <div className="flatAuth"><Icon name="message" size={32}/><strong>Сообщения доступны в Telegram</strong><button type="button" onClick={session.openBot}>Открыть TradeUP</button></div>;

  return (
    <div className="messagesPage">
      <div className="flatPageTitle"><h1>Сообщения</h1></div>
      <label className="messageSearch"><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск"/></label>
      {loading && <div className="messageListSkeleton" />}
      {error && <div className="flatNotice">{error}</div>}
      {!loading && !error && visible.length === 0 && <div className="flatEmpty messagesEmpty"><Icon name="message" size={30}/><strong>{threads.length ? "Ничего не найдено" : "Сообщений пока нет"}</strong><span>{threads.length ? "Измени запрос" : "Напиши продавцу из объявления"}</span></div>}
      {!loading && visible.length > 0 && <div className="messageList">{visible.map((thread) => {
        const otherId = thread.buyer_id === profileId ? thread.seller_id : thread.buyer_id;
        const other = profileMap.get(otherId); const listing = listingMap.get(thread.listing_id); const type = getItemType(listing);
        const readAt = thread.buyer_id === profileId ? thread.buyer_read_at : thread.seller_read_at;
        const unread = Boolean(thread.last_message_at && thread.last_sender_id !== profileId && (!readAt || new Date(thread.last_message_at).getTime() > new Date(readAt).getTime()));
        return <Link href={`/messages/${thread.id}`} className={unread ? "messageRow unread" : "messageRow"} key={thread.id}>
          <div className="messageThumb"><ProductImage src={type?.image_url} alt={type?.name ?? listing?.title ?? "Товар"} categoryId={type?.category_id ?? ""}/></div>
          <div className="messageMain"><div className="messageNameLine"><strong>{other?.first_name ?? "Пользователь"}</strong><time>{thread.last_message_at ? relativeDate(thread.last_message_at) : ""}</time></div><div className="messageListingLine">{listing?.title ?? "Объявление"}{listing ? ` · ${rubles(listing.price)}` : ""}</div><div className="messagePreview">{thread.last_message_preview || "Начните переписку"}</div></div>
          {unread && <i className="messageUnreadDot" />}
        </Link>;
      })}</div>}
    </div>
  );
}
