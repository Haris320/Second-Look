-- Apply after the webhook and recruitment migrations. Private, service-role only.
create table if not exists public.feedback_quality_jobs (
  submission_id text primary key references public.reviews(terac_submission_id) on delete cascade,
  state text not null default 'checking' check(state in ('checking','retry','needs_attention','done')),
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  assessment jsonb,
  decision jsonb,
  input_hash text,
  policy_version text,
  model text,
  last_error text,
  updated_at timestamptz not null default now()
);
alter table public.feedback_quality_jobs enable row level security;
revoke all on public.feedback_quality_jobs from anon,authenticated;
grant all on public.feedback_quality_jobs to service_role;

create or replace function public.claim_feedback_quality(p_submission text,p_token uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare j public.feedback_quality_jobs;
begin
  insert into public.feedback_quality_jobs(submission_id) values(p_submission) on conflict do nothing;
  select * into j from public.feedback_quality_jobs where submission_id=p_submission for update;
  if j.state in ('done','needs_attention') then return to_jsonb(j); end if;
  if j.lease_until > now() then return null; end if;
  update public.feedback_quality_jobs set state='checking',lease_token=p_token,
    lease_until=now()+interval '5 minutes',attempts=attempts+1,updated_at=now()
    where submission_id=p_submission returning * into j;
  return to_jsonb(j);
end;
$$;
revoke all on function public.claim_feedback_quality(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_feedback_quality(text,uuid) to service_role;

create or replace function public.finish_feedback_quality(p_submission text,p_token uuid,p_outcome text)
returns void language plpgsql security invoker set search_path=public as $$
declare j public.feedback_quality_jobs; oid uuid; existing text;
begin
  select order_id into oid from public.reviews where terac_submission_id=p_submission;
  -- Serialize count updates for different reviews of the same order.
  perform 1 from public.orders where id=oid for update;
  select * into j from public.feedback_quality_jobs where submission_id=p_submission for update;
  if j.state='done' then return; end if;
  if j.lease_token is distinct from p_token or j.lease_until <= now() then raise exception 'Lease lost'; end if;
  if p_outcome not in ('approved','rejected') or j.decision->>'outcome' is distinct from p_outcome then raise exception 'Decision mismatch'; end if;
  select status into existing from public.reviews where terac_submission_id=p_submission for update;
  if existing not in ('pending',p_outcome) then raise exception 'Review status conflict'; end if;
  update public.reviews set status=p_outcome,terac_status=p_outcome,terac_status_at=now() where terac_submission_id=p_submission;
  update public.orders set reviews_done=(select count(*) from public.reviews where order_id=oid and status='approved') where id=oid;
  update public.feedback_quality_jobs set state='done',lease_token=null,lease_until=null,last_error=null,updated_at=now() where submission_id=p_submission;
  insert into public.decisions(order_id,step,choice,reason) values(oid,'review_quality',p_outcome,j.decision->>'reason');
end;
$$;
revoke all on function public.finish_feedback_quality(text,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_feedback_quality(text,uuid,text) to service_role;
