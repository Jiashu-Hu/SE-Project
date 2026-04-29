-- Phase A2: bucket_items table.
-- Idempotent. Cascades from users + recipes; UNIQUE on (user_id, recipe_id).

create table if not exists bucket_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  recipe_id   uuid not null references recipes(id) on delete cascade,
  added_at    timestamptz not null default now(),
  unique (user_id, recipe_id)
);

create index if not exists bucket_items_user_idx
  on bucket_items (user_id, added_at desc);
