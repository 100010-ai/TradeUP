"use client";

import Link from "next/link";
import Icon from "@/components/icon";
import { useTelegramSession } from "@/components/telegram-session";
import { rubles, sellerLevel } from "@/lib/product";

export default function ProfileCenter() {
  const session = useTelegramSession();
  const profile = session.profile;

  if (session.state !== "verified" || !profile) {
    return <div className="flatAuth"><Icon name="user" size={32}/><strong>Профиль доступен в Telegram</strong><button type="button" onClick={session.openBot}>Открыть TradeUP</button></div>;
  }

  const level = sellerLevel(profile.rating);
  const nextRating = profile.rating < 1100 ? 1100 : profile.rating < 1250 ? 1250 : profile.rating < 1500 ? 1500 : profile.rating < 1800 ? 1800 : 2000;
  const previousRating = profile.rating < 1100 ? 1000 : profile.rating < 1250 ? 1100 : profile.rating < 1500 ? 1250 : profile.rating < 1800 ? 1500 : 1800;
  const progress = Math.min(100, Math.max(0, ((profile.rating - previousRating) / Math.max(1, nextRating - previousRating)) * 100));

  return (
    <div className="compactProfile">
      <section className="compactProfileTop">
        <div className="compactProfileAvatar">{profile.photo_url ? <img src={profile.photo_url} alt=""/> : profile.first_name.charAt(0).toUpperCase()}</div>
        <div className="compactProfileIdentity"><h1>{profile.first_name}</h1><span>{profile.username ? `@${profile.username}` : level}</span></div>
        <div className="compactProfileBalance"><strong>{rubles(profile.balance)}</strong><span>баланс</span></div>
      </section>

      <div className="compactStatsLine">
        <div className="compactStat"><strong>{profile.rating}</strong><span>рейтинг</span></div>
        <div className="compactStat"><strong>{profile.deals_count}</strong><span>сделок</span></div>
        <div className="compactStat"><strong>{rubles(profile.total_profit)}</strong><span>прибыль</span></div>
        <div className="compactStat"><strong>{session.counts.inventory}</strong><span>в инвентаре</span></div>
      </div>

      <div className="compactRank">
        <div className="compactRankLine"><strong>{level}</strong><span>{profile.rating} / {nextRating}</span></div>
        <div className="compactRankTrack"><i style={{ width: `${progress}%` }}/></div>
      </div>

      <nav className="compactProfileMenu">
        <Link href="/sell"><Icon name="list"/><span>Мои объявления</span><small>{session.counts.listings}</small><Icon name="chevronRight" size={16}/></Link>
        <Link href="/messages"><Icon name="message"/><span>Чаты</span>{session.unreadChats > 0 ? <small>{session.unreadChats} новых</small> : <small>Сообщения</small>}<Icon name="chevronRight" size={16}/></Link>
        <Link href="/deals"><Icon name="swap"/><span>Сделки и торг</span><small>{profile.deals_count}</small><Icon name="chevronRight" size={16}/></Link>
        <Link href="/leaderboard"><Icon name="trophy"/><span>Рейтинг</span><small>{level}</small><Icon name="chevronRight" size={16}/></Link>
        <Link href="/favorites"><Icon name="heart"/><span>Избранное</span><small>{session.counts.favorites}</small><Icon name="chevronRight" size={16}/></Link>
      </nav>
    </div>
  );
}
