"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Icon from "@/components/icon";
import ProductImage from "@/components/product-image";
import { useTelegramSession } from "@/components/telegram-session";
import { rubles } from "@/lib/product";

type Tab = "overview" | "wanted" | "auctions" | "bundles" | "collections";
type ItemType = { id:string; slug?:string; name:string; brand:string|null; category_id:string; base_value:number|string; image_url:string|null };
type InventoryItem = { id:string; item_type_id:string; condition:number; specs:Record<string,unknown>; is_locked:boolean; acquired_price:number|string; serial_code?:string; item_types:ItemType|ItemType[]|null };
type Wanted = { id:string; buyer_id:string; item_type_id:string; budget_max:number|string; min_condition:number; min_storage_gb:number|null; min_battery_health:number|null; note:string; status:string; created_at:string; expires_at:string; item_types:ItemType|ItemType[]|null; profiles?:{id:string;first_name:string;username:string|null;photo_url:string|null;rating:number;deals_count:number}|null };
type MarketStat = { item_type_id:string; name:string; brand:string|null; category_id:string; sales_7d:number; sales_30d:number; median_7d:number|string|null; median_30d:number|string|null; median_prev_7d:number|string|null; low_30d:number|string|null; high_30d:number|string|null; avg_sell_seconds:number|string|null; active_listings:number; circulating:number };
type Auction = { id:string; listing_id:string; seller_id:string; start_price:number|string; current_bid:number|string|null; high_bidder_id:string|null; bid_count:number; status:string; ends_at:string };
type Listing = { id:string; inventory_item_id:string; title:string; price:number|string; status:string };
type Profile = { id:string; first_name:string; username:string|null; photo_url:string|null; rating:number; deals_count:number };
type Bundle = { id:string; seller_id:string; title:string; description:string; price:number|string; status:string; created_at:string };
type BundleItem = { bundle_id:string; item_id:string };
type CollectionSet = { id:string; name:string; description:string; sort_order:number };
type CollectionEntry = { set_id:string; item_type_id:string; item_types:ItemType|ItemType[]|null };
type WantedData = { own:Wanted[]; requests:Wanted[]; itemTypes:ItemType[]; inventory:InventoryItem[] };
type AuctionData = { auctions:Auction[]; listings:Listing[]; items:InventoryItem[]; profiles:Profile[] };
type BundleData = { bundles:Bundle[]; bundleItems:BundleItem[]; items:InventoryItem[]; profiles:Profile[] };
type CollectionData = { sets:CollectionSet[]; entries:CollectionEntry[]; currentTypeIds:string[]; everTypeIds:string[] };

const tabs: { id:Tab; label:string; icon:"trend"|"search"|"trophy"|"package"|"collectible" }[] = [
  { id:"overview", label:"Пульс", icon:"trend" },
  { id:"wanted", label:"Ищу", icon:"search" },
  { id:"auctions", label:"Аукционы", icon:"trophy" },
  { id:"bundles", label:"Лоты", icon:"package" },
  { id:"collections", label:"Коллекции", icon:"collectible" },
];

const goalMeta: Record<string, { title:string; hint:string; xp:number }> = {
  first_sale: { title:"Закрыть продажу", hint:"Продай любой предмет сегодня", xp:80 },
  margin_8: { title:"Маржа 8%+", hint:"Закрой сделку с маржой не ниже 8%", xp:120 },
  fast_sale: { title:"Быстрый оборот", hint:"Продай предмет менее чем за 30 минут", xp:100 },
  negotiate: { title:"Договориться", hint:"Закрой сделку через торг", xp:90 },
};

