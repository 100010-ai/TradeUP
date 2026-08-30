"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/icon";
import ProductImage from "@/components/product-image";
import { useTelegramSession } from "@/components/telegram-session";
import { conditionLabel, rubles, type InventoryItem, type LiveInventoryListing } from "@/lib/product";

type InventoryResult = { ok?: boolean; inventory?: InventoryItem[]; liveListings?: LiveInventoryListing[] };

export default function SellCenter() {
  const session = useTelegramSession();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [liveListings, setLiveListings] = useState<LiveInventoryListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  async function load() {
    if (session.state !== "verified") { setLoading(false); return; }
    setLoading(true);
    try {
      const result = await session.callAction("inventory") as InventoryResult;
      setInventory(result.inventory ?? []);
      setLiveListings(result.liveListings ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить объявления");
    } finally { setLoading(false); }
  }

  useEffect(() => { if (session.state === "verified") void load(); else if (["browser","unavailable","error"].includes(session.state)) setLoading(false); }, [session.state]);
  const activeByItem = useMemo(() => new Map(liveListings.map((listing) => [listing.inventory_item_id, listing])), [liveListings]);

  async function cancel(listingId: string) {
    setActionId(listingId); setError(null);
    try { await session.callAction("cancel_listing", { listingId }); await load(); } catch { setError("Не удалось снять объявление"); } finally { setActionId(null); }
  }

  if (session.state !== "verified" && !loading) return <div className="flatAuth"><Icon name="inventory" size={32}/><strong>Объявления доступны в Telegram</strong><button type="button" onClick={session.openBot}>Открыть TradeUP</button></div>;

  const available = inventory.filter((item) => !activeByItem.has(item.id));

  return (
    <div className="flatSellPage">
      <div className="flatPageTitle"><h1>Мои объявления</h1><span>{liveListings.length} активных</span></div>
      {error && <div className="flatNotice">{error}</div>}
      {loading && <div className="flatListSkeleton" />}

      {!loading && liveListings.length > 0 && (
        <section className="flatInventorySection">
          <h2>На продаже</h2>
          {liveListings.map((listing) => {
            const item = inventory.find((entry) => entry.id === listing.inventory_item_id);
            const type = item?.item_types;
            return <div className="flatInventoryRow" key={listing.id}>
              <Link href={`/listing/${listing.id}`} className="flatInventoryImage"><ProductImage src={type?.image_url} alt={type?.name ?? listing.title} categoryId={type?.category_id ?? ""}/></Link>
              <Link href={`/listing/${listing.id}`} className="flatInventoryMain"><strong>{listing.title}</strong><span>{rubles(listing.price)} · {item ? conditionLabel(item.condition) : ""}</span></Link>
              <button type="button" className="flatRowAction" onClick={() => void cancel(listing.id)} disabled={actionId === listing.id}>Снять</button>
            </div>;
          })}
        </section>
      )}

      {!loading && (
        <section className="flatInventorySection">
          <h2>Можно выставить</h2>
          {available.length === 0 && <div className="flatInlineEmpty">Нет свободных предметов</div>}
          {available.map((item) => {
            const type = item.item_types;
            return <div className="flatInventoryRow" key={item.id}>
              <div className="flatInventoryImage"><ProductImage src={type?.image_url} alt={type?.name ?? "Предмет"} categoryId={type?.category_id ?? ""}/></div>
              <div className="flatInventoryMain"><strong>{type?.name ?? "Предмет"}</strong><span>{conditionLabel(item.condition)} · куплен за {rubles(item.acquired_price)}</span></div>
              <Link href={`/sell/new?item=${item.id}`} className="flatRowPrimary">Разместить</Link>
            </div>;
          })}
        </section>
      )}
    </div>
  );
}
