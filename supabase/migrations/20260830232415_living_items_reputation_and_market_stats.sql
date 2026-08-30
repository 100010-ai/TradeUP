alter table public.inventory_items
  add column if not exists serial_code text,
  add column if not exists specs jsonb not null default '{}'::jsonb,
  add column if not exists condition_notes text[] not null default '{}'::text[],
  add column if not exists owner_count integer not null default 1,
  add column if not exists lifetime_turnover numeric(14,2) not null default 0,
  add column if not exists last_sale_price numeric(12,2),
  add column if not exists first_seen_at timestamptz not null default now();

update public.inventory_items
set serial_code='TU-'||upper(substr(replace(id::text,'-',''),1,10))
where serial_code is null;
create unique index if not exists inventory_items_serial_code_uidx on public.inventory_items(serial_code);
alter table public.inventory_items alter column serial_code set not null;

update public.inventory_items i
set specs=jsonb_strip_nulls(jsonb_build_object(
  'color',case t.category_id when 'phones' then (array['Black','White','Blue','Graphite','Silver','Midnight'])[1+floor(random()*6)::int] when 'computers' then (array['Space Gray','Silver','Black','Graphite'])[1+floor(random()*4)::int] when 'consoles' then (array['Black','White','Gray'])[1+floor(random()*3)::int] when 'sneakers' then (array['Black','White','Gray','Mixed'])[1+floor(random()*4)::int] when 'watches' then (array['Black','Silver','Steel','Dark'])[1+floor(random()*4)::int] else null end,
  'storage_gb',case when t.category_id='phones' then case when t.name ilike '%128%' then 128 when t.name ilike '%64%' then 64 when t.name ilike '%256%' then 256 else (array[64,128,128,256])[1+floor(random()*4)::int] end when t.category_id='computers' then (array[256,512,512,1024])[1+floor(random()*4)::int] when t.slug like '%switch%' then (array[32,64,64,128])[1+floor(random()*4)::int] else null end,
  'battery_health',case when t.category_id in ('phones','computers') then greatest(68,least(100,i.condition-floor(random()*9)::int+4)) else null end,
  'box',random()<case when i.condition>=90 then .70 when i.condition>=75 then .45 else .25 end,
  'accessories',random()<case when i.condition>=85 then .72 else .48 end,
  'size_eu',case when t.category_id='sneakers' then round((38+random()*7)::numeric,1) else null end,
  'complete_set',case when t.category_id='collectibles' then random()<.58 else null end
))
from public.item_types t where t.id=i.item_type_id and i.specs='{}'::jsonb;

update public.inventory_items set condition_notes=case when condition>=95 then array['Почти без следов использования'] when condition>=88 then array['Незначительные следы использования'] when condition>=78 then array['Есть небольшие потёртости','Без критичных дефектов'] when condition>=65 then array['Заметные следы использования','Рабочее состояние'] else array['Сильные следы использования','Требует внимательной проверки'] end where cardinality(condition_notes)=0;

update public.inventory_items i set
 owner_count=1+coalesce((select count(*) from public.trades t where t.item_id=i.id),0),
 lifetime_turnover=coalesce((select sum(t.amount) from public.trades t where t.item_id=i.id),0),
 last_sale_price=(select t.amount from public.trades t where t.item_id=i.id order by t.completed_at desc limit 1),
 first_seen_at=least(i.acquired_at,coalesce((select min(t.completed_at) from public.trades t where t.item_id=i.id),i.acquired_at));

create or replace function public.decorate_inventory_item_instance() returns trigger language plpgsql security definer set search_path=public as $$
declare c text; n text;
begin
 if new.serial_code is null then new.serial_code:='TU-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)); end if;
 select category_id,name into c,n from public.item_types where id=new.item_type_id;
 if new.specs='{}'::jsonb then
  new.specs:=jsonb_strip_nulls(jsonb_build_object(
   'color',case c when 'phones' then (array['Black','White','Blue','Graphite','Silver','Midnight'])[1+floor(random()*6)::int] when 'computers' then (array['Space Gray','Silver','Black','Graphite'])[1+floor(random()*4)::int] when 'consoles' then (array['Black','White','Gray'])[1+floor(random()*3)::int] when 'sneakers' then (array['Black','White','Gray','Mixed'])[1+floor(random()*4)::int] when 'watches' then (array['Black','Silver','Steel','Dark'])[1+floor(random()*4)::int] else null end,
   'storage_gb',case when c='phones' then case when n ilike '%128%' then 128 when n ilike '%64%' then 64 when n ilike '%256%' then 256 else (array[64,128,128,256])[1+floor(random()*4)::int] end when c='computers' then (array[256,512,512,1024])[1+floor(random()*4)::int] else null end,
   'battery_health',case when c in ('phones','computers') then greatest(68,least(100,new.condition-floor(random()*9)::int+4)) else null end,
   'box',random()<case when new.condition>=90 then .70 when new.condition>=75 then .45 else .25 end,
   'accessories',random()<case when new.condition>=85 then .72 else .48 end,
   'size_eu',case when c='sneakers' then round((38+random()*7)::numeric,1) else null end,
   'complete_set',case when c='collectibles' then random()<.58 else null end));
 end if;
 if cardinality(new.condition_notes)=0 then new.condition_notes:=case when new.condition>=95 then array['Почти без следов использования'] when new.condition>=88 then array['Незначительные следы использования'] when new.condition>=78 then array['Есть небольшие потёртости','Без критичных дефектов'] when new.condition>=65 then array['Заметные следы использования','Рабочее состояние'] else array['Сильные следы использования','Требует внимательной проверки'] end; end if;
 new.first_seen_at:=coalesce(new.first_seen_at,now()); return new;
