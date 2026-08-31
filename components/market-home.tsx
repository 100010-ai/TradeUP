"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon, { categoryIconName } from "@/components/icon";
import ListingCard from "@/components/listing-card";
import { categoryMeta, type MarketCardListing } from "@/lib/product";

type Category = { id: string; name: string };
type SortMode = "new" | "cheap" | "deal";

const CARD_COLUMNS = "id,title,price,created_at,condition,item_name,brand,category_id,base_value,image_url";
const MARKET_LIMIT = 96;
const PAGE_SIZE = 24;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const CATEGORIES: readonly Category[] = [
  { id: "phones", name: "Смартфоны" },
  { id: "computers", name: "Компьютеры" },
  { id: "consoles", name: "Консоли" },
  { id: "sneakers", name: "Кроссовки" },
  { id: "watches", name: "Часы" },
  { id: "collectibles", name: "Коллекционное" },
];

async function publicRest<T>(path: string): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase не настроен");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Рынок недоступен (${response.status})`);
  return response.json() as Promise<T>;
}

export default function MarketHome() {
  const [listings, setListings] = useState<MarketCardListing[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("new");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadListings = useCallback(async () => {
    const select = encodeURIComponent(CARD_COLUMNS);
    const data = await publicRest<MarketCardListing[]>(`market_listings?select=${select}&order=created_at.desc&limit=${MARKET_LIMIT}`);
    setListings(data);
  }, []);

  useEffect(() => {
    let active = true;
    let reloadTimer: number | null = null;
    let disposeRealtime: (() => void) | null = null;

    setLoading(true);
    setError(null);

    const scheduleReload = () => {
      if (document.visibilityState !== "visible") return;
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(() => {
        reloadTimer = null;
        void loadListings().catch(() => undefined);
      }, 220);
    };

    const onVisibility = () => { if (document.visibilityState === "visible") scheduleReload(); };
    document.addEventListener("visibilitychange", onVisibility);

    void loadListings()
      .then(async () => {
        if (!active) return;
        setLoading(false);
        try {
          const { getSupabasePublic } = await import("@/lib/supabase/public");
          if (!active) return;
          const realtime = getSupabasePublic();
          if (!realtime) return;
          const channel = realtime
            .channel("tradeup-market-ui")
            .on("postgres_changes", { event: "*", schema: "public", table: "listings" }, scheduleReload)
            .subscribe();
          disposeRealtime = () => { void realtime.removeChannel(channel); };
        } catch {
          // Realtime is an enhancement. Foreground refreshes keep the market usable.
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Не удалось загрузить рынок");
        setLoading(false);
      });

    return () => {
      active = false;
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      disposeRealtime?.();
    };
  }, [loadListings, reloadKey]);

  const visibleListings = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    const filtered = listings.filter((listing) => {
      const categoryOk = activeCategory === "all" || listing.category_id === activeCategory;
      const queryOk = !normalized || `${listing.title} ${listing.brand ?? ""} ${listing.item_name}`.toLocaleLowerCase("ru").includes(normalized);
      return categoryOk && queryOk;
    });
    return [...filtered].sort((a, b) => {
      if (sortMode === "cheap") return Number(a.price) - Number(b.price);
      if (sortMode === "deal") return Number(a.price) / Math.max(1, Number(a.base_value)) - Number(b.price) / Math.max(1, Number(b.base_value));
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [listings, query, activeCategory, sortMode]);

  const renderedListings = visibleListings.slice(0, visibleCount);
  const filtersActive = query.trim().length > 0 || activeCategory !== "all";

  const resetFilters = () => {
    setQuery("");
    setActiveCategory("all");
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <div className="marketFlat" aria-busy={loading}>
      <div className="marketSearchRow" role="search">
        <label className="marketSearch flatSearch">
          <Icon name="search" size={19} />
          <input
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setVisibleCount(PAGE_SIZE); }}
            placeholder="Найти товар"
            aria-label="Поиск по рынку"
            autoComplete="off"
            spellCheck={false}
          />
          {query && <button type="button" onClick={() => { setQuery(""); setVisibleCount(PAGE_SIZE); }} aria-label="Очистить поиск"><Icon name="close" size={15} /></button>}
        </label>
        <label className="flatSort">
          <Icon name="filter" size={19} />
          <select aria-label="Сортировка объявлений" value={sortMode} onChange={(event) => { setSortMode(event.target.value as SortMode); setVisibleCount(PAGE_SIZE); }}>
            <option value="new">Новые</option>
            <option value="cheap">Дешевле</option>
            <option value="deal">Выгодные</option>
          </select>
        </label>
      </div>

      <nav className="flatCategoryRail" aria-label="Категории">
        <button type="button" aria-pressed={activeCategory === "all"} className={activeCategory === "all" ? "flatCategory active" : "flatCategory"} onClick={() => { setActiveCategory("all"); setVisibleCount(PAGE_SIZE); }}>
          <span><Icon name="grid" size={19} /></span><b>Все</b>
        </button>
        {CATEGORIES.map((category) => {
          const meta = categoryMeta[category.id] ?? { short: category.name };
          const active = activeCategory === category.id;
          return <button key={category.id} type="button" aria-pressed={active} className={active ? "flatCategory active" : "flatCategory"} onClick={() => { setActiveCategory(category.id); setVisibleCount(PAGE_SIZE); }}><span><Icon name={categoryIconName(category.id)} size={19} /></span><b>{meta.short}</b></button>;
        })}
      </nav>

      <div className="flatFeedHead">
        <h1>{activeCategory === "all" ? "Объявления" : CATEGORIES.find((item) => item.id === activeCategory)?.name ?? "Объявления"}</h1>
        <span aria-live="polite">{loading ? "…" : visibleListings.length}</span>
      </div>

      {loading && <div className="listingGridProduct flatGrid" aria-hidden="true">{Array.from({ length: 6 }).map((_, index) => <div className="listingSkeleton flatSkeleton" key={index} />)}</div>}
      {!loading && error && (
        <div className="flatEmpty" role="alert">
          <Icon name="info" size={30} /><strong>Не удалось загрузить</strong><span>{error}</span>
          <button type="button" className="inlineAction" onClick={() => setReloadKey((value) => value + 1)}>Повторить</button>
        </div>
      )}
      {!loading && !error && visibleListings.length === 0 && (
        <div className="flatEmpty">
          <Icon name="search" size={30} />
          <strong>{listings.length === 0 ? "Объявлений пока нет" : "Ничего не найдено"}</strong>
          <span>{listings.length === 0 ? "Первый лот появится здесь." : "Измени запрос или категорию."}</span>
          {filtersActive && <button type="button" className="inlineAction" onClick={resetFilters}>Сбросить фильтры</button>}
        </div>
      )}
      {!loading && !error && renderedListings.length > 0 && <>
        <div className="listingGridProduct flatGrid">{renderedListings.map((listing, index) => <ListingCard listing={listing} eager={index < 2} key={listing.id} />)}</div>
        {renderedListings.length < visibleListings.length && <button type="button" className="marketLoadMore" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Показать ещё</button>}
      </>}
    </div>
  );
}
