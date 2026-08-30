"use client";

import { useEffect, useMemo, useState } from "react";
import { useTelegramSession } from "@/components/telegram-session";
import { categoryMeta, relativeDate, rubles } from "@/lib/product";

type TradeRow = {
  id: string;
  listing_id: string;
  item_id: string;
  seller_id: string;
  buyer_id: string;
  amount: number | string;
  fee: number | string;
  seller_profit: number | string | null;
  completed_at: string;
};

type ItemRow = { id: string; item_types: { name: string; brand: string | null; category_id: string } | null };
type ListingRow = { id: string; title: string };
type DealsResult = { ok?: boolean; trades?: TradeRow[]; items?: ItemRow[]; listings?: ListingRow[] };
type Filter = "all" | "buy" | "sell";

export default function DealsCenter() {
  const session = useTelegramSession();
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.state !== "verified") {
      if (["browser", "unavailable", "error"].includes(session.state)) setLoading(false);
      return;
    }
    setLoading(true);
    void session.callAction("deals")
      .then((raw) => {
        const result = raw as DealsResult;
        setTrades(result.trades ?? []);
        setItems(result.items ?? []);
        setListings(result.listings ?? []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить сделки"))
      .finally(() => setLoading(false));
  }, [session.state]);

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const listingMap = useMemo(() => new Map(listings.map((listing) => [listing.id, listing])), [listings]);
  const visible = trades.filter((trade) => {
    if (filter === "buy") return trade.buyer_id === session.profile?.id;
    if (filter === "sell") return trade.seller_id === session.profile?.id;
    return true;
  });

  const soldCount = trades.filter((trade) => trade.seller_id === session.profile?.id).length;
  const boughtCount = trades.filter((trade) => trade.buyer_id === session.profile?.id).length;

  if (session.state !== "verified" && !loading) {
    return (
      <div className="authGate compactGate"><div className="authGateIcon">⇄</div><span className="sectionEyebrow">Сделки</span><h1>История твоего оборота</h1><p>Покупки, продажи и реальная маржа привязаны к Telegram-профилю.</p><button type="button" className="primaryAction" onClick={session.openBot}>Открыть TradeUP</button></div>
    );
  }

  return (
    <div className="dealsPage">
      <div className="pageHeadline"><div><span className="sectionEyebrow">Сделки</span><h1>Твой оборот</h1><p>Все покупки и перепродажи в одном журнале.</p></div></div>

      <div className="dealSummaryGrid">
        <div><span>Куплено</span><strong>{boughtCount}</strong></div>
        <div><span>Продано</span><strong>{soldCount}</strong></div>
        <div><span>Общая прибыль</span><strong className={Number(session.profile?.total_profit ?? 0) >= 0 ? "profitPositive" : "profitNegative"}>{rubles(session.profile?.total_profit ?? 0)}</strong></div>
      </div>

      <div className="segmentedTabs">
        <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Все</button>
        <button type="button" className={filter === "buy" ? "active" : ""} onClick={() => setFilter("buy")}>Покупки</button>
        <button type="button" className={filter === "sell" ? "active" : ""} onClick={() => setFilter("sell")}>Продажи</button>
      </div>

      {loading && <div className="dealList">{Array.from({ length: 4 }).map((_, index) => <div className="dealRowSkeleton" key={index} />)}</div>}
      {error && <div className="actionMessage">{error}</div>}
      {!loading && !error && visible.length === 0 && <div className="emptyPanel"><div className="emptySymbol">⇄</div><h3>Сделок пока нет</h3><p>Купи первый лот или выстави предмет из стартового набора.</p><a href="/" className="primaryAction">Перейти на рынок</a></div>}

      {!loading && visible.length > 0 && (
        <div className="dealList">
          {visible.map((trade) => {
            const isSale = trade.seller_id === session.profile?.id;
            const item = itemMap.get(trade.item_id)?.item_types;
            const listing = listingMap.get(trade.listing_id);
            const meta = categoryMeta[item?.category_id ?? ""] ?? { icon: "📦", short: "Товар" };
            const profit = Number(trade.seller_profit ?? 0);
            return (
              <article className="dealRow" key={trade.id}>
                <div className={`dealIcon category-${item?.category_id ?? "other"}`}>{meta.icon}</div>
                <div className="dealMain"><div className="dealTypeLine"><span className={isSale ? "dealType sale" : "dealType buy"}>{isSale ? "Продажа" : "Покупка"}</span><small>{relativeDate(trade.completed_at)}</small></div><h3>{listing?.title ?? item?.name ?? "Товар"}</h3><p>{item?.brand ?? meta.short}</p></div>
                <div className="dealAmount"><strong>{isSale ? "+" : "−"}{rubles(trade.amount)}</strong>{isSale && <span className={profit >= 0 ? "profitPositive" : "profitNegative"}>{profit >= 0 ? "+" : ""}{rubles(profit)} маржа</span>}</div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