end $$;
drop trigger if exists inventory_items_decorate_instance on public.inventory_items;
create trigger inventory_items_decorate_instance before insert on public.inventory_items for each row execute function public.decorate_inventory_item_instance();

create table if not exists public.item_events(
 id uuid primary key default gen_random_uuid(), item_id uuid not null references public.inventory_items(id) on delete cascade,
 event_type text not null check(event_type in ('created','sale','repair','service','note')),
 actor_id uuid references public.profiles(id) on delete set null, counterparty_id uuid references public.profiles(id) on delete set null,
 amount numeric(12,2), trade_id uuid unique references public.trades(id) on delete set null, meta jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now());
create index if not exists item_events_item_created_idx on public.item_events(item_id,created_at desc);
alter table public.item_events enable row level security; revoke all on public.item_events from anon,authenticated;

insert into public.item_events(item_id,event_type,actor_id,created_at,meta)
select i.id,'created',coalesce((select t.seller_id from public.trades t where t.item_id=i.id order by t.completed_at asc limit 1),i.owner_id),i.first_seen_at,jsonb_build_object('serial',i.serial_code)
from public.inventory_items i where not exists(select 1 from public.item_events e where e.item_id=i.id and e.event_type='created');
insert into public.item_events(item_id,event_type,actor_id,counterparty_id,amount,trade_id,created_at)
select t.item_id,'sale',t.seller_id,t.buyer_id,t.amount,t.id,t.completed_at from public.trades t on conflict(trade_id) do nothing;

create or replace function public.after_trade_item_history() returns trigger language plpgsql security definer set search_path=public as $$
begin
 update public.inventory_items set owner_count=owner_count+1,lifetime_turnover=lifetime_turnover+new.amount,last_sale_price=new.amount where id=new.item_id;
 insert into public.item_events(item_id,event_type,actor_id,counterparty_id,amount,trade_id,created_at) values(new.item_id,'sale',new.seller_id,new.buyer_id,new.amount,new.id,new.completed_at) on conflict(trade_id) do nothing;
 return new;
end $$;
drop trigger if exists trades_item_history on public.trades;
create trigger trades_item_history after insert on public.trades for each row execute function public.after_trade_item_history();

create table if not exists public.trade_ratings(
 id uuid primary key default gen_random_uuid(), trade_id uuid not null references public.trades(id) on delete cascade,
 rater_id uuid not null references public.profiles(id) on delete cascade, target_id uuid not null references public.profiles(id) on delete cascade,
 positive boolean not null, created_at timestamptz not null default now(), unique(trade_id,rater_id), check(rater_id<>target_id));
create index if not exists trade_ratings_target_idx on public.trade_ratings(target_id,created_at desc);
alter table public.trade_ratings enable row level security; revoke all on public.trade_ratings from anon,authenticated;

create table if not exists public.profile_response_stats(profile_id uuid primary key references public.profiles(id) on delete cascade,response_count bigint not null default 0,total_response_seconds numeric(16,2) not null default 0,updated_at timestamptz not null default now());
alter table public.profile_response_stats enable row level security; revoke all on public.profile_response_stats from anon,authenticated;

insert into public.profile_response_stats(profile_id,response_count,total_response_seconds)
select sender_id,count(*),sum(extract(epoch from(created_at-prev_at))) from(
 select sender_id,created_at,lag(sender_id) over(partition by thread_id order by created_at) prev_sender,lag(created_at) over(partition by thread_id order by created_at) prev_at from public.chat_messages
) q where prev_sender is not null and prev_sender<>sender_id and created_at-prev_at between interval '1 second' and interval '24 hours' group by sender_id
on conflict(profile_id) do update set response_count=excluded.response_count,total_response_seconds=excluded.total_response_seconds,updated_at=now();

