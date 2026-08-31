"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/icon";
import TraderIdentity from "@/components/trader-identity";
import { useTelegramSession } from "@/components/telegram-session";
import { emptyEquipped, styleFor, titleFor, type CosmeticItem, type EquippedCosmetics } from "@/lib/cosmetics";
import { rubles, sellerLevel } from "@/lib/product";

function rankBounds(rating: number) {
  if (rating < 1100) return { previous: 1000, next: 1100 };
  if (rating < 1250) return { previous: 1100, next: 1250 };
  if (rating < 1500) return { previous: 1250, next: 1500 };
  if (rating < 1800) return { previous: 1500, next: 1800 };
  if (rating < 2000) return { previous: 1800, next: 2000 };
  return { previous: 2000, next: 2000 };
}

export default function ProfileCenter() {
  const session = useTelegramSession();
  const profile = session.profile;
  const [catalog, setCatalog] = useState<CosmeticItem[]>([]);
  const [equipped, setEquipped] = useState<EquippedCosmetics>(emptyEquipped);

  useEffect(() => {
    if (session.state !== "verified") return;
    const initData = window.Telegram?.WebApp?.initData ?? "";
    if (!initData) return;
    const controller = new AbortController();

    void fetch("/api/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, action: "list", payload: {} }),
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => response.ok ? response.json() : null)
      .then((result: { catalog?: CosmeticItem[]; equipped?: EquippedCosmetics | null } | null) => {
        if (!result) return;
        setCatalog(Array.isArray(result.catalog) ? result.catalog : []);
        setEquipped(result.equipped ?? emptyEquipped);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });

    return () => controller.abort();
  }, [session.state]);

  if (session.state !== "verified" || !profile) {
    return <div className="flatAuth"><Icon name="user" size={32}/><strong>Профиль доступен в Telegram</strong><button type="button" onClick={session.openBot}>Открыть TradeUP</button></div>;
  }

  const level = sellerLevel(profile.rating);
  const bounds = rankBounds(profile.rating);
  const maxRank = bounds.previous === bounds.next;
  const progress = maxRank ? 100 : Math.min(100, Math.max(0, ((profile.rating - bounds.previous) / Math.max(1, bounds.next - bounds.previous)) * 100));
  const frameStyle = styleFor(catalog, equipped.frame_id);
  const nameStyle = styleFor(catalog, equipped.name_style_id);
  const themeStyle = styleFor(catalog, equipped.profile_theme_id);
  const title = titleFor(catalog, equipped.title_id);
  const profit = Number(profile.total_profit);

  return (
    <div className={`compactProfile ${themeStyle ? `profileCosmeticTheme ${themeStyle}` : ""}`}>
      <section className="compactProfileTop" aria-label="Профиль игрока">
        <div className={`compactProfileAvatar ${frameStyle}`} aria-hidden="true">{profile.photo_url ? <img src={profile.photo_url} alt=""/> : profile.first_name.charAt(0).toUpperCase()}</div>
        <div className="compactProfileIdentity">
          <div className="compactProfileNameLine"><h1 className={nameStyle}>{profile.first_name}</h1>{title ? <span className="equippedProfileTitle">{title}</span> : <span className="profileLevel">{level}</span>}</div>
          <span className="compactProfileHandle">{profile.username ? `@${profile.username}` : "Профиль TradeUP"}</span>
        </div>
        <div className="compactProfileBalance"><span>Баланс</span><strong>{rubles(profile.balance)}</strong></div>
      </section>

      <div className="compactStatsLine" aria-label="Статистика профиля">
        <div className="compactStat"><strong>{profile.rating}</strong><span>рейтинг</span></div>
        <div className="compactStat"><strong>{profile.deals_count}</strong><span>сделок</span></div>
        <div className="compactStat"><strong className={Number.isFinite(profit) && profit < 0 ? "profitNegative" : "profitPositive"}>{rubles(profile.total_profit)}</strong><span>прибыль</span></div>
        <div className="compactStat"><strong>{session.counts.inventory}</strong><span>инвентарь</span></div>
      </div>

      <div className="compactRank">
        <div className="compactRankLine"><strong>{level}</strong><span>{maxRank ? `Рейтинг ${profile.rating}` : `${profile.rating} / ${bounds.next}`}</span></div>
        <div className="compactRankTrack" role="progressbar" aria-label={maxRank ? "Максимальный ранг" : `Прогресс до следующего ранга: ${Math.round(progress)}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{ width: `${progress}%` }}/></div>
      </div>

      <TraderIdentity/>

      <nav className="compactProfileMenu" aria-label="Разделы профиля">
        <Link prefetch={false} href="/explore"><Icon name="trend"/><span>Рынок+</span><small>цели · аукционы · коллекции</small><Icon name="chevronRight" size={16}/></Link>
        <Link prefetch={false} href="/store"><Icon name="sparkles"/><span>Оформление</span><small>за Stars</small><Icon name="chevronRight" size={16}/></Link>
        <Link prefetch={false} href="/sell"><Icon name="list"/><span>Мои объявления</span><small>{session.counts.listings}</small><Icon name="chevronRight" size={16}/></Link>
        <Link prefetch={false} href="/messages"><Icon name="message"/><span>Чаты</span>{session.unreadChats > 0 ? <small>{session.unreadChats} новых</small> : <small>Сообщения</small>}<Icon name="chevronRight" size={16}/></Link>
        <Link prefetch={false} href="/deals"><Icon name="swap"/><span>Сделки и торг</span><small>{profile.deals_count}</small><Icon name="chevronRight" size={16}/></Link>
        <Link prefetch={false} href="/leaderboard"><Icon name="trophy"/><span>Рейтинг</span><small>{level}</small><Icon name="chevronRight" size={16}/></Link>
        <Link prefetch={false} href="/favorites"><Icon name="heart"/><span>Избранное</span><small>{session.counts.favorites}</small><Icon name="chevronRight" size={16}/></Link>
      </nav>
    </div>
  );
}
