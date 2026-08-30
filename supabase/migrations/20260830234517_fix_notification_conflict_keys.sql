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
 insert into public.notifications(user_id,type,title,body,href,event_key) values(case when p_actor_id=o.buyer_id then l.seller_id else o.buyer_id end,'offer','Встречное предложение',format('Новая цена: %s ₽',round(p_amount,0)),'/deals',format('counter_offer:%s',new_id)) on conflict(user_id,event_key) do nothing;
 return new_id;
end $$;

create or replace function public.notify_wanted_listing_match() returns trigger language plpgsql security definer set search_path=public as $$ declare it uuid; cond smallint; sp jsonb; begin
 if new.status<>'active' then return new; end if; select item_type_id,condition,specs into it,cond,sp from public.inventory_items where id=new.inventory_item_id;
 insert into public.notifications(user_id,type,title,body,href,event_key)
 select w.buyer_id,'wanted','Нашёлся подходящий товар',new.title||' за '||round(new.price,0)||' ₽','/listing/'||new.id,'wanted_match:'||w.id||':'||new.id
 from public.wanted_requests w where w.status='active' and w.expires_at>now() and w.item_type_id=it and w.buyer_id<>new.seller_id and w.budget_max>=new.price and w.min_condition<=cond and (w.min_storage_gb is null or coalesce((sp->>'storage_gb')::int,0)>=w.min_storage_gb) and (w.min_battery_health is null or coalesce((sp->>'battery_health')::int,0)>=w.min_battery_health)
 on conflict(user_id,event_key) do nothing; return new; end $$;

create or replace function public.notify_favorite_price_drop() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='active' and new.price<old.price then
  insert into public.notifications(user_id,type,title,body,href,event_key)
  select f.profile_id,'price_drop','Цена снизилась',new.title||' теперь стоит '||round(new.price,0)||' ₽','/listing/'||new.id,'price_drop:'||new.id||':'||round(new.price,0)::text
  from public.favorites f where f.listing_id=new.id and f.profile_id<>new.seller_id on conflict(user_id,event_key) do nothing;
 end if; return new;
end $$;

create or replace function public.notify_seller_favorite_milestone() returns trigger language plpgsql security definer set search_path=public as $$ declare seller uuid; title text; c integer;
begin
 select seller_id,l.title into seller,title from public.listings l where l.id=new.listing_id; if seller is null or seller=new.profile_id then return new; end if;
 select count(*) into c from public.favorites where listing_id=new.listing_id;
 if c in(1,5,10,25,50) then insert into public.notifications(user_id,type,title,body,href,event_key) values(seller,'interest','Товар замечают',title||' добавили в избранное уже '||c||' чел.','/listing/'||new.listing_id,'favorite_milestone:'||new.listing_id||':'||c) on conflict(user_id,event_key) do nothing; end if; return new;
end $$;

create or replace function public.notify_sellers_new_wanted() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.notifications(user_id,type,title,body,href,event_key)
 select distinct i.owner_id,'wanted','Есть покупатель','Новый запрос подходит под предмет в твоём инвентаре.','/explore?tab=wanted','wanted_seller:'||new.id||':'||i.owner_id
 from public.inventory_items i where i.item_type_id=new.item_type_id and i.owner_id<>new.buyer_id and not i.is_locked and i.condition>=new.min_condition and (new.min_storage_gb is null or coalesce((i.specs->>'storage_gb')::int,0)>=new.min_storage_gb) and (new.min_battery_health is null or coalesce((i.specs->>'battery_health')::int,0)>=new.min_battery_health)
 limit 30 on conflict(user_id,event_key) do nothing; return new;
end $$;

create or replace function public.place_auction_bid_atomic(p_bidder_id uuid,p_auction_id uuid,p_amount numeric) returns numeric language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.auctions%rowtype; l public.listings%rowtype; min_bid numeric; bal numeric; delta numeric;
begin
 select * into a from public.auctions where id=p_auction_id for update; if not found or a.status<>'active' then raise exception 'auction_not_active'; end if; if a.ends_at<=now() then perform public.settle_auction_atomic(a.id); raise exception 'auction_ended'; end if;
 select * into l from public.listings where id=a.listing_id; if l.seller_id=p_bidder_id then raise exception 'cannot_bid_own_auction'; end if;
 min_bid:=case when a.current_bid is null then a.start_price else a.current_bid+greatest(100,round(a.current_bid*.02,0)) end; if p_amount is null or p_amount<min_bid then raise exception 'bid_too_low'; end if;
 perform 1 from public.profiles where id in(p_bidder_id,a.high_bidder_id) order by id for update; select balance into bal from public.profiles where id=p_bidder_id;
 if a.high_bidder_id=p_bidder_id then delta:=p_amount-a.current_bid; if bal<delta then raise exception 'insufficient_funds'; end if; update public.profiles set balance=balance-delta,updated_at=now() where id=p_bidder_id;
 else if bal<p_amount then raise exception 'insufficient_funds'; end if; update public.profiles set balance=balance-p_amount,updated_at=now() where id=p_bidder_id; if a.high_bidder_id is not null then update public.profiles set balance=balance+a.current_bid,updated_at=now() where id=a.high_bidder_id; insert into public.notifications(user_id,type,title,body,href,event_key) values(a.high_bidder_id,'auction','Твою ставку перебили',l.title||' · новая ставка '||round(p_amount,0)||' ₽','/explore?tab=auctions','auction_outbid:'||a.id||':'||(a.bid_count+1)) on conflict(user_id,event_key) do nothing; end if; end if;
 update public.auctions set current_bid=round(p_amount,0),high_bidder_id=p_bidder_id,bid_count=bid_count+1,ends_at=case when ends_at-now()<=interval '30 seconds' then ends_at+interval '30 seconds' else ends_at end,updated_at=now() where id=a.id;
 insert into public.auction_bids(auction_id,bidder_id,amount) values(a.id,p_bidder_id,round(p_amount,0)); insert into public.notifications(user_id,type,title,body,href,event_key) values(a.seller_id,'auction','Новая ставка',l.title||' · '||round(p_amount,0)||' ₽','/explore?tab=auctions','auction_bid:'||a.id||':'||(a.bid_count+1)) on conflict(user_id,event_key) do nothing; return round(p_amount,0);
end $$;

revoke all on function public.counter_offer_atomic(uuid,uuid,numeric,integer,boolean) from public,anon,authenticated; grant execute on function public.counter_offer_atomic(uuid,uuid,numeric,integer,boolean) to service_role;
revoke all on function public.notify_wanted_listing_match() from public,anon,authenticated;
revoke all on function public.notify_favorite_price_drop() from public,anon,authenticated;
revoke all on function public.notify_seller_favorite_milestone() from public,anon,authenticated;
revoke all on function public.notify_sellers_new_wanted() from public,anon,authenticated;
revoke all on function public.place_auction_bid_atomic(uuid,uuid,numeric) from public,anon,authenticated; grant execute on function public.place_auction_bid_atomic(uuid,uuid,numeric) to service_role;