function one<T>(value:T|T[]|null|undefined){return Array.isArray(value)?value[0]??null:value??null;}
function pct(now:number|string|null,prev:number|string|null){const a=Number(now),b=Number(prev);if(!Number.isFinite(a)||!Number.isFinite(b)||b===0)return null;return((a-b)/b)*100;}
function duration(seconds:number|string|null){const s=Number(seconds);if(!Number.isFinite(s)||s<=0)return "нет данных";if(s<3600)return `${Math.max(1,Math.round(s/60))} мин`;if(s<86400)return `${Math.round(s/3600)} ч`;return `${Math.round(s/86400)} дн`;}
function remaining(value:string){const ms=new Date(value).getTime()-Date.now();if(!Number.isFinite(ms)||ms<=0)return "завершается";const min=Math.ceil(ms/60000);if(min<60)return `${min} мин`;const h=Math.ceil(min/60);if(h<24)return `${h} ч`;return `${Math.ceil(h/24)} дн`;}
function positiveInteger(value:string){const number=Number(value);return Number.isSafeInteger(number)&&number>0?number:null;}
function readableError(error:unknown,fallback:string){const code=error instanceof Error?error.message:"";if(code==="insufficient_funds")return "Недостаточно средств";if(code==="item_locked")return "Предмет уже участвует в другом действии";if(code==="bid_too_low")return "Ставка слишком низкая";if(code==="listing_not_active"||code==="auction_not_active")return "Лот уже недоступен";return code&&code!=="request_failed"?code:fallback;}

