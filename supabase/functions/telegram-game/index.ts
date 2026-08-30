import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const encoder = new TextEncoder();
const PROFILE_FIELDS = "id,username,first_name,photo_url,balance,rating,deals_count,total_profit,is_online,last_seen_at,starter_pack_granted_at";
function hexToBytes(hex:string){const bytes=new Uint8Array(hex.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=Number.parseInt(hex.slice(i*2,i*2+2),16);return bytes;}
type TelegramUser={id:number;first_name:string;last_name?:string;username?:string;photo_url?:string};
type RequestBody={initData?:unknown;action?:unknown;payload?:unknown};
type Db=ReturnType<typeof createClient>;

async function verifyInitData(initData:string,secretHex:string){
  const params=new URLSearchParams(initData);const hash=params.get("hash"),authRaw=params.get("auth_date"),userRaw=params.get("user");
  if(!hash||!/^[a-f0-9]{64}$/i.test(hash)||!authRaw||!userRaw)return{ok:false as const,reason:"missing_telegram_fields"};
  const auth=Number(authRaw),now=Math.floor(Date.now()/1000);if(!Number.isInteger(auth)||auth>now+30||now-auth>3600)return{ok:false as const,reason:"expired"};
  const check=[...params.entries()].filter(([k])=>k!=="hash").sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
  try{const key=await crypto.subtle.importKey("raw",hexToBytes(secretHex),{name:"HMAC",hash:"SHA-256"},false,["verify"]);if(!await crypto.subtle.verify("HMAC",key,hexToBytes(hash),encoder.encode(check)))return{ok:false as const,reason:"invalid_hash"};const user=JSON.parse(userRaw) as TelegramUser;if(typeof user.id!=="number"||!Number.isSafeInteger(user.id)||typeof user.first_name!=="string"||!user.first_name.trim())return{ok:false as const,reason:"invalid_user"};return{ok:true as const,user};}catch{return{ok:false as const,reason:"verification_error"};}
}
function safeActionError(message:string|undefined){const c=["invalid_price","invalid_title","description_too_long","item_not_owned","item_locked","listing_not_owned","listing_not_active","cannot_buy_own_listing","cannot_offer_own_listing","invalid_offer_amount","invalid_sale_price","buyer_not_found","insufficient_funds","inventory_mismatch","offer_not_pending","offer_not_owned"];return c.find(v=>message?.includes(v))??"game_action_failed";}

async function loadProfile(db:Db,user:TelegramUser){
  const firstName=user.first_name.trim().slice(0,128),username=user.username??null,photoUrl=user.photo_url??null;
  const existing=await db.from("profiles").select(PROFILE_FIELDS).eq("telegram_id",user.id).maybeSingle();
  if(existing.error)throw new Error("profile_load_failed");
  let profile=existing.data;
  const nowMs=Date.now();
  if(profile){
    const fresh=nowMs-new Date(profile.last_seen_at).getTime()<60_000;
    const identitySame=profile.first_name===firstName&&profile.username===username&&profile.photo_url===photoUrl;
    if(!fresh||!identitySame){
      const now=new Date(nowMs).toISOString();
      const updated=await db.from("profiles").update({username,first_name:firstName,last_name:user.last_name?.trim().slice(0,128)??null,photo_url:photoUrl,is_online:true,last_seen_at:now,updated_at:now}).eq("id",profile.id).select(PROFILE_FIELDS).single();
      if(updated.error||!updated.data)throw new Error("profile_update_failed");
      profile=updated.data;
    }
  }else{
    const now=new Date(nowMs).toISOString();
    const created=await db.from("profiles").insert({telegram_id:user.id,username,first_name:firstName,last_name:user.last_name?.trim().slice(0,128)??null,photo_url:photoUrl,is_online:true,last_seen_at:now,updated_at:now}).select(PROFILE_FIELDS).single();
    if(created.error||!created.data)throw new Error("profile_create_failed");
    profile=created.data;
  }

  let starterGranted=0;
  if(!profile.starter_pack_granted_at){
    const starter=await db.rpc("grant_starter_items",{p_profile_id:profile.id});
    if(starter.error)throw new Error("starter_pack_failed");
    starterGranted=Number(starter.data??0);
    if(starterGranted>0){
      const refreshed=await db.from("profiles").select(PROFILE_FIELDS).eq("id",profile.id).single();
      if(!refreshed.error&&refreshed.data)profile=refreshed.data;
    }
  }
  return{profile,starterGranted};
}
async function profileSnapshot(db:Db,id:string){const {data,error}=await db.from("profiles").select("id,username,first_name,photo_url,balance,rating,deals_count,total_profit,is_online,last_seen_at").eq("id",id).single();if(error)throw new Error("profile_load_failed");return data;}
async function loadOffers(db:Db,profileId:string){
  const own=await db.from("listings").select("id,title,price,status,seller_id").eq("seller_id",profileId).order("created_at",{ascending:false}).limit(100);if(own.error)throw new Error("offers_listings_failed");
  const ownIds=(own.data??[]).map(x=>x.id);const incoming=ownIds.length?await db.from("offers").select("id,listing_id,buyer_id,amount,status,created_at,updated_at").in("listing_id",ownIds).in("status",["pending","accepted","declined"]).order("updated_at",{ascending:false}).limit(100):{data:[],error:null};if(incoming.error)throw new Error("incoming_offers_failed");
  const outgoing=await db.from("offers").select("id,listing_id,buyer_id,amount,status,created_at,updated_at").eq("buyer_id",profileId).in("status",["pending","accepted","declined","cancelled","expired"]).order("updated_at",{ascending:false}).limit(100);if(outgoing.error)throw new Error("outgoing_offers_failed");
  const all=[...(incoming.data??[]),...(outgoing.data??[])],listingIds=[...new Set(all.map(o=>o.listing_id))],buyerIds=[...new Set(all.map(o=>o.buyer_id))];
  const listings=listingIds.length?await db.from("listings").select("id,title,price,status,seller_id").in("id",listingIds):{data:[],error:null};if(listings.error)throw new Error("offers_listings_failed");
  const profiles=buyerIds.length?await db.from("profiles").select("id,username,first_name,photo_url,rating,deals_count").in("id",buyerIds):{data:[],error:null};if(profiles.error)throw new Error("offer_profiles_failed");
  return{incoming:incoming.data??[],outgoing:outgoing.data??[],listings:listings.data??[],profiles:profiles.data??[]};
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return Response.json({ok:false,error:"method_not_allowed"},{status:405});
  const secret=req.headers.get("x-tradeup-telegram-secret")??"";if(!/^[a-f0-9]{64}$/i.test(secret))return Response.json({ok:false,error:"unauthorized_server"},{status:401});
  let body:RequestBody;try{body=await req.json();}catch{return Response.json({ok:false,error:"invalid_json"},{status:400});}
  if(typeof body.initData!=="string"||!body.initData||body.initData.length>16384||typeof body.action!=="string")return Response.json({ok:false,error:"invalid_payload"},{status:400});
  const verified=await verifyInitData(body.initData,secret);if(!verified.ok)return Response.json({ok:false,error:"telegram_auth_failed",reason:verified.reason},{status:401});
  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!service)return Response.json({ok:false,error:"server_not_configured"},{status:500});
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});let session;try{session=await loadProfile(db,verified.user);}catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:"profile_failed"},{status:500});}
  const profileId=session.profile.id as string;const payload=typeof body.payload==="object"&&body.payload!==null?body.payload as Record<string,unknown>:{};
  try{
    if(body.action==="bootstrap"){
      const [inventory,listings,favorites]=await Promise.all([
        db.from("inventory_items").select("id",{count:"exact",head:true}).eq("owner_id",profileId),
        db.from("listings").select("id",{count:"exact",head:true}).eq("seller_id",profileId).eq("status","active"),
        db.from("favorites").select("listing_id").eq("profile_id",profileId)
      ]);
      if(inventory.error||listings.error||favorites.error)throw new Error("bootstrap_load_failed");
      return Response.json({ok:true,user:verified.user,profile:session.profile,starterGranted:session.starterGranted,counts:{inventory:inventory.count??0,listings:listings.count??0,favorites:favorites.data?.length??0},favoriteIds:favorites.data?.map(r=>r.listing_id)??[]});
    }
    if(body.action==="inventory"){
      const {data,error}=await db.from("inventory_items").select("id,condition,acquired_price,acquired_at,is_locked,item_types(id,name,brand,category_id,base_value,volatility,image_url)").eq("owner_id",profileId).order("acquired_at",{ascending:false});if(error)throw new Error("inventory_load_failed");const ids=(data??[]).map(i=>i.id);let live:any[]=[];if(ids.length){const r=await db.from("listings").select("id,inventory_item_id,title,description,price,status,created_at").in("inventory_item_id",ids).in("status",["active","reserved"]);if(r.error)throw new Error("inventory_listings_failed");live=r.data??[];}return Response.json({ok:true,inventory:data??[],liveListings:live});
    }
    if(body.action==="favorites"){
      const {data,error}=await db.from("favorites").select("listing_id,created_at").eq("profile_id",profileId).order("created_at",{ascending:false});if(error)throw new Error("favorites_load_failed");const ids=(data??[]).map(f=>f.listing_id);if(!ids.length)return Response.json({ok:true,listings:[]});const r=await db.from("market_listings").select("id,title,price,created_at,condition,item_name,brand,category_id,base_value,image_url").in("id",ids);if(r.error)throw new Error("favorites_listings_failed");const order=new Map(ids.map((id,index)=>[id,index]));const sorted=[...(r.data??[])].sort((a:any,b:any)=>(order.get(a.id)??Number.MAX_SAFE_INTEGER)-(order.get(b.id)??Number.MAX_SAFE_INTEGER));return Response.json({ok:true,listings:sorted});
    }
    if(body.action==="deals"){
      const {data,error}=await db.from("trades").select("id,listing_id,item_id,seller_id,buyer_id,amount,fee,seller_profit,completed_at").or(`seller_id.eq.${profileId},buyer_id.eq.${profileId}`).order("completed_at",{ascending:false}).limit(50);if(error)throw new Error("deals_load_failed");const itemIds=[...new Set((data??[]).map(t=>t.item_id))],listingIds=[...new Set((data??[]).map(t=>t.listing_id))];const [items,listings]=await Promise.all([itemIds.length?db.from("inventory_items").select("id,item_types(name,brand,category_id)").in("id",itemIds):Promise.resolve({data:[],error:null}),listingIds.length?db.from("listings").select("id,title").in("id",listingIds):Promise.resolve({data:[],error:null})]);if(items.error||listings.error)throw new Error("deals_enrichment_failed");return Response.json({ok:true,trades:data??[],items:items.data??[],listings:listings.data??[]});
    }
    if(body.action==="offers")return Response.json({ok:true,...await loadOffers(db,profileId)});
    if(body.action==="create_listing"){
      const itemId=typeof payload.itemId==="string"?payload.itemId:"",title=typeof payload.title==="string"?payload.title:"",description=typeof payload.description==="string"?payload.description:"",price=typeof payload.price==="number"||typeof payload.price==="string"?Number(payload.price):NaN;if(!itemId||!Number.isFinite(price))return Response.json({ok:false,error:"invalid_payload"},{status:400});const r=await db.rpc("create_listing_atomic",{p_profile_id:profileId,p_item_id:itemId,p_price:price,p_title:title,p_description:description});if(r.error)return Response.json({ok:false,error:safeActionError(r.error.message)},{status:409});return Response.json({ok:true,listingId:r.data,profile:await profileSnapshot(db,profileId)});
    }
    if(body.action==="cancel_listing"){
      const id=typeof payload.listingId==="string"?payload.listingId:"";if(!id)return Response.json({ok:false,error:"invalid_payload"},{status:400});const r=await db.rpc("cancel_listing_atomic",{p_profile_id:profileId,p_listing_id:id});if(r.error)return Response.json({ok:false,error:safeActionError(r.error.message)},{status:409});return Response.json({ok:true,cancelled:Boolean(r.data)});
    }
    if(body.action==="toggle_favorite"){
      const id=typeof payload.listingId==="string"?payload.listingId:"";if(!id)return Response.json({ok:false,error:"invalid_payload"},{status:400});const r=await db.rpc("toggle_favorite_atomic",{p_profile_id:profileId,p_listing_id:id});if(r.error)return Response.json({ok:false,error:safeActionError(r.error.message)},{status:409});return Response.json({ok:true,favorite:Boolean(r.data)});
    }
    if(body.action==="view_listing"){
      const id=typeof payload.listingId==="string"?payload.listingId:"";if(!id)return Response.json({ok:false,error:"invalid_payload"},{status:400});const r=await db.rpc("record_listing_view_atomic",{p_viewer_id:profileId,p_listing_id:id});if(r.error)return Response.json({ok:false,error:safeActionError(r.error.message)},{status:409});return Response.json({ok:true,counted:Boolean(r.data)});
    }
    if(body.action==="buy_listing"){
      const id=typeof payload.listingId==="string"?payload.listingId:"";if(!id)return Response.json({ok:false,error:"invalid_payload"},{status:400});const r=await db.rpc("buy_listing_atomic",{p_buyer_id:profileId,p_listing_id:id});if(r.error)return Response.json({ok:false,error:safeActionError(r.error.message)},{status:409});return Response.json({ok:true,tradeId:r.data,profile:await profileSnapshot(db,profileId)});
    }
    if(body.action==="create_offer"){
      const id=typeof payload.listingId==="string"?payload.listingId:"",amount=typeof payload.amount==="number"||typeof payload.amount==="string"?Number(payload.amount):NaN;if(!id||!Number.isFinite(amount))return Response.json({ok:false,error:"invalid_payload"},{status:400});const r=await db.rpc("create_offer_atomic",{p_buyer_id:profileId,p_listing_id:id,p_amount:amount});if(r.error)return Response.json({ok:false,error:safeActionError(r.error.message)},{status:409});return Response.json({ok:true,offerId:r.data});
    }
    if(body.action==="cancel_offer"){
      const id=typeof payload.offerId==="string"?payload.offerId:"";if(!id)return Response.json({ok:false,error:"invalid_payload"},{status:400});const r=await db.rpc("cancel_offer_atomic",{p_buyer_id:profileId,p_offer_id:id});if(r.error)return Response.json({ok:false,error:safeActionError(r.error.message)},{status:409});return Response.json({ok:true,cancelled:Boolean(r.data)});
    }
    if(body.action==="respond_offer"){
      const id=typeof payload.offerId==="string"?payload.offerId:"",accept=typeof payload.accept==="boolean"?payload.accept:null;if(!id||accept===null)return Response.json({ok:false,error:"invalid_payload"},{status:400});const r=await db.rpc("respond_offer_atomic",{p_seller_id:profileId,p_offer_id:id,p_accept:accept});if(r.error)return Response.json({ok:false,error:safeActionError(r.error.message)},{status:409});return Response.json({ok:true,accepted:accept,tradeId:r.data??null,profile:await profileSnapshot(db,profileId)});
    }
    return Response.json({ok:false,error:"unknown_action"},{status:400});
  }catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:"game_action_failed"},{status:500});}
});