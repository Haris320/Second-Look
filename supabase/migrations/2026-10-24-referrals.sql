-- Fixed $3 referrals. Run after the existing Second Look migrations.
create table if not exists public.referral_profiles (
 id uuid primary key default gen_random_uuid(),
 scope text not null,
 whop_user_id text not null,
 email text not null,
 code text not null unique default replace(gen_random_uuid()::text,'-',''),
 created_at timestamptz not null default now(),
 unique(scope,whop_user_id)
);
alter table public.orders add column if not exists referral_profile_id uuid references public.referral_profiles(id);
alter table public.orders add column if not exists buyer_whop_user_id text;
create table if not exists public.referral_purchases (
 scope text not null,
 payment_id text not null,
 buyer_id text not null,
 order_id uuid not null references public.orders(id),
 created_at timestamptz not null default now(),
 primary key(scope,payment_id)
);
create index if not exists referral_purchases_buyer on public.referral_purchases(scope,buyer_id);
create table if not exists public.referral_rewards (
 id uuid primary key default gen_random_uuid(),
 scope text not null,
 profile_id uuid not null references public.referral_profiles(id),
 order_id uuid not null unique references public.orders(id),
 payment_id text not null,
 buyer_id text not null,
 amount_cents integer not null default 300 check(amount_cents=300),
 state text not null default 'pending' check(state in ('pending','transferring','paid','canceled','needs_attention','recovery_needed')),
 available_at timestamptz not null default now()+interval '30 days',
 transfer_id text unique,
 invalidated_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 lease_token uuid,
 lease_until timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(scope,payment_id), unique(scope,buyer_id)
);
create index if not exists referral_rewards_due on public.referral_rewards(scope,state,available_at);

-- All identity inputs come from a freshly retrieved, verified Whop payment.
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
 if ref.id is null or returning_buyer or ref.whop_user_id=p_buyer or ref.email=lower(trim(p_email)) then return; end if;
 insert into public.referral_rewards(scope,profile_id,order_id,payment_id,buyer_id)
 values(p_scope,ref.id,p_order,p_payment,p_buyer) on conflict do nothing;
end;
$$;

create or replace function public.claim_referral_reward(p_id uuid,p_scope text,p_token uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare r public.referral_rewards;
begin
 select * into r from public.referral_rewards where id=p_id and scope=p_scope for update;
 if r.id is null or r.state not in ('pending','transferring') or r.invalidated_at is not null
    or r.available_at>now() or r.lease_until>now() then return null; end if;
 update public.referral_rewards set lease_token=p_token,lease_until=now()+interval '5 minutes',updated_at=now()
 where id=p_id returning * into r;
 return to_jsonb(r);
end;
$$;

create or replace function public.invalidate_referral_reward(p_scope text,p_payment text,p_reason text)
returns void language plpgsql security invoker set search_path=public as $$
begin
 update public.referral_rewards set invalidated_at=coalesce(invalidated_at,now()),
 state=case when state in ('pending','canceled') then 'canceled' else 'recovery_needed' end,
 last_error=p_reason,updated_at=now() where scope=p_scope and payment_id=p_payment;
end;
$$;

-- Serializes webhook and worker updates; an invalidation can never be overwritten by a success.
create or replace function public.finish_referral_transfer(p_id uuid,p_transfer text,p_status text)
returns void language plpgsql security invoker set search_path=public as $$
declare r public.referral_rewards;
begin
 select * into r from public.referral_rewards where id=p_id for update;
 if r.id is null or (r.transfer_id is not null and r.transfer_id<>p_transfer) then raise exception 'Transfer mismatch'; end if;
 if r.state='pending' then raise exception 'Transfer was not initiated'; end if;
 update public.referral_rewards set transfer_id=p_transfer,
 state=case when invalidated_at is not null then 'recovery_needed'
   when state='paid' or p_status='succeeded' then 'paid'
   when p_status='failed' then 'needs_attention' else 'transferring' end,
 lease_token=null,lease_until=null,updated_at=now() where id=p_id;
end;
$$;

alter table public.referral_profiles enable row level security;
alter table public.referral_purchases enable row level security;
alter table public.referral_rewards enable row level security;
revoke all on public.referral_profiles,public.referral_purchases,public.referral_rewards from anon,authenticated;
grant all on public.referral_profiles,public.referral_purchases,public.referral_rewards to service_role;
revoke all on function public.record_referral_purchase(text,uuid,text,text,text),public.claim_referral_reward(uuid,text,uuid),public.invalidate_referral_reward(text,text,text),public.finish_referral_transfer(uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_referral_purchase(text,uuid,text,text,text),public.claim_referral_reward(uuid,text,uuid),public.invalidate_referral_reward(text,text,text),public.finish_referral_transfer(uuid,text,text) to service_role;
