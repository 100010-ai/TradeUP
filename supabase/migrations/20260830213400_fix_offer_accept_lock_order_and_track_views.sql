create or replace function public.respond_offer_atomic(p_seller_id uuid, p_offer_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer public.offers%rowtype;
  v_listing_seller uuid;
  v_listing_status text;
  v_listing_id uuid;
  v_trade_id uuid;
begin
  select listing_id into v_listing_id
  from public.offers
  where id = p_offer_id;

  if not found then
    raise exception 'offer_not_pending' using errcode='55000';
  end if;

  select seller_id, status into v_listing_seller, v_listing_status
  from public.listings
  where id = v_listing_id
  for update;

  if not found or v_listing_seller <> p_seller_id then
    raise exception 'offer_not_owned' using errcode='42501';
  end if;

  select * into v_offer
  from public.offers
  where id = p_offer_id
  for update;

  if not found or v_offer.status <> 'pending' then
    raise exception 'offer_not_pending' using errcode='55000';
  end if;
  if v_offer.listing_id <> v_listing_id then
    raise exception 'offer_not_owned' using errcode='42501';
  end if;

  if not p_accept then
    update public.offers set status='declined', updated_at=now() where id=p_offer_id;
    insert into public.market_events(event_type,listing_id,actor_id,payload)
    values('offer_updated',v_offer.listing_id,p_seller_id,jsonb_build_object('status','declined'));
    return null;
  end if;

  if v_listing_status <> 'active' then
    raise exception 'listing_not_active' using errcode='55000';
  end if;

  v_trade_id := public.complete_listing_sale_atomic(v_offer.buyer_id, v_offer.listing_id, v_offer.amount);
  update public.offers set status='accepted', updated_at=now() where id=p_offer_id;
  insert into public.market_events(event_type,listing_id,actor_id,payload)
  values('offer_updated',v_offer.listing_id,p_seller_id,jsonb_build_object('status','accepted','amount',v_offer.amount));
  return v_trade_id;
end;
$$;

revoke all on function public.respond_offer_atomic(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.respond_offer_atomic(uuid,uuid,boolean) to service_role;

create table if not exists public.listing_views (
  listing_id uuid not null references public.listings(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  primary key (listing_id, viewer_id)
);
create index if not exists listing_views_viewer_idx on public.listing_views(viewer_id, first_viewed_at desc);
alter table public.listing_views enable row level security;
revoke all on public.listing_views from public, anon, authenticated;
grant all on public.listing_views to service_role;

create or replace function public.record_listing_view_atomic(p_viewer_id uuid, p_listing_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seller_id uuid;
  v_status text;
  v_inserted integer := 0;
begin
  select seller_id, status into v_seller_id, v_status
  from public.listings
  where id = p_listing_id;

  if not found or v_status <> 'active' then
    raise exception 'listing_not_active' using errcode='55000';
  end if;
  if v_seller_id = p_viewer_id then
    return false;
  end if;

  insert into public.listing_views(listing_id, viewer_id)
  values(p_listing_id, p_viewer_id)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    update public.listings set views = views + 1 where id = p_listing_id;
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.record_listing_view_atomic(uuid,uuid) from public, anon, authenticated;
grant execute on function public.record_listing_view_atomic(uuid,uuid) to service_role;
