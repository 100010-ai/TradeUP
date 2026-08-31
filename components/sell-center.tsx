"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const sessionState = session.state;
  const callAction = session.callAction;

  const load = useCallback(async () => {
    if (sessionState !== "verified") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await callAction("inventory") as InventoryResult;
      setInventory(result.inventory ?? []);
      setLiveListings(result.liveListings ?? []);
    } catch {
      setError("Не удалось загрузить объявления");
    } finally {
      setLoading(false);
    }
  }, [sessionState, callAction]);

  useEffect(() => {
    if (sessionState === "verified") void load();
    else if (["browser", "unavailable", "error"].includes(sessionState)) setLoading(false);
  }, [sessionState, load]);

  const activeByItem = useMemo(() => new Map(liveListings.map((listing) => [listing.inventory_item_id, listing])), [liveListings]);
  const available = useMemo(() => inventory.filter((item) => !activeByItem.has(item.id) && !item.is_locked), [inventory, activeByItem]);
  const unavailableCount = inventory.length - liveListings.length - available.length;

  async function cancel(listingId: string) {
    setActionId(listingId);
    setError(null);
    try {
      await callAction("cancel_listing", { listingId });
      setConfirmCancelId(null);
      await load();
    } catch {
      setError("Не удалось снять объявление");
    } finally {
      setActionId(null);
    }
  }

  if (sessionState !== "verified" && !loading) return <div className="flatAuth"><Icon name="inventory" size={32}/><strong>Объявления доступны в Telegram</strong><button type="button" onClick={session.openBot}>Открыть TradeUP</button></div>;

  if (!loading && error && inventory.length === 0 && liveListings.length === 0) {
    return <div className="routeStatePage" role="alert"><Icon name="info" size={30}/><h1>Инвентарь не загрузился</h1><p>Проверь соединение и попробуй ещё раз.</p><div className="routeStateActions"><button type="button" className="inlineAction primary" onClick={() => void load()}>Повторить</button><Link className="inlineAction" href="/">На рынок</Link></div></div>;
  }

  return (
    <div className="flatSellPage" aria-busy={loading}>
      <div className="flatPageTitle"><h1>Мои объявления</h1><span>{liveListings.length} активных</span></div>
      {error && <div className="flatNotice" role="alert">{error}</div>}
      {loading && <div className="flatListSkeleton" aria-label="Загрузка инвентаря" />}

      {!loading && liveListings.length > 0 && (
        <section className="flatInventorySection">
          <h2>На продаже</h2>
          {liveListings.map((listing) => {
            const item = inventory.find((entry) => entry.id === listing.inventory_item_id);
            const type = item?.item_types;
            const confirming = confirmCancelId === listing.id;
            return <div className="flatInventoryRow" key={listing.id}>
              <Link href={`/listing/${listing.id}`} className="flatInventoryImage" aria-label={`Открыть ${listing.title}`}><ProductImage src={type?.image_url} alt={type?.name ?? listing.title} categoryId={type?.category_id ?? ""}/></Link>
              <Link href={`/listing/${listing.id}`} className="flatInventoryMain"><strong>{listing.title}</strong><span>{rubles(listing.price)}{item ? ` · ${conditionLabel(item.condition)}` : ""}</span></Link>
              {!confirming ? <button type="button" className="flatRowAction" onClick={() => setConfirmCancelId(listing.id)} disabled={actionId !== null}>Снять</button> : <div className="flatRowConfirm" role="group" aria-label={`Снять ${listing.title} с продажи?`}><button type="button" className="flatRowAction danger" onClick={() => void cancel(listing.id)} disabled={actionId === listing.id}>{actionId === listing.id ? "…" : "Да"}</button><button type="button" className="flatRowAction" onClick={() => setConfirmCancelId(null)} disabled={actionId === listing.id}>Нет</button></div>}
            </div>;
          })}
        </section>
      )}

      {!loading && (
        <section className="flatInventorySection">
          <h2>Можно выставить</h2>
          {available.length === 0 && <div className="flatInlineEmpty">{inventory.length === 0 ? "Инвентарь пуст. Сначала купи товар на рынке." : "Свободных предметов сейчас нет."}</div>}
          {unavailableCount > 0 && <div className="flatMuted">Ещё {unavailableCount} предметов заняты аукционами, наборами или другими действиями.</div>}
          {available.map((item) => {
            const type = item.item_types;
            return <Link href={`/sell/new?item=${item.id}`} className="flatInventoryRow inventoryPublishRow" key={item.id}>
              <span className="flatInventoryImage"><ProductImage src={type?.image_url} alt={type?.name ?? "Предмет"} categoryId={type?.category_id ?? ""}/></span>
              <span className="flatInventoryMain"><strong>{type?.name ?? "Предмет"}</strong><span>{conditionLabel(item.condition)} · куплен за {rubles(item.acquired_price)}</span></span>
              <span className="inventoryPublishChevron"><Icon name="chevronRight" size={18}/></span>
            </Link>;
          })}
          {inventory.length === 0 && <Link href="/" className="inlineAction primary">Перейти на рынок</Link>}
        </section>
      )}
    </div>
  );
}
