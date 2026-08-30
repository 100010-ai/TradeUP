import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyTelegramInitData } from "@/lib/telegram/verify-init-data";

export const runtime = "nodejs";
const ACTIONS = new Set(["negotiations","identity","ratings"]);
type Body={initData?:unknown;action?:unknown;payload?:unknown};

export async function POST(request:Request){
 const botToken=process.env.TELEGRAM_BOT_TOKEN,supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
 if(!botToken||!supabaseUrl)return NextResponse.json({ok:false,error:"server_not_configured"},{status:503});
 let body:Body;try{body=await request.json() as Body;}catch{return NextResponse.json({ok:false,error:"invalid_json"},{status:400});}
 if(typeof body.initData!=="string"||typeof body.action!=="string"||!ACTIONS.has(body.action))return NextResponse.json({ok:false,error:"invalid_payload"},{status:400});
 const verified=verifyTelegramInitData(body.initData,botToken);if(!verified.ok)return NextResponse.json({ok:false,error:"telegram_auth_failed"},{status:401});
 const secret=createHmac("sha256","WebAppData").update(botToken).digest("hex");
 try{
  const response=await fetch(`${supabaseUrl}/functions/v1/telegram-social-market`,{method:"POST",headers:{"Content-Type":"application/json","X-TradeUP-Telegram-Secret":secret},body:JSON.stringify({initData:body.initData,action:body.action,payload:typeof body.payload==="object"&&body.payload!==null?body.payload:{}}),cache:"no-store"});
  const raw=await response.text();let result:Record<string,unknown>;try{result=raw?JSON.parse(raw) as Record<string,unknown>:{ok:false,error:"empty_social_market_response"};}catch{result={ok:false,error:"invalid_social_market_response"};}
  return NextResponse.json(result,{status:response.status,headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({ok:false,error:"social_market_unavailable"},{status:502});}
}
