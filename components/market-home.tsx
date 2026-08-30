"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon, { categoryIconName } from "@/components/icon";
import ListingCard from "@/components/listing-card";
import { getSupabasePublic } from "@/lib/supabase/public";
import { categoryMeta, type MarketCardListing } from "@/lib/product";

type Category = { id: string; name: string; sort_order: number };
type SortMode = "new" | "cheap" | "deal";

const CARD_COLUMNS = "id,title,price,created_at,condition,item_name,brand,category_id,base_value,image_url";
const MARKET_LIMIT = 96;
const PAGE_SIZE = 24;

export default function MarketHome() {
  const supabase = useMemo(() => getSupabasePublic(), []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [listings, setListings] = useState<MarketCardListing[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("new");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    if (!supabase) throw new Error("Supabase не настроен");
    const result = await supabase.from("categories").select("id,name,sort_order").order("sort_order");
    if (result.error) throw result.error;
    setCategories(result.data ?? []);
  }, [supabase]);

  const loadListings = useCallback(async () => {
    if (!supabase) throw new Error("Supabase не настроен");
    const result = await supabase.from("market_listings").select(CARD_COLUMNS).order("created_at", { ascending: false }).limit(MARKET_LIMIT);
    if (result.error) throw result.error;
    setListings((result.data ?? []) as unknown as MarketCardListing[]);
  }, [supabase]);

  useEffect(() => {
    let active = true;
    let reloadTimer: number | null = null;

    void Promise.all([loadCategories(), loadListings()])
      .then(() => { if (active) setError(null); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить рынок"); })
      .finally(() => { if (active) setLoading(false); });

    if (!supabase) return () => { active = false; };

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
    const channel = supabase
      .channel("tradeup-market-ui")
      .on("postgres_changes", { event: "*", schema: "public", table: "listings" }, scheduleReload)
      .subscribe();

    return () => {
      active = false;
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [supabase, loadCategories, loadListings]);

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

  return (
    <div className="marketFlat">
      <div className="marketSearchRow">
        <label className="marketSearch flatSearch">
          <Icon name="search" size={19} />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(PAGE_SIZE); }} placeholder="Найти товар" />
          {query && <button type="button" onClick={() => { setQuery(""); setVisibleCount(PAGE_SIZE); }} aria-label="Очистить"><Icon name="close" size={15} /></button>}
        </label>
        <label className="flatSort" aria-label="Сортировка">
          <Icon name="filter" size={19} />
          <select value={sortMode} onChange={(event) => { setSortMode(event.target.value as SortMode); setVisibleCount(PAGE_SIZE); }}>
            <option value="new">Новые</option>
            <option value="cheap">Дешевле</option>
            <option value="deal">Выгодные</option>
          </select>
        </label>
      </div>

      <nav className="flatCategoryRail" aria-label="Категории">
        <button type="button" className={activeCategory === "all" ? "flatCategory active" : "flatCategory"} onClick={() => { setActiveCategory("all"); setVisibleCount(PAGE_SIZE); }}>
          <span><Icon name="grid" size={19} /></span><b>Все</b>
        </button>
        {categories.map((category) => {
          const meta = categoryMeta[category.id] ?? { short: category.name };
          return <button key={category.id} type="button" className={activeCategory === category.id ? "flatCategory active" : "flatCategory"} onClick={() => { setActiveCategory(category.id); setVisibleCount(PAGE_SIZE); }}><span><Icon name={categoryIconName(category.id)} size={19} /></span><b>{meta.short}</b></button>;
        })}
      </nav>

      <div className="flatFeedHead"><h1>{activeCategory === "all" ? "Объявления" : categories.find((item) => item.id === activeCategory)?.name ?? "Объявления"}</h1><span>{visibleListings.length}</span></div>

      {loading && <div className="listingGridProduct flatGrid">{Array.from({ length: 6 }).map((_, index) => <div className="listingSkeleton flatSkeleton" key={index} />)}</div>}
      {!loading && error && <div className="flatEmpty"><Icon name="info" size={30} /><strong>Не удалось загрузить</strong><span>{error}</span></div>}
      {!loading && !error && visibleListings.length === 0 && <div className="flatEmpty"><Icon name="search" size={30} /><strong>{listings.length === 0 ? "Объявлений пока нет" : "Ничего не найдено"}</strong><span>{listings.length === 0 ? "Первый лот появится здесь." : "Измени запрос или категорию."}</span></div>}
      {!loading && !error && renderedListings.length > 0 && <>
        <div className="listingGridProduct flatGrid">{renderedListings.map((listing, index) => <ListingCard listing={listing} eager={index < 2} key={listing.id} />)}</div>
        {renderedListings.length < visibleListings.length && <button type="button" className="marketLoadMore" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Показать ещё</button>}
      </>}
    </div>
  );
}
