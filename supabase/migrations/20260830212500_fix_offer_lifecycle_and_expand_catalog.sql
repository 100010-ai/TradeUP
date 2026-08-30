alter table public.offers drop constraint if exists offers_listing_id_buyer_id_status_key;
drop index if exists public.offers_listing_id_buyer_id_status_key;
create unique index if not exists offers_one_pending_per_buyer_listing_idx
  on public.offers(listing_id, buyer_id) where status = 'pending';

create or replace function public.create_offer_atomic(p_buyer_id uuid, p_listing_id uuid, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings%rowtype;
  v_balance numeric;
  v_offer_id uuid;
begin
  select * into v_listing from public.listings where id=p_listing_id for share;
  if not found or v_listing.status <> 'active' then raise exception 'listing_not_active' using errcode='55000'; end if;
  if v_listing.seller_id = p_buyer_id then raise exception 'cannot_offer_own_listing' using errcode='22023'; end if;
  if p_amount is null or p_amount <= 0 or p_amount >= v_listing.price or p_amount < round(v_listing.price * 0.50, 0) then
    raise exception 'invalid_offer_amount' using errcode='22023';
  end if;
  select balance into v_balance from public.profiles where id=p_buyer_id;
  if v_balance is null then raise exception 'buyer_not_found' using errcode='22023'; end if;
  if v_balance < p_amount then raise exception 'insufficient_funds' using errcode='22003'; end if;

  update public.offers
    set amount=round(p_amount,0), updated_at=now()
    where listing_id=p_listing_id and buyer_id=p_buyer_id and status='pending'
    returning id into v_offer_id;

  if found then
    insert into public.market_events(event_type,listing_id,actor_id,payload)
    values('offer_updated',p_listing_id,p_buyer_id,jsonb_build_object('amount',round(p_amount,0),'status','pending'));
    return v_offer_id;
  end if;

  insert into public.offers(listing_id,buyer_id,amount,status,updated_at)
  values(p_listing_id,p_buyer_id,round(p_amount,0),'pending',now())
  returning id into v_offer_id;

  insert into public.market_events(event_type,listing_id,actor_id,payload)
  values('offer_created',p_listing_id,p_buyer_id,jsonb_build_object('amount',round(p_amount,0)));
  return v_offer_id;
end;
$$;

create or replace function public.cancel_listing_atomic(p_profile_id uuid, p_listing_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item uuid;
  v_seller uuid;
  v_status text;
begin
  select inventory_item_id, seller_id, status into v_item, v_seller, v_status
  from public.listings where id = p_listing_id for update;

  if not found or v_seller <> p_profile_id then raise exception 'listing_not_owned' using errcode = '42501'; end if;
  if v_status not in ('active','reserved') then return false; end if;

  update public.listings set status='cancelled', updated_at=now() where id=p_listing_id;
  update public.inventory_items set is_locked=false where id=v_item;
  update public.offers set status='expired', updated_at=now() where listing_id=p_listing_id and status='pending';
  insert into public.market_events(event_type, listing_id, actor_id, payload)
  values ('listing_updated', p_listing_id, p_profile_id, jsonb_build_object('status','cancelled'));
  return true;
end;
$$;

revoke all on function public.create_offer_atomic(uuid,uuid,numeric) from public, anon, authenticated;
revoke all on function public.cancel_listing_atomic(uuid,uuid) from public, anon, authenticated;
grant execute on function public.create_offer_atomic(uuid,uuid,numeric) to service_role;
grant execute on function public.cancel_listing_atomic(uuid,uuid) to service_role;

create or replace function public.touch_support_ticket_from_message()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  update public.support_tickets
  set last_message_at = new.created_at,
      last_message_preview = left(new.body, 180),
      last_sender_type = new.sender_type,
      updated_at = new.created_at,
      user_read_at = case when new.sender_type = 'user' then new.created_at else user_read_at end,
      admin_read_at = case when new.sender_type = 'admin' then new.created_at else admin_read_at end
  where id = new.ticket_id;
  return new;
end;
$$;
revoke all on function public.touch_support_ticket_from_message() from public, anon, authenticated;
grant execute on function public.touch_support_ticket_from_message() to service_role;

insert into public.item_types
  (category_id,slug,name,brand,base_value,volatility,image_url,image_source_url,image_credit,image_license,is_active)
values
('phones','nothing-phone-2','Nothing Phone (2)','Nothing',32000,0.11,'https://commons.wikimedia.org/wiki/Special:Redirect/file/Nothing_Phone_2.png','https://commons.wikimedia.org/wiki/File:Nothing_Phone_2.png','WikiScis','CC BY-SA 4.0',true),
('computers','framework-laptop-13','Framework Laptop 13 AMD','Framework',78000,0.09,'https://commons.wikimedia.org/wiki/Special:Redirect/file/Framework_laptop_AMD_13.jpg','https://commons.wikimedia.org/wiki/File:Framework_laptop_AMD_13.jpg','Thcipriani','CC BY-SA 4.0',true),
('consoles','meta-quest-3','Meta Quest 3','Meta',52000,0.12,'https://commons.wikimedia.org/wiki/Special:Redirect/file/Meta_Quest_3_-_1.jpg','https://commons.wikimedia.org/wiki/File:Meta_Quest_3_-_1.jpg','Kyu3a','CC BY-SA 4.0',true),
('consoles','nintendo-switch-lite','Nintendo Switch Lite','Nintendo',18000,0.10,'https://commons.wikimedia.org/wiki/Special:Redirect/file/Nintendo_Switch_Lite_(turquoise)_-_1.jpg','https://commons.wikimedia.org/wiki/File:Nintendo_Switch_Lite_(turquoise)_-_1.jpg','KKPCW','CC BY-SA 4.0',true),
('sneakers','adidas-samba','Adidas Samba','Adidas',13500,0.10,'https://commons.wikimedia.org/wiki/Special:Redirect/file/Adidas_Samba_shoes.png','https://commons.wikimedia.org/wiki/File:Adidas_Samba_shoes.png','Sroc','CC BY-SA 3.0',true),
('sneakers','converse-chuck-taylor','Converse Chuck Taylor','Converse',9000,0.09,'https://commons.wikimedia.org/wiki/Special:Redirect/file/ConverseWhiteChucks.jpg','https://commons.wikimedia.org/wiki/File:ConverseWhiteChucks.jpg','Alx 91','CC BY-SA 2.5',true),
('watches','casio-f91w','Casio F-91W','Casio',3500,0.06,'https://commons.wikimedia.org/wiki/Special:Redirect/file/Casio_F-91W.jpg','https://commons.wikimedia.org/wiki/File:Casio_F-91W.jpg','NotFromUtrecht','CC BY-SA 3.0',true),
('collectibles','rubiks-cube-vintage','Rubik’s Cube Vintage','Rubik’s',4000,0.14,'https://commons.wikimedia.org/wiki/Special:Redirect/file/Rubik%27s_Cube.jpg','https://commons.wikimedia.org/wiki/File:Rubik%27s_Cube.jpg','Wikimedia Commons contributor','See source page',true),
('collectibles','game-boy-color','Game Boy Color','Nintendo',14000,0.16,'https://commons.wikimedia.org/wiki/Special:Redirect/file/Wikipedia_gameboycolor.jpg','https://commons.wikimedia.org/wiki/File:Wikipedia_gameboycolor.jpg','JCD1981NL','Public domain',true)
on conflict (slug) do update set
  category_id=excluded.category_id,name=excluded.name,brand=excluded.brand,base_value=excluded.base_value,
  volatility=excluded.volatility,image_url=excluded.image_url,image_source_url=excluded.image_source_url,
  image_credit=excluded.image_credit,image_license=excluded.image_license,is_active=true;

insert into public.price_history(item_type_id,price,recorded_at)
select it.id,it.base_value,now()
from public.item_types it
where it.slug in ('nothing-phone-2','framework-laptop-13','meta-quest-3','nintendo-switch-lite','adidas-samba','converse-chuck-taylor','casio-f91w','rubiks-cube-vintage','game-boy-color')
and not exists (select 1 from public.price_history ph where ph.item_type_id=it.id);

insert into public.support_topics(id,title,auto_reply,sort_order,is_active) values
('account','Аккаунт и вход','Если Mini App не узнаёт аккаунт, полностью закрой TradeUP в Telegram и открой снова через @TradeUpGame_Bot. Если профиль всё равно не загрузился, позови поддержку.',15,true),
('balance','Баланс и комиссия','Баланс меняется только после серверно подтверждённых сделок. Комиссия TradeUP составляет 4% и удерживается с продавца после продажи. Если цифры не сходятся, позови поддержку.',25,true),
('messages','Чаты и сообщения','Чаты привязаны к конкретным объявлениям. Если диалог не открывается или сообщение не отправляется, проверь доступность объявления и перезапусти Mini App. Если не помогло, позови поддержку.',35,true),
('security','Безопасность сделки','Не переводите деньги и не договаривайтесь о расчётах вне TradeUP. Внутриигровая покупка должна проходить только через кнопку покупки или подтверждённый торг.',45,true)
on conflict (id) do update set title=excluded.title,auto_reply=excluded.auto_reply,sort_order=excluded.sort_order,is_active=true,updated_at=now();

insert into public.tradeup_announcements(body,published_at)
select v.body, v.published_at
from (values
('В TradeUP нет системных продавцов и поддельных лотов. Все объявления на рынке создают реальные игроки.', now() - interval '4 minutes'),
('Торг работает прямо в карточке товара: предложи цену ниже текущей, продавец сможет принять или отклонить её.', now() - interval '3 minutes'),
('Комиссия сделки составляет 4% и удерживается с продавца только после успешной продажи.', now() - interval '2 minutes'),
('В разделе «Чаты» теперь всегда доступны официальный канал TradeUP и поддержка с быстрыми ответами и вызовом оператора.', now() - interval '1 minute'),
('Каталог расширен новыми смартфонами, техникой, консолями, кроссовками, часами и коллекционными предметами.', now())
) as v(body,published_at)
where not exists (select 1 from public.tradeup_announcements a where a.body=v.body);
