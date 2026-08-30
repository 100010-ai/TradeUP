"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Icon, { categoryIconName } from "@/components/icon";
import { useTelegramSession } from "@/components/telegram-session";
import { categoryMeta, relativeDate, rubles } from "@/lib/product";

type TradeRow = { id: string; listing_id: string; item_id: string; seller_id: string; buyer_id: string; amount: number | string; fee: number | string; seller_profit: number | string | null; completed_at: string };
type ItemRow = { id: string; item_types: { name: string; brand: string | null; category_id: string } | null };
type ListingRow = { id: string; title: string };
type DealsResult = { ok?: boolean; trades?: TradeRow[]; items?: ItemRow[]; listings?: ListingRow[] };
type OfferRow = { id: string; listing_id: string; buyer_id: string; amount: number | string; status: "pending" | "accepted" | "declined" | "cancelled" | "expired"; created_at: string; updated_at: string };
type OfferListing = { id: string; title: string; price: number | string; status: string; seller_id: string };
type OfferProfile = { id: string; username: string | null; first_name: string; photo_url: string | null; rating: number; deals_count: number };
type OffersResult = { ok?: boolean; incoming?: OfferRow[]; outgoing?: OfferRow[]; listings?: OfferListing[]; profiles?: OfferProfile[] };
type Filter = "all" | "buy" | "sell" | "offers";

const offerStatusLabel: Record<OfferRow["status"], string> = { pending: "Ждёт ответа", accepted: "Принято", declined: "Отклонено", cancelled: "Отменено", expired: "Закрыто" };

