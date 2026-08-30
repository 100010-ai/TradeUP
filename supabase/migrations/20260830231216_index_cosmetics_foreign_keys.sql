create index if not exists star_purchases_cosmetic_id_idx on public.star_purchases(cosmetic_id);
create index if not exists user_cosmetics_cosmetic_id_idx on public.user_cosmetics(cosmetic_id);
create index if not exists user_cosmetics_purchase_id_idx on public.user_cosmetics(purchase_id) where purchase_id is not null;
create index if not exists equipped_cosmetics_frame_id_idx on public.equipped_cosmetics(frame_id) where frame_id is not null;
create index if not exists equipped_cosmetics_name_style_id_idx on public.equipped_cosmetics(name_style_id) where name_style_id is not null;
create index if not exists equipped_cosmetics_title_id_idx on public.equipped_cosmetics(title_id) where title_id is not null;
create index if not exists equipped_cosmetics_profile_theme_id_idx on public.equipped_cosmetics(profile_theme_id) where profile_theme_id is not null;
