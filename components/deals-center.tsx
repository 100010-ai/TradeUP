"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Icon, { categoryIconName } from "@/components/icon";
import { useTelegramSession } from "@/components/telegram-session";
import { categoryMeta, relativeDate, rubles } from "@/lib/product";

type TradeRow = { id:string; listing_id:string; item_id:string; seller_id:string; buyer_id:string; amount:number|string; fee:number|string; seller_profit:number|string|null; completed_at:string };
type ItemRow = { id:string; item_types:{name:string;brand:string|null;category_id:string}|null };
type ListingRow = { id:string; title:string };
type DealsResult = { trades?:TradeRow[]; items?:ItemRow[]; listings?:ListingRow[] };
type OfferStatus = "pending"|"countered"|"accepted"|"declined"|"cancelled"|"expired";
type OfferRow = { id:string; listing_id:string; buyer_id:string; amount:number|string; status:OfferStatus; created_by_id:string; parent_offer_id:string|null; expires_at:string; is_final:boolean; created_at:string; updated_at:string };
type OfferListing = { id:string; title:string; price:number|string; status:string; seller_id:string; created_at:string };
type OfferProfile = { id:string; first_name:string; username:string|null; photo_url:string|null; rating:number; deals_count:number; last_seen_at:string; is_online:boolean };
type NegotiationResult = { profileId?:string; offers?:OfferRow[]; listings?:OfferListing[]; profiles?:OfferProfile[] };
type RatingRow = { trade_id:string; rater_id:string; target_id:string; positive:boolean; created_at:string };
type Filter = "all"|"buy"|"sell"|"offers";

const statusLabel:Record<OfferStatus,string> = { pending:"Идёт торг", countered:"Встречная цена", accepted:"Сделка", declined:"Отклонено", cancelled:"Отменено", expired:"Истекло" };

function timeLeft(value:string){const timestamp=new Date(value).getTime();if(!Number.isFinite(timestamp))return "нет срока";const ms=timestamp-Date.now();if(ms<=0)return "время вышло";const min=Math.ceil(ms/60000);if(min<60)return `${min} мин`;return `${Math.ceil(min/60)} ч`;}
function safeAmount(value:string){const number=Number(value);return Number.isSafeInteger(number)&&number>0?number:null;}
function readableError(error:unknown,fallback:string){const code=error instanceof Error?error.message:"";if(code==="insufficient_funds")return "Недостаточно средств";if(code==="offer_not_pending")return "Этот ход уже закрыт";if(code==="invalid_offer_amount")return "Цена вне допустимого диапазона";if(code==="counter_offer_pending")return "Сначала ответь на текущую встречную цену";return code&&code!=="request_failed"?code:fallback;}

