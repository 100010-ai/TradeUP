"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/icon";
import { useTelegramSession } from "@/components/telegram-session";
import { rubles } from "@/lib/product";

type ItemType={id:string;name:string;brand:string|null;category_id:string};
type Item={id:string;serial_code:string;condition:number;specs:Record<string,unknown>;condition_notes:string[];owner_count:number;lifetime_turnover:number|string;last_sale_price:number|string|null;first_seen_at:string;item_types:ItemType|ItemType[]|null};
type Event={id:string;event_type:string;actor_id:string|null;counterparty_id:string|null;amount:number|string|null;created_at:string};
type Person={id:string;first_name:string;username:string|null};
type Market={sales_7d:number;sales_30d:number;median_7d:number|string|null;median_30d:number|string|null;median_prev_7d:number|string|null;low_30d:number|string|null;high_30d:number|string|null;avg_sell_seconds:number|string|null;active_listings:number;circulating:number};
type Reputation={positive_count:number;negative_count:number;reputation_percent:number|string|null;avg_response_seconds:number|string|null;cancelled_listings:number};
type Result={item?:Item;events?:Event[];eventProfiles?:Person[];market?:Market|null;reputation?:Reputation|null;favorites?:number};
function one<T>(v:T|T[]|null|undefined){return Array.isArray(v)?v[0]??null:v??null;}
function yes(v:unknown){return v===true?"есть":v===false?"нет":null;}
function responseTime(v:number|string|null|undefined){const s=Number(v);if(!Number.isFinite(s)||s<=0)return "нет данных";if(s<60)return "меньше минуты";if(s<3600)return `≈ ${Math.max(1,Math.round(s/60))} мин`;return `≈ ${Math.max(1,Math.round(s/3600))} ч`;}
function date(v:string){return new Date(v).toLocaleDateString("ru-RU",{day:"numeric",month:"short",year:"numeric"});}

export default function ListingMarketContext({listingId}:{listingId:string}){
 const session=useTelegramSession();const[data,setData]=useState<Result|null>(null);const[loading,setLoading]=useState(false);
 useEffect(()=>{if(session.state!=="verified")return;let active=true;setLoading(true);void session.callDepthAction("listing_context",{listingId}).then(r=>{if(active)setData(r as Result);}).catch(()=>undefined).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[listingId,session.state,session.callDepthAction]);
 const people=useMemo(()=>new Map((data?.eventProfiles??[]).map(p=>[p.id,p])),[data]);if(session.state!=="verified")return null;if(loading&&!data)return <div className="instanceSkeleton"/>;if(!data?.item)return null;
 const item=data.item,type=one(item.item_types),specs=item.specs??{},market=data.market,reputation=data.reputation;const trend=market?.median_7d&&market?.median_prev_7d?((Number(market.median_7d)-Number(market.median_prev_7d))/Number(market.median_prev_7d))*100:null;
 const specRows=[
  ["Серийный код",item.serial_code],["Цвет",typeof specs.color==="string"?specs.color:null],["Память",Number(specs.storage_gb)>0?`${specs.storage_gb} GB`:null],["Аккумулятор",Number(specs.battery_health)>0?`${specs.battery_health}%`:null],["Коробка",yes(specs.box)],["Комплект",yes(specs.accessories)],["Размер",Number(specs.size_eu)>0?`EU ${specs.size_eu}`:null],["Полный комплект",yes(specs.complete_set)],
 ].filter((x):x is [string,string]=>typeof x[1]==="string"&&Boolean(x[1]));
 return <>
  <section className="flatSection instanceSection"><div className="instanceHeading"><div><span>Конкретный экземпляр</span><h2>{type?.name??"Предмет"}</h2></div><b>{item.owner_count} владелец{item.owner_count===1?"":item.owner_count<5?"а":"ев"}</b></div><div className="instanceSpecs">{specRows.map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>{item.condition_notes.length>0&&<div className="conditionNotes">{item.condition_notes.map(n=><span key={n}><Icon name="check" size={12}/>{n}</span>)}</div>}</section>
  <section className="flatSection marketReality"><div className="instanceHeading"><div><span>Реальные сделки</span><h2>Рынок этого товара</h2></div>{trend!==null&&<b className={trend>=0?"up":"down"}>{trend>=0?"+":""}{trend.toFixed(1)}%</b>}</div><div className="marketRealityGrid"><div><span>Медиана 7 дней</span><strong>{market?.median_7d?rubles(market.median_7d):"Нет данных"}</strong></div><div><span>Продаж за 30 дней</span><strong>{market?.sales_30d??0}</strong></div><div><span>Активных на рынке</span><strong>{market?.active_listings??0}</strong></div><div><span>Обычно продаётся</span><strong>{responseTime(market?.avg_sell_seconds)}</strong></div></div>{market?.low_30d&&market?.high_30d&&<p>За 30 дней похожие экземпляры уходили от <b>{rubles(market.low_30d)}</b> до <b>{rubles(market.high_30d)}</b>. В обращении сейчас {market.circulating} экземпляров.</p>}</section>
  <section className="flatSection sellerTrust"><div className="instanceHeading"><div><span>Репутация</span><h2>Продавец</h2></div>{reputation?.reputation_percent!=null&&<b>{Number(reputation.reputation_percent).toFixed(1)}%</b>}</div><div className="sellerTrustRows"><div><span>Положительные сделки</span><strong>{reputation?.positive_count??0}</strong></div><div><span>Проблемные</span><strong>{reputation?.negative_count??0}</strong></div><div><span>Средний ответ</span><strong>{responseTime(reputation?.avg_response_seconds)}</strong></div><div><span>Добавили в избранное</span><strong>{data.favorites??0}</strong></div></div></section>
  <section className="flatSection itemStory"><div className="instanceHeading"><div><span>История вещи</span><h2>{rubles(item.lifetime_turnover)} оборота</h2></div><small>с {date(item.first_seen_at)}</small></div><div className="itemStoryLine">{(data.events??[]).map(e=>{const actor=e.actor_id?people.get(e.actor_id):null,counter=e.counterparty_id?people.get(e.counterparty_id):null;return <div key={e.id}><i className={e.event_type}/><div><strong>{e.event_type==="created"?"Появился в TradeUP":e.event_type==="sale"?"Перепродажа":e.event_type==="repair"?"Ремонт":"Событие"}</strong><span>{e.event_type==="sale"?`${actor?.first_name??"Игрок"} → ${counter?.first_name??"Игрок"}`:actor?.first_name??"TradeUP"}</span></div><div><b>{e.amount?rubles(e.amount):""}</b><small>{date(e.created_at)}</small></div></div>;})}</div></section>
 </>;
}
