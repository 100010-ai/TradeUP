create or replace function public.notify_tradeup_announcement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_active is not true then return new; end if;

  insert into public.notifications(user_id,type,title,body,href,event_key)
  select p.id,
         'tradeup',
         'TradeUP',
         left(new.body,160),
         '/messages/tradeup',
         'announcement:'||new.id::text
  from public.profiles p
  on conflict(user_id,event_key) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_tradeup_announcement on public.tradeup_announcements;
create trigger trg_notify_tradeup_announcement
  after insert on public.tradeup_announcements
  for each row execute function public.notify_tradeup_announcement();
