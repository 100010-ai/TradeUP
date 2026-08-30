create or replace function public.notify_favorite_price_drop() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='active' and new.price<old.price then
  insert into public.notifications(user_id,type,title,body,href,event_key)
  select f.profile_id,'price_drop','Цена снизилась',new.title||' теперь стоит '||round(new.price,0)||' ₽','/listing/'||new.id,'price_drop:'||new.id||':'||round(new.price,0)::text
  from public.favorites f where f.listing_id=new.id and f.profile_id<>new.seller_id on conflict(event_key) do nothing;
 end if; return new;
end $$;
drop trigger if exists listings_favorite_price_drop on public.listings;create trigger listings_favorite_price_drop after update of price on public.listings for each row execute function public.notify_favorite_price_drop();

create or replace function public.notify_seller_favorite_milestone() returns trigger language plpgsql security definer set search_path=public as $$
declare seller uuid; title text; c integer;
begin
 select seller_id,l.title into seller,title from public.listings l where l.id=new.listing_id; if seller is null or seller=new.profile_id then return new; end if;
 select count(*) into c from public.favorites where listing_id=new.listing_id;
 if c in(1,5,10,25,50) then insert into public.notifications(user_id,type,title,body,href,event_key) values(seller,'interest','Товар замечают',title||' добавили в избранное уже '||c||' чел.','/listing/'||new.listing_id,'favorite_milestone:'||new.listing_id||':'||c) on conflict(event_key) do nothing; end if; return new;
end $$;
drop trigger if exists favorites_seller_milestone on public.favorites;create trigger favorites_seller_milestone after insert on public.favorites for each row execute function public.notify_seller_favorite_milestone();

create or replace function public.notify_sellers_new_wanted() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.notifications(user_id,type,title,body,href,event_key)
 select distinct i.owner_id,'wanted','Есть покупатель','Новый запрос подходит под предмет в твоём инвентаре.','/explore?tab=wanted','wanted_seller:'||new.id||':'||i.owner_id
 from public.inventory_items i where i.item_type_id=new.item_type_id and i.owner_id<>new.buyer_id and not i.is_locked and i.condition>=new.min_condition and (new.min_storage_gb is null or coalesce((i.specs->>'storage_gb')::int,0)>=new.min_storage_gb) and (new.min_battery_health is null or coalesce((i.specs->>'battery_health')::int,0)>=new.min_battery_health)
 limit 30 on conflict(event_key) do nothing; return new;
end $$;
drop trigger if exists wanted_notify_sellers on public.wanted_requests;create trigger wanted_notify_sellers after insert on public.wanted_requests for each row when(new.status='active') execute function public.notify_sellers_new_wanted();

revoke all on function public.notify_favorite_price_drop() from public,anon,authenticated;revoke all on function public.notify_seller_favorite_milestone() from public,anon,authenticated;revoke all on function public.notify_sellers_new_wanted() from public,anon,authenticated;
