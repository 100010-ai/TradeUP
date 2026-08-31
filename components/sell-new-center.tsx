"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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

  const sessionState = session.state;
  const callAction = session.callAction;

  const loadInventory = useCallback(async () => {
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
      setError("Не удалось загрузить инвентарь");
    } finally {
      setLoading(false);
    }
  }, [sessionState, callAction]);

  useEffect(() => {
    if (sessionState === "verified") void loadInventory();
    else if (["browser", "unavailable", "error"].includes(sessionState)) setLoading(false);
  }, [sessionState, loadInventory]);

  const blocked = useMemo(() => new Set(liveListings.map((listing) => listing.inventory_item_id)), [liveListings]);
  const available = useMemo(() => inventory.filter((item) => !blocked.has(item.id) && !item.is_locked), [inventory, blocked]);
  const selected = available.find((item) => item.id === selectedId) ?? null;
  const requestedUnavailable = Boolean(selectedId && !selected && !loading && !error);

  useEffect(() => {
    if (!selected) return;
    const type = selected.item_types;
    setTitle(type?.name ?? "");
    setPrice(String(Math.max(1, estimateFairValue(type?.base_value ?? 0, selected.condition))));
    setDescription("");
  }, [selected]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || submitting) return;
    const cleanTitle = title.trim();
    const numericPrice = Number(price);
    if (cleanTitle.length < 3 || cleanTitle.length > 100) {
      setError("Название должно быть от 3 до 100 символов");
      return;
    }
    if (!Number.isSafeInteger(numericPrice) || numericPrice <= 0) {
      setError("Укажи корректную цену");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await callAction("create_listing", { itemId: selected.id, price: numericPrice, title: cleanTitle, description: description.trim() });
      const listingId = typeof result.listingId === "string" ? result.listingId : null;
      router.push(listingId ? `/listing/${listingId}` : "/sell");
      router.refresh();
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "game_action_failed";
      setError(code === "invalid_price" ? "Проверь цену" : code === "item_locked" ? "Предмет уже выставлен или участвует в другой сделке" : "Не удалось разместить объявление");
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionState !== "verified" && !loading) {
    return <div className="flatFlowPage"><div className="flatFlowHeader"><button type="button" onClick={() => router.back()} aria-label="Назад"><Icon name="arrowLeft"/></button><strong>Новое объявление</strong></div><div className="flatAuth"><strong>Открой TradeUP в Telegram</strong><button type="button" onClick={session.openBot}>Открыть</button></div></div>;
  }

  return (
    <div className="flatFlowPage" aria-busy={loading || submitting}>
      <div className="flatFlowHeader"><button type="button" onClick={() => router.back()} aria-label="Назад"><Icon name="arrowLeft"/></button><strong>Новое объявление</strong></div>
      {error && inventory.length > 0 && <div className="flatNotice flowNotice" role="alert">{error}</div>}
      {loading && <div className="flatListSkeleton" aria-label="Загрузка инвентаря" />}

      {!loading && error && inventory.length === 0 && (
        <div className="routeStatePage" role="alert">
          <Icon name="info" size={30}/><h1>Инвентарь не загрузился</h1><p>Проверь соединение и попробуй ещё раз.</p>
          <div className="routeStateActions"><button type="button" className="inlineAction primary" onClick={() => void loadInventory()}>Повторить</button><Link className="inlineAction" href="/sell">Назад</Link></div>
        </div>
      )}

      {!loading && !error && !selected && (
        <section className="flatChooseItem">
          <h1>Что продаём?</h1>
          {requestedUnavailable && <div className="flatNotice" role="status">Этот предмет уже занят другим объявлением или сделкой. Выбери другой.</div>}
          {available.map((item) => <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} className="flatInventoryRow chooseRow"><span className="flatInventoryImage"><ProductImage src={item.item_types?.image_url} alt={item.item_types?.name ?? "Предмет"} categoryId={item.item_types?.category_id ?? ""}/></span><span className="flatInventoryMain"><strong>{item.item_types?.name ?? "Предмет"}</strong><span>{conditionLabel(item.condition)} · куплен за {rubles(item.acquired_price)}</span></span><Icon name="chevronRight" size={18}/></button>)}
          {available.length === 0 && (
            <div className="flatEmpty">
              <Icon name="inventory" size={30}/><strong>Свободных предметов нет</strong><span>{inventory.length ? "Все предметы уже выставлены или участвуют в сделках." : "Сначала купи что-нибудь на рынке."}</span>
              <Link className="inlineAction primary" href="/">На рынок</Link>
            </div>
          )}
        </section>
      )}

      {!loading && selected && (
        <form className="flatListingForm" onSubmit={submit}>
          <div className="flatSelectedItem"><div className="flatSelectedImage"><ProductImage src={selected.item_types?.image_url} alt={selected.item_types?.name ?? "Предмет"} categoryId={selected.item_types?.category_id ?? ""}/></div><div><strong>{selected.item_types?.name ?? "Предмет"}</strong><span>{conditionLabel(selected.condition)}</span></div><button type="button" className="flatTextAction" onClick={() => setSelectedId("")} disabled={submitting}>Изменить</button></div>

          <label className="flatFormField"><span>Название</span><input value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={100} autoComplete="off" required /></label>
          <label className="flatFormField"><span>Цена</span><div className="flatMoneyInput"><input value={price} onChange={(event) => setPrice(event.target.value.replace(/[^0-9]/g, "").slice(0, 12))} inputMode="numeric" aria-describedby="listing-price-hint" required/><b>₽</b></div><small id="listing-price-hint">Ориентир {rubles(estimateFairValue(selected.item_types?.base_value ?? 0, selected.condition))}</small></label>
          <label className="flatFormField"><span>Описание</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} placeholder="Необязательно" /><small>{description.length} / 2000</small></label>

          <div className="flatPublishSummary"><span>После комиссии 4%</span><strong>{rubles(Math.max(0, Number(price || 0) * .96))}</strong></div>
          <div className="flatFlowBottom"><button type="submit" disabled={submitting || !price || title.trim().length < 3}>{submitting ? "Размещаем…" : "Разместить объявление"}</button></div>
        </form>
      )}
    </div>
  );
}
