revoke execute on function public.notify_chat_message() from public, anon, authenticated;
revoke execute on function public.notify_offer_event() from public, anon, authenticated;
revoke execute on function public.notify_trade_event() from public, anon, authenticated;
revoke execute on function public.notify_support_message() from public, anon, authenticated;
revoke execute on function public.notify_tradeup_announcement() from public, anon, authenticated;
revoke execute on function public.prune_old_notifications(uuid) from public, anon, authenticated;

grant execute on function public.prune_old_notifications(uuid) to service_role;
