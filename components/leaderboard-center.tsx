"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/icon";
import { getSupabasePublic } from "@/lib/supabase/public";
import { rubles, sellerLevel } from "@/lib/product";

type LeaderRow = { id: string; username: string | null; first_name: string; photo_url: string | null; rating: number; deals_count: number; total_profit: number | string; rank: number };

export default function LeaderboardCenter() {
  const supabase = useMemo(() => getSupabasePublic(), []);
  const [rows, setRows] = useState<LeaderRow[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!supabase) { setError("Supabase не настроен"); setLoading(false); return; }
    void supabase.from("leaderboard").select("id,username,first_name,photo_url,rating,deals_count,total_profit,rank").order("rank", { ascending: true }).limit(50).then(({ data, error: queryError }) => { if (!active) return; if (queryError) setError(queryError.message); else setRows((data ?? []) as LeaderRow[]); setLoading(false); });
    return () => { active = false; };
  }, [supabase]);

  const topThree = rows.slice(0, 3); const rest = rows.slice(3);

  return <div className="leaderboardPage">
    <div className="pageHeadline"><div><span className="sectionEyebrow">Рейтинг</span><h1>Топ перекупов</h1><p>Места определяются реальной прибылью с завершённых продаж.</p></div></div>
    {loading && <div className="leaderboardSkeleton" />}
    {error && <div className="actionMessage">{error}</div>}
    {!loading && !error && rows.length === 0 && <div className="emptyPanel"><div className="emptySymbol"><Icon name="trophy" /></div><h3>Рейтинг пока пуст</h3><p>Первая завершённая перепродажа откроет таблицу игроков.</p><a href="/" className="primaryAction">На рынок</a></div>}
    {!loading && topThree.length > 0 && <section className="podiumGrid">{topThree.map((player, index) => <article className={`podiumCard place-${index + 1}`} key={player.id}><div className="podiumPlace">#{player.rank}</div><div className="podiumAvatar">{player.photo_url ? <img src={player.photo_url} alt="" /> : player.first_name.charAt(0).toUpperCase()}</div><h2>{player.first_name}</h2><p>{player.username ? `@${player.username}` : sellerLevel(player.rating)}</p><strong>{rubles(player.total_profit)}</strong><div className="podiumMeta"><span className="leaderRating"><Icon name="star" size={10} />{player.rating}</span><span>{player.deals_count} сделок</span></div></article>)}</section>}
    {!loading && rest.length > 0 && <section className="leaderList"><div className="leaderListHead"><span>Место</span><span>Игрок</span><span>Рейтинг</span><span>Сделки</span><span>Прибыль</span></div>{rest.map((player) => <article className="leaderRow" key={player.id}><strong className="leaderRank">#{player.rank}</strong><div className="leaderPerson"><div className="leaderAvatar">{player.photo_url ? <img src={player.photo_url} alt="" /> : player.first_name.charAt(0).toUpperCase()}</div><div><strong>{player.first_name}</strong><small>{player.username ? `@${player.username}` : sellerLevel(player.rating)}</small></div></div><span className="leaderRating"><Icon name="star" size={10} />{player.rating}</span><span>{player.deals_count}</span><strong className={Number(player.total_profit) >= 0 ? "profitPositive" : "profitNegative"}>{rubles(player.total_profit)}</strong></article>)}</section>}
    {!loading && rows.length > 0 && <p className="leaderboardNote">Сортировка: чистая прибыль, затем число сделок и рейтинг.</p>}
  </div>;
}
