create or replace function public.grant_starter_items(p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_granted_at timestamptz;
  v_inserted integer := 0;
  v_categories text[] := '{}';
  r record;
begin
  select starter_pack_granted_at into v_granted_at
  from public.profiles
  where id = p_profile_id
  for update;

  if not found then
    raise exception 'profile_not_found' using errcode='22023';
  end if;
  if v_granted_at is not null then
    return 0;
  end if;

  for r in
    select it.id, it.base_value, it.category_id
    from public.item_types it
    left join public.inventory_items ii on ii.item_type_id = it.id
    where it.is_active = true
      and it.base_value between 2500 and 50000
    group by it.id, it.base_value, it.category_id
    order by count(ii.id) asc,
             hashtextextended(it.id::text || ':' || p_profile_id::text, 0)
  loop
    if r.category_id = any(v_categories) then
      continue;
    end if;

    insert into public.inventory_items(owner_id, item_type_id, condition, acquired_price)
    values (
      p_profile_id,
      r.id,
      floor(68 + random() * 29)::smallint,
      round((r.base_value * (0.52 + random() * 0.23))::numeric, 0)
    );

    v_categories := array_append(v_categories, r.category_id);
    v_inserted := v_inserted + 1;
    exit when v_inserted >= 3;
  end loop;

  if v_inserted < 3 then
    for r in
      select it.id, it.base_value, it.category_id
      from public.item_types it
      left join public.inventory_items ii on ii.item_type_id = it.id
      where it.is_active = true
        and it.base_value between 2500 and 50000
        and not exists (
          select 1 from public.inventory_items own
          where own.owner_id = p_profile_id and own.item_type_id = it.id
        )
      group by it.id, it.base_value, it.category_id
      order by count(ii.id) asc,
               hashtextextended(it.id::text || ':fallback:' || p_profile_id::text, 0)
    loop
      insert into public.inventory_items(owner_id, item_type_id, condition, acquired_price)
      values (
        p_profile_id,
        r.id,
        floor(68 + random() * 29)::smallint,
        round((r.base_value * (0.52 + random() * 0.23))::numeric, 0)
      );
      v_inserted := v_inserted + 1;
      exit when v_inserted >= 3;
    end loop;
  end if;

  update public.profiles
  set starter_pack_granted_at = now(), updated_at = now()
  where id = p_profile_id;

  return v_inserted;
end;
$$;
