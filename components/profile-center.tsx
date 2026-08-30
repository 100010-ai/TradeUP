"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/icon";
import TraderIdentity from "@/components/trader-identity";
import { useTelegramSession } from "@/components/telegram-session";
import { emptyEquipped, styleFor, titleFor, type CosmeticItem, type EquippedCosmetics } from "@/lib/cosmetics";
import { rubles, sellerLevel } from "@/lib/product";

export default function ProfileCenter() {
  const session = useTelegramSession();
  const profile = session.profile;
  const [catalog, setCatalog] = useState<CosmeticItem[]>([]);
  const [equipped, setEquipped] = useState<EquippedCosmetics>(emptyEquipped);

  useEffect(() => {
    if (session.state !== "verified") return;
    const initData = window.Telegram?.WebApp?.initData ?? "";
    if (!initData) return;
    let active = true;
    void fetch("/api/store", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData, action: "list", payload: {} }), cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((result: { catalog?: CosmeticItem[]; equipped?: EquippedCosmetics | null } | null) => {
        if (!active || !result) return;
        setCatalog(Array.isArray(result.catalog) ? result.catalog : []);
        setEquipped(result.equipped ?? emptyEquipped);
      }).catch(() => undefined);
    return () => { active = false; };
  }, [session.state]);

  if (session.state !== "verified" || !profile) {
    return <div className="flatAuth"><Icon name="user" size={32}/><strong>Профиль доступен в Telegram</strong><button type="button" onClick={session.openBot}>Открыть TradeUP</button></div>;
  }

  const level = sellerLevel(profile.rating);
  const nextRating = profile.rating < 1100 ? 1100 : profile.rating < 1250 ? 1250 : profile.rating < 1500 ? 1500 : profile.rating < 1800 ? 1800 : 2000;
  const previousRating = profile.rating < 1100 ? 1000 : profile.rating < 1250 ? 1100 : profile.rating < 1500 ? 1250 : profile.rating < 1800 ? 1500 : 1800;
  const progress = Math.min(100, Math.max(0, ((profile.rating - previousRating) / Math.max(1, nextRating - previousRating)) * 100));
  const frameStyle = styleFor(catalog, equipped.frame_id);
  const nameStyle = styleFor(catalog, equipped.name_style_id);
  const themeStyle = styleFor(catalog, equipped.profile_theme_id);
  const title = titleFor(catalog, equipped.title_id);

  return (
    <div className={`compactProfile ${themeStyle ? `profileCosmeticTheme ${themeStyle}` : ""}`}>
      <section className="compactProfileTop">
        <div className={`compactProfileAvatar ${frameStyle}`}>{profile.photo_url ? <img src={profile.photo_url} alt=""/> : profile.first_name.charAt(0).toUpperCase()}</div>
        <div className="compactProfileIdentity">
          <div className="compactProfileNameLine"><h1 className={nameStyle}>{profile.first_name}</h1>{title ? <span className="equippedProfileTitle">{title}</span> : <span className="profileLevel">{level}</span>}</div>
          <span className="compactProfileHandle">{profile.username ? `@${profile.username}` : "Профиль TradeUP"}</span>
        </div>
        <div className="compactProfileBalance"><span>Баланс</span><strong>{rubles(profile.balance)}</strong></div>
      </section>

      <div className="compactStatsLine">
        <div className="compactStat"><strong>{profile.rating}</strong><span>рейтинг</span></div>
        <div className="compactStat"><strong>{profile.deals_count}</strong><span>сделок</span></div>
        <div className="compactStat"><strong>{rubles(profile.total_profit)}</strong><span>прибыль</span></div>
        <div className="compactStat"><strong>{session.counts.inventory}</strong><span>инвентарь</span></div>
      </div>

      <div className="compactRank">
        <div className="compactRankLine"><strong>{level}</strong><span>{profile.rating} / {nextRating}</span></div>
        <div className="compactRankTrack"><i style={{ width: `${progress}%` }}/></div>
      </div>

      <TraderIdentity/>

      <nav className="compactProfileMenu">
        <Link href="/explore"><Icon name="trend"/><span>Рынок+</span><small>цели · аукционы · коллекции</small><Icon name="chevronRight" size={16}/></Link>
        <Link href="/store"><Icon name="sparkles"/><span>Оформление</span><small>за Stars</small><Icon name="chevronRight" size={16}/></Link>
        <Link href="/sell"><Icon name="list"/><span>Мои объявления</span><small>{session.counts.listings}</small><Icon name="chevronRight" size={16}/></Link>
        <Link href="/messages"><Icon name="message"/><span>Чаты</span>{session.unreadChats > 0 ? <small>{session.unreadChats} новых</small> : <small>Сообщения</small>}<Icon name="chevronRight" size={16}/></Link>
        <Link href="/deals"><Icon name="swap"/><span>Сделки и торг</span><small>{profile.deals_count}</small><Icon name="chevronRight" size={16}/></Link>
        <Link href="/leaderboard"><Icon name="trophy"/><span>Рейтинг</span><small>{level}</small><Icon name="chevronRight" size={16}/></Link>
        <Link href="/favorites"><Icon name="heart"/><span>Избранное</span><small>{session.counts.favorites}</small><Icon name="chevronRight" size={16}/></Link>
      </nav>
    </div>
  );
}
