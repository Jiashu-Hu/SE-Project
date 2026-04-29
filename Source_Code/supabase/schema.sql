-- Phase 2: full target schema (users, sessions, password_reset_tokens, recipes).
-- For incremental upgrade from Phase 1, see migrations/2026-04-27-phase-2-auth.sql.

create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  name            text not null,
  password_salt   text not null,
  password_hash   text not null,
  created_at      timestamptz not null default now()
);

create table if not exists sessions (
  token           uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null
);

create index if not exists sessions_user_id_idx     on sessions (user_id);
create index if not exists sessions_expires_at_idx  on sessions (expires_at);

create table if not exists password_reset_tokens (
  token           uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_id_idx     on password_reset_tokens (user_id);
create index if not exists password_reset_tokens_expires_at_idx  on password_reset_tokens (expires_at);

create table if not exists recipes (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references users(id) on delete cascade,
  title         text not null check (length(title) between 1 and 120),
  description   text not null default '',
  category      text not null check (
    category in ('Breakfast','Lunch','Dinner','Dessert','Snacks','Other')
  ),
  prep_time     integer not null check (prep_time >= 0),
  cook_time     integer not null check (cook_time >= 0),
  servings      integer not null check (servings >= 1),
  image_url     text,
  ingredients   jsonb   not null default '[]'::jsonb,
  instructions  jsonb   not null default '[]'::jsonb,
  tags          jsonb   not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists recipes_author_id_idx  on recipes (author_id);
create index if not exists recipes_created_at_idx on recipes (created_at desc);

-- Phase A1: meal planner.

create table if not exists meal_plan_slots (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  date         date not null,
  meal_type    text not null check (meal_type in ('morning','noon','evening')),
  recipe_id    uuid not null references recipes(id) on delete cascade,
  servings     integer not null check (servings >= 1) default 4,
  created_at   timestamptz not null default now(),
  unique (user_id, date, meal_type)
);

create index if not exists meal_plan_slots_user_date_idx
  on meal_plan_slots (user_id, date);

create table if not exists ingredient_aisles (
  id              uuid primary key default gen_random_uuid(),
  item_normalized text not null unique,
  aisle           text not null check (aisle in (
    'Produce','Dairy & Eggs','Meat & Seafood','Bakery','Pantry','Frozen','Other'
  )),
  source          text not null check (source in ('seed','llm')) default 'llm',
  created_at      timestamptz not null default now()
);

-- Phase A2: bucket layer.

create table if not exists bucket_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  recipe_id   uuid not null references recipes(id) on delete cascade,
  added_at    timestamptz not null default now(),
  unique (user_id, recipe_id)
);

create index if not exists bucket_items_user_idx
  on bucket_items (user_id, added_at desc);

-- Phase B: ingredient catalog.

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

-- Phase B seed entries are loaded at app/test boot via
-- src/test/setup.ts → seedGlobal(...) reading data/ingredient-seed.json.
-- Production loads the same JSON via scripts/load-ingredient-seed.mjs.