export default function ExploreCenter(){
  const session=useTelegramSession();
  const params=useSearchParams();
  const requested=params.get("tab") as Tab|null;
  const[tab,setTab]=useState<Tab>(tabs.some((item)=>item.id===requested)?requested!:"overview");
  const[overview,setOverview]=useState<Record<string,unknown>|null>(null);
  const[wanted,setWanted]=useState<WantedData|null>(null);
  const[auctionData,setAuctionData]=useState<AuctionData|null>(null);
  const[bundleData,setBundleData]=useState<BundleData|null>(null);
  const[collectionData,setCollectionData]=useState<CollectionData|null>(null);
  const[loading,setLoading]=useState(true);
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const[showCreate,setShowCreate]=useState(false);
  const[wantedType,setWantedType]=useState("");
  const[wantedBudget,setWantedBudget]=useState("");
  const[wantedCondition,setWantedCondition]=useState("75");
  const[auctionItem,setAuctionItem]=useState("");
  const[auctionPrice,setAuctionPrice]=useState("");
  const[auctionHours,setAuctionHours]=useState("24");
  const[bidAmounts,setBidAmounts]=useState<Record<string,string>>({});
  const[bundleItems,setBundleItems]=useState<string[]>([]);
  const[bundleTitle,setBundleTitle]=useState("");
  const[bundlePrice,setBundlePrice]=useState("");

  const sessionState=session.state;
  const callDepthAction=session.callDepthAction;
  const profileId=session.profile?.id??"";

  const load=useCallback(async(target:Tab,force=false)=>{
    if(sessionState!=="verified")return;
    const cached=target==="overview"?overview:target==="wanted"?wanted:target==="auctions"?auctionData:target==="bundles"?bundleData:collectionData;
    if(cached&&!force){setLoading(false);return;}
    setError(null);
    setLoading(true);
    try{
      if(target==="overview")setOverview(await callDepthAction("overview"));
      if(target==="wanted"){
        const result=await callDepthAction("wanted");
        setWanted({own:(result.own??[]) as Wanted[],requests:(result.requests??[]) as Wanted[],itemTypes:(result.itemTypes??[]) as ItemType[],inventory:(result.inventory??[]) as InventoryItem[]});
      }
      if(target==="auctions"){
        const [auctionsResult,wantedResult]=await Promise.all([callDepthAction("auctions"),wanted?Promise.resolve(null):callDepthAction("wanted")]);
        setAuctionData({auctions:(auctionsResult.auctions??[]) as Auction[],listings:(auctionsResult.listings??[]) as Listing[],items:(auctionsResult.items??[]) as InventoryItem[],profiles:(auctionsResult.profiles??[]) as Profile[]});
        if(wantedResult)setWanted({own:(wantedResult.own??[]) as Wanted[],requests:(wantedResult.requests??[]) as Wanted[],itemTypes:(wantedResult.itemTypes??[]) as ItemType[],inventory:(wantedResult.inventory??[]) as InventoryItem[]});
      }
      if(target==="bundles"){
        const [bundlesResult,wantedResult]=await Promise.all([callDepthAction("bundles"),wanted?Promise.resolve(null):callDepthAction("wanted")]);
        setBundleData({bundles:(bundlesResult.bundles??[]) as Bundle[],bundleItems:(bundlesResult.bundleItems??[]) as BundleItem[],items:(bundlesResult.items??[]) as InventoryItem[],profiles:(bundlesResult.profiles??[]) as Profile[]});
        if(wantedResult)setWanted({own:(wantedResult.own??[]) as Wanted[],requests:(wantedResult.requests??[]) as Wanted[],itemTypes:(wantedResult.itemTypes??[]) as ItemType[],inventory:(wantedResult.inventory??[]) as InventoryItem[]});
      }
      if(target==="collections"){
        const result=await callDepthAction("collections");
        setCollectionData({sets:(result.sets??[]) as CollectionSet[],entries:(result.entries??[]) as CollectionEntry[],currentTypeIds:(result.currentTypeIds??[]) as string[],everTypeIds:(result.everTypeIds??[]) as string[]});
      }
    }catch(reason){setError(readableError(reason,"Не удалось загрузить раздел"));}
    finally{setLoading(false);}
  },[sessionState,callDepthAction,overview,wanted,auctionData,bundleData,collectionData]);

  useEffect(()=>{
    if(sessionState==="verified")void load(tab);
    else if(["browser","unavailable","error"].includes(sessionState))setLoading(false);
  },[sessionState,tab,load]);

  const availableInventory=useMemo(()=>wanted?.inventory.filter((item)=>!item.is_locked)??[],[wanted?.inventory]);
  const listingMap=useMemo(()=>new Map((auctionData?.listings??[]).map((item)=>[item.id,item])),[auctionData?.listings]);
  const auctionItemMap=useMemo(()=>new Map((auctionData?.items??[]).map((item)=>[item.id,item])),[auctionData?.items]);
  const bundleItemMap=useMemo(()=>new Map((bundleData?.items??[]).map((item)=>[item.id,item])),[bundleData?.items]);

  function changeTab(next:Tab){setTab(next);setShowCreate(false);setError(null);}

  async function claimGoal(key:string){
    if(busy)return;setBusy(true);setError(null);
    try{await callDepthAction("claim_goal",{goalKey:key});await load("overview",true);}
    catch(reason){setError(reason instanceof Error&&reason.message==="goal_already_claimed"?"Цель уже получена":"Цель ещё не выполнена");}
    finally{setBusy(false);}
  }

  async function createWanted(event:React.FormEvent){
    event.preventDefault();
    const budget=positiveInteger(wantedBudget);const condition=Number(wantedCondition);
    if(!wantedType||!budget){setError("Укажи предмет и корректный бюджет");return;}
    if(!Number.isInteger(condition)||condition<1||condition>100){setError("Состояние должно быть от 1 до 100%");return;}
    setBusy(true);setError(null);
    try{await callDepthAction("create_wanted",{itemTypeId:wantedType,budgetMax:budget,minCondition:condition});setWantedBudget("");setShowCreate(false);await load("wanted",true);}
    catch(reason){setError(readableError(reason,"Не удалось создать запрос"));}
    finally{setBusy(false);}
  }

  async function cancelWanted(id:string){
    if(busy)return;setBusy(true);setError(null);
    try{await callDepthAction("cancel_wanted",{requestId:id});await load("wanted",true);}
    catch(reason){setError(readableError(reason,"Не удалось снять запрос"));}
    finally{setBusy(false);}
  }

  async function createAuction(event:React.FormEvent){
    event.preventDefault();
    const item=availableInventory.find((entry)=>entry.id===auctionItem);const type=one(item?.item_types);const startPrice=positiveInteger(auctionPrice);const hours=positiveInteger(auctionHours);
    if(!item||!type){setError("Выбери свободный предмет");return;}
    if(!startPrice||!hours){setError("Проверь стартовую цену и длительность");return;}
    setBusy(true);setError(null);
    try{await callDepthAction("create_auction",{itemId:item.id,title:type.name,startPrice,durationMinutes:hours*60});setShowCreate(false);setAuctionItem("");setAuctionPrice("");await load("auctions",true);}
    catch(reason){setError(readableError(reason,"Не удалось создать аукцион"));}
    finally{setBusy(false);}
  }

  async function bidAuction(id:string,min:number){
    const amount=positiveInteger(bidAmounts[id]??"");
    if(!amount||amount<min){setError(`Минимальная ставка: ${rubles(min)}`);return;}
    setBusy(true);setError(null);
    try{await callDepthAction("bid_auction",{auctionId:id,amount});setBidAmounts((current)=>({...current,[id]:""}));await load("auctions",true);}
    catch(reason){setError(readableError(reason,"Ставка не прошла"));}
    finally{setBusy(false);}
  }

  async function createBundle(event:React.FormEvent){
    event.preventDefault();const title=bundleTitle.trim();const price=positiveInteger(bundlePrice);
    if(bundleItems.length<2){setError("Добавь минимум два предмета");return;}
    if(title.length<3){setError("Название лота слишком короткое");return;}
    if(!price){setError("Укажи корректную цену комплекта");return;}
    setBusy(true);setError(null);
    try{await callDepthAction("create_bundle",{itemIds:bundleItems,title,description:"Комплект из личного инвентаря",price});setBundleItems([]);setBundleTitle("");setBundlePrice("");setShowCreate(false);await load("bundles",true);}
    catch(reason){setError(readableError(reason,"Не удалось создать лот"));}
    finally{setBusy(false);}
  }

  async function buyBundle(id:string){
    if(busy)return;setBusy(true);setError(null);
    try{await callDepthAction("buy_bundle",{bundleId:id});await load("bundles",true);}
    catch(reason){setError(readableError(reason,"Покупка не прошла"));}
    finally{setBusy(false);}
  }

  if(sessionState!=="verified"&&!loading)return <div className="flatAuth"><Icon name="trend" size={30}/><strong>Рынок+ доступен в Telegram</strong><button type="button" onClick={session.openBot}>Открыть TradeUP</button></div>;

  const marketStats=(overview?.marketStats??[]) as MarketStat[];
  const goals=(overview?.goalDone??{}) as Record<string,boolean>;
  const claims=new Set(((overview?.goalClaims??[]) as {goal_key:string}[]).map((item)=>item.goal_key));
  const chains=(overview?.chains??[]) as {id:string;start_capital:number|string;current_capital:number|string;trade_count:number;total_profit:number|string;is_active:boolean}[];
  const season=overview?.season as {name:string;ends_at:string}|null|undefined;
  const seasonStats=overview?.seasonStats as {profit:number|string;volume:number|string;sales:number;purchases:number;best_margin_pct:number|string}|null|undefined;
  const highlight=overview?.highlight as {profit:number|string;profit_pct:number|string;item?:InventoryItem;profile?:{first_name:string;username:string|null}}|null|undefined;

  return <div className="depthPage" aria-busy={loading}>
    <header className="depthHeader"><div><span>Рынок+</span><h1>Живой рынок</h1></div><Link prefetch={false} href="/" aria-label="Вернуться на рынок"><Icon name="arrowLeft"/></Link></header>
    <nav className="depthTabs" role="tablist" aria-label="Разделы Рынка+">{tabs.map((item)=><button type="button" role="tab" aria-selected={tab===item.id} key={item.id} className={tab===item.id?"active":""} onClick={()=>changeTab(item.id)}><Icon name={item.icon} size={17}/><span>{item.label}</span></button>)}</nav>
    {error&&<div className="depthError" role="alert"><span>{error}</span><button type="button" aria-label="Закрыть ошибку" onClick={()=>setError(null)}><Icon name="close" size={14}/></button></div>}
    {error&&!loading&&<button type="button" className="depthRetry" onClick={()=>void load(tab,true)}>Повторить загрузку</button>}
    {loading&&<div className="depthLoading" aria-label="Загрузка раздела"><i/><i/><i/></div>}

    {!loading&&tab==="overview"&&<div className="depthContent">
      {highlight&&<section className="depthHero"><span>Сделка дня</span><strong>+{rubles(highlight.profit)} · +{Number(highlight.profit_pct).toFixed(1)}%</strong><p>{one(highlight.item?.item_types)?.name??"Предмет"} · {highlight.profile?.first_name??"Игрок"}</p></section>}
      <section className="depthSection"><div className="depthSectionTitle"><div><span>Рынок сейчас</span><h2>Что реально продаётся</h2></div></div><div className="marketPulseList">{marketStats.slice(0,10).map((stat)=>{const change=pct(stat.median_7d,stat.median_prev_7d);return <div className="marketPulseRow" key={stat.item_type_id}><div><strong>{stat.name}</strong><span>{stat.sales_7d} продаж за 7 дней · обычно {duration(stat.avg_sell_seconds)}</span></div><div><strong>{stat.median_7d?rubles(stat.median_7d):"Нет цены"}</strong>{change!==null&&<span className={change>=0?"up":"down"}>{change>=0?"+":""}{change.toFixed(1)}%</span>}</div></div>;})}{!marketStats.length&&<div className="depthEmpty">Рынок только начинает собирать статистику. Здесь не будет выдуманных цен.</div>}</div></section>
      <section className="depthSection"><div className="depthSectionTitle"><div><span>Сегодня</span><h2>Цели перекупа</h2></div><div className="depthLevel">LVL {Number((overview?.progress as {level?:number})?.level??1)}</div></div><div className="goalList">{Object.entries(goalMeta).map(([key,goal])=>{const done=Boolean(goals[key]),claimed=claims.has(key);return <div className="goalRow" key={key}><div className={done?"goalCheck done":"goalCheck"}>{done?<Icon name="check" size={15}/>:<span/>}</div><div><strong>{goal.title}</strong><span>{goal.hint}</span></div><button type="button" disabled={!done||claimed||busy} onClick={()=>void claimGoal(key)}>{claimed?"Получено":`+${goal.xp} XP`}</button></div>;})}</div></section>
      {season&&<section className="depthSection"><div className="depthSectionTitle"><div><span>Сезон</span><h2>{season.name}</h2></div><span className="seasonEnd">ещё {remaining(season.ends_at)}</span></div><div className="seasonStats"><div><strong>{rubles(seasonStats?.profit??0)}</strong><span>прибыль</span></div><div><strong>{seasonStats?.sales??0}</strong><span>продаж</span></div><div><strong>{Number(seasonStats?.best_margin_pct??0).toFixed(1)}%</strong><span>лучшая маржа</span></div></div><p className="depthHint">Сезон не сбрасывает деньги и предметы. Он фиксирует историю торговли и даёт только статусные награды.</p></section>}
      <section className="depthSection"><div className="depthSectionTitle"><div><span>Цепочки</span><h2>Цепочки перекупа</h2></div></div>{chains.length?<div className="chainList">{chains.map((chain,index)=><div className="chainRow" key={chain.id}><span>#{index+1}</span><div><strong>{rubles(chain.start_capital)} → {rubles(chain.current_capital)}</strong><small>{chain.trade_count} сделок · +{rubles(chain.total_profit)}</small></div>{chain.is_active&&<b>активна</b>}</div>)}</div>:<div className="depthEmpty">Первая прибыльная продажа запустит твою цепочку.</div>}</section>
    </div>}

    {!loading&&tab==="wanted"&&wanted&&<div className="depthContent"><div className="depthActionLine"><div><span>Обратный рынок</span><h2>Люди уже ищут товары</h2></div><button type="button" aria-expanded={showCreate} onClick={()=>setShowCreate((value)=>!value)}><Icon name="plus" size={17}/>{showCreate?"Закрыть":"Создать запрос"}</button></div>{showCreate&&<form className="depthForm" onSubmit={createWanted}><label>Что ищешь<select value={wantedType} onChange={(event)=>setWantedType(event.target.value)} required><option value="">Выбери предмет</option>{wanted.itemTypes.map((type)=><option key={type.id} value={type.id}>{type.name}</option>)}</select></label><div className="depthFormSplit"><label>Бюджет<input value={wantedBudget} onChange={(event)=>setWantedBudget(event.target.value.replace(/\D/g,"").slice(0,12))} inputMode="numeric" placeholder="35000" required/></label><label>Состояние от<input value={wantedCondition} onChange={(event)=>setWantedCondition(event.target.value.replace(/\D/g,"").slice(0,3))} inputMode="numeric" min={1} max={100} required/></label></div><button type="submit" disabled={busy}>Опубликовать запрос</button></form>}
      {wanted.own.length>0&&<section className="depthSection"><div className="depthSectionTitle"><div><span>Твои запросы</span><h2>Что ты ищешь</h2></div></div>{wanted.own.map((request)=><div className="wantedRow" key={request.id}><div><strong>{one(request.item_types)?.name??"Предмет"}</strong><span>до {rubles(request.budget_max)} · состояние от {request.min_condition}%</span></div><b>{request.status}</b>{request.status==="active"&&<button type="button" disabled={busy} onClick={()=>void cancelWanted(request.id)}>Снять</button>}</div>)}</section>}
      <section className="depthSection"><div className="depthSectionTitle"><div><span>Спрос</span><h2>Запросы покупателей</h2></div><strong>{wanted.requests.length}</strong></div>{wanted.requests.map((request)=>{const match=availableInventory.find((item)=>item.item_type_id===request.item_type_id&&item.condition>=request.min_condition&&Number(item.specs?.storage_gb??0)>=(request.min_storage_gb??0)&&Number(item.specs?.battery_health??0)>=(request.min_battery_health??0));return <div className="wantedRow public" key={request.id}><div><strong>{one(request.item_types)?.name??"Предмет"}</strong><span>{request.profiles?.first_name??"Покупатель"} · бюджет до {rubles(request.budget_max)} · {request.min_condition}%+</span></div>{match?<Link prefetch={false} href={`/sell/new?item=${match.id}&wanted=${request.id}`}>Предложить свой</Link>:<small>нет подходящего в инвентаре</small>}</div>;})}{!wanted.requests.length&&<div className="depthEmpty">Активных запросов пока нет.</div>}</section>
    </div>}

    {!loading&&tab==="auctions"&&auctionData&&<div className="depthContent"><div className="depthActionLine"><div><span>Торги</span><h2>Аукционы игроков</h2></div><button type="button" aria-expanded={showCreate} onClick={()=>setShowCreate((value)=>!value)}><Icon name="plus" size={17}/>{showCreate?"Закрыть":"Выставить"}</button></div>{showCreate&&<form className="depthForm" onSubmit={createAuction}><label>Предмет<select value={auctionItem} onChange={(event)=>setAuctionItem(event.target.value)} required><option value="">Из свободного инвентаря</option>{availableInventory.map((item)=><option value={item.id} key={item.id}>{one(item.item_types)?.name} · {item.condition}%</option>)}</select></label><div className="depthFormSplit"><label>Стартовая цена<input value={auctionPrice} onChange={(event)=>setAuctionPrice(event.target.value.replace(/\D/g,"").slice(0,12))} inputMode="numeric" required/></label><label>Длительность<select value={auctionHours} onChange={(event)=>setAuctionHours(event.target.value)}><option value="1">1 час</option><option value="6">6 часов</option><option value="24">24 часа</option><option value="72">3 дня</option><option value="168">7 дней</option></select></label></div><button type="submit" disabled={busy||!availableInventory.length}>Запустить аукцион</button></form>}
      <div className="auctionGrid">{auctionData.auctions.filter((auction)=>auction.status==="active").map((auction)=>{const listing=listingMap.get(auction.listing_id);const item=listing?auctionItemMap.get(listing.inventory_item_id):null;const type=one(item?.item_types);const mine=auction.seller_id===profileId;const minimum=Math.ceil(Number(auction.current_bid??auction.start_price)+(auction.current_bid?Math.max(100,Number(auction.current_bid)*.02):0));return <article className="auctionTile" key={auction.id}><div className="auctionImage"><ProductImage src={type?.image_url} alt={type?.name??listing?.title??"Аукцион"} categoryId={type?.category_id??""}/><span className="auctionTime">{remaining(auction.ends_at)}</span></div><div className="auctionInfo"><strong>{listing?.title??type?.name??"Предмет"}</strong><span>{auction.bid_count} ставок · {item?.condition??0}%</span><div className="auctionPrice"><small>{auction.current_bid?"Текущая ставка":"Старт"}</small><b>{rubles(auction.current_bid??auction.start_price)}</b></div>{!mine&&<div className="auctionBid"><input aria-label={`Ставка на ${listing?.title??type?.name??"аукцион"}`} value={bidAmounts[auction.id]??""} onChange={(event)=>setBidAmounts((current)=>({...current,[auction.id]:event.target.value.replace(/\D/g,"").slice(0,12)}))} placeholder={String(minimum)} inputMode="numeric"/><button type="button" disabled={busy} onClick={()=>void bidAuction(auction.id,minimum)}>Ставка</button></div>}{mine&&<small className="auctionMine">Твой аукцион</small>}</div></article>;})}</div>{!auctionData.auctions.some((auction)=>auction.status==="active")&&<div className="depthEmpty">Активных аукционов пока нет. Первый можно запустить из своего инвентаря.</div>}
    </div>}

    {!loading&&tab==="bundles"&&bundleData&&<div className="depthContent"><div className="depthActionLine"><div><span>Лоты</span><h2>Купить комплект и разобрать</h2></div><button type="button" aria-expanded={showCreate} onClick={()=>setShowCreate((value)=>!value)}><Icon name="plus" size={17}/>{showCreate?"Закрыть":"Собрать лот"}</button></div>{showCreate&&<form className="depthForm" onSubmit={createBundle}><label>Название<input value={bundleTitle} onChange={(event)=>setBundleTitle(event.target.value.slice(0,100))} minLength={3} placeholder="Комплект Apple для перепродажи" required/></label><div className="bundlePicker">{availableInventory.map((item)=>{const type=one(item.item_types),checked=bundleItems.includes(item.id);return <button type="button" key={item.id} aria-pressed={checked} className={checked?"selected":""} onClick={()=>setBundleItems((current)=>checked?current.filter((id)=>id!==item.id):current.length<5?[...current,item.id]:current)}><span>{type?.name??"Предмет"}</span><small>{item.condition}% · {rubles(item.acquired_price)}</small><Icon name={checked?"check":"plus"} size={15}/></button>;})}</div><label>Цена комплекта<input value={bundlePrice} onChange={(event)=>setBundlePrice(event.target.value.replace(/\D/g,"").slice(0,12))} inputMode="numeric" required/></label><button type="submit" disabled={busy||bundleItems.length<2}>Опубликовать {bundleItems.length}/5</button></form>}
      <div className="bundleList">{bundleData.bundles.filter((bundle)=>bundle.status==="active").map((bundle)=>{const links=bundleData.bundleItems.filter((link)=>link.bundle_id===bundle.id);const items=links.map((link)=>bundleItemMap.get(link.item_id)).filter(Boolean) as InventoryItem[];const mine=bundle.seller_id===profileId;return <article className="bundleRow" key={bundle.id}><div className="bundleThumbStack">{items.slice(0,3).map((item,index)=>{const type=one(item.item_types);return <span key={item.id} style={{zIndex:3-index}}><ProductImage src={type?.image_url} alt={type?.name??"Предмет"} categoryId={type?.category_id??""}/></span>;})}</div><div><strong>{bundle.title}</strong><span>{items.map((item)=>one(item.item_types)?.name).filter(Boolean).slice(0,3).join(" · ")}</span><small>{items.length} предмета</small></div><div className="bundleBuy"><strong>{rubles(bundle.price)}</strong>{mine?<small>твой лот</small>:<button type="button" disabled={busy} onClick={()=>void buyBundle(bundle.id)}>Купить</button>}</div></article>;})}</div>{!bundleData.bundles.some((bundle)=>bundle.status==="active")&&<div className="depthEmpty">Лотов пока нет. Хороший лот позволяет купить комплект дешевле и распродать его по частям.</div>}
    </div>}

    {!loading&&tab==="collections"&&collectionData&&<div className="depthContent"><div className="depthActionLine"><div><span>История владения</span><h2>Коллекции</h2></div></div><div className="collectionList">{collectionData.sets.map((set)=>{const entries=collectionData.entries.filter((entry)=>entry.set_id===set.id),ever=entries.filter((entry)=>collectionData.everTypeIds.includes(entry.item_type_id)),current=entries.filter((entry)=>collectionData.currentTypeIds.includes(entry.item_type_id));const progress=entries.length?Math.round(ever.length/entries.length*100):0;return <section className="collectionRow" key={set.id}><div className="collectionTop"><div><strong>{set.name}</strong><span>{set.description}</span></div><b>{ever.length}/{entries.length}</b></div><div className="collectionTrack" role="progressbar" aria-label={`Коллекция ${set.name}: ${progress}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{width:`${progress}%`}}/></div><div className="collectionItems">{entries.map((entry)=>{const type=one(entry.item_types),owned=current.some((item)=>item.item_type_id===entry.item_type_id),had=collectionData.everTypeIds.includes(entry.item_type_id);return <div key={entry.item_type_id} className={owned?"owned":had?"historic":""}><span><ProductImage src={type?.image_url} alt={type?.name??"Предмет"} categoryId={type?.category_id??""}/></span><small>{type?.name}</small>{owned?<b>есть</b>:had?<b>был</b>:null}</div>;})}</div></section>;})}</div></div>}
  </div>;
}
