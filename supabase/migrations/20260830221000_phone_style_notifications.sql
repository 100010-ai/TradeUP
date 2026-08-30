create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  href text,
  event_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_event_unique unique(user_id, event_key)
);

create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant all on public.notifications to service_role;

create or replace function public.notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_thread public.chat_threads%rowtype;
  v_recipient uuid;
  v_sender_name text;
begin
  select * into v_thread from public.chat_threads where id = new.thread_id;
  if not found then return new; end if;
  v_recipient := case when new.sender_id = v_thread.buyer_id then v_thread.seller_id else v_thread.buyer_id end;
  select coalesce(nullif(first_name,''),'Пользователь') into v_sender_name from public.profiles where id = new.sender_id;
  insert into public.notifications(user_id,type,title,body,href,event_key)
  values(v_recipient,'message',coalesce(v_sender_name,'Пользователь'),left(new.body,160),'/messages/'||new.thread_id::text,'chat:'||new.id::text)
  on conflict(user_id,event_key) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_notify_chat_message on public.chat_messages;
create trigger trg_notify_chat_message after insert on public.chat_messages for each row execute function public.notify_chat_message();

create or replace function public.notify_offer_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings%rowtype;
  v_buyer_name text;
begin
  select * into v_listing from public.listings where id = new.listing_id;
  if not found then return new; end if;

  if tg_op = 'INSERT' and new.status = 'pending' then
    select coalesce(nullif(first_name,''),'Покупатель') into v_buyer_name from public.profiles where id = new.buyer_id;
    insert into public.notifications(user_id,type,title,body,href,event_key)
    values(v_listing.seller_id,'offer','Новое предложение',coalesce(v_buyer_name,'Покупатель')||' предлагает '||trim(to_char(new.amount,'FM9999999990'))||' ₽ за '||left(v_listing.title,72),'/deals','offer:'||new.id::text||':pending')
    on conflict(user_id,event_key) do nothing;
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'declined' then
    insert into public.notifications(user_id,type,title,body,href,event_key)
    values(new.buyer_id,'offer','Предложение отклонено',left(v_listing.title,110),'/deals','offer:'||new.id::text||':declined')
    on conflict(user_id,event_key) do nothing;
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'expired' then
    insert into public.notifications(user_id,type,title,body,href,event_key)
    values(new.buyer_id,'offer','Предложение больше не активно',left(v_listing.title,110),'/deals','offer:'||new.id::text||':expired')
    on conflict(user_id,event_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_offer_event on public.offers;
create trigger trg_notify_offer_event after insert or update of status on public.offers for each row execute function public.notify_offer_event();

create or replace function public.notify_trade_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
begin
  select title into v_title from public.listings where id = new.listing_id;
  v_title := coalesce(v_title,'Товар');
  insert into public.notifications(user_id,type,title,body,href,event_key)
  values
    (new.buyer_id,'purchase','Покупка завершена',left(v_title,96)||' · '||trim(to_char(new.amount,'FM9999999990'))||' ₽','/deals','trade:'||new.id::text||':buyer'),
    (new.seller_id,'sale','Товар продан',left(v_title,96)||' · '||trim(to_char(new.amount,'FM9999999990'))||' ₽','/deals','trade:'||new.id::text||':seller')
  on conflict(user_id,event_key) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_notify_trade_event on public.trades;
create trigger trg_notify_trade_event after insert on public.trades for each row execute function public.notify_trade_event();

create or replace function public.notify_support_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  if new.sender_type not in ('admin','system') then return new; end if;
  select user_id into v_user_id from public.support_tickets where id = new.ticket_id;
  if v_user_id is null then return new; end if;
  insert into public.notifications(user_id,type,title,body,href,event_key)
  values(v_user_id,'support',case when new.sender_type='admin' then 'Поддержка TradeUP' else 'Статус поддержки' end,left(new.body,160),'/messages/support','support:'||new.id::text)
  on conflict(user_id,event_key) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_notify_support_message on public.support_messages;
create trigger trg_notify_support_message after insert on public.support_messages for each row execute function public.notify_support_message();

create or replace function public.prune_old_notifications(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.notifications
  where user_id = p_user_id
    and id in (
      select id from public.notifications
      where user_id = p_user_id
      order by created_at desc
      offset 200
    );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
