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
  inventory_items: {
    item_types: {
      category_id: string;
      image_url: string | null;
      name: string;
    } | null;
  } | null;
};

type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

type TelegramState = "checking" | "verified" | "browser" | "unavailable" | "error";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "TradeUpGame_Bot";
const BOT_URL = `https://t.me/${BOT_USERNAME}?startapp=market`;

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
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [telegramState, setTelegramState] = useState<TelegramState>("checking");

  async function loadMarket() {
    const [categoriesResult, listingsResult] = await Promise.all([
      supabasePublic.from("categories").select("id,name,sort_order").order("sort_order"),
      supabasePublic
        .from("listings")
        .select(
          "id,title,description,price,views,created_at,inventory_items(item_types(category_id,image_url,name))",
        )
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (categoriesResult.error) throw categoriesResult.error;
    if (listingsResult.error) throw listingsResult.error;

    setCategories(categoriesResult.data ?? []);
    setListings((listingsResult.data ?? []) as unknown as Listing[]);
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

  useEffect(() => {
    let cancelled = false;
    const webApp = window.Telegram?.WebApp;

    if (!webApp) {
      setTelegramState("browser");
      return;
    }

    webApp.ready();
    webApp.expand();

    if (!webApp.initData) {
      setTelegramState("unavailable");
      return;
    }

    void fetch("/api/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: webApp.initData }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          ok?: boolean;
          user?: TelegramUser;
        };

        if (!response.ok || !payload.ok || !payload.user) {
          throw new Error("Telegram auth failed");
        }

        if (!cancelled) {
          setTelegramUser(payload.user);
          setTelegramState("verified");
        }
      })
      .catch(() => {
        if (!cancelled) setTelegramState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredListings = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");

    return listings.filter((listing) => {
      const categoryId = listing.inventory_items?.item_types?.category_id;
      const matchesCategory = activeCategory === "all" || categoryId === activeCategory;
      const matchesQuery =
        !normalized ||
        `${listing.title} ${listing.description}`.toLocaleLowerCase("ru").includes(normalized);

      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, listings, query]);

  const profileInitial = telegramUser?.first_name?.trim().charAt(0).toLocaleUpperCase("ru") || "T";

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">Trade<span>UP</span></div>
          <div className="brandCaption">онлайн-рынок</div>
        </div>
        <button
          className="profileButton"
          type="button"
          aria-label="Профиль"
          onClick={() => {
            if (telegramState !== "verified") window.location.href = BOT_URL;
          }}
        >
          {profileInitial}
        </button>
      </header>

      {telegramState !== "verified" && (
        <section className="tgNotice" aria-live="polite">
          <div>
            <strong>
              {telegramState === "checking" ? "Подключаем Telegram…" : "Открой TradeUP через Telegram"}
            </strong>
            <span>
              {telegramState === "error"
                ? "Авторизация будет активна после добавления TELEGRAM_BOT_TOKEN на Vercel."
                : `Mini App работает через @${BOT_USERNAME}.`}
            </span>
          </div>
          {telegramState !== "checking" && (
            <a href={BOT_URL} rel="noreferrer">Открыть</a>
          )}
        </section>
      )}

      {telegramState === "verified" && telegramUser && (
        <section className="tgUserBar">
          <span className="tgUserDot" />
          <span>В сети как <strong>{telegramUser.first_name}</strong></span>
          {telegramUser.username && <small>@{telegramUser.username}</small>}
        </section>
      )}

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
            <h3>{activeCategory === "all" ? "Рынок пока пуст" : "В категории пока пусто"}</h3>
            <p>Здесь появится первое настоящее объявление игрока. Никаких фейковых лотов.</p>
            <button type="button" className="primaryButton">Выставить первым</button>
          </div>
        )}

        <div className="listingGrid">
          {filteredListings.map((listing) => {
            const imageUrl = listing.inventory_items?.item_types?.image_url;
            return (
              <article className="listingCard" key={listing.id}>
                <div className="listingImagePlaceholder">
                  {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <span>TradeUP</span>}
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
            );
          })}
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
