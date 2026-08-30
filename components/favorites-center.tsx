"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (session.state !== "verified") { if (["browser", "unavailable", "error"].includes(session.state)) setLoading(false); return; }
    setLoading(true);
    void session.callAction("favorites").then((result) => setListings(((result as FavoritesResult).listings ?? []) as MarketListing[])).catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить избранное")).finally(() => setLoading(false));
  }, [session.state]);

  if (session.state !== "verified" && !loading) {
    return <div className="authGate compactGate"><div className="authGateIcon"><Icon name="heart" /></div><span className="sectionEyebrow">Избранное</span><h1>Сохраняй выгодные лоты</h1><p>Войди через Telegram, и избранное будет привязано к игровому профилю.</p><button type="button" className="primaryAction" onClick={session.openBot}>Открыть TradeUP</button></div>;
  }

  return <div className="collectionPage">
    <div className="pageHeadline"><div><span className="sectionEyebrow">Избранное</span><h1>Сохранённые лоты</h1><p>Следи за тем, что хочешь забрать позже.</p></div><div className="inventoryCounter"><strong>{listings.length}</strong><span>лотов</span></div></div>
    {loading && <div className="listingGridProduct">{Array.from({ length: 4 }).map((_, index) => <div className="listingSkeleton" key={index} />)}</div>}
    {error && <div className="actionMessage">{error}</div>}
    {!loading && !error && listings.length === 0 && <div className="emptyPanel"><div className="emptySymbol"><Icon name="heart" /></div><h3>Пока ничего не сохранено</h3><p>Добавляй лоты в избранное из карточки товара.</p><Link href="/" className="primaryAction">Смотреть рынок</Link></div>}
    {!loading && listings.length > 0 && <div className="listingGridProduct">{listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}</div>}
  </div>;
}
