"use client";

import { useEffect, useMemo, useState } from "react";
import { supabasePublic } from "@/lib/supabase/public";

type Category = {
  id: string;
  name: string;
  sort_order: number;
};

type Listing = {
  id: string;
  title: string;
  description: string;
  price: number;
  views: number;
  created_at: string;
};

const money = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});

export default function Market() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadMarket() {
    const [categoriesResult, listingsResult] = await Promise.all([
      supabasePublic.from("categories").select("id,name,sort_order").order("sort_order"),
      supabasePublic
        .from("listings")
        .select("id,title,description,price,views,created_at")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (categoriesResult.error) throw categoriesResult.error;
    if (listingsResult.error) throw listingsResult.error;

    setCategories(categoriesResult.data ?? []);
    setListings((listingsResult.data ?? []) as Listing[]);
  }

  useEffect(() => {
    let mounted = true;

    loadMarket()
      .catch((reason: unknown) => {
        if (mounted) {
          setError(reason instanceof Error ? reason.message : "Не удалось загрузить рынок");
        }
      })
      .finally(() => mounted && setLoading(false));

    const channel = supabasePublic
      .channel("tradeup-market")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "listings" },
        () => void loadMarket(),
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabasePublic.removeChannel(channel);
    };
  }, []);

  const filteredListings = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    if (!normalized) return listings;

    return listings.filter((listing) =>
      `${listing.title} ${listing.description}`.toLocaleLowerCase("ru").includes(normalized),
    );
  }, [listings, query]);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">Trade<span>UP</span></div>
          <div className="brandCaption">онлайн-рынок</div>
        </div>
        <button className="profileButton" type="button" aria-label="Профиль">К</button>
      </header>

      <section className="hero">
        <p className="eyebrow">Виртуальный перекуп</p>
        <h1>Найди дешевле.<br />Продай дороже.</h1>
        <p className="heroText">Игроки сами формируют рынок. Лоты и цены обновляются в реальном времени.</p>
      </section>

      <section className="searchPanel">
        <label className="searchBox">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по объявлениям"
            aria-label="Поиск по объявлениям"
          />
        </label>
        <button className="filterButton" type="button">Фильтры</button>
      </section>

      <nav className="categories" aria-label="Категории">
        <button
          className={activeCategory === "all" ? "category active" : "category"}
          onClick={() => setActiveCategory("all")}
          type="button"
        >
          Все
        </button>
        {categories.map((category) => (
          <button
            className={activeCategory === category.id ? "category active" : "category"}
            onClick={() => setActiveCategory(category.id)}
            type="button"
            key={category.id}
          >
            {category.name}
          </button>
        ))}
      </nav>

      <section className="marketSection">
        <div className="sectionHeading">
          <div>
            <p className="sectionKicker">Рынок</p>
            <h2>Свежие объявления</h2>
          </div>
          <span className="livePill"><i /> LIVE</span>
        </div>

        {loading && <div className="stateCard">Загружаем рынок…</div>}
        {error && <div className="stateCard error">Ошибка: {error}</div>}

        {!loading && !error && filteredListings.length === 0 && (
          <div className="emptyState">
            <div className="emptyIcon">↗</div>
            <h3>Рынок пока пуст</h3>
            <p>Здесь появится первое настоящее объявление игрока. Никаких фейковых лотов.</p>
            <button type="button" className="primaryButton">Выставить первым</button>
          </div>
        )}

        <div className="listingGrid">
          {filteredListings.map((listing) => (
            <article className="listingCard" key={listing.id}>
              <div className="listingImagePlaceholder">
                <span>TradeUP</span>
              </div>
              <div className="listingBody">
                <h3>{listing.title}</h3>
                <strong>{money.format(Number(listing.price))} ₽</strong>
                <div className="listingMeta">
                  <span>{listing.views} просмотров</span>
                  <span>{new Date(listing.created_at).toLocaleDateString("ru-RU")}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <button className="sellFab" type="button">+ Продать</button>

      <nav className="bottomNav" aria-label="Основная навигация">
        <button className="navItem active" type="button"><span>⌂</span>Рынок</button>
        <button className="navItem" type="button"><span>♡</span>Избранное</button>
        <button className="navItem" type="button"><span>⇄</span>Сделки</button>
        <button className="navItem" type="button"><span>◉</span>Профиль</button>
      </nav>
    </main>
  );
}
