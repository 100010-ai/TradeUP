create or replace view public.profile_trader_identity with (security_invoker=true) as
with seller_trades as (
  select tr.id,tr.seller_id,tr.amount,tr.fee,tr.seller_profit,tr.completed_at,ii.item_type_id,it.category_id,it.brand,
         greatest(0,tr.amount-tr.fee-tr.seller_profit) as cost_basis,
         extract(epoch from (tr.completed_at-l.created_at)) as sell_seconds
  from public.trades tr
  join public.inventory_items ii on ii.id=tr.item_id
  join public.item_types it on it.id=ii.item_type_id
  left join public.listings l on l.id=tr.listing_id
), category_stats as (
  select seller_id,category_id,count(*) trade_count,sum(seller_profit) profit
  from seller_trades group by seller_id,category_id
), ranked_category as (
  select *,row_number() over(partition by seller_id order by trade_count desc,profit desc,category_id) rn from category_stats
), brand_stats as (
  select seller_id,brand,count(*) trade_count,sum(seller_profit) profit
  from seller_trades where brand is not null group by seller_id,brand
), ranked_brand as (
  select *,row_number() over(partition by seller_id order by trade_count desc,profit desc,brand) rn from brand_stats
), totals as (
  select seller_id,count(*) sales,
         round(avg(case when cost_basis>0 then seller_profit*100.0/cost_basis end),2) avg_margin_pct,
         max(case when cost_basis>0 then seller_profit*100.0/cost_basis end) best_margin_pct,
         max(seller_profit) best_profit,
         round(avg(sell_seconds)) avg_sell_seconds,
         count(distinct item_type_id) unique_item_types
  from seller_trades group by seller_id
)
select p.id profile_id,
       coalesce(t.sales,0) sales,
       coalesce(t.avg_margin_pct,0) avg_margin_pct,
       coalesce(t.best_margin_pct,0) best_margin_pct,
       coalesce(t.best_profit,0) best_profit,
       t.avg_sell_seconds,
       coalesce(t.unique_item_types,0) unique_item_types,
       rc.category_id specialization_category,
       rc.trade_count specialization_trades,
       rb.brand top_brand,
       rb.trade_count top_brand_trades,
       case
         when coalesce(t.sales,0)>=100 then 'Master Dealer'
         when coalesce(t.sales,0)>=50 then 'Pro Dealer'
         when coalesce(t.sales,0)>=20 then 'Dealer III'
         when coalesce(t.sales,0)>=8 then 'Dealer II'
         when coalesce(t.sales,0)>=3 then 'Dealer I'
         else 'New Trader'
       end trader_rank
from public.profiles p
left join totals t on t.seller_id=p.id
left join ranked_category rc on rc.seller_id=p.id and rc.rn=1
left join ranked_brand rb on rb.seller_id=p.id and rb.rn=1;
revoke all on public.profile_trader_identity from anon,authenticated;

grant select on public.profile_trader_identity to service_role;
