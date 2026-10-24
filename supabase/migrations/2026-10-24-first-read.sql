-- AI first read: three new order statuses and two columns. Applied 2026-10-24.
alter table orders drop constraint orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('pending_payment', 'awaiting_upload', 'screening', 'needs_reupload', 'held', 'paid', 'in_review', 'done'));
alter table orders add column first_read_json jsonb, add column hold_reason text;
