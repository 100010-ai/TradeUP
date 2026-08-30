"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/icon";
import ProductImage from "@/components/product-image";
import { useTelegramSession } from "@/components/telegram-session";
import { conditionLabel, estimateFairValue, rubles, type InventoryItem, type LiveInventoryListing } from "@/lib/product";

type InventoryResult = { inventory?: InventoryItem[]; liveListings?: LiveInventoryListing[] };

export default function SellNewCenter({ itemId }: { itemId: string | null }) {
  const session = useTelegramSession();
  const router = useRouter();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [liveListings, setLiveListings] = useState<LiveInventoryListing[]>([]);
  const [selectedId, setSelectedId] = useState(itemId ?? "");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.state !== "verified") { if (["browser","unavailable","error"].includes(session.state)) setLoading(false); return; }
    void session.callAction("inventory").then((raw) => {
      const result = raw as InventoryResult;
      setInventory(result.inventory ?? []); setLiveListings(result.liveListings ?? []);
    }).catch(() => setError("Не удалось загрузить инвентарь")).finally(() => setLoading(false));
  }, [session.state]);

  const blocked = useMemo(() => new Set(liveListings.map((listing) => listing.inventory_item_id)), [liveListings]);
  const selected = inventory.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    const type = selected.item_types;
    setTitle((current) => current || type?.name || "");
    setPrice((current) => current || String(estimateFairValue(type?.base_value ?? 0, selected.condition)));
  }, [selected]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSubmitting(true); setError(null);
    try {
      const result = await session.callAction("create_listing", { itemId: selected.id, price: Number(price), title, description });
      const listingId = typeof result.listingId === "string" ? result.listingId : null;
      router.push(listingId ? `/listing/${listingId}` : "/sell");
      router.refresh();
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "game_action_failed";
      setError(code === "invalid_price" ? "Проверь цену" : code === "item_locked" ? "Предмет уже выставлен" : "Не удалось разместить объявление");
    } finally { setSubmitting(false); }
  }

  if (session.state !== "verified" && !loading) return <div className="flatFlowPage"><div className="flatFlowHeader"><button type="button" onClick={() => router.back()}><Icon name="arrowLeft"/></button><strong>Новое объявление</strong></div><div className="flatAuth"><strong>Открой TradeUP в Telegram</strong><button onClick={session.openBot}>Открыть</button></div></div>;

  return (
    <div className="flatFlowPage">
      <div className="flatFlowHeader"><button type="button" onClick={() => router.back()} aria-label="Назад"><Icon name="arrowLeft"/></button><strong>Новое объявление</strong></div>
      {error && <div className="flatNotice flowNotice">{error}</div>}
      {loading && <div className="flatListSkeleton" />}

      {!loading && !selected && (
        <section className="flatChooseItem">
          <h1>Что продаём?</h1>
          {inventory.filter((item) => !blocked.has(item.id)).map((item) => <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} className="flatInventoryRow chooseRow"><span className="flatInventoryImage"><ProductImage src={item.item_types?.image_url} alt={item.item_types?.name ?? "Предмет"} categoryId={item.item_types?.category_id ?? ""}/></span><span className="flatInventoryMain"><strong>{item.item_types?.name ?? "Предмет"}</strong><span>{conditionLabel(item.condition)}</span></span><Icon name="chevronRight" size={18}/></button>)}
        </section>
      )}

      {!loading && selected && (
        <form className="flatListingForm" onSubmit={submit}>
          <div className="flatSelectedItem"><div className="flatSelectedImage"><ProductImage src={selected.item_types?.image_url} alt={selected.item_types?.name ?? "Предмет"} categoryId={selected.item_types?.category_id ?? ""}/></div><div><strong>{selected.item_types?.name}</strong><span>{conditionLabel(selected.condition)}</span></div><Link href="/sell/new">Изменить</Link></div>

          <label className="flatFormField"><span>Название</span><input value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={100} required /></label>
          <label className="flatFormField"><span>Цена</span><div className="flatMoneyInput"><input value={price} onChange={(event) => setPrice(event.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" required/><b>₽</b></div><small>Ориентир {rubles(estimateFairValue(selected.item_types?.base_value ?? 0, selected.condition))}</small></label>
          <label className="flatFormField"><span>Описание</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} placeholder="Необязательно" /></label>

          <div className="flatPublishSummary"><span>После комиссии</span><strong>{rubles(Math.max(0, Number(price || 0) * .96))}</strong></div>
          <div className="flatFlowBottom"><button type="submit" disabled={submitting || !price || title.trim().length < 3}>{submitting ? "Размещаем..." : "Разместить объявление"}</button></div>
        </form>
      )}
    </div>
  );
}
