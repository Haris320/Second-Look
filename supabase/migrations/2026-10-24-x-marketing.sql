create table if not exists public.marketing_posts (
  id uuid primary key default gen_random_uuid(),
  account text not null,
  day date not null default (now() at time zone 'utc')::date,
  state text not null check (state in ('generating','draft','posting','posted','failed','unknown')),
  text text,
  check_reason text,
  post_id text unique,
  error text,
  created_at timestamptz not null default now(),
  posted_at timestamptz,
  unique(account,day)
);
alter table public.marketing_posts enable row level security;
revoke all on public.marketing_posts from public, anon, authenticated;
grant all on public.marketing_posts to service_role;

create or replace function public.claim_marketing_post(p_account text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result public.marketing_posts;
begin
  perform pg_advisory_xact_lock(hashtextextended('marketing:' || p_account,0));
  -- An interrupted publish must be inspected before any further posts are allowed.
  if exists(select 1 from public.marketing_posts where account=p_account and state in ('posting','unknown')) then return null; end if;
  if exists(select 1 from public.marketing_posts where account=p_account and state='generating' and created_at > now()-interval '10 minutes') then return null; end if;
  insert into public.marketing_posts(account,state) values(p_account,'generating')
    on conflict(account,day) do nothing returning * into result;
  return case when result.id is null then null else to_jsonb(result) end;
end;
$$;
revoke all on function public.claim_marketing_post(text) from public,anon,authenticated;
grant execute on function public.claim_marketing_post(text) to service_role;
