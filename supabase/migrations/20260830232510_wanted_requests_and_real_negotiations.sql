alter table public.offers add column if not exists created_by_id uuid references public.profiles(id) on delete cascade, add column if not exists parent_offer_id uuid references public.offers(id) on delete set null, add column if not exists expires_at timestamptz, add column if not exists is_final boolean not null default false;
update public.offers set created_by_id=buyer_id where created_by_id is null; update public.offers set expires_at=created_at+interval '24 hours' where expires_at is null;
alter table public.offers alter column created_by_id set not null, alter column expires_at set not null;
alter table public.offers drop constraint if exists offers_status_check;
alter table public.offers add constraint offers_status_check check(status in('pending','accepted','declined','cancelled','expired','countered'));
create index if not exists offers_created_by_idx on public.offers(created_by_id,updated_at desc); create index if not exists offers_parent_idx on public.offers(parent_offer_id);

create or replace function public.create_offer_atomic(p_buyer_id uuid,p_listing_id uuid,p_amount numeric) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_listing public.listings%rowtype; v_balance numeric; v_offer public.offers%rowtype;
begin
 select * into v_listing from public.listings where id=p_listing_id for share; if not found or v_listing.status<>'active' then raise exception 'listing_not_active' using errcode='55000'; end if; if v_listing.seller_id=p_buyer_id then raise exception 'cannot_offer_own_listing' using errcode='22023'; end if;
 if p_amount is null or p_amount<=0 or p_amount>=v_listing.price or p_amount<round(v_listing.price*.50,0) then raise exception 'invalid_offer_amount' using errcode='22023'; end if;
 select balance into v_balance from public.profiles where id=p_buyer_id; if v_balance is null then raise exception 'buyer_not_found'; end if; if v_balance<p_amount then raise exception 'insufficient_funds' using errcode='22003'; end if;
 update public.offers set status='expired',updated_at=now() where listing_id=p_listing_id and buyer_id=p_buyer_id and status='pending' and expires_at<=now();
 select * into v_offer from public.offers where listing_id=p_listing_id and buyer_id=p_buyer_id and status='pending' order by created_at desc limit 1 for update;
 if found then if v_offer.created_by_id<>p_buyer_id then raise exception 'counter_offer_pending' using errcode='55000'; end if; update public.offers set amount=round(p_amount,0),expires_at=now()+interval '24 hours',updated_at=now(),is_final=false where id=v_offer.id returning * into v_offer;
 else insert into public.offers(listing_id,buyer_id,amount,status,created_by_id,expires_at) values(p_listing_id,p_buyer_id,round(p_amount,0),'pending',p_buyer_id,now()+interval '24 hours') returning * into v_offer; end if;
 insert into public.market_events(event_type,listing_id,actor_id,payload) values('offer_updated',p_listing_id,p_buyer_id,jsonb_build_object('amount',v_offer.amount,'status','pending','expires_at',v_offer.expires_at)); return v_offer.id;
end $$;

create or replace function public.counter_offer_atomic(p_actor_id uuid,p_offer_id uuid,p_amount numeric,p_expires_minutes integer default 120,p_is_final boolean default false) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.offers%rowtype; l public.listings%rowtype; new_id uuid; minutes integer;
begin
 select listing_id into o.listing_id from public.offers where id=p_offer_id; if not found then raise exception 'offer_not_pending'; end if;
 select * into l from public.listings where id=o.listing_id for update; if not found or l.status<>'active' then raise exception 'listing_not_active'; end if;
 select * into o from public.offers where id=p_offer_id for update; if o.status<>'pending' or o.expires_at<=now() then update public.offers set status='expired',updated_at=now() where id=o.id and status='pending'; raise exception 'offer_not_pending'; end if;
 if p_actor_id not in(o.buyer_id,l.seller_id) then raise exception 'offer_not_owned' using errcode='42501'; end if; if p_actor_id=o.created_by_id then raise exception 'cannot_counter_own_offer'; end if;
 if p_amount is null or p_amount<round(l.price*.50,0) or p_amount>l.price then raise exception 'invalid_offer_amount'; end if;
 if p_actor_id=o.buyer_id and (select balance from public.profiles where id=o.buyer_id)<p_amount then raise exception 'insufficient_funds'; end if;
 minutes:=greatest(5,least(coalesce(p_expires_minutes,120),1440)); update public.offers set status='countered',updated_at=now() where id=o.id;
 insert into public.offers(listing_id,buyer_id,amount,status,created_by_id,parent_offer_id,expires_at,is_final) values(o.listing_id,o.buyer_id,round(p_amount,0),'pending',p_actor_id,o.id,now()+make_interval(mins=>minutes),coalesce(p_is_final,false)) returning id into new_id;
 insert into public.notifications(user_id,type,title,body,href,event_key) values(case when p_actor_id=o.buyer_id then l.seller_id else o.buyer_id end,'offer','Встречное предложение',format('Новая цена: %s ₽',round(p_amount,0)),format('/deals'),format('counter_offer:%s',new_id)) on conflict(event_key) do nothing;
 return new_id;
end $$;

