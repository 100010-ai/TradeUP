"use client";

import Link from "next/link";
import Icon from "@/components/icon";
import { useTelegramSession } from "@/components/telegram-session";
import { rubles, sellerLevel } from "@/lib/product";

export default function ProfileCenter() {
  const session = useTelegramSession();
  const profile = session.profile;

  if (session.state !== "verified" || !profile) {
    return <div className="authGate compactGate"><div className="authGateIcon"><Icon name="user" /></div><span className="sectionEyebrow">Профиль</span><h1>Карьера перекупа</h1><p>Рейтинг, прибыль и статистика появятся после входа через @{session.botUsername}.</p><button type="button" className="primaryAction" onClick={session.openBot}>Открыть TradeUP</button></div>;
  }

  const level = sellerLevel(profile.rating);
  const nextRating = profile.rating < 1100 ? 1100 : profile.rating < 1250 ? 1250 : profile.rating < 1500 ? 1500 : profile.rating < 1800 ? 1800 : 2000;
  const previous = profile.rating < 1100 ? 1000 : profile.rating < 1250 ? 1100 : profile.rating < 1500 ? 1250 : profile.rating < 1800 ? 1500 : 1800;
  const progress = Math.min(100, Math.max(0, ((profile.rating - previous) / Math.max(1, nextRating - previous)) * 100));

  return <div className="profilePage">
    <section className="profileHeroCard">
      <div className="profileAvatarXL">{profile.photo_url ? <img src={profile.photo_url} alt="" /> : profile.first_name.charAt(0).toUpperCase()}</div>
      <div className="profileHeroInfo"><span className="sectionEyebrow">Профиль игрока</span><h1>{profile.first_name}</h1><p>{profile.username ? `@${profile.username}` : `Уровень: ${level}`}</p></div>
      <div className="onlinePill"><i /> online</div>
    </section>

    <section className="walletCard"><div><span>Баланс</span><strong>{rubles(profile.balance)}</strong><p>Игровые рубли для сделок</p></div><Link href="/" className="primaryAction">Искать лоты</Link></section>

    <div className="profileStatsGrid">
      <div><span>Рейтинг</span><strong>{profile.rating}</strong><small>{level}</small></div>
      <div><span>Сделки</span><strong>{profile.deals_count}</strong><small>покупки + продажи</small></div>
      <div><span>Прибыль</span><strong className={Number(profile.total_profit) >= 0 ? "profitPositive" : "profitNegative"}>{rubles(profile.total_profit)}</strong><small>чистая после комиссии</small></div>
      <div><span>Инвентарь</span><strong>{session.counts.inventory}</strong><small>{session.counts.listings} на продаже</small></div>
    </div>

    <section className="rankCard"><div className="rankHeader"><div><span className="sectionEyebrow">Прогресс</span><h2>{level}</h2></div><strong>{profile.rating} / {nextRating}</strong></div><div className="rankTrack"><i style={{ width: `${progress}%` }} /></div><p>Успешные сделки повышают рейтинг и открывают доступ к более дорогому рынку.</p></section>

    <section className="profileMenu">
      <Link href="/leaderboard"><div><span><Icon name="trophy" size={19} /></span><div><strong>Топ перекупов</strong><small>Рейтинг по реальной прибыли</small></div></div><b><Icon name="chevronRight" size={17} /></b></Link>
      <Link href="/sell"><div><span><Icon name="inventory" size={19} /></span><div><strong>Мой инвентарь</strong><small>{session.counts.inventory} предметов</small></div></div><b><Icon name="chevronRight" size={17} /></b></Link>
      <Link href="/favorites"><div><span><Icon name="heart" size={19} /></span><div><strong>Избранное</strong><small>{session.counts.favorites} сохранено</small></div></div><b><Icon name="chevronRight" size={17} /></b></Link>
      <Link href="/deals"><div><span><Icon name="swap" size={19} /></span><div><strong>Сделки и торг</strong><small>{profile.deals_count} завершённых операций</small></div></div><b><Icon name="chevronRight" size={17} /></b></Link>
      <a href={session.botUrl}><div><span><Icon name="bot" size={19} /></span><div><strong>@{session.botUsername}</strong><small>Открыть бота</small></div></div><b><Icon name="chevronRight" size={17} /></b></a>
    </section>

    <div className="profileFootnote">Приватные игровые данные не отображаются в публичном профиле.</div>
  </div>;
}
