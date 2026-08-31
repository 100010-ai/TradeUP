"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/icon";
import ListingCard from "@/components/listing-card";
import { useTelegramSession } from "@/components/telegram-session";
import { type MarketListing } from "@/lib/product";

type FavoritesResult = { ok?: boolean; listings?: MarketListing[] };

export default function FavoritesCenter() {
  const session = useTelegramSession();
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      const result = await callAction("favorites") as FavoritesResult;
      setListings(result.listings ?? []);
    } catch {
      setError("Не удалось загрузить избранное");
    } finally {
      setLoading(false);
    }
  }, [sessionState, callAction]);

  useEffect(() => {
    if (sessionState === "verified") void load();
    else if (["browser", "unavailable", "error"].includes(sessionState)) setLoading(false);
  }, [sessionState, load]);

  if (sessionState !== "verified" && !loading) {
    return <div className="flatAuth"><Icon name="heart" size={32}/><strong>Избранное доступно в Telegram</strong><span>Сохраняй лоты и возвращайся к ним позже.</span><button type="button" onClick={session.openBot}>Открыть TradeUP</button></div>;
  }

  return (
    <div className="favoritesPage" aria-busy={loading}>
      <div className="flatPageTitle"><h1>Избранное</h1><span>{loading ? "…" : `${listings.length} лотов`}</span></div>

      {loading && <div className="listingGridProduct flatGrid" aria-hidden="true">{Array.from({ length: 4 }).map((_, index) => <div className="listingSkeleton flatSkeleton" key={index} />)}</div>}
      {!loading && error && <div className="flatEmpty" role="alert"><Icon name="info" size={30}/><strong>Не удалось загрузить</strong><span>{error}</span><button type="button" className="inlineAction" onClick={() => void load()}>Повторить</button></div>}
      {!loading && !error && listings.length === 0 && <div className="flatEmpty"><Icon name="heart" size={30}/><strong>Пока ничего не сохранено</strong><span>Добавляй интересные лоты в избранное из карточки товара.</span><Link href="/" className="inlineAction primary">Смотреть рынок</Link></div>}
      {!loading && !error && listings.length > 0 && <div className="listingGridProduct flatGrid">{listings.map((listing, index) => <ListingCard key={listing.id} listing={listing} eager={index < 2} />)}</div>}
    </div>
  );
}
