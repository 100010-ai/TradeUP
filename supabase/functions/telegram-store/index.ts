import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const encoder = new TextEncoder();
type TelegramUser={id:number;first_name:string;username?:string;photo_url?:string};
type RequestBody={initData?:unknown;action?:unknown;payload?:unknown};
type Db=ReturnType<typeof createClient>;

function hexToBytes(hex:string){const bytes=new Uint8Array(hex.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=Number.parseInt(hex.slice(i*2,i*2+2),16);return bytes;}
async function verifyInitData(initData:string,secretHex:string){
  const params=new URLSearchParams(initData),hash=params.get("hash"),authRaw=params.get("auth_date"),userRaw=params.get("user");
  if(!hash||!/^[a-f0-9]{64}$/i.test(hash)||!authRaw||!userRaw)return{ok:false as const,reason:"missing_telegram_fields"};
  const auth=Number(authRaw),now=Math.floor(Date.now()/1000);if(!Number.isInteger(auth)||auth>now+30||now-auth>3600)return{ok:false as const,reason:"expired"};
  const check=[...params.entries()].filter(([k])=>k!=="hash").sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
  try{const key=await crypto.subtle.importKey("raw",hexToBytes(secretHex),{name:"HMAC",hash:"SHA-256"},false,["verify"]);if(!await crypto.subtle.verify("HMAC",key,hexToBytes(hash),encoder.encode(check)))return{ok:false as const,reason:"invalid_hash"};const user=JSON.parse(userRaw) as TelegramUser;if(typeof user.id!=="number"||!Number.isSafeInteger(user.id))return{ok:false as const,reason:"invalid_user"};return{ok:true as const,user};}catch{return{ok:false as const,reason:"verification_error"};}
}
async function profileByTelegram(db:Db,telegramId:number){const r=await db.from("profiles").select("id,telegram_id,first_name").eq("telegram_id",telegramId).maybeSingle();if(r.error)throw new Error("profile_load_failed");return r.data;}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return Response.json({ok:false,error:"method_not_allowed"},{status:405});
  const secret=req.headers.get("x-tradeup-telegram-secret")??"";if(!/^[a-f0-9]{64}$/i.test(secret))return Response.json({ok:false,error:"unauthorized_server"},{status:401});
  let body:RequestBody;try{body=await req.json();}catch{return Response.json({ok:false,error:"invalid_json"},{status:400});}
  if(typeof body.action!=="string")return Response.json({ok:false,error:"invalid_payload"},{status:400});
  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!service)return Response.json({ok:false,error:"server_not_configured"},{status:500});
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});const payload=typeof body.payload==="object"&&body.payload!==null?body.payload as Record<string,unknown>:{};

  try{
    if(body.action==="server_validate_precheckout"){
      const invoicePayload=typeof payload.invoicePayload==="string"?payload.invoicePayload:"",telegramUserId=Number(payload.telegramUserId),amount=Number(payload.starsAmount);
      if(!invoicePayload||!Number.isSafeInteger(telegramUserId)||!Number.isInteger(amount))return Response.json({ok:false,error:"invalid_payload"},{status:400});
      const r=await db.from("star_purchases").select("id,user_id,cosmetic_id,stars_amount,status,profiles!inner(telegram_id),cosmetics_catalog!inner(is_active)").eq("invoice_payload",invoicePayload).maybeSingle();
      if(r.error)throw new Error("purchase_load_failed");const p:any=r.data;if(!p)return Response.json({ok:false,error:"purchase_not_found"},{status:404});
      const tg=Array.isArray(p.profiles)?p.profiles[0]?.telegram_id:p.profiles?.telegram_id;const active=Array.isArray(p.cosmetics_catalog)?p.cosmetics_catalog[0]?.is_active:p.cosmetics_catalog?.is_active;
      const valid=p.status==="pending"&&Number(p.stars_amount)===amount&&Number(tg)===telegramUserId&&active===true;
      return Response.json({ok:valid,error:valid?undefined:"purchase_invalid"},{status:valid?200:409});
    }
    if(body.action==="server_confirm_purchase"){
      const invoicePayload=typeof payload.invoicePayload==="string"?payload.invoicePayload:"",chargeId=typeof payload.chargeId==="string"?payload.chargeId:"",telegramUserId=Number(payload.telegramUserId),amount=Number(payload.starsAmount);
      if(!invoicePayload||!chargeId||!Number.isSafeInteger(telegramUserId)||!Number.isInteger(amount))return Response.json({ok:false,error:"invalid_payload"},{status:400});
      const r=await db.rpc("confirm_star_cosmetic_purchase",{p_invoice_payload:invoicePayload,p_telegram_user_id:telegramUserId,p_stars_amount:amount,p_charge_id:chargeId});
      if(r.error)return Response.json({ok:false,error:r.error.message.includes("purchase_")||r.error.message.includes("charge_")?r.error.message.split("\n")[0]:"purchase_confirm_failed"},{status:409});
      return Response.json({ok:true,cosmeticId:r.data});
    }

    if(typeof body.initData!=="string"||!body.initData||body.initData.length>16384)return Response.json({ok:false,error:"invalid_payload"},{status:400});
    const verified=await verifyInitData(body.initData,secret);if(!verified.ok)return Response.json({ok:false,error:"telegram_auth_failed",reason:verified.reason},{status:401});
    const profile=await profileByTelegram(db,verified.user.id);if(!profile)return Response.json({ok:false,error:"profile_not_found"},{status:404});const profileId=profile.id as string;

    if(body.action==="list"){
      const [catalog,owned,equipped,purchases]=await Promise.all([
        db.from("cosmetics_catalog").select("id,kind,name,description,stars_price,rarity,style_key,sort_order").eq("is_active",true).order("sort_order"),
        db.from("user_cosmetics").select("cosmetic_id,acquired_at").eq("user_id",profileId).order("acquired_at",{ascending:false}),
        db.from("equipped_cosmetics").select("frame_id,name_style_id,title_id,profile_theme_id").eq("user_id",profileId).maybeSingle(),
        db.from("star_purchases").select("id,cosmetic_id,stars_amount,status,created_at,paid_at").eq("user_id",profileId).order("created_at",{ascending:false}).limit(20)
      ]);
      if(catalog.error||owned.error||equipped.error||purchases.error)throw new Error("store_load_failed");
      return Response.json({ok:true,catalog:catalog.data??[],owned:owned.data??[],equipped:equipped.data??null,purchases:purchases.data??[]});
    }
    if(body.action==="prepare_purchase"){
      const cosmeticId=typeof payload.cosmeticId==="string"?payload.cosmeticId:"";if(!cosmeticId)return Response.json({ok:false,error:"invalid_payload"},{status:400});
      const [item,own]=await Promise.all([db.from("cosmetics_catalog").select("id,name,description,stars_price,kind,style_key").eq("id",cosmeticId).eq("is_active",true).maybeSingle(),db.from("user_cosmetics").select("cosmetic_id").eq("user_id",profileId).eq("cosmetic_id",cosmeticId).maybeSingle()]);
      if(item.error||own.error)throw new Error("store_load_failed");if(!item.data)return Response.json({ok:false,error:"cosmetic_not_found"},{status:404});if(own.data)return Response.json({ok:false,error:"already_owned"},{status:409});
      const cutoff=new Date(Date.now()-15*60_000).toISOString();const pending=await db.from("star_purchases").select("id,invoice_payload,stars_amount,created_at").eq("user_id",profileId).eq("cosmetic_id",cosmeticId).eq("status","pending").gte("created_at",cutoff).order("created_at",{ascending:false}).limit(1).maybeSingle();if(pending.error)throw new Error("purchase_load_failed");
      let purchase=pending.data;
      if(!purchase){await db.from("star_purchases").update({status:"cancelled"}).eq("user_id",profileId).eq("cosmetic_id",cosmeticId).eq("status","pending").lt("created_at",cutoff);const id=crypto.randomUUID(),invoicePayload=`tu_cos_${id.replaceAll("-","")}`;const created=await db.from("star_purchases").insert({id,user_id:profileId,cosmetic_id:cosmeticId,invoice_payload:invoicePayload,stars_amount:item.data.stars_price}).select("id,invoice_payload,stars_amount,created_at").single();if(created.error||!created.data)throw new Error("purchase_create_failed");purchase=created.data;}
      return Response.json({ok:true,purchaseId:purchase.id,invoicePayload:purchase.invoice_payload,starsAmount:purchase.stars_amount,title:item.data.name,description:item.data.description});
    }
    if(body.action==="purchase_status"){
      const purchaseId=typeof payload.purchaseId==="string"?payload.purchaseId:"";if(!purchaseId)return Response.json({ok:false,error:"invalid_payload"},{status:400});const r=await db.from("star_purchases").select("id,invoice_payload,stars_amount,status,cosmetic_id,telegram_payment_charge_id").eq("id",purchaseId).eq("user_id",profileId).maybeSingle();if(r.error)throw new Error("purchase_load_failed");if(!r.data)return Response.json({ok:false,error:"purchase_not_found"},{status:404});return Response.json({ok:true,purchase:r.data});
    }
    if(body.action==="equip"){
      const kind=typeof payload.kind==="string"?payload.kind:"",cosmeticId=typeof payload.cosmeticId==="string"?payload.cosmeticId:null;const column=kind==="frame"?"frame_id":kind==="name_style"?"name_style_id":kind==="title"?"title_id":kind==="profile_theme"?"profile_theme_id":"";if(!column)return Response.json({ok:false,error:"invalid_kind"},{status:400});
      if(cosmeticId){const [item,own]=await Promise.all([db.from("cosmetics_catalog").select("id,kind").eq("id",cosmeticId).eq("is_active",true).maybeSingle(),db.from("user_cosmetics").select("cosmetic_id").eq("user_id",profileId).eq("cosmetic_id",cosmeticId).maybeSingle()]);if(item.error||own.error)throw new Error("store_load_failed");if(!item.data||item.data.kind!==kind)return Response.json({ok:false,error:"cosmetic_kind_mismatch"},{status:409});if(!own.data)return Response.json({ok:false,error:"cosmetic_not_owned"},{status:403});}
      const row:any={user_id:profileId,[column]:cosmeticId,updated_at:new Date().toISOString()};const r=await db.from("equipped_cosmetics").upsert(row,{onConflict:"user_id"}).select("frame_id,name_style_id,title_id,profile_theme_id").single();if(r.error)throw new Error("equip_failed");return Response.json({ok:true,equipped:r.data});
    }
    return Response.json({ok:false,error:"unknown_action"},{status:400});
  }catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:"store_failed"},{status:500});}
});
