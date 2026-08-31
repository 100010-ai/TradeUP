"use client";

import { useCallback, useEffect, useState } from "react";
import Icon, { categoryIconName } from "@/components/icon";
import { useTelegramSession } from "@/components/telegram-session";
import { categoryMeta, rubles } from "@/lib/product";

type Identity = { profile_id:string; sales:number; avg_margin_pct:number|string; best_margin_pct:number|string; best_profit:number|string; avg_sell_seconds:number|string|null; unique_item_types:number; specialization_category:string|null; specialization_trades:number|null; top_brand:string|null; top_brand_trades:number|null; trader_rank:string };
type Reputation = { reputation_percent:number|string|null; positive_count:number; negative_count:number; avg_response_seconds:number|string|null };
type IdentityResult = { identity?:Identity|null; reputation?:Reputation|null };

const rankRu: Record<string, string> = { "New Trader":"Новичок", "Dealer I":"Дилер I", "Dealer II":"Дилер II", "Dealer III":"Дилер III", "Pro Dealer":"Профи", "Master Dealer":"Мастер" };

function duration(value: number | string | null) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "нет данных";
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} мин`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} ч`;
  return `${Math.round(seconds / 86400)} дн`;
}

function percent(value: number | string) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)}%` : "нет данных";
}

function salesLabel(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "продаж";
  if (mod10 === 1) return "продажа";
  if (mod10 >= 2 && mod10 <= 4) return "продажи";
  return "продаж";
}

export default function TraderIdentity() {
  const session = useTelegramSession();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (session.state !== "verified") return;
    const initData = window.Telegram?.WebApp?.initData ?? "";
    if (!initData) return;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch("/api/social-market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, action: "identity", payload: {} }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("identity_failed");
      const result = await response.json() as IdentityResult;
      setIdentity(result.identity ?? null);
      setReputation(result.reputation ?? null);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [session.state]);

  useEffect(() => { void load(); }, [load]);

  if (session.state !== "verified") return null;
  if (loading && !identity) return <section className="traderIdentity traderIdentityLoading" aria-label="Загрузка торгового профиля"><i/><i/><i/></section>;
  if (failed && !identity) return <section className="traderIdentity traderIdentityUnavailable"><div><strong>Стиль торговли временно недоступен</strong><span>Остальной профиль работает как обычно.</span></div><button type="button" onClick={() => void load()}>Повторить</button></section>;
  if (!identity) return null;

  const category = identity.specialization_category ? (categoryMeta[identity.specialization_category] ?? { short: identity.specialization_category }) : null;
  const unlockMargin = identity.sales >= 3;
  const unlockSpeed = identity.sales >= 8;
  const unlockDeep = identity.sales >= 20;
  const reputationValue = Number(reputation?.reputation_percent);
  const hasReputation = Number.isFinite(reputationValue);

  return <section className="traderIdentity" aria-label="Стиль торговли">
    <div className="traderIdentityHead"><div><span>Стиль торговли</span><h2>{category ? category.short : "Специализация формируется"}</h2></div><b>{rankRu[identity.trader_rank] ?? identity.trader_rank}</b></div>
    <div className="traderIdentityCore"><div className="traderSpecialIcon"><Icon name={categoryIconName(identity.specialization_category ?? "")} size={22}/></div><div><strong>{identity.sales} {salesLabel(identity.sales)}</strong><span>{identity.top_brand ? `Чаще всего: ${identity.top_brand}` : "Нужно больше завершённых сделок"}</span></div>{hasReputation && <div className="traderRep"><strong>{reputationValue.toFixed(1)}%</strong><span>репутация</span></div>}</div>
    <div className="traderIdentityStats">
      <div className={!unlockMargin ? "locked" : ""}><span>Средняя маржа</span><strong>{unlockMargin ? percent(identity.avg_margin_pct) : "после 3 продаж"}</strong></div>
      <div className={!unlockSpeed ? "locked" : ""}><span>Скорость продажи</span><strong>{unlockSpeed ? duration(identity.avg_sell_seconds) : "после 8 продаж"}</strong></div>
      <div className={!unlockDeep ? "locked" : ""}><span>Лучшая перепродажа</span><strong>{unlockDeep ? `+${rubles(identity.best_profit)}` : "после 20 продаж"}</strong></div>
    </div>
    {!unlockDeep && <p>Статистика раскрывается только по завершённым сделкам и постепенно точнее описывает твой стиль.</p>}
  </section>;
}
