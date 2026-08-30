create index if not exists favorites_profile_created_idx
  on public.favorites(profile_id, created_at desc);

create index if not exists offers_buyer_updated_idx
  on public.offers(buyer_id, updated_at desc);

create index if not exists profiles_last_seen_idx
  on public.profiles(last_seen_at desc);

create index if not exists profiles_leaderboard_idx
  on public.profiles(total_profit desc, deals_count desc, rating desc)
  where deals_count > 0 or total_profit <> 0;
