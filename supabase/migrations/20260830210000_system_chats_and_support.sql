create table if not exists public.tradeup_announcements (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  is_active boolean not null default true,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.support_topics (
  id text primary key,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  auto_reply text not null check (char_length(btrim(auto_reply)) between 1 and 2000),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic_id text references public.support_topics(id) on delete set null,
  status text not null default 'bot' check (status in ('bot','waiting','active','closed')),
  last_message_at timestamptz,
  last_message_preview text not null default '' check (char_length(last_message_preview) <= 180),
  last_sender_type text check (last_sender_type is null or last_sender_type in ('user','bot','admin','system')),
  user_read_at timestamptz,
  admin_read_at timestamptz,
  requested_at timestamptz,
  joined_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists support_tickets_one_open_per_user_idx on public.support_tickets(user_id) where status in ('bot','waiting','active');
create index if not exists support_tickets_status_updated_idx on public.support_tickets(status, updated_at desc);
create index if not exists support_tickets_user_updated_idx on public.support_tickets(user_id, updated_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_type text not null check (sender_type in ('user','bot','admin','system')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket_created_idx on public.support_messages(ticket_id, created_at);

create table if not exists public.system_chat_reads (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  tradeup_read_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_support_ticket_from_message()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  update public.support_tickets
  set last_message_at = new.created_at,
      last_message_preview = left(new.body, 180),
      last_sender_type = new.sender_type,
      updated_at = new.created_at,
      user_read_at = case when new.sender_type = 'user' then new.created_at else user_read_at end,
      admin_read_at = case when new.sender_type in ('admin','system') then new.created_at else admin_read_at end
  where id = new.ticket_id;
  return new;
end;
$$;

drop trigger if exists support_messages_touch_ticket on public.support_messages;
create trigger support_messages_touch_ticket after insert on public.support_messages for each row execute function public.touch_support_ticket_from_message();

insert into public.support_topics (id,title,auto_reply,sort_order) values
('purchase','Покупка не проходит','Проверь баланс и статус объявления. Если деньги есть, а покупка всё равно не проходит, позови поддержку и мы посмотрим сделку вручную.',10),
('listing','Проблема с объявлением','Если объявление не публикуется или отображается неверно, проверь выбранный предмет, цену и попробуй открыть страницу публикации заново. Если не помогло, позови поддержку.',20),
('trade','Сделка или предмет','Если предмет не появился после сделки или статус сделки выглядит неверно, не создавай повторную покупку. Позови поддержку, чтобы мы проверили транзакцию.',30),
('user','Проблема с пользователем','Если другой игрок нарушает правила или мешает сделке, опиши ситуацию. При необходимости позови поддержку, и оператор подключится к диалогу.',40),
('other','Другое','Опиши вопрос через кнопку вызова поддержки. Оператор увидит обращение и подключится, как только сможет.',50)
on conflict (id) do update set title=excluded.title,auto_reply=excluded.auto_reply,sort_order=excluded.sort_order,is_active=true,updated_at=now();

insert into public.tradeup_announcements (body)
select 'Добро пожаловать в TradeUP. Здесь будут появляться новости, обновления и важные сообщения проекта.'
where not exists (select 1 from public.tradeup_announcements);

alter table public.tradeup_announcements enable row level security;
alter table public.support_topics enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.system_chat_reads enable row level security;
revoke all on public.tradeup_announcements from anon, authenticated, public;
revoke all on public.support_topics from anon, authenticated, public;
revoke all on public.support_tickets from anon, authenticated, public;
revoke all on public.support_messages from anon, authenticated, public;
revoke all on public.system_chat_reads from anon, authenticated, public;
revoke all on function public.touch_support_ticket_from_message() from public, anon, authenticated;
grant all on public.tradeup_announcements to service_role;
grant all on public.support_topics to service_role;
grant all on public.support_tickets to service_role;
grant all on public.support_messages to service_role;
grant all on public.system_chat_reads to service_role;
grant execute on function public.touch_support_ticket_from_message() to service_role;
