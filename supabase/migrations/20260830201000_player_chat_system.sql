create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz,
  last_message_preview text not null default '',
  last_sender_id uuid references public.profiles(id) on delete set null,
  buyer_read_at timestamptz,
  seller_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_threads_participants_different check (buyer_id <> seller_id),
  constraint chat_threads_preview_length check (char_length(last_message_preview) <= 180),
  constraint chat_threads_unique_listing_buyer unique (listing_id, buyer_id)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint chat_messages_body_length check (char_length(btrim(body)) between 1 and 2000)
);

create index chat_threads_buyer_updated_idx on public.chat_threads (buyer_id, updated_at desc);
create index chat_threads_seller_updated_idx on public.chat_threads (seller_id, updated_at desc);
create index chat_threads_listing_idx on public.chat_threads (listing_id);
create index chat_messages_thread_created_idx on public.chat_messages (thread_id, created_at asc);
create index chat_messages_sender_created_idx on public.chat_messages (sender_id, created_at desc);

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
revoke all on table public.chat_threads from anon, authenticated;
revoke all on table public.chat_messages from anon, authenticated;

create or replace function public.sync_chat_thread_after_message()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.chat_threads
  set last_message_at = new.created_at,
      last_message_preview = left(new.body, 180),
      last_sender_id = new.sender_id,
      updated_at = new.created_at
  where id = new.thread_id;
  return new;
end;
$$;

create trigger chat_messages_sync_thread
  after insert on public.chat_messages
  for each row execute function public.sync_chat_thread_after_message();