export default function DealsCenter() {
  const session = useTelegramSession();
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [incoming, setIncoming] = useState<OfferRow[]>([]);
  const [outgoing, setOutgoing] = useState<OfferRow[]>([]);
  const [offerListings, setOfferListings] = useState<OfferListing[]>([]);
  const [offerProfiles, setOfferProfiles] = useState<OfferProfile[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    const [dealsRaw, offersRaw] = await Promise.all([session.callAction("deals"), session.callAction("offers")]);
    const deals = dealsRaw as DealsResult;
    const offers = offersRaw as OffersResult;
    setTrades(deals.trades ?? []); setItems(deals.items ?? []); setListings(deals.listings ?? []);
    setIncoming(offers.incoming ?? []); setOutgoing(offers.outgoing ?? []); setOfferListings(offers.listings ?? []); setOfferProfiles(offers.profiles ?? []);
  }

  useEffect(() => {
    if (session.state !== "verified") { if (["browser", "unavailable", "error"].includes(session.state)) setLoading(false); return; }
    setLoading(true);
    void loadAll().catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить сделки")).finally(() => setLoading(false));
  }, [session.state]);

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const listingMap = useMemo(() => new Map(listings.map((listing) => [listing.id, listing])), [listings]);
  const offerListingMap = useMemo(() => new Map(offerListings.map((listing) => [listing.id, listing])), [offerListings]);
  const offerProfileMap = useMemo(() => new Map(offerProfiles.map((profile) => [profile.id, profile])), [offerProfiles]);
  const visible = trades.filter((trade) => filter === "buy" ? trade.buyer_id === session.profile?.id : filter === "sell" ? trade.seller_id === session.profile?.id : true);
  const soldCount = trades.filter((trade) => trade.seller_id === session.profile?.id).length;
  const boughtCount = trades.filter((trade) => trade.buyer_id === session.profile?.id).length;
  const pendingCount = [...incoming, ...outgoing].filter((offer) => offer.status === "pending").length;

  async function respond(offerId: string, accept: boolean) {
    setActionId(offerId); setError(null);
    try { await session.callAction("respond_offer", { offerId, accept }); await loadAll(); }
    catch (reason) { const code = reason instanceof Error ? reason.message : "game_action_failed"; setError(code === "insufficient_funds" ? "У покупателя уже не хватает денег" : code === "offer_not_pending" ? "Предложение уже закрыто" : "Не удалось обработать предложение"); }
    finally { setActionId(null); }
  }

  async function cancelOffer(offerId: string) {
    setActionId(offerId); setError(null);
    try { await session.callAction("cancel_offer", { offerId }); await loadAll(); }
    catch { setError("Не удалось отменить предложение"); }
    finally { setActionId(null); }
  }

  if (session.state !== "verified" && !loading) {
    return <div className="authGate compactGate"><div className="authGateIcon"><Icon name="swap" /></div><span className="sectionEyebrow">Сделки</span><h1>История оборота</h1><p>Покупки, продажи, торг и маржа привязаны к Telegram-профилю.</p><button type="button" className="primaryAction" onClick={session.openBot}>Открыть TradeUP</button></div>;
  }

  return <div className="dealsPage">
    <div className="pageHeadline"><div><span className="sectionEyebrow">Сделки</span><h1>Твой оборот</h1><p>Покупки, продажи и предложения цены в одном месте.</p></div>{pendingCount > 0 && <div className="pendingCounter"><strong>{pendingCount}</strong><span>ждут ответа</span></div>}</div>
    <div className="dealSummaryGrid"><div><span>Куплено</span><strong>{boughtCount}</strong></div><div><span>Продано</span><strong>{soldCount}</strong></div><div><span>Общая прибыль</span><strong className={Number(session.profile?.total_profit ?? 0) >= 0 ? "profitPositive" : "profitNegative"}>{rubles(session.profile?.total_profit ?? 0)}</strong></div></div>
    <div className="segmentedTabs dealsTabs"><button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Все</button><button type="button" className={filter === "buy" ? "active" : ""} onClick={() => setFilter("buy")}>Покупки</button><button type="button" className={filter === "sell" ? "active" : ""} onClick={() => setFilter("sell")}>Продажи</button><button type="button" className={filter === "offers" ? "active" : ""} onClick={() => setFilter("offers")}>Торг {pendingCount > 0 && <i>{pendingCount}</i>}</button></div>
    {loading && <div className="dealList">{Array.from({ length: 4 }).map((_, index) => <div className="dealRowSkeleton" key={index} />)}</div>}
    {error && <div className="actionMessage">{error}</div>}

    {!loading && filter === "offers" && <div className="offersLayout">
      <section className="offersColumn"><div className="offersHeading"><div><span className="sectionEyebrow">Входящие</span><h2>Тебе предлагают</h2></div><strong>{incoming.filter((offer) => offer.status === "pending").length}</strong></div>
        {incoming.length === 0 && <div className="miniEmpty">На твои лоты пока никто не торгуется.</div>}
        {incoming.map((offer) => { const listing = offerListingMap.get(offer.listing_id); const buyer = offerProfileMap.get(offer.buyer_id); const discount = listing ? Math.round((1 - Number(offer.amount) / Number(listing.price)) * 100) : 0; return <article className={`offerCard status-${offer.status}`} key={`in-${offer.id}`}><div className="offerTop"><span className={`offerStatus ${offer.status}`}>{offerStatusLabel[offer.status]}</span><small>{relativeDate(offer.updated_at)}</small></div><Link href={`/listing/${offer.listing_id}`}><h3>{listing?.title ?? "Лот"}</h3></Link><div className="offerMoney"><strong>{rubles(offer.amount)}</strong>{listing && <span>{discount > 0 ? `−${discount}%` : ""} от {rubles(listing.price)}</span>}</div><div className="offerPerson"><span className="sellerMiniAvatar">{buyer?.first_name?.charAt(0).toUpperCase() ?? "?"}</span><div><strong>{buyer?.first_name ?? "Покупатель"}</strong><small className="sellerRating"><Icon name="star" size={10} />{buyer?.rating ?? 1000} · {buyer?.deals_count ?? 0} сделок</small></div></div>{offer.status === "pending" && <div className="offerActions"><button type="button" className="acceptOffer" disabled={actionId === offer.id} onClick={() => void respond(offer.id, true)}>Принять</button><button type="button" className="declineOffer" disabled={actionId === offer.id} onClick={() => void respond(offer.id, false)}>Отклонить</button></div>}</article>; })}
      </section>
      <section className="offersColumn"><div className="offersHeading"><div><span className="sectionEyebrow">Исходящие</span><h2>Ты предлагаешь</h2></div><strong>{outgoing.filter((offer) => offer.status === "pending").length}</strong></div>
        {outgoing.length === 0 && <div className="miniEmpty">Ты ещё не предлагал свою цену продавцам.</div>}
        {outgoing.map((offer) => { const listing = offerListingMap.get(offer.listing_id); return <article className={`offerCard status-${offer.status}`} key={`out-${offer.id}`}><div className="offerTop"><span className={`offerStatus ${offer.status}`}>{offerStatusLabel[offer.status]}</span><small>{relativeDate(offer.updated_at)}</small></div><Link href={`/listing/${offer.listing_id}`}><h3>{listing?.title ?? "Лот"}</h3></Link><div className="offerMoney"><strong>{rubles(offer.amount)}</strong>{listing && <span>Цена лота {rubles(listing.price)}</span>}</div>{offer.status === "pending" && <button type="button" className="cancelOfferButton" disabled={actionId === offer.id} onClick={() => void cancelOffer(offer.id)}>Отменить предложение</button>}</article>; })}
      </section>
    </div>}

    {!loading && filter !== "offers" && !error && visible.length === 0 && <div className="emptyPanel"><div className="emptySymbol"><Icon name="history" /></div><h3>Сделок пока нет</h3><p>Купи первый лот, предложи цену или выстави предмет из инвентаря.</p><Link href="/" className="primaryAction">Перейти на рынок</Link></div>}
    {!loading && filter !== "offers" && visible.length > 0 && <div className="dealList">{visible.map((trade) => { const isSale = trade.seller_id === session.profile?.id; const item = itemMap.get(trade.item_id)?.item_types; const listing = listingMap.get(trade.listing_id); const meta = categoryMeta[item?.category_id ?? ""] ?? { short: "Товар", icon: "" }; const profit = Number(trade.seller_profit ?? 0); return <article className="dealRow" key={trade.id}><div className={`dealIcon category-${item?.category_id ?? "other"}`}><Icon name={categoryIconName(item?.category_id ?? "")} size={24} /></div><div className="dealMain"><div className="dealTypeLine"><span className={isSale ? "dealType sale" : "dealType buy"}>{isSale ? "Продажа" : "Покупка"}</span><small>{relativeDate(trade.completed_at)}</small></div><h3>{listing?.title ?? item?.name ?? "Товар"}</h3><p>{item?.brand ?? meta.short}</p></div><div className="dealAmount"><strong>{isSale ? "+" : "−"}{rubles(trade.amount)}</strong>{isSale && <span className={profit >= 0 ? "profitPositive" : "profitNegative"}>{profit >= 0 ? "+" : ""}{rubles(profit)} маржа</span>}</div></article>; })}</div>}
  </div>;
}