create or replace function public.after_chat_message_response_stat() returns trigger language plpgsql security definer set search_path=public as $$
declare p_sender uuid; p_at timestamptz; secs numeric;
begin
 select sender_id,created_at into p_sender,p_at from public.chat_messages where thread_id=new.thread_id and created_at<new.created_at order by created_at desc limit 1;
 if p_sender is not null and p_sender<>new.sender_id then secs:=extract(epoch from(new.created_at-p_at)); if secs between 1 and 86400 then insert into public.profile_response_stats(profile_id,response_count,total_response_seconds,updated_at) values(new.sender_id,1,secs,now()) on conflict(profile_id) do update set response_count=profile_response_stats.response_count+1,total_response_seconds=profile_response_stats.total_response_seconds+excluded.total_response_seconds,updated_at=now(); end if; end if; return new;
end $$;
drop trigger if exists chat_messages_response_stat on public.chat_messages;
create trigger chat_messages_response_stat after insert on public.chat_messages for each row execute function public.after_chat_message_response_stat();

create or replace function public.rate_trade_atomic(p_profile_id uuid,p_trade_id uuid,p_positive boolean) returns boolean language plpgsql security definer set search_path=public as $$
declare tr public.trades%rowtype; target uuid;
begin
 select * into tr from public.trades where id=p_trade_id; if not found then raise exception 'trade_not_found'; end if;
 if p_profile_id=tr.buyer_id then target:=tr.seller_id; elsif p_profile_id=tr.seller_id then target:=tr.buyer_id; else raise exception 'trade_not_owned'; end if;
 insert into public.trade_ratings(trade_id,rater_id,target_id,positive) values(p_trade_id,p_profile_id,target,p_positive) on conflict(trade_id,rater_id) do update set positive=excluded.positive,created_at=now(); return true;
end $$;
revoke all on function public.rate_trade_atomic(uuid,uuid,boolean) from public,anon,authenticated; grant execute on function public.rate_trade_atomic(uuid,uuid,boolean) to service_role;

create or replace view public.profile_reputation_public with (security_invoker=true) as
select p.id profile_id,p.deals_count,p.created_at,
 coalesce(r.positive_count,0) positive_count,coalesce(r.negative_count,0) negative_count,
 case when coalesce(r.total_count,0)=0 then null else round(100.0*r.positive_count/r.total_count,1) end reputation_percent,
 case when coalesce(s.response_count,0)=0 then null else round(s.total_response_seconds/s.response_count) end avg_response_seconds,
 coalesce(l.cancelled_count,0) cancelled_listings
from public.profiles p
left join lateral(select count(*) filter(where positive) positive_count,count(*) filter(where not positive) negative_count,count(*) total_count from public.trade_ratings where target_id=p.id) r on true
left join public.profile_response_stats s on s.profile_id=p.id
left join lateral(select count(*) filter(where status='cancelled') cancelled_count from public.listings where seller_id=p.id) l on true;
revoke all on public.profile_reputation_public from anon,authenticated;

create or replace view public.item_market_stats with (security_invoker=true) as
select it.id item_type_id,it.name,it.brand,it.category_id,
 count(tr.id) filter(where tr.completed_at>=now()-interval '7 days') sales_7d,
 count(tr.id) filter(where tr.completed_at>=now()-interval '30 days') sales_30d,
 percentile_cont(.5) within group(order by tr.amount) filter(where tr.completed_at>=now()-interval '7 days') median_7d,
 percentile_cont(.5) within group(order by tr.amount) filter(where tr.completed_at>=now()-interval '30 days') median_30d,
 percentile_cont(.5) within group(order by tr.amount) filter(where tr.completed_at>=now()-interval '14 days' and tr.completed_at<now()-interval '7 days') median_prev_7d,
 min(tr.amount) filter(where tr.completed_at>=now()-interval '30 days') low_30d,max(tr.amount) filter(where tr.completed_at>=now()-interval '30 days') high_30d,
 avg(extract(epoch from(tr.completed_at-l.created_at))) filter(where tr.completed_at>=now()-interval '30 days') avg_sell_seconds,
 (select count(*) from public.listings al join public.inventory_items ai on ai.id=al.inventory_item_id where ai.item_type_id=it.id and al.status='active') active_listings,
 (select count(*) from public.inventory_items ci where ci.item_type_id=it.id) circulating
from public.item_types it left join public.inventory_items ii on ii.item_type_id=it.id left join public.trades tr on tr.item_id=ii.id left join public.listings l on l.id=tr.listing_id
group by it.id,it.name,it.brand,it.category_id;
revoke all on public.item_market_stats from anon,authenticated;

revoke all on function public.decorate_inventory_item_instance() from public,anon,authenticated;
revoke all on function public.after_trade_item_history() from public,anon,authenticated;
revoke all on function public.after_chat_message_response_stat() from public,anon,authenticated;