export default function DealsCenter(){
  const session=useTelegramSession();
  const[trades,setTrades]=useState<TradeRow[]>([]);
  const[items,setItems]=useState<ItemRow[]>([]);
  const[listings,setListings]=useState<ListingRow[]>([]);
  const[offers,setOffers]=useState<OfferRow[]>([]);
  const[offerListings,setOfferListings]=useState<OfferListing[]>([]);
  const[offerProfiles,setOfferProfiles]=useState<OfferProfile[]>([]);
  const[ratings,setRatings]=useState<RatingRow[]>([]);
  const[filter,setFilter]=useState<Filter>("all");
  const[loading,setLoading]=useState(true);
  const[actionId,setActionId]=useState<string|null>(null);
  const[error,setError]=useState<string|null>(null);
  const[counterId,setCounterId]=useState<string|null>(null);
  const[counterAmount,setCounterAmount]=useState("");
  const[finalPrice,setFinalPrice]=useState(false);

  const sessionState=session.state;
  const profileId=session.profile?.id??"";
  const totalProfit=session.profile?.total_profit??0;
  const callAction=session.callAction;
  const callDepthAction=session.callDepthAction;

  const social=useCallback(async(action:string,payload:Record<string,unknown>={})=>{
    const initData=window.Telegram?.WebApp?.initData??"";
    if(!initData)throw new Error("telegram_required");
    const response=await fetch("/api/social-market",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({initData,action,payload}),cache:"no-store"});
    const result=await response.json() as Record<string,unknown>&{ok?:boolean;error?:string};
    if(!response.ok||!result.ok)throw new Error(result.error??"request_failed");
    return result;
  },[]);

  const loadAll=useCallback(async()=>{
    setError(null);
    const[dealsRaw,negRaw]=await Promise.all([callAction("deals"),social("negotiations")]);
    const deals=dealsRaw as DealsResult;
    const negotiation=negRaw as NegotiationResult;
    const nextTrades=deals.trades??[];
    setTrades(nextTrades);
    setItems(deals.items??[]);
    setListings(deals.listings??[]);
    setOffers(negotiation.offers??[]);
    setOfferListings(negotiation.listings??[]);
    setOfferProfiles(negotiation.profiles??[]);

    if(!nextTrades.length){setRatings([]);return;}
    try{
      const ratingRaw=await social("ratings",{tradeIds:nextTrades.map((trade)=>trade.id)});
      setRatings((ratingRaw.ratings??[]) as RatingRow[]);
    }catch{
      // Ratings are secondary. Deals and negotiations should remain usable without them.
      setRatings([]);
    }
  },[callAction,social]);

  useEffect(()=>{
    if(sessionState!=="verified"){
      if(["browser","unavailable","error"].includes(sessionState))setLoading(false);
      return;
    }
    let active=true;
    setLoading(true);
    void loadAll().catch((reason)=>{if(active)setError(readableError(reason,"Не удалось загрузить сделки"));}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[sessionState,loadAll]);

  const itemMap=useMemo(()=>new Map(items.map((item)=>[item.id,item])),[items]);
  const listingMap=useMemo(()=>new Map(listings.map((item)=>[item.id,item])),[listings]);
  const offerListingMap=useMemo(()=>new Map(offerListings.map((item)=>[item.id,item])),[offerListings]);
  const profileMap=useMemo(()=>new Map(offerProfiles.map((item)=>[item.id,item])),[offerProfiles]);
  const offerMap=useMemo(()=>new Map(offers.map((item)=>[item.id,item])),[offers]);
  const ratingMap=useMemo(()=>new Map(ratings.map((item)=>[item.trade_id,item])),[ratings]);
  const visible=useMemo(()=>trades.filter((trade)=>filter==="buy"?trade.buyer_id===profileId:filter==="sell"?trade.seller_id===profileId:true),[trades,filter,profileId]);
  const activeOffers=useMemo(()=>offers.filter((offer)=>offer.status==="pending").sort((a,b)=>new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime()),[offers]);
  const historyOffers=useMemo(()=>offers.filter((offer)=>offer.status!=="pending").sort((a,b)=>new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime()).slice(0,30),[offers]);
  const soldCount=useMemo(()=>trades.filter((trade)=>trade.seller_id===profileId).length,[trades,profileId]);
  const boughtCount=useMemo(()=>trades.filter((trade)=>trade.buyer_id===profileId).length,[trades,profileId]);
  const pendingCount=activeOffers.length;

  function chain(offer:OfferRow){const result:OfferRow[]=[];let current:OfferRow|undefined=offer;const seen=new Set<string>();while(current&&!seen.has(current.id)){seen.add(current.id);result.unshift(current);current=current.parent_offer_id?offerMap.get(current.parent_offer_id):undefined;}return result;}

  async function refresh(){setLoading(true);try{await loadAll();}catch(reason){setError(readableError(reason,"Не удалось обновить сделки"));}finally{setLoading(false);}}

  async function respond(offerId:string,accept:boolean){
    if(actionId)return;setActionId(offerId);setError(null);
    try{await callDepthAction("respond_offer",{offerId,accept});setCounterId(null);await loadAll();}
    catch(reason){setError(readableError(reason,"Не удалось обработать предложение"));}
    finally{setActionId(null);}
  }

  async function counter(offer:OfferRow){
    const amount=safeAmount(counterAmount);
    if(!amount){setError("Укажи корректную встречную цену");return;}
    if(actionId)return;setActionId(offer.id);setError(null);
    try{await callDepthAction("counter_offer",{offerId:offer.id,amount,expiresMinutes:120,isFinal:finalPrice});setCounterId(null);setCounterAmount("");setFinalPrice(false);await loadAll();}
    catch(reason){setError(readableError(reason,"Встречная цена не отправлена"));}
    finally{setActionId(null);}
  }

  async function cancelOffer(id:string){
    if(actionId)return;setActionId(id);setError(null);
    try{await callAction("cancel_offer",{offerId:id});await loadAll();}
    catch(reason){setError(readableError(reason,"Не удалось отменить предложение"));}
    finally{setActionId(null);}
  }

  async function rate(tradeId:string,positive:boolean){
    if(actionId)return;setActionId(`rate-${tradeId}`);setError(null);
    try{await callDepthAction("rate_trade",{tradeId,positive});const ratingRaw=await social("ratings",{tradeIds:trades.map((trade)=>trade.id)});setRatings((ratingRaw.ratings??[]) as RatingRow[]);}
    catch(reason){setError(readableError(reason,"Не удалось сохранить оценку"));}
    finally{setActionId(null);}
  }

  if(sessionState!=="verified"&&!loading)return <div className="flatAuth"><Icon name="swap" size={32}/><strong>Сделки доступны в Telegram</strong><span>Торг и история привязаны к твоему игровому профилю.</span><button type="button" onClick={session.openBot}>Открыть TradeUP</button></div>;

  return <div className="dealsPage negotiationPage" aria-busy={loading}>
    <div className="pageHeadline"><div><span className="sectionEyebrow">Сделки</span><h1>Твой оборот</h1><p>Покупки, продажи и торг с реальными игроками.</p></div>{pendingCount>0&&<div className="pendingCounter"><strong>{pendingCount}</strong><span>активных</span></div>}</div>
    <div className="dealSummaryGrid"><div><span>Куплено</span><strong>{boughtCount}</strong></div><div><span>Продано</span><strong>{soldCount}</strong></div><div><span>Прибыль</span><strong className={Number(totalProfit)>=0?"profitPositive":"profitNegative"}>{rubles(totalProfit)}</strong></div></div>
    <div className="segmentedTabs dealsTabs" role="tablist" aria-label="Фильтр сделок"><button type="button" role="tab" aria-selected={filter==="all"} className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>Все</button><button type="button" role="tab" aria-selected={filter==="buy"} className={filter==="buy"?"active":""} onClick={()=>setFilter("buy")}>Покупки</button><button type="button" role="tab" aria-selected={filter==="sell"} className={filter==="sell"?"active":""} onClick={()=>setFilter("sell")}>Продажи</button><button type="button" role="tab" aria-selected={filter==="offers"} className={filter==="offers"?"active":""} onClick={()=>setFilter("offers")}>Торг {pendingCount>0&&<i>{pendingCount}</i>}</button></div>
    {loading&&<div className="dealList" aria-label="Загрузка сделок">{Array.from({length:4}).map((_,index)=><div className="dealRowSkeleton" key={index}/>)}</div>}
    {error&&<div className="actionMessage" role="alert"><span>{error}</span>{!loading&&<button type="button" className="dealsRetry" onClick={()=>void refresh()}>Повторить</button>}</div>}

    {!loading&&filter==="offers"&&<div className="negotiationList">
      <div className="negotiationHeading"><div><span>Активные переговоры</span><h2>{activeOffers.length?"Ваш ход или ответ другой стороны":"Пока тихо"}</h2></div></div>
      {activeOffers.map((offer)=>{const listing=offerListingMap.get(offer.listing_id),sellerId=listing?.seller_id??"",buyer=profileMap.get(offer.buyer_id),seller=profileMap.get(sellerId),creator=profileMap.get(offer.created_by_id),myTurn=offer.created_by_id!==profileId,isBuyer=offer.buyer_id===profileId,other=isBuyer?seller:buyer,steps=chain(offer),suggested=Math.max(1,Math.round((Number(offer.amount)+Number(listing?.price??offer.amount))/2));return <section className="negotiationRow" key={offer.id}>
        <div className="negotiationTop"><div><Link prefetch={false} href={`/listing/${offer.listing_id}`}>{listing?.title??"Объявление"}</Link><span>{other?.first_name??"Игрок"} · {other?.deals_count??0} сделок</span></div><div className={myTurn?"turnBadge mine":"turnBadge"}>{myTurn?"Твой ход":"Ждём ответ"}</div></div>
        <div className="negotiationCurrent"><div><span>{creator?.first_name??(offer.created_by_id===profileId?"Ты":"Игрок")} предложил</span><strong>{rubles(offer.amount)}</strong></div><div><span>{offer.is_final?"Финальная цена":"Действует"}</span><strong>{offer.is_final?"без торга":timeLeft(offer.expires_at)}</strong></div></div>
        {steps.length>1&&<div className="negotiationTimeline" aria-label="История торга">{steps.map((step,index)=><div key={step.id} className={step.id===offer.id?"current":""}><span>{index+1}</span><strong>{rubles(step.amount)}</strong><small>{profileMap.get(step.created_by_id)?.first_name??"Игрок"}</small></div>)}</div>}
        {counterId===offer.id&&<div className="counterEditor"><label>Встречная цена<div><input value={counterAmount} onChange={(event)=>setCounterAmount(event.target.value.replace(/\D/g,"").slice(0,12))} inputMode="numeric" placeholder={String(suggested)} autoFocus/><b>₽</b></div></label><label className="finalToggle"><input type="checkbox" checked={finalPrice} onChange={(event)=>setFinalPrice(event.target.checked)}/><span>Финальная цена</span></label><div><button type="button" onClick={()=>void counter(offer)} disabled={actionId===offer.id||!counterAmount}>Отправить</button><button type="button" onClick={()=>{setCounterId(null);setCounterAmount("");setFinalPrice(false);}}>Отмена</button></div></div>}
        {myTurn&&counterId!==offer.id&&<div className="negotiationActions"><button type="button" className="acceptOffer" disabled={Boolean(actionId)} onClick={()=>void respond(offer.id,true)}>Принять {rubles(offer.amount)}</button>{!offer.is_final&&<button type="button" className="counterOffer" disabled={Boolean(actionId)} onClick={()=>{setCounterId(offer.id);setCounterAmount(String(suggested));}}>Встречная цена</button>}<button type="button" className="declineOffer" disabled={Boolean(actionId)} onClick={()=>void respond(offer.id,false)}>Отклонить</button></div>}
        {!myTurn&&isBuyer&&<button type="button" className="cancelOfferButton" disabled={Boolean(actionId)} onClick={()=>void cancelOffer(offer.id)}>Отменить свой ход</button>}
      </section>;})}
      {!activeOffers.length&&<div className="miniEmpty">Предложи цену в объявлении или дождись торга по своему товару.</div>}
      {historyOffers.length>0&&<details className="negotiationHistory"><summary>История переговоров · {historyOffers.length}</summary>{historyOffers.map((offer)=><div key={offer.id}><span>{offerListingMap.get(offer.listing_id)?.title??"Лот"}</span><strong>{rubles(offer.amount)}</strong><small>{statusLabel[offer.status]} · {relativeDate(offer.updated_at)}</small></div>)}</details>}
    </div>}

    {!loading&&filter!=="offers"&&!error&&visible.length===0&&<div className="emptyPanel"><div className="emptySymbol"><Icon name="history"/></div><h3>{filter==="buy"?"Покупок пока нет":filter==="sell"?"Продаж пока нет":"Сделок пока нет"}</h3><p>Купи первый лот, предложи цену или выстави предмет.</p><Link prefetch={false} href="/" className="primaryAction">Перейти на рынок</Link></div>}
    {!loading&&filter!=="offers"&&visible.length>0&&<div className="dealList">{visible.map((trade)=>{const isSale=trade.seller_id===profileId,item=itemMap.get(trade.item_id)?.item_types,listing=listingMap.get(trade.listing_id),meta=categoryMeta[item?.category_id??""]??{short:"Товар"},profit=Number(trade.seller_profit??0),rating=ratingMap.get(trade.id);return <article className="dealRow ratedDeal" key={trade.id}><div className={`dealIcon category-${item?.category_id??"other"}`}><Icon name={categoryIconName(item?.category_id??"")} size={24}/></div><div className="dealMain"><div className="dealTypeLine"><span className={isSale?"dealType sale":"dealType buy"}>{isSale?"Продажа":"Покупка"}</span><small>{relativeDate(trade.completed_at)}</small></div><h3>{listing?.title??item?.name??"Товар"}</h3><p>{item?.brand??meta.short}</p><div className="tradeRating"><span>{rating?"Оценка сделки":"Как прошла сделка?"}</span><button type="button" className={rating?.positive===true?"active":""} disabled={actionId===`rate-${trade.id}`} onClick={()=>void rate(trade.id,true)} aria-label="Оценить сделку положительно">👍</button><button type="button" className={rating?.positive===false?"active bad":""} disabled={actionId===`rate-${trade.id}`} onClick={()=>void rate(trade.id,false)} aria-label="Оценить сделку отрицательно">👎</button></div></div><div className="dealAmount"><strong>{isSale?"+":"−"}{rubles(trade.amount)}</strong>{isSale&&<span className={profit>=0?"profitPositive":"profitNegative"}>{profit>=0?"+":""}{rubles(profit)} маржа</span>}</div></article>;})}</div>}
  </div>;
}
