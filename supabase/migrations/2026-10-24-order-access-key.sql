-- Private order links: only a SHA-256 of each order's link key is stored. Applied 2026-10-24.
alter table orders add column access_key_hash text;
