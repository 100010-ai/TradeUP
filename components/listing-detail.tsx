"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/icon";
import ProductImage from "@/components/product-image";
import { useTelegramSession } from "@/components/telegram-session";
import { getSupabasePublic } from "@/lib/supabase/public";
import { conditionLabel, dealDelta, estimateFairValue, percent, relativeDate, rubles, sellerLevel, type MarketListing } from "@/lib/product";

type PricePoint = { price: number | string; recorded_at: string };

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <div className="sparklineEmpty">История появится после первых сделок</div>;
  const min = Math.min(...points); const max = Math.max(...points); const range = Math.max(1, max - min);
  const coords = points.map((value, index) => `${points.length === 1 ? 50 : (index / (points.length - 1)) * 100},${32 - ((value - min) / range) * 28}`).join(" ");
  return <svg className="sparkline" viewBox="0 0 100 36" preserveAspectRatio="none" aria-label="История цены"><polyline points={coords} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" /></svg>;
}

export default function ListingDetail({ id }: { id: string }) {
  const supabase = useMemo(() => getSupabasePublic(), []);
  const session = useTelegramSession(); const router = useRouter();
  const [listing, setListing] = useState<MarketListing | null>(null); const [history, setHistory] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true); const [actionLoading, setActionLoading] = useState(false); const [offerOpen, setOfferOpen] = useState(false); const [offerAmount, setOfferAmount] = useState(""); const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) throw new Error("Supabase не настроен");
      const listingResult = await supabase.from("market_listings").select("*").eq("id", id).maybeSingle();
      if (listingResult.error) throw listingResult.error;
      if (!listingResult.data) { if (active) setListing(null); return; }
      const typed = listingResult.data as unknown as MarketListing;
      const historyResult = await supabase.from("price_history").select("price,recorded_at").eq("item_type_id", typed.item_type_id).order("recorded_at", { ascending: true }).limit(30);
      if (historyResult.error) throw historyResult.error;
      if (active) { setListing(typed); setOfferAmount(String(Math.max(1, Math.round(Number(typed.price) * .9)))); setHistory((historyResult.data ?? []) as PricePoint[]); }
    }
    void load().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Не удалось открыть лот")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id, supabase]);

  async function toggleFavorite() {
    if (session.state !== "verified") { session.openBot(); return; }
    setActionLoading(true); setMessage(null);
    try { await session.callAction("toggle_favorite", { listingId: id }); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось обновить избранное"); }
    finally { setActionLoading(false); }
  }

  async function buy() {
    if (session.state !== "verified") { session.openBot(); return; }
    setActionLoading(true); setMessage(null);
    try { await session.callAction("buy_listing", { listingId: id }); router.push("/deals"); router.refresh(); }
    catch (error) { const code = error instanceof Error ? error.message : "game_action_failed"; setMessage(code === "insufficient_funds" ? "Не хватает денег на балансе" : code === "listing_not_active" ? "Этот лот уже купили или сняли" : "Покупка не прошла"); }
    finally { setActionLoading(false); }
  }

  async function createOffer(event: React.FormEvent) {
    event.preventDefault(); if (!listing) return; if (session.state !== "verified") { session.openBot(); return; }
    setActionLoading(true); setMessage(null);
    try { await session.callAction("create_offer", { listingId: id, amount: Number(offerAmount) }); setOfferOpen(false); setMessage(`Предложение ${rubles(offerAmount)} отправлено продавцу`); }
    catch (error) { const code = error instanceof Error ? error.message : "game_action_failed"; setMessage(code === "invalid_offer_amount" ? "Предложение должно быть ниже цены лота, но не меньше 50%" : code === "insufficient_funds" ? "На балансе недостаточно средств" : code === "listing_not_active" ? "Лот уже недоступен" : "Не удалось отправить предложение"); }
    finally { setActionLoading(false); }
  }

  async function cancel() {
    setActionLoading(true); setMessage(null);
    try { await session.callAction("cancel_listing", { listingId: id }); router.push("/sell"); router.refresh(); }
    catch { setMessage("Не удалось снять лот"); }
    finally { setActionLoading(false); }
  }

  if (loading) return <div className="detailSkeleton" />;
  if (!listing) return <div className="emptyPanel"><div className="emptySymbol"><Icon name="info" /></div><h3>Лота больше нет на рынке</h3><p>Его могли купить или продавец снял объявление.</p><Link href="/" className="primaryAction">Вернуться на рынок</Link></div>;

  const fair = estimateFairValue(listing.base_value, listing.condition); const delta = dealDelta(listing.price, listing.base_value, listing.condition); const isOwner = session.profile?.id === listing.seller_id; const favorite = session.favoriteIds.has(listing.id); const pricePoints = history.map((item) => Number(item.price)).filter(Number.isFinite); const askingPrice = Number(listing.price); const offerNumber = Number(offerAmount || 0); const offerPercent = askingPrice > 0 ? Math.round((offerNumber / askingPrice) * 100) : 0;

  return <div className="listingDetailPage">
    <Link href="/" className="backLink"><Icon name="arrowLeft" size={15} /> Назад к рынку</Link>
    <section className="detailGrid">
      <div className={`detailVisual category-${listing.category_id}`}>
        <ProductImage src={listing.image_url} alt={listing.item_name} categoryId={listing.category_id} loading="eager" />
        {listing.image_source_url && (listing.image_credit || listing.image_license) && <a className="detailImageCredit" href={listing.image_source_url} target="_blank" rel="noreferrer" title="Источник изображения">Фото: {listing.image_credit ?? "источник"}{listing.image_license ? ` · ${listing.image_license}` : ""}</a>}
        <div className="detailVisualMeta"><span>{listing.category_name}</span><strong>{listing.condition}%</strong></div>
      </div>
      <div className="detailInfo">
        <div className="detailTopline"><span>{listing.brand ?? listing.category_name}</span><button type="button" className={favorite ? "favoriteRound active" : "favoriteRound"} onClick={() => void toggleFavorite()} disabled={actionLoading} aria-label="В избранное"><Icon name="heart" size={20} fill={favorite ? "currentColor" : "none"} /></button></div>
        <h1>{listing.title}</h1>
        <div className="detailPriceRow"><strong>{rubles(listing.price)}</strong><span className={delta <= -5 ? "priceSignal good" : delta >= 8 ? "priceSignal high" : "priceSignal"}>{percent(delta, false)} к ориентиру</span></div>
        <p className="detailDescription">{listing.description || "Продавец не добавил описание."}</p>
        <div className="detailFacts"><div><span>Состояние</span><strong>{conditionLabel(listing.condition)}</strong></div><div><span>Ориентир</span><strong>{rubles(fair)}</strong></div><div><span>Опубликовано</span><strong>{relativeDate(listing.created_at)}</strong></div><div><span>Просмотры</span><strong>{listing.views}</strong></div></div>
        {message && <div className="actionMessage successAware">{message}</div>}
        <div className="detailActions">{isOwner ? <button type="button" className="secondaryDanger" onClick={() => void cancel()} disabled={actionLoading}>Снять с продажи</button> : <><button type="button" className="buyButton" onClick={() => void buy()} disabled={actionLoading}>{actionLoading ? "Проверяем" : session.state === "verified" ? `Купить за ${rubles(listing.price)}` : "Открыть в Telegram"}</button><button type="button" className="offerButton" onClick={() => session.state === "verified" ? setOfferOpen((value) => !value) : session.openBot()} disabled={actionLoading}>Предложить цену</button></>}{!isOwner && <span className="feeHint">Комиссию 4% платит продавец.</span>}</div>
        {offerOpen && !isOwner && <form className="offerComposer" onSubmit={createOffer}><div className="offerComposerHead"><div><span className="sectionEyebrow">Торг</span><strong>Твоя цена</strong></div><button type="button" onClick={() => setOfferOpen(false)} aria-label="Закрыть"><Icon name="close" size={16} /></button></div><div className="offerInputRow"><input value={offerAmount} onChange={(event) => setOfferAmount(event.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" autoFocus /><b>₽</b></div><div className="offerQuickRow">{[85,90,95].map((value) => <button key={value} type="button" onClick={() => setOfferAmount(String(Math.round(askingPrice * value / 100)))}>{value}%</button>)}<span>{offerPercent}% от цены</span></div><button className="offerSubmit" type="submit" disabled={actionLoading || !offerAmount}>Отправить предложение</button><p>Деньги спишутся только если продавец примет оффер.</p></form>}
      </div>
    </section>
    <section className="detailLowerGrid"><div className="infoCard sellerCard"><span className="sectionEyebrow">Продавец</span><div className="sellerProfileRow"><div className="sellerAvatarLarge">{listing.seller_photo_url ? <img src={listing.seller_photo_url} alt="" /> : listing.seller_first_name.charAt(0).toUpperCase()}</div><div><h3>{listing.seller_first_name}</h3><p>{sellerLevel(listing.seller_rating)} · {listing.seller_deals_count} сделок</p></div><div className="ratingPill sellerRating"><Icon name="star" size={11} />{listing.seller_rating}</div></div>{listing.seller_username && <div className="sellerUsername">@{listing.seller_username}</div>}</div><div className="infoCard priceHistoryCard"><div className="cardHeadingInline"><div><span className="sectionEyebrow">Цена</span><h3>История предмета</h3></div><strong>{pricePoints.length} точек</strong></div><Sparkline points={pricePoints} /><p>График строится по реальным завершённым сделкам.</p></div></section>
  </div>;
}
