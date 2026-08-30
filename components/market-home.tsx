"use client";

import { useEffect, useMemo, useState } from "react";
import Icon, { categoryIconName } from "@/components/icon";
import ListingCard from "@/components/listing-card";
import { getSupabasePublic } from "@/lib/supabase/public";
import { categoryMeta, type MarketListing } from "@/lib/product";

type Category = { id: string; name: string; sort_order: number };
type SortMode = "new" | "cheap" | "deal";

export default function MarketHome() {
  const supabase = useMemo(() => getSupabasePublic(), []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("new");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadMarket() {
    if (!supabase) throw new Error("Supabase не настроен");
    const [categoriesResult, listingsResult] = await Promise.all([
      supabase.from("categories").select("id,name,sort_order").order("sort_order"),
      supabase.from("market_listings").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    if (categoriesResult.error) throw categoriesResult.error;
    if (listingsResult.error) throw listingsResult.error;
    setCategories(categoriesResult.data ?? []);
    setListings((listingsResult.data ?? []) as unknown as MarketListing[]);
  }

  useEffect(() => {
    let active = true;
    void loadMarket().catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : "Не удалось загрузить рынок")).finally(() => active && setLoading(false));
    if (!supabase) return () => { active = false; };
    const channel = supabase.channel("tradeup-market-ui").on("postgres_changes", { event: "*", schema: "public", table: "listings" }, () => void loadMarket().catch(() => undefined)).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [supabase]);

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

  return (
    <div className="marketFlat">
      <div className="marketSearchRow">
        <label className="marketSearch flatSearch">
          <Icon name="search" size={19} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти товар" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Очистить"><Icon name="close" size={15} /></button>}
        </label>
        <label className="flatSort" aria-label="Сортировка">
          <Icon name="filter" size={19} />
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="new">Новые</option>
            <option value="cheap">Дешевле</option>
            <option value="deal">Выгодные</option>
          </select>
        </label>
      </div>

      <nav className="flatCategoryRail" aria-label="Категории">
        <button type="button" className={activeCategory === "all" ? "flatCategory active" : "flatCategory"} onClick={() => setActiveCategory("all")}>
          <span><Icon name="grid" size={19} /></span><b>Все</b>
        </button>
        {categories.map((category) => {
          const meta = categoryMeta[category.id] ?? { short: category.name, icon: "" };
          return <button key={category.id} type="button" className={activeCategory === category.id ? "flatCategory active" : "flatCategory"} onClick={() => setActiveCategory(category.id)}><span><Icon name={categoryIconName(category.id)} size={19} /></span><b>{meta.short}</b></button>;
        })}
      </nav>

      <div className="flatFeedHead"><h1>{activeCategory === "all" ? "Объявления" : categories.find((item) => item.id === activeCategory)?.name ?? "Объявления"}</h1><span>{visibleListings.length}</span></div>

      {loading && <div className="listingGridProduct flatGrid">{Array.from({ length: 6 }).map((_, index) => <div className="listingSkeleton flatSkeleton" key={index} />)}</div>}
      {!loading && error && <div className="flatEmpty"><Icon name="info" size={30} /><strong>Не удалось загрузить</strong><span>{error}</span></div>}
      {!loading && !error && visibleListings.length === 0 && <div className="flatEmpty"><Icon name="search" size={30} /><strong>{listings.length === 0 ? "Объявлений пока нет" : "Ничего не найдено"}</strong><span>{listings.length === 0 ? "Первый лот появится здесь." : "Измени запрос или категорию."}</span></div>}
      {!loading && !error && visibleListings.length > 0 && <div className="listingGridProduct flatGrid">{visibleListings.map((listing) => <ListingCard listing={listing} key={listing.id} />)}</div>}
    </div>
  );
}
