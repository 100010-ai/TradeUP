"use client";

import { useEffect, useState } from "react";
import Icon, { categoryIconName } from "@/components/icon";
import { useTelegramSession } from "@/components/telegram-session";
import { categoryMeta, rubles } from "@/lib/product";

type Identity={profile_id:string;sales:number;avg_margin_pct:number|string;best_margin_pct:number|string;best_profit:number|string;avg_sell_seconds:number|string|null;unique_item_types:number;specialization_category:string|null;specialization_trades:number|null;top_brand:string|null;top_brand_trades:number|null;trader_rank:string};
type Reputation={reputation_percent:number|string|null;positive_count:number;negative_count:number;avg_response_seconds:number|string|null};
function time(v:number|string|null){const s=Number(v);if(!Number.isFinite(s)||s<=0)return "нет данных";if(s<3600)return `${Math.max(1,Math.round(s/60))} мин`;if(s<86400)return `${Math.round(s/3600)} ч`;return `${Math.round(s/86400)} дн`;}
const rankRu:Record<string,string>={"New Trader":"Новичок","Dealer I":"Дилер I","Dealer II":"Дилер II","Dealer III":"Дилер III","Pro Dealer":"Профи","Master Dealer":"Мастер"};

export default function TraderIdentity(){
 const session=useTelegramSession();const[identity,setIdentity]=useState<Identity|null>(null),[reputation,setReputation]=useState<Reputation|null>(null);
 useEffect(()=>{if(session.state!=="verified")return;const initData=window.Telegram?.WebApp?.initData??"";if(!initData)return;let active=true;void fetch("/api/social-market",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({initData,action:"identity",payload:{}}),cache:"no-store"}).then(async r=>r.ok?r.json():null).then((r:{identity?:Identity|null;reputation?:Reputation|null}|null)=>{if(active&&r){setIdentity(r.identity??null);setReputation(r.reputation??null);}}).catch(()=>undefined);return()=>{active=false;};},[session.state]);
 if(!identity)return null;const category=identity.specialization_category?(categoryMeta[identity.specialization_category]??{short:identity.specialization_category,icon:""}):null;const unlockMargin=identity.sales>=3,unlockSpeed=identity.sales>=8,unlockDeep=identity.sales>=20;
 return <section className="traderIdentity">
  <div className="traderIdentityHead"><div><span>Стиль торговли</span><h2>{category?category.short:"Специализация формируется"}</h2></div><b>{rankRu[identity.trader_rank]??identity.trader_rank}</b></div>
  <div className="traderIdentityCore"><div className="traderSpecialIcon"><Icon name={categoryIconName(identity.specialization_category??"")} size={22}/></div><div><strong>{identity.sales} продаж</strong><span>{identity.top_brand?`Чаще всего ${identity.top_brand}`:"Нужно больше реальных сделок"}</span></div>{reputation?.reputation_percent!=null&&<div className="traderRep"><strong>{Number(reputation.reputation_percent).toFixed(1)}%</strong><span>репутация</span></div>}</div>
  <div className="traderIdentityStats">
   <div className={!unlockMargin?"locked":""}><span>Средняя маржа</span><strong>{unlockMargin?`${Number(identity.avg_margin_pct).toFixed(1)}%`:"после 3 продаж"}</strong></div>
   <div className={!unlockSpeed?"locked":""}><span>Средняя продажа</span><strong>{unlockSpeed?time(identity.avg_sell_seconds):"после 8 продаж"}</strong></div>
   <div className={!unlockDeep?"locked":""}><span>Лучший flip</span><strong>{unlockDeep?`+${rubles(identity.best_profit)}`:"после 20 продаж"}</strong></div>
  </div>
  {!unlockDeep&&<p>Статистика раскрывается по мере реальной торговли. Она ничего не усиливает, только точнее показывает твой стиль.</p>}
 </section>;
}
