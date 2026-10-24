-- Run in Supabase SQL Editor before enabling recruitment.
create table if not exists public.recruitment_jobs (
  order_id uuid primary key references public.orders(id) on delete cascade,
  state text not null check (state in ('creating','preparing','launching','active','retryable','needs_attention')),
  opportunity_id text unique,
  task_token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  quoted_cost_cents integer,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.recruitment_jobs enable row level security;
revoke all on public.recruitment_jobs from anon, authenticated;
grant all on public.recruitment_jobs to service_role;
alter table public.reviews add column if not exists terac_participant_id text;
create unique index if not exists reviews_unique_participant
  on public.reviews(order_id, terac_participant_id) where terac_participant_id is not null;

create or replace function public.claim_recruitment(p_order_id uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare j public.recruitment_jobs;
begin
  -- Lock the order to serialize duplicate payment/quality callbacks.
  perform 1 from public.orders where id=p_order_id and status='paid'
    and whop_payment_id is not null and paid_at is not null and ((amount_cents=1500 and review_target in (1,3)) or (amount_cents=4000 and review_target=3)) for update;
  if not found then raise exception 'Order is not eligible'; end if;
  insert into public.recruitment_jobs(order_id,state) values(p_order_id,'creating')
    on conflict(order_id) do nothing returning * into j;
  if found then return to_jsonb(j); end if;
  update public.recruitment_jobs set state='preparing',updated_at=now()
    where order_id=p_order_id and state='retryable' and opportunity_id is not null returning * into j;
  if found then return to_jsonb(j); end if;
  return null;
end;
$$;
revoke all on function public.claim_recruitment(uuid) from public, anon, authenticated;
grant execute on function public.claim_recruitment(uuid) to service_role;

-- Called only after the server verifies the submission's opportunity through MCP.
create or replace function public.assign_terac_review(p_order_id uuid, p_submission text, p_participant text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare o public.orders; r public.reviews; used integer;
begin
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.status not in ('paid','in_review') then raise exception 'Order not available'; end if;
  select * into r from public.reviews where terac_submission_id=p_submission;
  if found then
    if r.order_id<>p_order_id or r.terac_participant_id is distinct from p_participant then raise exception 'Assignment mismatch'; end if;
    return to_jsonb(r);
  end if;
  select count(*) into used from public.reviews where order_id=p_order_id and status <> 'rejected';
  if used >= o.review_target then raise exception 'Review quota full'; end if;
  insert into public.reviews(order_id,terac_submission_id,terac_participant_id)
    values(p_order_id,p_submission,p_participant) returning * into r;
  update public.orders set status='in_review' where id=p_order_id;
  return to_jsonb(r);
end;
$$;
revoke all on function public.assign_terac_review(uuid,text,text) from public, anon, authenticated;
grant execute on function public.assign_terac_review(uuid,text,text) to service_role;

create or replace function public.submit_terac_review(p_order_id uuid,p_submission text,p_answers jsonb)
returns boolean language plpgsql security invoker set search_path=public as $$
declare r public.reviews;
begin
  select * into r from public.reviews where order_id=p_order_id and terac_submission_id=p_submission for update;
  if not found or r.status='rejected' then raise exception 'No valid assignment'; end if;
  if r.submitted_at is not null then return false; end if;
  if now() < r.created_at + interval '60 seconds' then raise exception 'Spend at least 60 seconds reviewing'; end if;
  update public.reviews set answers_json=p_answers,submitted_at=now(),
    duration_s=greatest(0,extract(epoch from now()-created_at)::integer) where id=r.id;
  return true;
end;
$$;
revoke all on function public.submit_terac_review(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.submit_terac_review(uuid,text,jsonb) to service_role;
