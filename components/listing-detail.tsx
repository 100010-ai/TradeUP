"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/icon";
import ListingMarketContext from "@/components/listing-market-context";
import ProductImage from "@/components/product-image";
import { useTelegramSession } from "@/components/telegram-session";
import { getSupabasePublic } from "@/lib/supabase/public";
import { conditionLabel, dealDelta, estimateFairValue, percent, relativeDate, rubles, sellerLevel, type MarketListing } from "@/lib/product";

type PricePoint = { price: number | string; recorded_at: string };

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <span className="flatMuted">Истории продаж пока нет</span>;
  const min = Math.min(...points); const max = Math.max(...points); const range = Math.max(1, max - min);
  const coords = points.map((value, index) => `${points.length === 1 ? 50 : (index / (points.length - 1)) * 100},${32 - ((value - min) / range) * 28}`).join(" ");
  return <svg className="sparkline" viewBox="0 0 100 36" preserveAspectRatio="none"><polyline points={coords} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" /></svg>;
}

export default function ListingDetail({ id }: { id: string }) {
  const supabase = useMemo(() => getSupabasePublic(), []);
  const session = useTelegramSession();
  const router = useRouter();
  const [listing, setListing] = useState<MarketListing | null>(null);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);

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
      if (active) { setListing(typed); setOfferAmount(String(Math.max(1, Math.round(Number(typed.price) * 0.9)))); setHistory((historyResult.data ?? []) as PricePoint[]); }
    }
    void load().catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : "Не удалось открыть объявление")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id, supabase]);

  useEffect(() => {
    if (session.state !== "verified" || !listing || session.profile?.id === listing.seller_id) return;
    let active = true;
    void session.callAction("view_listing", { listingId: listing.id }).then((result) => {
      if (!active || result.counted !== true) return;
      setListing((current) => current && current.id === listing.id ? { ...current, views: current.views + 1 } : current);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [listing?.id, listing?.seller_id, session.state, session.profile?.id, session]);

  async function toggleFavorite() {
    if (session.state !== "verified") return session.openBot();
    setActionLoading(true);
    try { await session.callAction("toggle_favorite", { listingId: id }); } catch { setMessage("Не удалось обновить избранное"); } finally { setActionLoading(false); }
  }

  async function openChat() {
    if (session.state !== "verified") return session.openBot();
    setActionLoading(true); setMessage(null);
    try {
      const result = await session.callChatAction("start_thread", { listingId: id });
      if (typeof result.threadId === "string") router.push(`/messages/${result.threadId}`);
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "chat_failed";
      setMessage(code === "cannot_chat_with_self" ? "Это твоё объявление" : "Не удалось открыть чат");
    } finally { setActionLoading(false); }
  }

  async function buy() {
    if (session.state !== "verified") return session.openBot();
    setActionLoading(true); setMessage(null);
    try { await session.callAction("buy_listing", { listingId: id }); router.push("/deals"); router.refresh(); }
    catch (reason) { const code = reason instanceof Error ? reason.message : "game_action_failed"; setMessage(code === "insufficient_funds" ? "Не хватает денег" : code === "listing_not_active" ? "Объявление уже недоступно" : "Покупка не прошла"); }
    finally { setActionLoading(false); }
  }

  async function createOffer(event: React.FormEvent) {
    event.preventDefault();
    if (!listing) return;
    if (session.state !== "verified") return session.openBot();
    setActionLoading(true); setMessage(null);
    try { await session.callAction("create_offer", { listingId: id, amount: Number(offerAmount) }); setOfferOpen(false); setMessage("Предложение отправлено. У продавца будет 24 часа на ответ."); }
    catch (reason) { const code = reason instanceof Error ? reason.message : "game_action_failed"; setMessage(code === "invalid_offer_amount" ? "Цена должна быть от 50% до 99% стоимости" : code === "insufficient_funds" ? "Недостаточно средств" : code === "counter_offer_pending" ? "Сначала ответь на встречное предложение в разделе сделок" : "Не удалось отправить предложение"); }
    finally { setActionLoading(false); }
  }

  async function cancel() {
    setActionLoading(true);
    try { await session.callAction("cancel_listing", { listingId: id }); router.push("/sell"); router.refresh(); }
    catch { setMessage("Не удалось снять объявление"); }
    finally { setActionLoading(false); }
  }

  if (loading) return <div className="detailSkeleton flatDetailSkeleton" />;
  if (!listing) return <div className="flatEmpty pageEmpty"><Icon name="tag" size={30}/><strong>Объявление недоступно</strong><Link href="/">На рынок</Link></div>;

  const fair = estimateFairValue(listing.base_value, listing.condition);
  const delta = dealDelta(listing.price, listing.base_value, listing.condition);
  const isOwner = session.profile?.id === listing.seller_id;
  const favorite = session.favoriteIds.has(listing.id);
  const points = history.map((item) => Number(item.price)).filter(Number.isFinite);
  const asking = Number(listing.price);

  return (
    <div className="flatListingPage">
      <div className="flatDetailTop">
        <Link href="/" aria-label="Назад"><Icon name="arrowLeft" /></Link>
        <button type="button" aria-label="В избранное" onClick={() => void toggleFavorite()} className={favorite ? "flatIconButton active" : "flatIconButton"}><Icon name="heart" /></button>
      </div>

      <div className={`flatDetailImage category-${listing.category_id}`}>
        <ProductImage src={listing.image_url} alt={listing.item_name} categoryId={listing.category_id} loading="eager" />
      </div>

      <section className="flatDetailMain">
        <div className="flatPriceLine"><strong>{rubles(listing.price)}</strong>{Math.abs(delta) >= 5 && <span className={delta < 0 ? "good" : "high"}>{percent(delta, false)}</span>}</div>
        <h1>{listing.title}</h1>
        <div className="flatSubline">{[listing.brand, conditionLabel(listing.condition), relativeDate(listing.created_at)].filter(Boolean).join(" · ")}</div>

        {message && <div className="flatNotice">{message}</div>}

        {!isOwner && (
          <div className="flatPrimaryActions">
            <button type="button" className="flatBuy" onClick={() => void buy()} disabled={actionLoading}>{session.state === "verified" ? "Купить" : "Открыть в Telegram"}</button>
            <button type="button" className="flatChatButton" onClick={() => void openChat()} disabled={actionLoading}><Icon name="message" size={19}/>Написать</button>
          </div>
        )}
        {!isOwner && <button type="button" className="flatTextAction" onClick={() => session.state === "verified" ? setOfferOpen((value) => !value) : session.openBot()}>Предложить свою цену</button>}
        {isOwner && <button type="button" className="flatDangerAction" onClick={() => void cancel()} disabled={actionLoading}>Снять объявление</button>}

        {offerOpen && !isOwner && (
          <form className="flatOfferForm" onSubmit={createOffer}>
            <div className="flatField"><label>Твоя цена</label><div className="flatMoneyInput"><input value={offerAmount} onChange={(event) => setOfferAmount(event.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" autoFocus/><b>₽</b></div></div>
            <div className="flatQuickPrices">{[85,90,95].map((value) => <button type="button" key={value} onClick={() => setOfferAmount(String(Math.round(asking * value / 100)))}>{value}%</button>)}</div>
            <button className="flatSubmit" type="submit" disabled={!offerAmount || actionLoading}>Отправить</button>
          </form>
        )}
      </section>

      <section className="flatSeller" onClick={() => !isOwner && void openChat()} role={!isOwner ? "button" : undefined}>
        <div className="flatSellerAvatar">{listing.seller_photo_url ? <img src={listing.seller_photo_url} alt=""/> : listing.seller_first_name.charAt(0).toUpperCase()}</div>
        <div><strong>{listing.seller_first_name}</strong><span>{listing.seller_username ? `@${listing.seller_username} · ` : ""}{sellerLevel(listing.seller_rating)} · {listing.seller_deals_count} сделок</span></div>
        <div className="flatSellerRating"><Icon name="star" size={15}/>{listing.seller_rating}</div>
        {!isOwner && <Icon name="chevronRight" size={18}/>} 
      </section>

      <section className="flatSection">
        <h2>Описание</h2>
        <p>{listing.description || "Без описания"}</p>
      </section>

      <section className="flatRows">
        <div><span>Состояние</span><strong>{listing.condition}%</strong></div>
        <div><span>Базовый ориентир</span><strong>{rubles(fair)}</strong></div>
        <div><span>Просмотры</span><strong>{listing.views}</strong></div>
      </section>

      <ListingMarketContext listingId={listing.id}/>

      <section className="flatSection flatHistory">
        <h2>История рынка</h2>
        <Sparkline points={points}/>
      </section>
    </div>
  );
}
