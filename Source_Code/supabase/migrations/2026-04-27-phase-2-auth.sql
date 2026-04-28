-- Phase 2 migration: applied to an existing Phase 1 Supabase project.
-- Idempotent (uses `if not exists` / drops constraints if they exist).
--
-- DESTRUCTIVE: truncates the recipes table because the existing rows
-- have author_id values like 'seed-test-user' (from the in-memory mock
-- user) that won't cast to uuid. This is dev/demo data only.

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

-- Tighten recipes.author_id from text to uuid + FK.
truncate table recipes;

alter table recipes
  alter column author_id type uuid using author_id::uuid;

alter table recipes
  drop constraint if exists recipes_author_id_fkey,
  add  constraint recipes_author_id_fkey
       foreign key (author_id) references users(id) on delete cascade;
