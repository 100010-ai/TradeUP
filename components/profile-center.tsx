"use client";

import Link from "next/link";
import Icon from "@/components/icon";
import { useTelegramSession } from "@/components/telegram-session";
import { rubles, sellerLevel } from "@/lib/product";

export default function ProfileCenter() {
  const session = useTelegramSession();
  const profile = session.profile;

  if (session.state !== "verified" || !profile) return <div className="flatAuth"><Icon name="user" size={32}/><strong>Профиль доступен в Telegram</strong><button type="button" onClick={session.openBot}>Открыть TradeUP</button></div>;

  const level = sellerLevel(profile.rating);
  return (
    <div className="flatProfilePage">
      <section className="flatProfileHead">
        <div className="flatProfileAvatar">{profile.photo_url ? <img src={profile.photo_url} alt=""/> : profile.first_name.charAt(0).toUpperCase()}</div>
        <div><h1>{profile.first_name}</h1><span>{profile.username ? `@${profile.username}` : level}</span></div>
      </section>

      <section className="flatBalance"><span>Баланс</span><strong>{rubles(profile.balance)}</strong></section>
      <section className="flatProfileStats"><div><strong>{profile.rating}</strong><span>рейтинг</span></div><div><strong>{profile.deals_count}</strong><span>сделок</span></div><div><strong>{rubles(profile.total_profit)}</strong><span>прибыль</span></div></section>

      <nav className="flatProfileMenu">
        <Link href="/sell"><Icon name="list"/><span>Мои объявления</span><small>{session.counts.listings}</small><Icon name="chevronRight" size={17}/></Link>
        <Link href="/messages"><Icon name="message"/><span>Сообщения</span>{session.unreadChats > 0 && <small>{session.unreadChats}</small>}<Icon name="chevronRight" size={17}/></Link>
        <Link href="/deals"><Icon name="swap"/><span>Сделки и торг</span><small>{profile.deals_count}</small><Icon name="chevronRight" size={17}/></Link>
        <Link href="/leaderboard"><Icon name="trophy"/><span>Рейтинг</span><small>{level}</small><Icon name="chevronRight" size={17}/></Link>
        <Link href="/favorites"><Icon name="heart"/><span>Избранное</span><small>{session.counts.favorites}</small><Icon name="chevronRight" size={17}/></Link>
      </nav>
    </div>
  );
}
