-- Second Look schema. Paste into Supabase → SQL Editor → Run.
-- Only the server touches these tables (service key bypasses RLS), so RLS is on with no policies:
-- the publishable key in the browser can't read or write anything.
-- Screenshots are uploaded with server-issued signed upload URLs, so the bucket needs no policies either.

create extension if not exists pgcrypto;

create table orders (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  audience        text,                                -- e.g. women_21_35_us; null until a Flow B buyer uploads
  tier            text not null check (tier in ('quick', 'full', 'rush')),
  review_target   int  not null,
  reviews_done    int  not null default 0,
  -- awaiting_upload: paid on the Whop marketplace (Flow B), screenshots not uploaded yet
  -- screening: paid, AI first read running; needs_reupload: not a dating profile or screenshots missing, customer re-uploads;
  -- held: explicit, looks under 18, or the check errored twice (refund)
  status          text not null default 'pending_payment'
                  check (status in ('pending_payment', 'awaiting_upload', 'screening', 'needs_reupload', 'held', 'paid', 'in_review', 'done')),
  whop_checkout_id text,
  whop_payment_id text unique,
  amount_cents    int,
  report_json     jsonb,
  first_read_json jsonb,                               -- AI first read; shown labeled as AI, never part of report_json
  hold_reason     text,                                -- why the first read held the order (team only)
  created_at      timestamptz not null default now(),
  paid_at         timestamptz,
  delivered_at    timestamptz
);
create index orders_queue on orders (audience, status, created_at);
create index orders_email on orders (lower(email));

create table screenshots (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  storage_path text not null,
  position     int  not null
);
create index screenshots_order on screenshots (order_id, position);

create table reviews (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references orders(id) on delete cascade,
  terac_submission_id text not null unique,
  answers_json        jsonb,
  duration_s          int,
  status              text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at          timestamptz not null default now(),  -- when the reviewer was assigned the order
  submitted_at        timestamptz                          -- null = reviewer still working (counts as in flight)
);
create index reviews_order on reviews (order_id, status);

create table panels (
  id                   uuid primary key default gen_random_uuid(),
  audience             text not null unique,
  terac_opportunity_id text,
  status               text not null default 'draft'
);

create table decisions (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid references orders(id) on delete set null,
  step       text not null,
  choice     text not null,
  reason     text not null,
  created_at timestamptz not null default now()
);
create index decisions_recent on decisions (created_at desc);

alter table orders      enable row level security;
alter table screenshots enable row level security;
alter table reviews     enable row level security;
alter table panels      enable row level security;
alter table decisions   enable row level security;
