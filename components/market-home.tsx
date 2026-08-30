"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  const [activeCount, setActiveCount] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadMarket() {
    if (!supabase) throw new Error("Supabase не настроен в Vercel");

    const [categoriesResult, listingsResult, listingsCount, onlinePlayers] = await Promise.all([
      supabase.from("categories").select("id,name,sort_order").order("sort_order"),
      supabase.from("market_listings").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("market_listings").select("id", { count: "exact", head: true }),
      supabase.from("profile_cards").select("id", { count: "exact", head: true }).eq("is_online", true),
    ]);

    if (categoriesResult.error) throw categoriesResult.error;
    if (listingsResult.error) throw listingsResult.error;
    if (listingsCount.error) throw listingsCount.error;
    if (onlinePlayers.error) throw onlinePlayers.error;

    setCategories(categoriesResult.data ?? []);
    setListings((listingsResult.data ?? []) as unknown as MarketListing[]);
    setActiveCount(listingsCount.count ?? 0);
    setOnlineCount(onlinePlayers.count ?? 0);
  }

  useEffect(() => {
    let active = true;
    void loadMarket()
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить рынок");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    if (!supabase) return () => { active = false; };

    const channel = supabase
      .channel("tradeup-market-ui")
      .on("postgres_changes", { event: "*", schema: "public", table: "listings" }, () => {
        void loadMarket().catch(() => undefined);
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  const visibleListings = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    const filtered = listings.filter((listing) => {
      const matchesCategory = activeCategory === "all" || listing.category_id === activeCategory;
      const matchesQuery = !normalized || `${listing.title} ${listing.brand ?? ""} ${listing.item_name}`
        .toLocaleLowerCase("ru")
        .includes(normalized);
      return matchesCategory && matchesQuery;
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === "cheap") return Number(a.price) - Number(b.price);
      if (sortMode === "deal") {
        const aScore = Number(a.price) / Math.max(1, Number(a.base_value));
        const bScore = Number(b.price) / Math.max(1, Number(b.base_value));
        return aScore - bScore;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [listings, query, activeCategory, sortMode]);

  return (
    <>
      <section className="marketHero">
        <div className="marketHeroCopy">
          <span className="heroTag">Онлайн-перекупство</span>
          <h1>Поймай цену.<br />Забери маржу.</h1>
          <p>Рынок создают сами игроки. Никаких системных продавцов и нарисованных сделок.</p>
        </div>
        <div className="marketPulseCard">
          <div><strong>{activeCount}</strong><span>лотов сейчас</span></div>
          <div><strong>{onlineCount}</strong><span>игроков онлайн</span></div>
          <Link href="/sell">Выставить товар</Link>
        </div>
      </section>

      <section className="marketToolbar">
        <label className="marketSearch">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти iPhone, консоль, кроссовки…" />
          {query && <button type="button" onClick={() => setQuery("")}>×</button>}
        </label>
        <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} aria-label="Сортировка">
          <option value="new">Сначала новые</option>
          <option value="cheap">Сначала дешевле</option>
          <option value="deal">Самые выгодные</option>
        </select>
      </section>

      <nav className="categoryRail" aria-label="Категории">
        <button type="button" className={activeCategory === "all" ? "categoryTile active" : "categoryTile"} onClick={() => setActiveCategory("all")}>
          <span>✦</span><strong>Все</strong>
        </button>
        {categories.map((category) => {
          const meta = categoryMeta[category.id] ?? { icon: "📦", short: category.name };
          return (
            <button key={category.id} type="button" className={activeCategory === category.id ? "categoryTile active" : "categoryTile"} onClick={() => setActiveCategory(category.id)}>
              <span>{meta.icon}</span><strong>{meta.short}</strong>
            </button>
          );
        })}
      </nav>

      <section className="feedSection">
        <div className="sectionTitleRow">
          <div>
            <span className="sectionEyebrow">Рынок</span>
            <h2>{activeCategory === "all" ? "Свежие предложения" : categories.find((item) => item.id === activeCategory)?.name ?? "Категория"}</h2>
          </div>
          <span className="liveStatus"><i /> LIVE</span>
        </div>

        {loading && (
          <div className="listingGridProduct">
            {Array.from({ length: 6 }).map((_, index) => <div className="listingSkeleton" key={index} />)}
          </div>
        )}

        {!loading && error && (
          <div className="emptyPanel errorPanel">
            <div className="emptySymbol">!</div>
            <h3>Рынок не загрузился</h3>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && visibleListings.length === 0 && (
          <div className="emptyPanel launchPanel">
            <div className="emptySymbol">↗</div>
            <div>
              <span className="sectionEyebrow">Старт рынка</span>
              <h3>{listings.length === 0 ? "Будь первым продавцом" : "По фильтру ничего нет"}</h3>
              <p>{listings.length === 0 ? "После входа ты получишь стартовый инвентарь. Выстави первый реальный лот и задай цену рынку." : "Попробуй другую категорию или убери часть запроса."}</p>
            </div>
            {listings.length === 0 ? <Link href="/sell" className="primaryAction">Открыть инвентарь</Link> : <button className="primaryAction" type="button" onClick={() => { setQuery(""); setActiveCategory("all"); }}>Сбросить фильтры</button>}
          </div>
        )}

        {!loading && !error && visibleListings.length > 0 && (
          <div className="listingGridProduct">
            {visibleListings.map((listing) => <ListingCard listing={listing} key={listing.id} />)}
          </div>
        )}
      </section>
    </>
  );
}
