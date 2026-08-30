import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const encoder = new TextEncoder();
const PROFILE_FIELDS = "id,telegram_id,first_name,username,photo_url,last_seen_at";
type TelegramUser = { id: number; first_name: string; last_name?: string; username?: string; photo_url?: string };
type RequestBody = { initData?: unknown; action?: unknown; payload?: unknown };
type Db = ReturnType<typeof createClient>;
type SupportTicket = { id:string; user_id:string; topic_id:string|null; status:"bot"|"waiting"|"active"|"closed"; last_message_at:string|null; last_message_preview:string; last_sender_type:string|null; user_read_at:string|null; admin_read_at:string|null; requested_at:string|null; joined_at:string|null; closed_at:string|null; created_at:string; updated_at:string };

function hexToBytes(hex:string){ const out=new Uint8Array(hex.length/2); for(let i=0;i<out.length;i++) out[i]=Number.parseInt(hex.slice(i*2,i*2+2),16); return out; }
function newer(value:string|null|undefined, than:string|null|undefined){ if(!value) return false; return new Date(value).getTime() > (than ? new Date(than).getTime() : 0); }

async function verifyInitData(initData:string, secretHex:string){
  const params=new URLSearchParams(initData); const receivedHash=params.get("hash"); const authDateRaw=params.get("auth_date"); const userRaw=params.get("user");
  if(!receivedHash||!/^[a-f0-9]{64}$/i.test(receivedHash)||!authDateRaw||!userRaw) return {ok:false as const,reason:"missing_telegram_fields"};
  const authDate=Number(authDateRaw), now=Math.floor(Date.now()/1000);
  if(!Number.isInteger(authDate)||authDate>now+30||now-authDate>3600) return {ok:false as const,reason:"expired"};
  const check=[...params.entries()].filter(([k])=>k!=="hash").sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
  try{
    const key=await crypto.subtle.importKey("raw",hexToBytes(secretHex),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
    if(!await crypto.subtle.verify("HMAC",key,hexToBytes(receivedHash),encoder.encode(check))) return {ok:false as const,reason:"invalid_hash"};
    const user=JSON.parse(userRaw) as TelegramUser;
    if(typeof user.id!=="number"||!Number.isSafeInteger(user.id)||typeof user.first_name!=="string"||!user.first_name.trim()) return {ok:false as const,reason:"invalid_user"};
    return {ok:true as const,user};
  }catch{return {ok:false as const,reason:"verification_error"};}
}

async function loadProfile(db:Db,user:TelegramUser){
  const firstName=user.first_name.trim().slice(0,128),username=user.username??null,photoUrl=user.photo_url??null;
  const existing=await db.from("profiles").select(PROFILE_FIELDS).eq("telegram_id",user.id).maybeSingle();
  if(existing.error) throw new Error("profile_load_failed");
  const nowMs=Date.now();
  if(existing.data){
    const fresh=nowMs-new Date(existing.data.last_seen_at).getTime()<60_000;
    const identitySame=existing.data.first_name===firstName&&existing.data.username===username&&existing.data.photo_url===photoUrl;
    if(fresh&&identitySame) return existing.data;
    const now=new Date(nowMs).toISOString();
    const updated=await db.from("profiles").update({username,first_name:firstName,last_name:user.last_name?.trim().slice(0,128)??null,photo_url:photoUrl,is_online:true,last_seen_at:now,updated_at:now}).eq("id",existing.data.id).select(PROFILE_FIELDS).single();
    if(updated.error||!updated.data) throw new Error("profile_update_failed");
    return updated.data;
  }
  const now=new Date(nowMs).toISOString();
  const created=await db.from("profiles").insert({telegram_id:user.id,username,first_name:firstName,last_name:user.last_name?.trim().slice(0,128)??null,photo_url:photoUrl,is_online:true,last_seen_at:now,updated_at:now}).select(PROFILE_FIELDS).single();
  if(created.error||!created.data) throw new Error("profile_create_failed");
  return created.data;
}
function isParticipant(t:{buyer_id:string;seller_id:string},id:string){ return t.buyer_id===id||t.seller_id===id; }
async function readThread(db:Db,threadId:string,profileId:string){
  const {data,error}=await db.from("chat_threads").select("id,listing_id,buyer_id,seller_id,last_message_at,last_message_preview,last_sender_id,buyer_read_at,seller_read_at,created_at,updated_at").eq("id",threadId).maybeSingle();
  if(error) throw new Error("chat_thread_load_failed"); if(!data||!isParticipant(data,profileId)) return null; return data;
}
async function enrichThreads(db:Db,threads:any[],profileId:string){
  const listingIds=[...new Set(threads.map(t=>t.listing_id).filter(Boolean))];
  const otherIds=[...new Set(threads.map(t=>t.buyer_id===profileId?t.seller_id:t.buyer_id).filter(Boolean))];
  const [lr,pr]=await Promise.all([
    listingIds.length?db.from("listings").select("id,title,price,status,seller_id,inventory_item_id,inventory_items(id,item_types(name,brand,image_url,category_id))").in("id",listingIds):Promise.resolve({data:[],error:null}),
    otherIds.length?db.from("profiles").select("id,first_name,username,photo_url,rating,deals_count,is_online,last_seen_at").in("id",otherIds):Promise.resolve({data:[],error:null})
  ]);
  if(lr.error||pr.error) throw new Error("chat_enrichment_failed");
  const cutoff=Date.now()-5*60_000;
  const profiles=(pr.data??[]).map((p:any)=>({...p,is_online:new Date(p.last_seen_at).getTime()>=cutoff}));
  return {listings:lr.data??[],profiles};
}
async function openSupportTicket(db:Db,profileId:string){
  const {data,error}=await db.from("support_tickets").select("id,user_id,topic_id,status,last_message_at,last_message_preview,last_sender_type,user_read_at,admin_read_at,requested_at,joined_at,closed_at,created_at,updated_at").eq("user_id",profileId).in("status",["bot","waiting","active"]).order("updated_at",{ascending:false}).limit(1).maybeSingle();
  if(error) throw new Error("support_ticket_load_failed"); return (data??null) as SupportTicket|null;
}
async function latestSupportTicket(db:Db,profileId:string){
  const open=await openSupportTicket(db,profileId); if(open) return open;
  const {data,error}=await db.from("support_tickets").select("id,user_id,topic_id,status,last_message_at,last_message_preview,last_sender_type,user_read_at,admin_read_at,requested_at,joined_at,closed_at,created_at,updated_at").eq("user_id",profileId).order("updated_at",{ascending:false}).limit(1).maybeSingle();
  if(error) throw new Error("support_ticket_load_failed"); return (data??null) as SupportTicket|null;
}
async function systemChats(db:Db,profileId:string){
  const [ar,rr,ticket]=await Promise.all([
    db.from("tradeup_announcements").select("id,body,published_at").eq("is_active",true).order("published_at",{ascending:false}).limit(1).maybeSingle(),
    db.from("system_chat_reads").select("tradeup_read_at").eq("user_id",profileId).maybeSingle(),
    latestSupportTicket(db,profileId)
  ]);
  if(ar.error||rr.error) throw new Error("system_chat_load_failed");
  const a=ar.data; const tradeUnread=Boolean(a?.published_at&&newer(a.published_at,rr.data?.tradeup_read_at));
  const supportUnread=Boolean(ticket?.last_message_at&&ticket.last_sender_type!=="user"&&newer(ticket.last_message_at,ticket.user_read_at));
  return [
    {id:"tradeup",kind:"tradeup",title:"TradeUP",subtitle:"Официальный чат",preview:a?.body??"Новости TradeUP",updatedAt:a?.published_at??new Date(0).toISOString(),unread:tradeUnread,status:"official"},
    {id:"support",kind:"support",title:"Поддержка TradeUP",subtitle:ticket?.status==="active"?"Поддержка подключилась":ticket?.status==="waiting"?"Ожидание оператора":"Поможем решить вопрос",preview:ticket?.last_message_preview||"Выбери тему, и мы подскажем решение",updatedAt:ticket?.updated_at??new Date(0).toISOString(),unread:supportUnread,status:ticket?.status??"bot"}
  ];
}
async function supportTopics(db:Db){ const {data,error}=await db.from("support_topics").select("id,title,auto_reply,sort_order").eq("is_active",true).order("sort_order"); if(error) throw new Error("support_topics_load_failed"); return data??[]; }
async function ensureBotTicket(db:Db,profileId:string,topicId:string|null=null){
  const open=await openSupportTicket(db,profileId); if(open) return open;
  const {data,error}=await db.from("support_tickets").insert({user_id:profileId,topic_id:topicId,status:"bot",user_read_at:new Date().toISOString()}).select("id,user_id,topic_id,status,last_message_at,last_message_preview,last_sender_type,user_read_at,admin_read_at,requested_at,joined_at,closed_at,created_at,updated_at").single();
  if(!error&&data) return data as SupportTicket;
  const raced=await openSupportTicket(db,profileId); if(raced) return raced;
  throw new Error("support_ticket_create_failed");
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return Response.json({ok:false,error:"method_not_allowed"},{status:405});
  const secret=req.headers.get("x-tradeup-telegram-secret")??""; if(!/^[a-f0-9]{64}$/i.test(secret)) return Response.json({ok:false,error:"unauthorized_server"},{status:401});
  let body:RequestBody; try{body=await req.json();}catch{return Response.json({ok:false,error:"invalid_json"},{status:400});}
  if(typeof body.initData!=="string"||!body.initData||body.initData.length>16384||typeof body.action!=="string") return Response.json({ok:false,error:"invalid_payload"},{status:400});
  const verified=await verifyInitData(body.initData,secret); if(!verified.ok) return Response.json({ok:false,error:"telegram_auth_failed",reason:verified.reason},{status:401});
  const url=Deno.env.get("SUPABASE_URL"), service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if(!url||!service) return Response.json({ok:false,error:"server_not_configured"},{status:500});
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const profile=await loadProfile(db,verified.user); const profileId=profile.id as string; const payload=typeof body.payload==="object"&&body.payload!==null?body.payload as Record<string,unknown>:{};
    if(body.action==="unread_count"){
      const {data:threads,error}=await db.from("chat_threads").select("buyer_id,seller_id,last_message_at,last_sender_id,buyer_read_at,seller_read_at").or(`buyer_id.eq.${profileId},seller_id.eq.${profileId}`).not("last_message_at","is",null).limit(200);
      if(error) throw new Error("chat_unread_load_failed");
      const playerUnread=(threads??[]).filter(t=>{if(t.last_sender_id===profileId||!t.last_message_at)return false;const readAt=t.buyer_id===profileId?t.buyer_read_at:t.seller_read_at;return newer(t.last_message_at,readAt);}).length;
      const systems=await systemChats(db,profileId);
      return Response.json({ok:true,unread:playerUnread+systems.filter(s=>s.unread).length});
    }
    if(body.action==="threads"){
      const {data:threads,error}=await db.from("chat_threads").select("id,listing_id,buyer_id,seller_id,last_message_at,last_message_preview,last_sender_id,buyer_read_at,seller_read_at,created_at,updated_at").or(`buyer_id.eq.${profileId},seller_id.eq.${profileId}`).order("updated_at",{ascending:false}).limit(100);
      if(error) throw new Error("chat_threads_load_failed"); const [enriched,systems]=await Promise.all([enrichThreads(db,threads??[],profileId),systemChats(db,profileId)]); return Response.json({ok:true,profileId,threads:threads??[],systemChats:systems,...enriched});
    }
    if(body.action==="open_system_chat"){
      const channel=payload.channel==="tradeup"?"tradeup":payload.channel==="support"?"support":""; if(!channel) return Response.json({ok:false,error:"invalid_payload"},{status:400});
      if(channel==="tradeup"){
        const [mr,rr]=await Promise.all([
          db.from("tradeup_announcements").select("id,body,published_at").eq("is_active",true).order("published_at",{ascending:true}).limit(200),
          db.from("system_chat_reads").select("tradeup_read_at").eq("user_id",profileId).maybeSingle()
        ]);
        if(mr.error||rr.error) throw new Error("tradeup_chat_load_failed");
        const latest=(mr.data??[]).at(-1)?.published_at as string|undefined;
        if(latest&&newer(latest,rr.data?.tradeup_read_at)){
          const now=new Date().toISOString(); const write=await db.from("system_chat_reads").upsert({user_id:profileId,tradeup_read_at:now,updated_at:now},{onConflict:"user_id"}); if(write.error) throw new Error("system_chat_read_failed");
        }
        return Response.json({ok:true,kind:"tradeup",messages:mr.data??[]});
      }
      const [topics,ticket]=await Promise.all([supportTopics(db),latestSupportTicket(db,profileId)]); let messages:any[]=[]; let current=ticket;
      if(ticket){
        if(ticket.last_message_at&&ticket.last_sender_type!=="user"&&newer(ticket.last_message_at,ticket.user_read_at)){
          const now=new Date().toISOString(); const u=await db.from("support_tickets").update({user_read_at:now}).eq("id",ticket.id); if(u.error) throw new Error("support_read_failed"); current={...ticket,user_read_at:now};
        }
        const r=await db.from("support_messages").select("id,ticket_id,sender_type,body,created_at").eq("ticket_id",ticket.id).order("created_at",{ascending:true}).limit(500); if(r.error) throw new Error("support_messages_load_failed"); messages=r.data??[];
      }
      return Response.json({ok:true,kind:"support",ticket:current,messages,topics});
    }
    if(body.action==="support_choose_topic"){
      const topicId=typeof payload.topicId==="string"?payload.topicId:""; if(!topicId) return Response.json({ok:false,error:"invalid_payload"},{status:400});
      const tr=await db.from("support_topics").select("id,title,auto_reply").eq("id",topicId).eq("is_active",true).maybeSingle(); if(tr.error) throw new Error("support_topic_load_failed"); if(!tr.data) return Response.json({ok:false,error:"support_topic_not_found"},{status:404});
      let ticket=await openSupportTicket(db,profileId); if(ticket&&["waiting","active"].includes(ticket.status)) return Response.json({ok:false,error:"support_already_requested"},{status:409}); if(!ticket) ticket=await ensureBotTicket(db,profileId,topicId);
      const u=await db.from("support_tickets").update({topic_id:topicId,status:"bot",closed_at:null,updated_at:new Date().toISOString()}).eq("id",ticket.id); if(u.error) throw new Error("support_ticket_update_failed");
      const i=await db.from("support_messages").insert([{ticket_id:ticket.id,sender_type:"user",body:tr.data.title},{ticket_id:ticket.id,sender_type:"bot",body:tr.data.auto_reply}]); if(i.error) throw new Error("support_message_send_failed"); return Response.json({ok:true,ticketId:ticket.id});
    }
    if(body.action==="support_request_human"){
      let ticket=await openSupportTicket(db,profileId); if(!ticket) ticket=await ensureBotTicket(db,profileId,"other");
      if(ticket.status==="active") return Response.json({ok:true,ticketId:ticket.id,shouldNotify:false,alreadyActive:true}); if(ticket.status==="waiting") return Response.json({ok:true,ticketId:ticket.id,shouldNotify:false,alreadyWaiting:true});
      const now=new Date().toISOString(); const u=await db.from("support_tickets").update({status:"waiting",requested_at:now,updated_at:now}).eq("id",ticket.id); if(u.error) throw new Error("support_ticket_update_failed");
      const m=await db.from("support_messages").insert({ticket_id:ticket.id,sender_type:"system",body:"Поддержка вызвана. Ожидайте подключения оператора."}); if(m.error) throw new Error("support_message_send_failed");
      return Response.json({ok:true,ticketId:ticket.id,shouldNotify:true,requester:{firstName:profile.first_name,username:profile.username,telegramId:profile.telegram_id}});
    }
    if(body.action==="support_send_message"){
      const text=typeof payload.body==="string"?payload.body.trim():""; if(!text||text.length>2000) return Response.json({ok:false,error:"invalid_message"},{status:400}); const ticket=await openSupportTicket(db,profileId); if(!ticket||!["waiting","active"].includes(ticket.status)) return Response.json({ok:false,error:"support_not_called"},{status:409});
      const {data,error}=await db.from("support_messages").insert({ticket_id:ticket.id,sender_type:"user",body:text}).select("id,ticket_id,sender_type,body,created_at").single(); if(error||!data) throw new Error("support_message_send_failed"); return Response.json({ok:true,message:data});
    }
    if(body.action==="start_thread"){
      const listingId=typeof payload.listingId==="string"?payload.listingId:""; if(!listingId) return Response.json({ok:false,error:"invalid_payload"},{status:400}); const lr=await db.from("listings").select("id,seller_id,status").eq("id",listingId).maybeSingle(); if(lr.error) throw new Error("listing_load_failed"); if(!lr.data) return Response.json({ok:false,error:"listing_not_found"},{status:404}); if(lr.data.seller_id===profileId) return Response.json({ok:false,error:"cannot_chat_with_self"},{status:409});
      const ex=await db.from("chat_threads").select("id").eq("listing_id",listingId).eq("buyer_id",profileId).maybeSingle(); if(ex.error) throw new Error("chat_thread_load_failed"); if(ex.data) return Response.json({ok:true,threadId:ex.data.id}); if(!["active","reserved"].includes(lr.data.status)) return Response.json({ok:false,error:"listing_not_active"},{status:409});
      const c=await db.from("chat_threads").insert({listing_id:listingId,buyer_id:profileId,seller_id:lr.data.seller_id,buyer_read_at:new Date().toISOString()}).select("id").single(); if(c.error){const retry=await db.from("chat_threads").select("id").eq("listing_id",listingId).eq("buyer_id",profileId).maybeSingle(); if(retry.data) return Response.json({ok:true,threadId:retry.data.id}); throw new Error("chat_thread_create_failed");} return Response.json({ok:true,threadId:c.data.id});
    }
    if(body.action==="open_thread"){
      const threadId=typeof payload.threadId==="string"?payload.threadId:""; if(!threadId) return Response.json({ok:false,error:"invalid_payload"},{status:400}); const thread=await readThread(db,threadId,profileId); if(!thread) return Response.json({ok:false,error:"chat_not_found"},{status:404});
      const readColumn=thread.buyer_id===profileId?"buyer_read_at":"seller_read_at"; const oldRead=thread[readColumn]; let readAt=oldRead;
      if(thread.last_message_at&&thread.last_sender_id!==profileId&&newer(thread.last_message_at,oldRead)){ readAt=new Date().toISOString(); const u=await db.from("chat_threads").update({[readColumn]:readAt}).eq("id",threadId); if(u.error) throw new Error("chat_read_failed"); }
      const mr=await db.from("chat_messages").select("id,thread_id,sender_id,body,created_at").eq("thread_id",threadId).order("created_at",{ascending:true}).limit(300); if(mr.error) throw new Error("chat_messages_load_failed"); const enriched=await enrichThreads(db,[thread],profileId); return Response.json({ok:true,profileId,thread:{...thread,[readColumn]:readAt},messages:mr.data??[],...enriched});
    }
    if(body.action==="poll_thread"){
      const threadId=typeof payload.threadId==="string"?payload.threadId:""; const since=typeof payload.since==="string"?payload.since:""; if(!threadId) return Response.json({ok:false,error:"invalid_payload"},{status:400}); const thread=await readThread(db,threadId,profileId); if(!thread) return Response.json({ok:false,error:"chat_not_found"},{status:404});
      const readColumn=thread.buyer_id===profileId?"buyer_read_at":"seller_read_at"; let readAt=thread[readColumn]; if(thread.last_message_at&&thread.last_sender_id!==profileId&&newer(thread.last_message_at,readAt)){readAt=new Date().toISOString();const u=await db.from("chat_threads").update({[readColumn]:readAt}).eq("id",threadId);if(u.error)throw new Error("chat_read_failed");}
      let query=db.from("chat_messages").select("id,thread_id,sender_id,body,created_at").eq("thread_id",threadId).order("created_at",{ascending:true}).limit(100); if(since) query=query.gt("created_at",since); const mr=await query; if(mr.error) throw new Error("chat_messages_load_failed"); return Response.json({ok:true,profileId,thread:{...thread,[readColumn]:readAt},messages:mr.data??[]});
    }
    if(body.action==="send_message"){
      const threadId=typeof payload.threadId==="string"?payload.threadId:""; const text=typeof payload.body==="string"?payload.body.trim():""; if(!threadId||!text||text.length>2000) return Response.json({ok:false,error:"invalid_message"},{status:400}); const thread=await readThread(db,threadId,profileId); if(!thread) return Response.json({ok:false,error:"chat_not_found"},{status:404}); const {data,error}=await db.from("chat_messages").insert({thread_id:threadId,sender_id:profileId,body:text}).select("id,thread_id,sender_id,body,created_at").single(); if(error||!data) throw new Error("chat_message_send_failed"); const readColumn=thread.buyer_id===profileId?"buyer_read_at":"seller_read_at"; const u=await db.from("chat_threads").update({[readColumn]:data.created_at}).eq("id",threadId); if(u.error) throw new Error("chat_read_failed"); return Response.json({ok:true,message:data});
    }
    if(body.action==="mark_read"){
      const threadId=typeof payload.threadId==="string"?payload.threadId:""; if(!threadId) return Response.json({ok:false,error:"invalid_payload"},{status:400}); const thread=await readThread(db,threadId,profileId); if(!thread) return Response.json({ok:false,error:"chat_not_found"},{status:404}); const readColumn=thread.buyer_id===profileId?"buyer_read_at":"seller_read_at"; if(thread.last_message_at&&thread.last_sender_id!==profileId&&newer(thread.last_message_at,thread[readColumn])){const u=await db.from("chat_threads").update({[readColumn]:new Date().toISOString()}).eq("id",threadId); if(u.error) throw new Error("chat_read_failed");} return Response.json({ok:true});
    }
    return Response.json({ok:false,error:"unknown_action"},{status:400});
  }catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:"chat_failed"},{status:500});}
});