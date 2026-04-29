-- Phase B: ingredients catalog (global seed + per-user growth).
-- Idempotent. user_id null = global seed; non-null = per-user.
-- A second migration in this same file (Task 9) will append the seed insert.

create table if not exists ingredients (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references users(id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 80),
  name_normalized text not null,
  default_unit    text not null default '',
  aisle           text not null check (aisle in (
    'Produce','Dairy & Eggs','Meat & Seafood','Bakery','Pantry','Frozen','Other'
  )),
  source          text not null check (source in ('seed','user','ai','backfill')) default 'user',
  created_at      timestamptz not null default now(),
  unique (user_id, name_normalized)
);

create index if not exists ingredients_user_idx
  on ingredients (user_id);
create index if not exists ingredients_name_norm_idx
  on ingredients (name_normalized text_pattern_ops);
