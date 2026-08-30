import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const encoder = new TextEncoder();
type TelegramUser={id:number;first_name:string;last_name?:string;username?:string;photo_url?:string};
type RequestBody={initData?:unknown;action?:unknown;payload?:unknown};
function hexToBytes(hex:string){const bytes=new Uint8Array(hex.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=Number.parseInt(hex.slice(i*2,i*2+2),16);return bytes;}
async function verifyInitData(initData:string,secretHex:string){const params=new URLSearchParams(initData);const hash=params.get("hash"),authRaw=params.get("auth_date"),userRaw=params.get("user");if(!hash||!/^[a-f0-9]{64}$/i.test(hash)||!authRaw||!userRaw)return{ok:false as const,reason:"missing_telegram_fields"};const auth=Number(authRaw),now=Math.floor(Date.now()/1000);if(!Number.isInteger(auth)||auth>now+30||now-auth>3600)return{ok:false as const,reason:"expired"};const check=[...params.entries()].filter(([k])=>k!=="hash").sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");try{const key=await crypto.subtle.importKey("raw",hexToBytes(secretHex),{name:"HMAC",hash:"SHA-256"},false,["verify"]);if(!await crypto.subtle.verify("HMAC",key,hexToBytes(hash),encoder.encode(check)))return{ok:false as const,reason:"invalid_hash"};const user=JSON.parse(userRaw) as TelegramUser;if(typeof user.id!=="number"||!Number.isSafeInteger(user.id))return{ok:false as const,reason:"invalid_user"};return{ok:true as const,user};}catch{return{ok:false as const,reason:"verification_error"};}}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return Response.json({ok:false,error:"method_not_allowed"},{status:405});
  const secret=req.headers.get("x-tradeup-telegram-secret")??"";if(!/^[a-f0-9]{64}$/i.test(secret))return Response.json({ok:false,error:"unauthorized_server"},{status:401});
  let body:RequestBody;try{body=await req.json();}catch{return Response.json({ok:false,error:"invalid_json"},{status:400});}
  if(typeof body.initData!=="string"||!body.initData||typeof body.action!=="string")return Response.json({ok:false,error:"invalid_payload"},{status:400});
  const verified=await verifyInitData(body.initData,secret);if(!verified.ok)return Response.json({ok:false,error:"telegram_auth_failed",reason:verified.reason},{status:401});
  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!service)return Response.json({ok:false,error:"server_not_configured"},{status:500});
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const profile=await db.from("profiles").select("id").eq("telegram_id",verified.user.id).maybeSingle();if(profile.error)return Response.json({ok:false,error:"profile_load_failed"},{status:500});if(!profile.data)return Response.json({ok:true,notifications:[],unread:0,latest:null});
  const profileId=profile.data.id as string;const payload=typeof body.payload==="object"&&body.payload!==null?body.payload as Record<string,unknown>:{};
  try{
    if(body.action==="unread"){
      const r=await db.from("notifications").select("id,type,title,body,href,created_at,read_at",{count:"exact"}).eq("user_id",profileId).is("read_at",null).order("created_at",{ascending:false}).limit(1);if(r.error)throw new Error("notifications_load_failed");return Response.json({ok:true,unread:r.count??0,latest:r.data?.[0]??null});
    }
    if(body.action==="list"){
      const r=await db.from("notifications").select("id,type,title,body,href,created_at,read_at").eq("user_id",profileId).order("created_at",{ascending:false}).limit(80);if(r.error)throw new Error("notifications_load_failed");return Response.json({ok:true,notifications:r.data??[]});
    }
    if(body.action==="mark_read"){
      const id=typeof payload.notificationId==="string"?payload.notificationId:"";if(!id)return Response.json({ok:false,error:"invalid_payload"},{status:400});const r=await db.from("notifications").update({read_at:new Date().toISOString()}).eq("id",id).eq("user_id",profileId).is("read_at",null);if(r.error)throw new Error("notification_update_failed");return Response.json({ok:true});
    }
    if(body.action==="mark_all"){
      const r=await db.from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",profileId).is("read_at",null);if(r.error)throw new Error("notifications_update_failed");void db.rpc("prune_old_notifications",{p_user_id:profileId});return Response.json({ok:true});
    }
    return Response.json({ok:false,error:"unknown_action"},{status:400});
  }catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:"notifications_failed"},{status:500});}
});
