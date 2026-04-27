-- Phase 1: recipes only.
-- Phase 2 (auth migration) will add users / sessions / password_reset_tokens
-- and tighten recipes.author_id to `uuid references users(id) on delete cascade`.

create table if not exists recipes (
  id            uuid primary key default gen_random_uuid(),
  author_id     text not null,
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
