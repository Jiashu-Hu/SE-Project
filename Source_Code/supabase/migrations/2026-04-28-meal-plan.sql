-- Meal planner Phase A1: meal_plan_slots and ingredient_aisles tables.
-- Idempotent — uses `if not exists` everywhere.

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
