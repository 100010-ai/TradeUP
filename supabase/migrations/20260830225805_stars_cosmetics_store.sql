create table if not exists public.cosmetics_catalog (
  id text primary key,
  kind text not null check (kind in ('frame','name_style','title','profile_theme')),
  name text not null,
  description text not null default '',
  stars_price integer not null check (stars_price > 0),
  rarity text not null default 'common' check (rarity in ('common','rare','epic','legendary')),
  style_key text not null unique,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.star_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cosmetic_id text not null references public.cosmetics_catalog(id) on delete restrict,
  invoice_payload text not null unique,
  stars_amount integer not null check (stars_amount > 0),
  status text not null default 'pending' check (status in ('pending','paid','refunded','cancelled')),
  telegram_payment_charge_id text unique,
  telegram_user_id bigint,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  refunded_at timestamptz
);

create table if not exists public.user_cosmetics (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cosmetic_id text not null references public.cosmetics_catalog(id) on delete cascade,
  purchase_id uuid references public.star_purchases(id) on delete set null,
  source text not null default 'stars' check (source in ('stars','grant')),
  acquired_at timestamptz not null default now(),
  primary key (user_id, cosmetic_id)
);

create table if not exists public.equipped_cosmetics (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  frame_id text references public.cosmetics_catalog(id) on delete set null,
  name_style_id text references public.cosmetics_catalog(id) on delete set null,
  title_id text references public.cosmetics_catalog(id) on delete set null,
  profile_theme_id text references public.cosmetics_catalog(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists star_purchases_user_created_idx on public.star_purchases(user_id, created_at desc);
create index if not exists star_purchases_status_created_idx on public.star_purchases(status, created_at desc);
create index if not exists user_cosmetics_user_acquired_idx on public.user_cosmetics(user_id, acquired_at desc);

alter table public.cosmetics_catalog enable row level security;
alter table public.star_purchases enable row level security;
alter table public.user_cosmetics enable row level security;
alter table public.equipped_cosmetics enable row level security;

revoke all on public.cosmetics_catalog from anon, authenticated;
revoke all on public.star_purchases from anon, authenticated;
revoke all on public.user_cosmetics from anon, authenticated;
revoke all on public.equipped_cosmetics from anon, authenticated;

insert into public.cosmetics_catalog (id,kind,name,description,stars_price,rarity,style_key,sort_order) values
('frame_amber_edge','frame','Amber Edge','Тонкая янтарная рамка с аккуратными угловыми акцентами.',45,'common','frame-amber-edge',10),
('frame_frost','frame','Frost','Холодная серебристая рамка без лишнего блеска.',65,'rare','frame-frost',20),
('frame_carbon','frame','Carbon','Графитовая рамка с тихой карбоновой фактурой.',80,'rare','frame-carbon',30),
('frame_aurora','frame','Aurora','Мягкий холодный градиент по краю аватара.',120,'epic','frame-aurora',40),
('frame_black_label','frame','Black Label','Чёрный премиальный контур с точными золотыми насечками.',160,'legendary','frame-black-label',50),
('name_signal','name_style','Signal','Чистое имя с янтарным акцентом.',35,'common','name-signal',60),
('name_chrome','name_style','Chrome','Сдержанный металлический градиент имени.',55,'rare','name-chrome',70),
('name_prism','name_style','Prism','Холодный многоцветный градиент без анимации.',95,'epic','name-prism',80),
('title_dealer','title','Перекуп','Компактный титул для профиля.',25,'common','title-dealer',90),
('title_collector','title','Коллекционер','Титул для тех, кто любит собирать редкие вещи.',35,'common','title-collector',100),
('title_negotiator','title','Переговорщик','Титул для любителей торга.',45,'rare','title-negotiator',110),
('title_early','title','Early Dealer','Редкий ранний титул TradeUP.',70,'epic','title-early',120),
('theme_obsidian','profile_theme','Obsidian','Глубокая чёрная шапка профиля с мягким светом.',75,'rare','theme-obsidian',130),
('theme_graphite','profile_theme','Graphite','Строгая графитовая шапка с тонкой сеткой.',90,'rare','theme-graphite',140),
('theme_amber_studio','profile_theme','Amber Studio','Чёрная шапка с очень аккуратным янтарным свечением.',120,'epic','theme-amber-studio',150),
('theme_midnight_glass','profile_theme','Midnight Glass','Холодная ночная шапка с эффектом затемнённого стекла.',150,'legendary','theme-midnight-glass',160)
on conflict (id) do update set
  kind=excluded.kind,name=excluded.name,description=excluded.description,stars_price=excluded.stars_price,
  rarity=excluded.rarity,style_key=excluded.style_key,sort_order=excluded.sort_order,updated_at=now();
