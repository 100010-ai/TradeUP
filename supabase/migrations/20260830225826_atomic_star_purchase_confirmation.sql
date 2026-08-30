create or replace function public.confirm_star_cosmetic_purchase(
  p_invoice_payload text,
  p_telegram_user_id bigint,
  p_stars_amount integer,
  p_charge_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase public.star_purchases%rowtype;
  v_profile public.profiles%rowtype;
begin
  select * into v_purchase
  from public.star_purchases
  where invoice_payload = p_invoice_payload
  for update;

  if not found then raise exception 'purchase_not_found'; end if;

  select * into v_profile from public.profiles where id = v_purchase.user_id;
  if not found or v_profile.telegram_id <> p_telegram_user_id then raise exception 'purchase_user_mismatch'; end if;
  if v_purchase.stars_amount <> p_stars_amount then raise exception 'purchase_amount_mismatch'; end if;

  if v_purchase.status = 'paid' then
    if v_purchase.telegram_payment_charge_id is distinct from p_charge_id then raise exception 'purchase_charge_mismatch'; end if;
    return v_purchase.cosmetic_id;
  end if;
  if v_purchase.status <> 'pending' then raise exception 'purchase_not_pending'; end if;

  if exists(select 1 from public.star_purchases where telegram_payment_charge_id = p_charge_id and id <> v_purchase.id) then
    raise exception 'charge_already_used';
  end if;

  update public.star_purchases
  set status='paid', telegram_payment_charge_id=p_charge_id, telegram_user_id=p_telegram_user_id, paid_at=now()
  where id=v_purchase.id;

  insert into public.user_cosmetics(user_id, cosmetic_id, purchase_id, source)
  values(v_purchase.user_id, v_purchase.cosmetic_id, v_purchase.id, 'stars')
  on conflict(user_id, cosmetic_id) do nothing;

  return v_purchase.cosmetic_id;
end;
$$;

revoke all on function public.confirm_star_cosmetic_purchase(text,bigint,integer,text) from public, anon, authenticated;
grant execute on function public.confirm_star_cosmetic_purchase(text,bigint,integer,text) to service_role;
