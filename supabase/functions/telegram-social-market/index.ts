import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const encoder=new TextEncoder();
type TelegramUser={id:number;first_name:string;username?:string};type Body={initData?:unknown;action?:unknown;payload?:unknown};
function hexToBytes(hex:string){const b=new Uint8Array(hex.length/2);for(let i=0;i<b.length;i++)b[i]=Number.parseInt(hex.slice(i*2,i*2+2),16);return b;}
async function verify(initData:string,secret:string){const p=new URLSearchParams(initData),hash=p.get("hash"),authRaw=p.get("auth_date"),userRaw=p.get("user");if(!hash||!/^[a-f0-9]{64}$/i.test(hash)||!authRaw||!userRaw)return null;const auth=Number(authRaw),now=Math.floor(Date.now()/1000);if(!Number.isInteger(auth)||auth>now+30||now-auth>3600)return null;const check=[...p.entries()].filter(([k])=>k!=="hash").sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");try{const key=await crypto.subtle.importKey("raw",hexToBytes(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);if(!await crypto.subtle.verify("HMAC",key,hexToBytes(hash),encoder.encode(check)))return null;const u=JSON.parse(userRaw) as TelegramUser;return Number.isSafeInteger(u.id)?u:null;}catch{return null;}}

Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return Response.json({ok:false,error:"method_not_allowed"},{status:405});
 const secret=req.headers.get("x-tradeup-telegram-secret")??"";if(!/^[a-f0-9]{64}$/i.test(secret))return Response.json({ok:false,error:"unauthorized_server"},{status:401});
 let body:Body;try{body=await req.json();}catch{return Response.json({ok:false,error:"invalid_json"},{status:400});}
 if(typeof body.initData!=="string"||typeof body.action!=="string")return Response.json({ok:false,error:"invalid_payload"},{status:400});const user=await verify(body.initData,secret);if(!user)return Response.json({ok:false,error:"telegram_auth_failed"},{status:401});
 const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!service)return Response.json({ok:false,error:"server_not_configured"},{status:500});const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const me=await db.from("profiles").select("id,first_name,username,photo_url,rating,deals_count,total_profit,created_at").eq("telegram_id",user.id).maybeSingle();if(me.error)return Response.json({ok:false,error:"profile_load_failed"},{status:500});if(!me.data)return Response.json({ok:false,error:"profile_not_found"},{status:404});const profileId=me.data.id as string;
 try{
  if(body.action==="negotiations"){
   await db.rpc("expire_stale_offers");
   const ownListings=await db.from("listings").select("id,title,price,status,seller_id,created_at").eq("seller_id",profileId).order("created_at",{ascending:false}).limit(150);if(ownListings.error)throw new Error("negotiations_load_failed");const ownIds=(ownListings.data??[]).map(x=>x.id);
   const [incoming,outgoing]=await Promise.all([
    ownIds.length?db.from("offers").select("id,listing_id,buyer_id,amount,status,created_by_id,parent_offer_id,expires_at,is_final,created_at,updated_at").in("listing_id",ownIds).in("status",["pending","countered","accepted","declined","cancelled","expired"]).order("updated_at",{ascending:false}).limit(200):Promise.resolve({data:[],error:null}),
    db.from("offers").select("id,listing_id,buyer_id,amount,status,created_by_id,parent_offer_id,expires_at,is_final,created_at,updated_at").eq("buyer_id",profileId).in("status",["pending","countered","accepted","declined","cancelled","expired"]).order("updated_at",{ascending:false}).limit(200)
   ]);if(incoming.error||outgoing.error)throw new Error("negotiations_load_failed");
   const allMap=new Map<string,any>();for(const row of [...(incoming.data??[]),...(outgoing.data??[])])allMap.set(row.id,row);const offers=[...allMap.values()];const listingIds=[...new Set(offers.map(x=>x.listing_id))];const missing=listingIds.filter(id=>!ownIds.includes(id));const extra=missing.length?await db.from("listings").select("id,title,price,status,seller_id,created_at").in("id",missing):{data:[],error:null};if(extra.error)throw new Error("negotiations_listing_failed");const listings=[...(ownListings.data??[]),...(extra.data??[])];const pids=[...new Set([...offers.flatMap(x=>[x.buyer_id,x.created_by_id]),...listings.map(x=>x.seller_id)].filter(Boolean))];const profiles=pids.length?await db.from("profiles").select("id,first_name,username,photo_url,rating,deals_count,last_seen_at,is_online").in("id",pids):{data:[],error:null};if(profiles.error)throw new Error("negotiations_profile_failed");
   return Response.json({ok:true,profileId,offers,listings,profiles:profiles.data??[]});
  }
  if(body.action==="identity"){
   const target=typeof (body.payload as any)?.profileId==="string"?(body.payload as any).profileId:profileId;
   const [identity,reputation]=await Promise.all([db.from("profile_trader_identity").select("*").eq("profile_id",target).maybeSingle(),db.from("profile_reputation_public").select("*").eq("profile_id",target).maybeSingle()]);if(identity.error||reputation.error)throw new Error("identity_load_failed");return Response.json({ok:true,identity:identity.data??null,reputation:reputation.data??null});
  }
  if(body.action==="ratings"){
   const tradeIds=Array.isArray((body.payload as any)?.tradeIds)?(body.payload as any).tradeIds.filter((x:unknown)=>typeof x==="string").slice(0,100):[];if(!tradeIds.length)return Response.json({ok:true,ratings:[]});const r=await db.from("trade_ratings").select("trade_id,rater_id,target_id,positive,created_at").eq("rater_id",profileId).in("trade_id",tradeIds);if(r.error)throw new Error("ratings_load_failed");return Response.json({ok:true,ratings:r.data??[]});
  }
  return Response.json({ok:false,error:"unknown_action"},{status:400});
 }catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:"social_market_failed"},{status:500});}
});