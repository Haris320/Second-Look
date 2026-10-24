-- Apply before deploying /api/terac/webhook. Run once in Supabase SQL Editor.
-- Inbox: durable handoff to the review worker. processed_at stays null until
-- the worker has completed quality review/report work (not merely delivery).
create table if not exists public.terac_webhook_events (
  event_id text primary key,
  event_type text not null,
  submission_id text not null,
  opportunity_id text not null,
  occurred_at timestamptz not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists terac_webhook_pending
  on public.terac_webhook_events (received_at) where processed_at is null;
alter table public.terac_webhook_events enable row level security;
revoke all on public.terac_webhook_events from anon, authenticated;
grant all on public.terac_webhook_events to service_role;

-- External lifecycle is distinct from our own quality-control approval.
alter table public.reviews add column if not exists terac_status text;
alter table public.reviews add column if not exists terac_status_at timestamptz;

create or replace function public.receive_terac_webhook(p_event jsonb)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted_id text;
begin
  if p_event->>'event_type' not in ('submission.status.change', 'submission.approved') then
    raise exception 'Unsupported Terac event';
  end if;
  insert into public.terac_webhook_events
    (event_id, event_type, submission_id, opportunity_id, occurred_at, payload)
  values
    (p_event->>'event_id', p_event->>'event_type', p_event->>'resource_id',
     p_event->>'opportunity_id', (p_event->>'occurred_at')::timestamptz, p_event)
  on conflict (event_id) do nothing
  returning event_id into inserted_id;
  if inserted_id is null then return false; end if;

  -- Lock/update atomically with the inbox insert; stale deliveries cannot rewind
  -- status. Events arriving before local assignment remain available in the inbox.
  update public.reviews
  set terac_status = p_event->>'to', terac_status_at = (p_event->>'occurred_at')::timestamptz
  where terac_submission_id = p_event->>'resource_id'
    and (terac_status_at is null or terac_status_at < (p_event->>'occurred_at')::timestamptz);
  return true;
end;
$$;
revoke all on function public.receive_terac_webhook(jsonb) from public, anon, authenticated;
grant execute on function public.receive_terac_webhook(jsonb) to service_role;