create or replace function public.respond_negotiation_offer_atomic(p_actor_id uuid,p_offer_id uuid,p_accept boolean) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.offers%rowtype; l public.listings%rowtype; trade_id uuid;
begin
 select listing_id into o.listing_id from public.offers where id=p_offer_id; if not found then raise exception 'offer_not_pending'; end if; select * into l from public.listings where id=o.listing_id for update; if not found then raise exception 'listing_not_active'; end if; select * into o from public.offers where id=p_offer_id for update;
 if o.status<>'pending' or o.expires_at<=now() then update public.offers set status='expired',updated_at=now() where id=o.id and status='pending'; raise exception 'offer_not_pending'; end if;
 if p_actor_id not in(o.buyer_id,l.seller_id) or p_actor_id=o.created_by_id then raise exception 'offer_not_owned' using errcode='42501'; end if;
 if not p_accept then update public.offers set status='declined',updated_at=now() where id=o.id; return null; end if;
 if l.status<>'active' then raise exception 'listing_not_active'; end if; trade_id:=public.complete_listing_sale_atomic(o.buyer_id,o.listing_id,o.amount); update public.offers set status='accepted',updated_at=now() where id=o.id; return trade_id;
end $$;

create or replace function public.expire_stale_offers() returns integer language plpgsql security definer set search_path=public as $$ declare n integer; begin update public.offers set status='expired',updated_at=now() where status='pending' and expires_at<=now(); get diagnostics n=row_count; return n; end $$;

create table if not exists public.wanted_requests(
 id uuid primary key default gen_random_uuid(),buyer_id uuid not null references public.profiles(id) on delete cascade,item_type_id uuid not null references public.item_types(id) on delete cascade,
 budget_max numeric(12,2) not null check(budget_max>0),min_condition smallint not null default 60 check(min_condition between 1 and 100),min_storage_gb integer,min_battery_health smallint check(min_battery_health is null or min_battery_health between 1 and 100),note text not null default '' check(char_length(note)<=500),status text not null default 'active' check(status in('active','fulfilled','cancelled','expired')),created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '14 days'));
create index if not exists wanted_active_item_idx on public.wanted_requests(item_type_id,budget_max desc) where status='active'; create index if not exists wanted_buyer_idx on public.wanted_requests(buyer_id,created_at desc);
alter table public.wanted_requests enable row level security; revoke all on public.wanted_requests from anon,authenticated;

create or replace function public.create_wanted_request_atomic(p_buyer_id uuid,p_item_type_id uuid,p_budget_max numeric,p_min_condition integer default 60,p_min_storage_gb integer default null,p_min_battery_health integer default null,p_note text default '') returns uuid language plpgsql security definer set search_path=public as $$ declare rid uuid; base numeric; begin
 select base_value into base from public.item_types where id=p_item_type_id and is_active=true; if base is null then raise exception 'item_type_not_found'; end if; if p_budget_max<=0 or p_budget_max>base*3 then raise exception 'invalid_budget'; end if;
 insert into public.wanted_requests(buyer_id,item_type_id,budget_max,min_condition,min_storage_gb,min_battery_health,note) values(p_buyer_id,p_item_type_id,round(p_budget_max,0),greatest(1,least(coalesce(p_min_condition,60),100)),p_min_storage_gb,p_min_battery_health,left(coalesce(p_note,''),500)) returning id into rid; return rid; end $$;
create or replace function public.cancel_wanted_request_atomic(p_buyer_id uuid,p_request_id uuid) returns boolean language plpgsql security definer set search_path=public as $$ begin update public.wanted_requests set status='cancelled' where id=p_request_id and buyer_id=p_buyer_id and status='active'; return found; end $$;

create or replace function public.notify_wanted_listing_match() returns trigger language plpgsql security definer set search_path=public as $$ declare it uuid; cond smallint; sp jsonb; begin
 if new.status<>'active' then return new; end if; select item_type_id,condition,specs into it,cond,sp from public.inventory_items where id=new.inventory_item_id;
 insert into public.notifications(user_id,type,title,body,href,event_key)
 select w.buyer_id,'wanted','Нашёлся подходящий товар',new.title||' за '||round(new.price,0)||' ₽','/listing/'||new.id,'wanted_match:'||w.id||':'||new.id
 from public.wanted_requests w where w.status='active' and w.expires_at>now() and w.item_type_id=it and w.buyer_id<>new.seller_id and w.budget_max>=new.price and w.min_condition<=cond and (w.min_storage_gb is null or coalesce((sp->>'storage_gb')::int,0)>=w.min_storage_gb) and (w.min_battery_health is null or coalesce((sp->>'battery_health')::int,0)>=w.min_battery_health)
 on conflict(event_key) do nothing; return new; end $$;
drop trigger if exists listings_notify_wanted on public.listings; create trigger listings_notify_wanted after insert or update of status,price on public.listings for each row execute function public.notify_wanted_listing_match();

revoke all on function public.counter_offer_atomic(uuid,uuid,numeric,integer,boolean) from public,anon,authenticated; grant execute on function public.counter_offer_atomic(uuid,uuid,numeric,integer,boolean) to service_role;
revoke all on function public.respond_negotiation_offer_atomic(uuid,uuid,boolean) from public,anon,authenticated; grant execute on function public.respond_negotiation_offer_atomic(uuid,uuid,boolean) to service_role;
revoke all on function public.expire_stale_offers() from public,anon,authenticated; grant execute on function public.expire_stale_offers() to service_role;
revoke all on function public.create_wanted_request_atomic(uuid,uuid,numeric,integer,integer,integer,text) from public,anon,authenticated; grant execute on function public.create_wanted_request_atomic(uuid,uuid,numeric,integer,integer,integer,text) to service_role;
revoke all on function public.cancel_wanted_request_atomic(uuid,uuid) from public,anon,authenticated; grant execute on function public.cancel_wanted_request_atomic(uuid,uuid) to service_role;
revoke all on function public.notify_wanted_listing_match() from public,anon,authenticated;
