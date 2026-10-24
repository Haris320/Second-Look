-- Run after 2026-10-24-referrals.sql. Whop sign-in can now create profiles without purchases.
-- Self-referrals qualify on the first purchase. Existing rewards/history are unchanged.
create or replace function public.record_referral_purchase(p_scope text,p_order uuid,p_payment text,p_buyer text,p_email text)
returns void language plpgsql security invoker set search_path=public as $$
declare o public.orders; ref public.referral_profiles; returning_buyer boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_scope||':'||p_buyer,0));
 select * into o from public.orders where id=p_order for update;
 if o.whop_payment_id is distinct from p_payment or o.paid_at is null then raise exception 'Unverified order'; end if;
 if o.buyer_whop_user_id is not null and o.buyer_whop_user_id<>p_buyer then raise exception 'Buyer mismatch'; end if;
 update public.orders set buyer_whop_user_id=p_buyer where id=p_order;
 insert into public.referral_profiles(scope,whop_user_id,email) values(p_scope,p_buyer,lower(trim(p_email))) on conflict(scope,whop_user_id) do nothing;
 if exists(select 1 from public.referral_purchases where scope=p_scope and payment_id=p_payment) then return; end if;
 returning_buyer := exists(select 1 from public.referral_purchases where scope=p_scope and buyer_id=p_buyer)
   or exists(select 1 from public.orders where id<>p_order and paid_at is not null
      and (buyer_whop_user_id=p_buyer or lower(trim(email))=lower(trim(p_email))));
 insert into public.referral_purchases(scope,payment_id,buyer_id,order_id) values(p_scope,p_payment,p_buyer,p_order);
 select * into ref from public.referral_profiles where id=o.referral_profile_id and scope=p_scope;
 if ref.id is null or returning_buyer then return; end if;
 insert into public.referral_rewards(scope,profile_id,order_id,payment_id,buyer_id)
 values(p_scope,ref.id,p_order,p_payment,p_buyer) on conflict do nothing;
end;
$$;

revoke all on function public.record_referral_purchase(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.record_referral_purchase(text,uuid,text,text,text) to service_role;
