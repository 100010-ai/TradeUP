"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/icon";
import ProductImage from "@/components/product-image";
import { useTelegramSession } from "@/components/telegram-session";
import { categoryMeta, conditionLabel, estimateFairValue, rubles, type InventoryItem, type LiveInventoryListing } from "@/lib/product";

type InventoryResult = { ok?: boolean; inventory?: InventoryItem[]; liveListings?: LiveInventoryListing[] };

export default function SellCenter() {
  const session = useTelegramSession();
  const router = useRouter();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [liveListings, setLiveListings] = useState<LiveInventoryListing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadInventory() {
    if (session.state !== "verified") { setLoading(false); return; }
    setLoading(true);
    try {
      const result = (await session.callAction("inventory")) as InventoryResult;
      setInventory(result.inventory ?? []);
      setLiveListings(result.liveListings ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить инвентарь");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (session.state === "verified") void loadInventory();
    if (["browser", "unavailable", "error"].includes(session.state)) setLoading(false);
  }, [session.state]);

  const activeByItem = useMemo(() => new Map(liveListings.map((listing) => [listing.inventory_item_id, listing])), [liveListings]);
  const selected = inventory.find((item) => item.id === selectedId) ?? null;

  function selectItem(item: InventoryItem) {
    if (activeByItem.has(item.id)) return;
    const itemType = item.item_types;
    setSelectedId(item.id);
    setTitle(itemType?.name ?? "");
    setDescription("");
    setPrice(String(estimateFairValue(itemType?.base_value ?? 0, item.condition)));
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSubmitting(true); setError(null);
    try {
      const result = await session.callAction("create_listing", { itemId: selected.id, price: Number(price), title, description });
      const listingId = typeof result.listingId === "string" ? result.listingId : null;
      router.push(listingId ? `/listing/${listingId}` : "/");
      router.refresh();
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "game_action_failed";
      setError(code === "item_locked" ? "Этот предмет уже выставлен" : code === "invalid_price" ? "Проверь цену" : "Не удалось создать объявление");
    } finally { setSubmitting(false); }
  }

  async function cancel(listingId: string) {
    setSubmitting(true); setError(null);
    try { await session.callAction("cancel_listing", { listingId }); await loadInventory(); }
    catch { setError("Не удалось снять объявление"); }
    finally { setSubmitting(false); }
  }

  if (session.state !== "verified" && !loading) {
    return <div className="authGate"><div className="authGateIcon"><Icon name="inventory" /></div><span className="sectionEyebrow">Продажа</span><h1>Инвентарь в Telegram</h1><p>Открой Mini App через @{session.botUsername}. После первого входа TradeUP выдаст стартовый набор для первых сделок.</p><button type="button" className="primaryAction" onClick={session.openBot}>Открыть TradeUP</button></div>;
  }

  const acquired = Number(selected?.acquired_price ?? 0);
  const asking = Number(price || 0);
  const sellerNet = Math.max(0, asking * 0.96);
  const profit = sellerNet - acquired;

  return (
    <div className="sellPage">
      <div className="pageHeadline"><div><span className="sectionEyebrow">Продать</span><h1>Инвентарь</h1><p>Выбери предмет, назначь цену и отправь его на живой рынок.</p></div><div className="inventoryCounter"><strong>{inventory.length}</strong><span>предметов</span></div></div>

      {session.starterGranted > 0 && <div className="starterBanner"><span><Icon name="sparkles" size={20} /></span><div><strong>Стартовый набор получен</strong><p>{session.starterGranted} предмета уже лежат в инвентаре. Это реальные игровые предметы.</p></div></div>}
      {error && <div className="actionMessage">{error}</div>}
      {loading && <div className="inventoryGrid">{Array.from({ length: 3 }).map((_, index) => <div className="inventorySkeleton" key={index} />)}</div>}
      {!loading && inventory.length === 0 && <div className="emptyPanel"><div className="emptySymbol"><Icon name="inventory" /></div><h3>Инвентарь пуст</h3><p>После покупки товары будут появляться здесь и их можно будет перепродавать.</p><Link href="/" className="primaryAction">Искать на рынке</Link></div>}

      {!loading && inventory.length > 0 && <div className="inventoryGrid">{inventory.map((item) => {
        const itemType = item.item_types;
        const live = activeByItem.get(item.id);
        const meta = categoryMeta[itemType?.category_id ?? ""] ?? { short: "Предмет", icon: "" };
        return <article className={`${selectedId === item.id ? "inventoryCard selected" : "inventoryCard"} ${live ? "listed" : ""}`} key={item.id}>
          <button type="button" className="inventorySelect" onClick={() => selectItem(item)} disabled={Boolean(live)}>
            <div className={`inventoryVisual category-${itemType?.category_id ?? "other"}`}><ProductImage src={itemType?.image_url} alt={itemType?.name ?? "Предмет"} categoryId={itemType?.category_id} /><i>{item.condition}%</i></div>
            <div className="inventoryInfo"><span>{itemType?.brand ?? meta.short}</span><h3>{itemType?.name ?? "Предмет"}</h3><p>{conditionLabel(item.condition)} · закупка {rubles(item.acquired_price)}</p></div>
          </button>
          {live && <div className="listedBar"><div><span>На продаже</span><strong>{rubles(live.price)}</strong></div><div><Link href={`/listing/${live.id}`}>Открыть</Link><button type="button" onClick={() => void cancel(live.id)} disabled={submitting}>Снять</button></div></div>}
        </article>;
      })}</div>}

      {selected && !activeByItem.has(selected.id) && <form className="sellComposer" onSubmit={submit}>
        <div className="composerHeading"><div><span className="sectionEyebrow">Новое объявление</span><h2>{selected.item_types?.name}</h2></div><button type="button" onClick={() => setSelectedId(null)} aria-label="Закрыть"><Icon name="close" size={17} /></button></div>
        <label><span>Название</span><input value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={100} required /></label>
        <label><span>Цена</span><div className="priceInput"><input value={price} onChange={(event) => setPrice(event.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" required /><b>₽</b></div></label>
        <div className="priceAdvisor"><div><span>Ориентир</span><strong>{rubles(estimateFairValue(selected.item_types?.base_value ?? 0, selected.condition))}</strong></div><div><span>После комиссии</span><strong>{rubles(sellerNet)}</strong></div><div><span>Маржа</span><strong className={profit >= 0 ? "profitPositive" : "profitNegative"}>{profit >= 0 ? "+" : ""}{rubles(profit)}</strong></div></div>
        <label><span>Описание</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} placeholder="Состояние, комплект, детали" /></label>
        <button className="publishButton" type="submit" disabled={submitting || !price || title.trim().length < 3}>{submitting ? "Публикуем" : "Выставить на рынок"}</button>
        <p className="composerHint">После продажи TradeUP удержит 4% комиссии.</p>
      </form>}
    </div>
  );
}
