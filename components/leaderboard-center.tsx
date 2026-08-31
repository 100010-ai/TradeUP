"use client";

/* Telegram profile photos are arbitrary remote URLs. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/icon";
import { getSupabasePublic } from "@/lib/supabase/public";
import { rubles, sellerLevel } from "@/lib/product";

type LeaderRow = { id: string; username: string | null; first_name: string; photo_url: string | null; rating: number; deals_count: number; total_profit: number | string; rank: number };

function PlayerAvatar({ src, name }: { src?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const initial = name.trim().charAt(0).toUpperCase() || "T";
  return src && !failed ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)}/> : <>{initial}</>;
}

export default function LeaderboardCenter() {
  const supabase = useMemo(() => getSupabasePublic(), []);
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    if (!supabase) {
      setError("Рейтинг временно недоступен");
      setLoading(false);
      return () => { active = false; };
    }

    void supabase
      .from("leaderboard")
      .select("id,username,first_name,photo_url,rating,deals_count,total_profit,rank")
      .order("rank", { ascending: true })
      .limit(50)
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) setError("Не удалось загрузить рейтинг");
        else setRows((data ?? []) as LeaderRow[]);
        setLoading(false);
      });

    return () => { active = false; };
  }, [supabase, reloadKey]);

  const topThree = rows.slice(0, 3);
  const rest = rows.slice(3);

  return <div className="leaderboardPage" aria-busy={loading}>
    <div className="pageHeadline"><div><span className="sectionEyebrow">Рейтинг</span><h1>Топ перекупов</h1><p>Таблица строится по результатам завершённых сделок.</p></div></div>
    {loading && <div className="leaderboardSkeleton" aria-label="Загрузка рейтинга" />}
    {!loading && error && <div className="flatEmpty" role="alert"><Icon name="info" size={30}/><strong>Рейтинг не загрузился</strong><span>{error}</span><button type="button" className="inlineAction" onClick={() => setReloadKey((value) => value + 1)}>Повторить</button></div>}
    {!loading && !error && rows.length === 0 && <div className="flatEmpty"><Icon name="trophy" size={30}/><strong>Рейтинг пока пуст</strong><span>Первая завершённая перепродажа откроет таблицу игроков.</span><Link href="/" className="inlineAction primary">На рынок</Link></div>}
    {!loading && !error && topThree.length > 0 && <section className="podiumGrid" aria-label="Топ 3">{topThree.map((player, index) => <article className={`podiumCard place-${index + 1}`} key={player.id}><div className="podiumPlace">#{player.rank}</div><div className="podiumAvatar"><PlayerAvatar src={player.photo_url} name={player.first_name}/></div><h2>{player.first_name}</h2><p>{player.username ? `@${player.username}` : sellerLevel(player.rating)}</p><strong className={Number(player.total_profit) >= 0 ? "profitPositive" : "profitNegative"}>{rubles(player.total_profit)}</strong><div className="podiumMeta"><span className="leaderRating"><Icon name="star" size={10} />{player.rating}</span><span>{player.deals_count} сделок</span></div></article>)}</section>}
    {!loading && !error && rest.length > 0 && <section className="leaderList" aria-label="Остальные места"><div className="leaderListHead"><span>Место</span><span>Игрок</span><span>Рейтинг</span><span>Сделки</span><span>Прибыль</span></div>{rest.map((player) => <article className="leaderRow" key={player.id}><strong className="leaderRank">#{player.rank}</strong><div className="leaderPerson"><div className="leaderAvatar"><PlayerAvatar src={player.photo_url} name={player.first_name}/></div><div><strong>{player.first_name}</strong><small>{player.username ? `@${player.username}` : sellerLevel(player.rating)}</small></div></div><span className="leaderRating"><Icon name="star" size={10} />{player.rating}</span><span>{player.deals_count}</span><strong className={Number(player.total_profit) >= 0 ? "profitPositive" : "profitNegative"}>{rubles(player.total_profit)}</strong></article>)}</section>}
    {!loading && !error && rows.length > 0 && <p className="leaderboardNote">Сортировка: чистая прибыль, затем число сделок и рейтинг.</p>}
  </div>;
}
