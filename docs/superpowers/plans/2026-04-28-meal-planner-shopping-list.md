# Meal Planner + Shopping List Implementation Plan (Phase A1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/meal-plan` page where the user fills 3 slots per day (morning / noon / evening) for a week, plus a `/meal-plan/shopping` page that aggregates the ingredients across selected recipes, scales by per-slot servings, groups by aisle (hybrid keyword + LLM cache classifier), and persists checkbox state in `localStorage`.

**Architecture:** Two new Postgres tables (`meal_plan_slots`, `ingredient_aisles`), three new lib modules (`meal-plan`, `shopping-list`, `ingredient-aisles`), four new API routes, two new server pages, and ~7 client components. The classifier reuses the existing OpenAI/GPTGOD client factory from `lib/ai-recipe.ts` (no new env var or test seam). The migration follows the same pattern as Phase 2 (full schema in `supabase/schema.sql` plus a date-stamped one-shot migration file).

**Tech Stack:**
- `pg` 8 + PGlite for tests (already installed)
- `openai` 6 via the GPTGOD gateway (already installed and configured)
- Reuses: `lib/db.ts` test seam, `lib/ai-recipe.ts` `getOpenAI()` factory + `__setTestClient` hook, `lib/recipes.ts` (for recipe lookup), `lib/auth-server.ts`, `RecipeForm` patterns

**Spec:** [`docs/superpowers/specs/2026-04-28-meal-planner-shopping-list-design.md`](../specs/2026-04-28-meal-planner-shopping-list-design.md)

**Working directory:** Worktree at `../class-project-meal-plan/` on branch `feat/meal-planner`.

---

## Decisions baked in (don't relitigate)

1. **Two new tables only.** `meal_plan_slots` and `ingredient_aisles`. Schema in §3 of the spec.
2. **Reuse `lib/ai-recipe.ts` OpenAI factory.** `lib/ingredient-aisles.ts` imports `getOpenAI` from `ai-recipe.ts`. Tests share the `__setTestClient`/`__resetClient` hooks. No new env var.
3. **Pure aggregation, async classification.** `lib/shopping-list.ts` is I/O-free (takes slots+recipes in, returns aggregated rows out). `lib/ingredient-aisles.ts` does the DB cache + LLM. The route stitches them.
4. **Week start is Monday.** Hardcoded constant in a tiny `lib/week.ts` helper.
5. **`date` columns stored as Postgres `date`, marshalled to `YYYY-MM-DD` strings everywhere in JS.** No timezone math.
6. **Aisle enum: 7 values** — `Produce`, `Dairy & Eggs`, `Meat & Seafood`, `Bakery`, `Pantry`, `Frozen`, `Other`. Same constant used in DB CHECK, TS union, and LLM JSON schema.
7. **Cache writes use `ON CONFLICT DO NOTHING`** so concurrent shopping-list generations don't fight.
8. **`ON DELETE CASCADE` on `recipe_id`** — deleting a recipe drops its scheduled slots.
9. **Coverage gate stays at 80%.** New lib + routes should clear it on their own. The existing `lib/db.ts` and `lib/image-compress.ts` excludes carry over.
10. **No bucket, no autocomplete, no AI generator changes.** Phase A2 / Phase B work — out of scope here.

---

## File structure

### Created
| Path | Responsibility |
|---|---|
| `Source_Code/supabase/migrations/2026-04-28-meal-plan.sql` | Date-stamped one-shot migration adding both tables. |
| `Source_Code/src/lib/week.ts` | `mondayOf(date)`, `addWeeks(start, n)`, `currentWeekStart()`. Pure helpers. |
| `Source_Code/src/lib/meal-plan.ts` | Async DB CRUD: `listSlotsForWeek`, `listSlotsWithRecipesForWeek`, `createSlot`, `updateSlot`, `deleteSlot`, `bulkUpdateServings`. |
| `Source_Code/src/lib/shopping-list.ts` | Pure functions: `parseAmount`, `formatAmount`, `aggregateIngredients`. |
| `Source_Code/src/lib/ingredient-aisles.ts` | `AISLES` const, `keywordClassify`, `classifyIngredients` (cache + keyword + LLM batch). |
| `Source_Code/src/lib/__tests__/week.test.ts` | |
| `Source_Code/src/lib/__tests__/meal-plan.test.ts` | |
| `Source_Code/src/lib/__tests__/shopping-list.test.ts` | |
| `Source_Code/src/lib/__tests__/ingredient-aisles.test.ts` | |
| `Source_Code/src/app/api/meal-plan/slots/route.ts` | `POST` create slot. |
| `Source_Code/src/app/api/meal-plan/slots/[id]/route.ts` | `PATCH` (servings or recipe), `DELETE`. |
| `Source_Code/src/app/api/meal-plan/slots/bulk-servings/route.ts` | `PATCH { weekStart, servings }`. |
| `Source_Code/src/app/api/meal-plan/shopping/route.ts` | `POST { weekStart }` → aisle-grouped items. |
| `Source_Code/src/app/api/meal-plan/__tests__/slots.test.ts` | |
| `Source_Code/src/app/api/meal-plan/__tests__/bulk-servings.test.ts` | |
| `Source_Code/src/app/api/meal-plan/__tests__/shopping.test.ts` | |
| `Source_Code/src/app/meal-plan/page.tsx` | Server component reading `?week=YYYY-MM-DD`. |
| `Source_Code/src/app/meal-plan/shopping/page.tsx` | Server component for the list. |
| `Source_Code/src/components/meal-plan/MealPlanClient.tsx` | Container client component. |
| `Source_Code/src/components/meal-plan/WeekNav.tsx` | Prev / today / next buttons. |
| `Source_Code/src/components/meal-plan/ServingsControls.tsx` | Default-servings input + "Apply to all". |
| `Source_Code/src/components/meal-plan/DayColumn.tsx` | Day header + 3 slot positions. |
| `Source_Code/src/components/meal-plan/MealSlotCard.tsx` | Filled slot card. |
| `Source_Code/src/components/meal-plan/EmptySlot.tsx` | "+ Add meal" button. |
| `Source_Code/src/components/meal-plan/RecipePickerModal.tsx` | Searchable recipe-list modal. |
| `Source_Code/src/components/shopping-list/ShoppingListClient.tsx` | Aisle checklist with localStorage. |

### Modified
| Path | Change |
|---|---|
| `Source_Code/supabase/schema.sql` | Append the two `create table` statements. |
| `Source_Code/src/test/setup.ts` | Truncate list extended to include `meal_plan_slots` and `ingredient_aisles`. |
| `Source_Code/src/components/Header.tsx` | Add "Meal Plan" link. |

---

## Phase 1: Schema + test setup

### Task 1: Migration file + schema.sql append

**Files:**
- Create: `Source_Code/supabase/migrations/2026-04-28-meal-plan.sql`
- Modify: `Source_Code/supabase/schema.sql`

- [ ] **Step 1: Create the migration directory file**

Create `Source_Code/supabase/migrations/2026-04-28-meal-plan.sql`:

```sql
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
```

- [ ] **Step 2: Append the same DDL to `schema.sql`**

Open `Source_Code/supabase/schema.sql` and append after the existing `recipes` block:

```sql

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
```

- [ ] **Step 3: Verify the schema parses against PGlite**

```bash
node -e "(async () => {
  const fs = require('node:fs');
  const { PGlite } = await import('@electric-sql/pglite');
  const sql = fs.readFileSync('Source_Code/supabase/schema.sql','utf8');
  const p = new PGlite();
  await p.exec(sql);
  const r = await p.query(\"select table_name from information_schema.tables where table_schema='public' order by table_name\");
  console.log(r.rows.map(x => x.table_name));
  await p.close();
})()"
```

Expected: `[ 'ingredient_aisles', 'meal_plan_slots', 'password_reset_tokens', 'recipes', 'sessions', 'users' ]` — six tables.

- [ ] **Step 4: Commit**

```bash
git add Source_Code/supabase/schema.sql Source_Code/supabase/migrations/2026-04-28-meal-plan.sql
git commit -m "feat: add meal_plan_slots and ingredient_aisles tables"
```

---

### Task 2: Extend test setup truncate

**Files:**
- Modify: `Source_Code/src/test/setup.ts`

- [ ] **Step 1: Find the existing truncate**

Open `Source_Code/src/test/setup.ts`. Find the `afterEach` block. The current truncate is:

```typescript
await pglite.exec(
  "truncate table users, sessions, password_reset_tokens, recipes restart identity cascade;"
);
```

- [ ] **Step 2: Extend the truncate**

Replace with:

```typescript
await pglite.exec(
  "truncate table users, sessions, password_reset_tokens, recipes, meal_plan_slots, ingredient_aisles restart identity cascade;"
);
```

The `cascade` keyword handles `meal_plan_slots → users`/`recipes` FK chains automatically; we list `meal_plan_slots` explicitly so identity is reset.

- [ ] **Step 3: Run the existing suite — verify nothing broke**

From `Source_Code/`:

```bash
npm test 2>&1 | tail -5
```

Expected: every existing test still passes. The new tables are simply truncated (and stay empty since no test creates rows yet). 110 tests pass.

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/test/setup.ts
git commit -m "test: truncate meal_plan_slots and ingredient_aisles between tests"
```

---

## Phase 2: Lib (TDD)

### Task 3: `lib/week.ts` — week-start helpers

**Files:**
- Create: `Source_Code/src/lib/week.ts`
- Create: `Source_Code/src/lib/__tests__/week.test.ts`

- [ ] **Step 1: Write the failing test**

Create `Source_Code/src/lib/__tests__/week.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mondayOf, addWeeks, currentWeekStart } from "@/lib/week";

describe("mondayOf", () => {
  it("returns the same date when given a Monday", () => {
    expect(mondayOf(new Date("2026-04-27T12:00:00Z"))).toBe("2026-04-27");
  });

  it("rolls back to Monday when given a Wednesday", () => {
    expect(mondayOf(new Date("2026-04-29T12:00:00Z"))).toBe("2026-04-27");
  });

  it("rolls back to Monday when given a Sunday", () => {
    expect(mondayOf(new Date("2026-05-03T12:00:00Z"))).toBe("2026-04-27");
  });
});

describe("addWeeks", () => {
  it("advances by one week", () => {
    expect(addWeeks("2026-04-27", 1)).toBe("2026-05-04");
  });

  it("rolls back by two weeks", () => {
    expect(addWeeks("2026-04-27", -2)).toBe("2026-04-13");
  });
});

describe("currentWeekStart", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(currentWeekStart()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run — verify RED**

From `Source_Code/`:

```bash
npm test -- --run src/lib/__tests__/week.test.ts 2>&1 | tail -10
```

Expected: import error — `Cannot find module '@/lib/week'`.

- [ ] **Step 3: Implement**

Create `Source_Code/src/lib/week.ts`:

```typescript
// Week-start helpers. Weeks are Monday-to-Sunday. All inputs/outputs are
// UTC dates as YYYY-MM-DD strings. Postgres `date` columns are timezone-free
// so we treat all date math as UTC to avoid drift.

export function mondayOf(date: Date): string {
  const d = new Date(date.getTime());
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function addWeeks(weekStart: string, n: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

export function currentWeekStart(): string {
  return mondayOf(new Date());
}

// Inclusive end-of-week (Sunday) for a given Monday-start.
export function sundayOf(weekStart: string): string {
  return addWeeks(weekStart, 0).replace(weekStart, weekStart); // identity guard
  // Above is dead-equivalent to weekStart + 6 days; spelled out next:
}
```

Wait — replace `sundayOf` with the actual implementation:

```typescript
export function sundayOf(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}
```

(Final file omits the `dead-equivalent` placeholder. Use the second `sundayOf` body.)

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/lib/__tests__/week.test.ts 2>&1 | tail -10
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add Source_Code/src/lib/week.ts Source_Code/src/lib/__tests__/week.test.ts
git commit -m "feat: add week-start helpers (mondayOf, addWeeks, currentWeekStart, sundayOf)"
```

---

### Task 4: `lib/meal-plan.ts` — DB CRUD (TDD)

**Files:**
- Create: `Source_Code/src/lib/meal-plan.ts`
- Create: `Source_Code/src/lib/__tests__/meal-plan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `Source_Code/src/lib/__tests__/meal-plan.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  createSlot,
  listSlotsForWeek,
  updateSlot,
  deleteSlot,
  bulkUpdateServings,
} from "@/lib/meal-plan";
import { registerUser } from "@/lib/auth";
import { createRecipe } from "@/lib/recipes";
import type { CreateRecipePayload } from "@/types/recipe";

const SAMPLE_RECIPE: CreateRecipePayload = {
  title: "Toast",
  description: "Bread, but warm.",
  category: "Breakfast",
  prepTime: 1,
  cookTime: 3,
  servings: 1,
  ingredients: [{ amount: "2", unit: "slice", item: "bread" }],
  instructions: ["Toast the bread"],
  tags: [],
};

async function makeUserAndRecipe() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  const recipe = await createRecipe(reg.user.id, SAMPLE_RECIPE);
  return { userId: reg.user.id, recipeId: recipe.id };
}

describe("createSlot + listSlotsForWeek", () => {
  it("creates a slot and finds it within the week range", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    const result = await createSlot({
      userId, date: "2026-04-27", mealType: "evening", recipeId, servings: 2,
    });
    expect("slot" in result).toBe(true);

    const slots = await listSlotsForWeek(userId, "2026-04-27");
    expect(slots).toHaveLength(1);
    expect(slots[0].date).toBe("2026-04-27");
    expect(slots[0].mealType).toBe("evening");
    expect(slots[0].servings).toBe(2);
  });

  it("rejects a duplicate (user, date, meal_type) with an error", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    await createSlot({ userId, date: "2026-04-27", mealType: "evening", recipeId, servings: 2 });
    const dup = await createSlot({ userId, date: "2026-04-27", mealType: "evening", recipeId, servings: 4 });
    expect("error" in dup).toBe(true);
  });

  it("excludes slots outside the requested week", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    await createSlot({ userId, date: "2026-04-27", mealType: "morning", recipeId, servings: 1 });
    await createSlot({ userId, date: "2026-05-04", mealType: "morning", recipeId, servings: 1 });
    const week = await listSlotsForWeek(userId, "2026-04-27");
    expect(week).toHaveLength(1);
    expect(week[0].date).toBe("2026-04-27");
  });
});

describe("updateSlot", () => {
  it("updates servings", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    const created = await createSlot({ userId, date: "2026-04-27", mealType: "noon", recipeId, servings: 2 });
    if (!("slot" in created)) throw new Error("setup failed");
    const updated = await updateSlot({ slotId: created.slot.id, userId, servings: 6 });
    expect(updated?.servings).toBe(6);
  });

  it("returns null when the slot does not belong to the user", async () => {
    const a = await makeUserAndRecipe();
    const b = await makeUserAndRecipe();
    const created = await createSlot({
      userId: a.userId, date: "2026-04-27", mealType: "noon", recipeId: a.recipeId, servings: 2,
    });
    if (!("slot" in created)) throw new Error("setup failed");
    const trespass = await updateSlot({ slotId: created.slot.id, userId: b.userId, servings: 99 });
    expect(trespass).toBeNull();
  });
});

describe("deleteSlot", () => {
  it("removes the slot and returns true", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    const created = await createSlot({ userId, date: "2026-04-27", mealType: "evening", recipeId, servings: 2 });
    if (!("slot" in created)) throw new Error("setup failed");
    expect(await deleteSlot(created.slot.id, userId)).toBe(true);
    expect(await listSlotsForWeek(userId, "2026-04-27")).toEqual([]);
  });

  it("returns false when the slot does not belong to the user", async () => {
    const a = await makeUserAndRecipe();
    const b = await makeUserAndRecipe();
    const created = await createSlot({
      userId: a.userId, date: "2026-04-27", mealType: "evening", recipeId: a.recipeId, servings: 2,
    });
    if (!("slot" in created)) throw new Error("setup failed");
    expect(await deleteSlot(created.slot.id, b.userId)).toBe(false);
  });
});

describe("bulkUpdateServings", () => {
  it("applies servings to every slot in the requested week", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    await createSlot({ userId, date: "2026-04-27", mealType: "morning", recipeId, servings: 1 });
    await createSlot({ userId, date: "2026-04-29", mealType: "noon", recipeId, servings: 1 });
    await createSlot({ userId, date: "2026-05-04", mealType: "morning", recipeId, servings: 1 });

    const n = await bulkUpdateServings(userId, "2026-04-27", 4);
    expect(n).toBe(2);

    const week1 = await listSlotsForWeek(userId, "2026-04-27");
    expect(week1.every((s) => s.servings === 4)).toBe(true);
    const week2 = await listSlotsForWeek(userId, "2026-05-04");
    expect(week2.every((s) => s.servings === 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run — verify RED**

```bash
npm test -- --run src/lib/__tests__/meal-plan.test.ts 2>&1 | tail -10
```

Expected: import error.

- [ ] **Step 3: Implement**

Create `Source_Code/src/lib/meal-plan.ts`:

```typescript
import { getDb } from "@/lib/db";
import type { QueryRow } from "@/lib/db";
import { sundayOf } from "@/lib/week";

export type MealType = "morning" | "noon" | "evening";

export const MEAL_TYPES: readonly MealType[] = ["morning", "noon", "evening"];

export interface MealPlanSlot {
  readonly id: string;
  readonly userId: string;
  readonly date: string;
  readonly mealType: MealType;
  readonly recipeId: string;
  readonly servings: number;
  readonly createdAt: string;
}

interface SlotRow extends QueryRow {
  id: string;
  user_id: string;
  date: string | Date;
  meal_type: MealType;
  recipe_id: string;
  servings: number;
  created_at: string | Date;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function toIsoDate(value: string | Date): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function toIsoTimestamp(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString();
}

function rowToSlot(row: SlotRow): MealPlanSlot {
  return {
    id: row.id,
    userId: row.user_id,
    date: toIsoDate(row.date),
    mealType: row.meal_type,
    recipeId: row.recipe_id,
    servings: row.servings,
    createdAt: toIsoTimestamp(row.created_at),
  };
}

const SELECT_COLUMNS =
  "id, user_id, date, meal_type, recipe_id, servings, created_at";

export async function listSlotsForWeek(
  userId: string,
  weekStart: string
): Promise<readonly MealPlanSlot[]> {
  if (!isUuid(userId)) return [];
  const weekEnd = sundayOf(weekStart);
  const db = getDb();
  const result = await db.query<SlotRow>(
    `select ${SELECT_COLUMNS}
       from meal_plan_slots
      where user_id = $1 and date >= $2 and date <= $3
      order by date, meal_type`,
    [userId, weekStart, weekEnd]
  );
  return result.rows.map(rowToSlot);
}

interface CreateSlotInput {
  readonly userId: string;
  readonly date: string;
  readonly mealType: MealType;
  readonly recipeId: string;
  readonly servings: number;
}

export async function createSlot(
  input: CreateSlotInput
): Promise<{ slot: MealPlanSlot } | { error: string }> {
  if (!isUuid(input.userId)) return { error: "Invalid user." };
  if (!isUuid(input.recipeId)) return { error: "Invalid recipe." };
  const db = getDb();
  try {
    const result = await db.query<SlotRow>(
      `insert into meal_plan_slots (user_id, date, meal_type, recipe_id, servings)
         values ($1, $2, $3, $4, $5)
         returning ${SELECT_COLUMNS}`,
      [input.userId, input.date, input.mealType, input.recipeId, input.servings]
    );
    return { slot: rowToSlot(result.rows[0]) };
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505") {
      return { error: "This slot is already filled." };
    }
    throw err;
  }
}

interface UpdateSlotInput {
  readonly slotId: string;
  readonly userId: string;
  readonly recipeId?: string;
  readonly servings?: number;
}

export async function updateSlot(
  input: UpdateSlotInput
): Promise<MealPlanSlot | null> {
  if (!isUuid(input.slotId) || !isUuid(input.userId)) return null;
  const sets: string[] = [];
  const values: unknown[] = [];
  if (input.recipeId !== undefined) {
    if (!isUuid(input.recipeId)) return null;
    values.push(input.recipeId);
    sets.push(`recipe_id = $${values.length}`);
  }
  if (input.servings !== undefined) {
    values.push(input.servings);
    sets.push(`servings = $${values.length}`);
  }
  if (sets.length === 0) return null;
  values.push(input.slotId);
  values.push(input.userId);
  const db = getDb();
  const result = await db.query<SlotRow>(
    `update meal_plan_slots
        set ${sets.join(", ")}
      where id = $${values.length - 1} and user_id = $${values.length}
      returning ${SELECT_COLUMNS}`,
    values
  );
  return result.rows[0] ? rowToSlot(result.rows[0]) : null;
}

export async function deleteSlot(
  slotId: string,
  userId: string
): Promise<boolean> {
  if (!isUuid(slotId) || !isUuid(userId)) return false;
  const db = getDb();
  const result = await db.query(
    `delete from meal_plan_slots where id = $1 and user_id = $2`,
    [slotId, userId]
  );
  return result.rowCount > 0;
}

export async function bulkUpdateServings(
  userId: string,
  weekStart: string,
  servings: number
): Promise<number> {
  if (!isUuid(userId)) return 0;
  if (!Number.isInteger(servings) || servings < 1) return 0;
  const weekEnd = sundayOf(weekStart);
  const db = getDb();
  const result = await db.query(
    `update meal_plan_slots
        set servings = $1
      where user_id = $2 and date >= $3 and date <= $4`,
    [servings, userId, weekStart, weekEnd]
  );
  return result.rowCount;
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/lib/__tests__/meal-plan.test.ts 2>&1 | tail -10
```

Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add Source_Code/src/lib/meal-plan.ts Source_Code/src/lib/__tests__/meal-plan.test.ts
git commit -m "feat: meal-plan lib with slot CRUD and bulk-servings update"
```

---

### Task 5: `lib/shopping-list.ts` — pure aggregation (TDD)

**Files:**
- Create: `Source_Code/src/lib/shopping-list.ts`
- Create: `Source_Code/src/lib/__tests__/shopping-list.test.ts`

- [ ] **Step 1: Write the failing test**

Create `Source_Code/src/lib/__tests__/shopping-list.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  parseAmount,
  formatAmount,
  aggregateIngredients,
} from "@/lib/shopping-list";
import type { Recipe } from "@/types/recipe";

function makeRecipe(
  overrides: Partial<Recipe> = {}
): Recipe {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    authorId: "22222222-2222-2222-2222-222222222222",
    title: "Test Recipe",
    description: "",
    category: "Dinner",
    prepTime: 0,
    cookTime: 0,
    servings: 4,
    imageUrl: null,
    ingredients: [],
    instructions: [],
    tags: [],
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("parseAmount", () => {
  it("parses a plain number", () => {
    expect(parseAmount("3")).toBe(3);
  });

  it("parses a decimal", () => {
    expect(parseAmount("1.5")).toBe(1.5);
  });

  it("parses a mixed fraction", () => {
    expect(parseAmount("1 1/2")).toBe(1.5);
  });

  it("parses a bare fraction", () => {
    expect(parseAmount("3/4")).toBe(0.75);
  });

  it("returns null for non-numeric strings", () => {
    expect(parseAmount("a pinch")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("to taste")).toBeNull();
  });
});

describe("formatAmount", () => {
  it("strips trailing zeros and decimal point", () => {
    expect(formatAmount(3)).toBe("3");
    expect(formatAmount(1.5)).toBe("1.5");
    expect(formatAmount(0.75)).toBe("0.75");
  });
});

describe("aggregateIngredients", () => {
  it("sums same item + same unit across slots", async () => {
    const recipe = makeRecipe({
      servings: 4,
      ingredients: [{ amount: "200", unit: "g", item: "spaghetti" }],
    });
    const items = aggregateIngredients([
      { servings: 4, recipe },
      { servings: 4, recipe },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].item).toBe("spaghetti");
    expect(items[0].unit).toBe("g");
    expect(items[0].amount).toBe("400");
  });

  it("scales by slot.servings / recipe.servings", () => {
    const recipe = makeRecipe({
      servings: 4,
      ingredients: [{ amount: "200", unit: "g", item: "spaghetti" }],
    });
    const items = aggregateIngredients([{ servings: 2, recipe }]);
    expect(items[0].amount).toBe("100");
  });

  it("keeps different units as separate rows for the same item", () => {
    const r1 = makeRecipe({
      servings: 1,
      ingredients: [{ amount: "200", unit: "g", item: "pasta" }],
    });
    const r2 = makeRecipe({
      id: "33333333-3333-3333-3333-333333333333",
      servings: 1,
      ingredients: [{ amount: "1", unit: "box", item: "pasta" }],
    });
    const items = aggregateIngredients([
      { servings: 1, recipe: r1 },
      { servings: 1, recipe: r2 },
    ]);
    expect(items).toHaveLength(2);
    const units = items.map((i) => i.unit).sort();
    expect(units).toEqual(["box", "g"]);
  });

  it("passes non-numeric amounts through unchanged", () => {
    const recipe = makeRecipe({
      servings: 1,
      ingredients: [{ amount: "to taste", unit: "", item: "salt" }],
    });
    const items = aggregateIngredients([{ servings: 2, recipe }]);
    expect(items[0].amount).toBe("to taste");
    expect(items[0].item).toBe("salt");
  });

  it("joins mixed numeric + non-numeric for the same item+unit with a comma", () => {
    const r1 = makeRecipe({
      servings: 1,
      ingredients: [{ amount: "1", unit: "tsp", item: "salt" }],
    });
    const r2 = makeRecipe({
      id: "33333333-3333-3333-3333-333333333333",
      servings: 1,
      ingredients: [{ amount: "to taste", unit: "tsp", item: "salt" }],
    });
    const items = aggregateIngredients([
      { servings: 1, recipe: r1 },
      { servings: 1, recipe: r2 },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe("1, to taste");
  });

  it("normalizes item and unit case for grouping but preserves first-seen casing for display", () => {
    const r1 = makeRecipe({
      servings: 1,
      ingredients: [{ amount: "2", unit: "Cup", item: "Flour" }],
    });
    const r2 = makeRecipe({
      id: "33333333-3333-3333-3333-333333333333",
      servings: 1,
      ingredients: [{ amount: "1", unit: "cup", item: "flour" }],
    });
    const items = aggregateIngredients([
      { servings: 1, recipe: r1 },
      { servings: 1, recipe: r2 },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe("3");
    expect(items[0].item).toBe("Flour");
    expect(items[0].unit).toBe("Cup");
  });
});
```

- [ ] **Step 2: Run — verify RED**

```bash
npm test -- --run src/lib/__tests__/shopping-list.test.ts 2>&1 | tail -10
```

Expected: import error.

- [ ] **Step 3: Implement**

Create `Source_Code/src/lib/shopping-list.ts`:

```typescript
// Pure aggregation for the shopping list. No I/O.
//
// Input: a list of slot-with-recipe pairs, where each slot has its own
// `servings` (the user-facing override). Each recipe carries its own default
// `servings` plus the ingredient list. We scale per slot, then aggregate
// across all slots.

import type { Recipe } from "@/types/recipe";

export interface ShoppingListSlot {
  readonly servings: number;
  readonly recipe: Recipe;
}

export interface AggregatedItem {
  readonly item: string;   // first-seen casing
  readonly unit: string;   // first-seen casing
  readonly amount: string; // already-formatted for display
}

const FRACTION_RE = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/;       // "1 1/2"
const BARE_FRAC_RE = /^(\d+)\s*\/\s*(\d+)$/;              // "1/2"
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;                     // "1.5", "200"

export function parseAmount(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  let m = FRACTION_RE.exec(s);
  if (m) {
    const whole = Number(m[1]);
    const num = Number(m[2]);
    const den = Number(m[3]);
    if (den === 0) return null;
    return whole + num / den;
  }
  m = BARE_FRAC_RE.exec(s);
  if (m) {
    const num = Number(m[1]);
    const den = Number(m[2]);
    if (den === 0) return null;
    return num / den;
  }
  if (DECIMAL_RE.test(s)) return Number(s);
  return null;
}

export function formatAmount(n: number): string {
  // Trim trailing zeros + dot.
  return n.toFixed(2).replace(/\.?0+$/, "");
}

interface Bucket {
  readonly displayItem: string;
  readonly displayUnit: string;
  numericTotal: number;
  numericCount: number;
  nonNumericParts: string[];
}

export function aggregateIngredients(
  slots: readonly ShoppingListSlot[]
): readonly AggregatedItem[] {
  const buckets = new Map<string, Bucket>();

  for (const slot of slots) {
    const ratio =
      slot.recipe.servings > 0 ? slot.servings / slot.recipe.servings : 1;
    for (const ing of slot.recipe.ingredients) {
      const itemKey = ing.item.trim().toLowerCase();
      const unitKey = ing.unit.trim().toLowerCase();
      if (!itemKey) continue;
      const key = `${itemKey}|${unitKey}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          displayItem: ing.item.trim(),
          displayUnit: ing.unit.trim(),
          numericTotal: 0,
          numericCount: 0,
          nonNumericParts: [],
        };
        buckets.set(key, bucket);
      }
      const parsed = parseAmount(ing.amount);
      if (parsed !== null) {
        bucket.numericTotal += parsed * ratio;
        bucket.numericCount += 1;
      } else {
        const trimmed = ing.amount.trim();
        if (trimmed) bucket.nonNumericParts.push(trimmed);
      }
    }
  }

  const out: AggregatedItem[] = [];
  for (const b of buckets.values()) {
    const parts: string[] = [];
    if (b.numericCount > 0) parts.push(formatAmount(b.numericTotal));
    parts.push(...b.nonNumericParts);
    out.push({
      item: b.displayItem,
      unit: b.displayUnit,
      amount: parts.join(", "),
    });
  }
  return out;
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/lib/__tests__/shopping-list.test.ts 2>&1 | tail -10
```

Expected: 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add Source_Code/src/lib/shopping-list.ts Source_Code/src/lib/__tests__/shopping-list.test.ts
git commit -m "feat: shopping-list lib — parseAmount, formatAmount, aggregateIngredients

Pure functions only. Scales each slot by servings/recipe.servings,
aggregates by (item, unit) lowercased, preserves first-seen casing
for display, sums numeric amounts, joins non-numeric with commas."
```

---

### Task 6: `lib/ingredient-aisles.ts` — keyword + cache + LLM (TDD)

**Files:**
- Create: `Source_Code/src/lib/ingredient-aisles.ts`
- Create: `Source_Code/src/lib/__tests__/ingredient-aisles.test.ts`

- [ ] **Step 1: Write the failing test**

Create `Source_Code/src/lib/__tests__/ingredient-aisles.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import {
  AISLES,
  keywordClassify,
  classifyIngredients,
} from "@/lib/ingredient-aisles";
import { __setTestClient, __resetClient } from "@/lib/ai-recipe";
import { getDb } from "@/lib/db";

function makeFakeClient(responses: unknown[]) {
  let i = 0;
  return {
    chat: {
      completions: {
        create: async () => {
          const next = responses[i++];
          if (!next) throw new Error("fake client ran out of responses");
          return next;
        },
      },
    },
  } as unknown as Parameters<typeof __setTestClient>[0];
}

function makeChatResponse(payload: unknown) {
  return {
    id: "x", object: "chat.completion", created: 0, model: "gpt-4.1-mini",
    choices: [{
      index: 0, finish_reason: "stop",
      message: { role: "assistant", content: JSON.stringify(payload), refusal: null },
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

afterEach(() => __resetClient());

describe("AISLES", () => {
  it("has exactly 7 entries with Other last", () => {
    expect(AISLES).toHaveLength(7);
    expect(AISLES[AISLES.length - 1]).toBe("Other");
  });
});

describe("keywordClassify", () => {
  it("matches common produce", () => {
    expect(keywordClassify("tomato")).toBe("Produce");
    expect(keywordClassify("Yellow Onion")).toBe("Produce");
  });

  it("matches dairy", () => {
    expect(keywordClassify("milk")).toBe("Dairy & Eggs");
    expect(keywordClassify("eggs")).toBe("Dairy & Eggs");
  });

  it("matches meat", () => {
    expect(keywordClassify("chicken thighs")).toBe("Meat & Seafood");
  });

  it("returns null for unknown items", () => {
    expect(keywordClassify("xyzzy")).toBeNull();
  });
});

describe("classifyIngredients", () => {
  it("returns keyword classifications without calling the LLM", async () => {
    __setTestClient(makeFakeClient([])); // no LLM calls allowed

    const result = await classifyIngredients(["tomato", "milk", "chicken"]);
    expect(result["tomato"]).toBe("Produce");
    expect(result["milk"]).toBe("Dairy & Eggs");
    expect(result["chicken"]).toBe("Meat & Seafood");
  });

  it("calls the LLM for unknown items and writes results to the cache", async () => {
    __setTestClient(makeFakeClient([
      makeChatResponse({
        classifications: [
          { item: "yuzu", aisle: "Produce" },
          { item: "buttermilk", aisle: "Dairy & Eggs" },
        ],
      }),
    ]));

    const result = await classifyIngredients(["yuzu", "buttermilk"]);
    expect(result["yuzu"]).toBe("Produce");
    expect(result["buttermilk"]).toBe("Dairy & Eggs");

    // Cache should now contain both entries.
    const cached = await getDb().query<{ item_normalized: string; aisle: string }>(
      "select item_normalized, aisle from ingredient_aisles order by item_normalized"
    );
    expect(cached.rows.map((r) => r.item_normalized).sort()).toEqual(["buttermilk", "yuzu"]);
  });

  it("hits the cache on a second call for the same items (no LLM needed)", async () => {
    // First call seeds the cache via LLM.
    __setTestClient(makeFakeClient([
      makeChatResponse({
        classifications: [{ item: "yuzu", aisle: "Produce" }],
      }),
    ]));
    await classifyIngredients(["yuzu"]);

    // Second call: fake client throws if asked, but it shouldn't be asked.
    __setTestClient(makeFakeClient([])); // empty
    const second = await classifyIngredients(["yuzu"]);
    expect(second["yuzu"]).toBe("Produce");
  });

  it("falls back to Other when the LLM call fails", async () => {
    __setTestClient({
      chat: {
        completions: {
          create: async () => {
            throw new Error("network down");
          },
        },
      },
    } as unknown as Parameters<typeof __setTestClient>[0]);

    const result = await classifyIngredients(["zogglefruit"]);
    expect(result["zogglefruit"]).toBe("Other");
  });
});
```

- [ ] **Step 2: Run — verify RED**

```bash
npm test -- --run src/lib/__tests__/ingredient-aisles.test.ts 2>&1 | tail -10
```

Expected: import error.

- [ ] **Step 3: Implement**

Create `Source_Code/src/lib/ingredient-aisles.ts`:

```typescript
import { getDb } from "@/lib/db";
import type { QueryRow } from "@/lib/db";
import { getOpenAI } from "@/lib/ai-recipe";

export type Aisle =
  | "Produce"
  | "Dairy & Eggs"
  | "Meat & Seafood"
  | "Bakery"
  | "Pantry"
  | "Frozen"
  | "Other";

export const AISLES: readonly Aisle[] = [
  "Produce",
  "Dairy & Eggs",
  "Meat & Seafood",
  "Bakery",
  "Pantry",
  "Frozen",
  "Other",
];

const KEYWORDS: Record<Exclude<Aisle, "Other">, readonly string[]> = {
  "Produce": [
    "tomato","onion","garlic","lettuce","carrot","spinach","kale",
    "apple","banana","orange","lemon","lime","grape","berry","strawberry",
    "potato","cucumber","celery","pepper","mushroom","zucchini","broccoli",
    "cauliflower","ginger","cilantro","parsley","basil","mint","avocado","cabbage",
  ],
  "Dairy & Eggs": [
    "milk","cheese","yogurt","butter","cream","sour cream","egg","eggs",
    "mozzarella","cheddar","parmesan","ricotta","feta",
  ],
  "Meat & Seafood": [
    "chicken","beef","pork","lamb","turkey","bacon","sausage","ham",
    "fish","salmon","tuna","cod","shrimp","scallop","prawn",
  ],
  "Bakery": [
    "bread","baguette","croissant","bun","tortilla","pita","naan","bagel",
  ],
  "Pantry": [
    "pasta","spaghetti","rice","flour","sugar","salt","pepper","oil","olive oil",
    "vinegar","soy sauce","honey","cumin","paprika","cinnamon",
    "tomato sauce","stock","broth","baking powder","yeast","oat","cereal",
    "bean","lentil","chickpea","nut","almond","walnut","pecan","peanut",
  ],
  "Frozen": ["frozen", "ice cream"],
};

function normalize(item: string): string {
  return item.trim().toLowerCase();
}

export function keywordClassify(item: string): Aisle | null {
  const norm = normalize(item);
  if (!norm) return null;
  for (const aisle of Object.keys(KEYWORDS) as Array<keyof typeof KEYWORDS>) {
    for (const kw of KEYWORDS[aisle]) {
      if (norm.includes(kw)) return aisle as Aisle;
    }
  }
  return null;
}

interface AisleRow extends QueryRow {
  item_normalized: string;
  aisle: Aisle;
}

async function lookupCache(
  items: readonly string[]
): Promise<Map<string, Aisle>> {
  if (items.length === 0) return new Map();
  const db = getDb();
  const result = await db.query<AisleRow>(
    `select item_normalized, aisle
       from ingredient_aisles
      where item_normalized = any($1::text[])`,
    [items as unknown[]]
  );
  const map = new Map<string, Aisle>();
  for (const row of result.rows) map.set(row.item_normalized, row.aisle);
  return map;
}

const LLM_SYSTEM = `You categorize grocery ingredients into one of these aisles:
Produce, Dairy & Eggs, Meat & Seafood, Bakery, Pantry, Frozen, Other.
Always return the result via the JSON schema. Use Other for items that don't fit.`;

const LLM_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "classifications",
    strict: true,
    schema: {
      type: "object" as const,
      additionalProperties: false,
      required: ["classifications"],
      properties: {
        classifications: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["item", "aisle"],
            properties: {
              item: { type: "string" },
              aisle: {
                type: "string",
                enum: [...AISLES],
              },
            },
          },
        },
      },
    },
  },
};

async function llmBatchClassify(
  items: readonly string[]
): Promise<Record<string, Aisle>> {
  if (items.length === 0) return {};
  const fallback = (): Record<string, Aisle> =>
    Object.fromEntries(items.map((i) => [i, "Other" as Aisle]));
  try {
    const client = getOpenAI();
    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      max_tokens: 1024,
      messages: [
        { role: "system", content: LLM_SYSTEM },
        {
          role: "user",
          content: `Categorize each item:\n${items.map((i) => `- ${i}`).join("\n")}`,
        },
      ],
      response_format: LLM_RESPONSE_FORMAT,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) return fallback();
    const parsed = JSON.parse(content) as {
      classifications: { item: string; aisle: Aisle }[];
    };
    const out: Record<string, Aisle> = {};
    for (const c of parsed.classifications) {
      out[normalize(c.item)] = c.aisle;
    }
    for (const item of items) {
      if (!(item in out)) out[item] = "Other";
    }
    return out;
  } catch {
    return fallback();
  }
}

async function writeCache(map: Record<string, Aisle>): Promise<void> {
  const entries = Object.entries(map);
  if (entries.length === 0) return;
  const db = getDb();
  for (const [item, aisle] of entries) {
    await db.query(
      `insert into ingredient_aisles (item_normalized, aisle, source)
         values ($1, $2, 'llm')
         on conflict (item_normalized) do nothing`,
      [item, aisle]
    );
  }
}

export async function classifyIngredients(
  items: readonly string[]
): Promise<Record<string, Aisle>> {
  const result: Record<string, Aisle> = {};
  const unique = [...new Set(items.map(normalize))].filter((s) => s.length > 0);
  if (unique.length === 0) return result;

  // 1. Cache.
  const cached = await lookupCache(unique);
  for (const [item, aisle] of cached) result[item] = aisle;

  // 2. Keyword map.
  const stillMissing: string[] = [];
  for (const item of unique) {
    if (item in result) continue;
    const fromKw = keywordClassify(item);
    if (fromKw) {
      result[item] = fromKw;
    } else {
      stillMissing.push(item);
    }
  }

  // 3. LLM + cache write-back.
  if (stillMissing.length > 0) {
    const fromLlm = await llmBatchClassify(stillMissing);
    for (const [item, aisle] of Object.entries(fromLlm)) result[item] = aisle;
    await writeCache(fromLlm);
  }

  return result;
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/lib/__tests__/ingredient-aisles.test.ts 2>&1 | tail -10
```

Expected: 8 tests PASS.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add Source_Code/src/lib/ingredient-aisles.ts Source_Code/src/lib/__tests__/ingredient-aisles.test.ts
git commit -m "feat: ingredient-aisles classifier (keyword + cache + LLM)

Hybrid classification: cache lookup → keyword map → LLM batch (with
write-back to cache). Reuses lib/ai-recipe.ts getOpenAI() factory and
test seam. LLM failure falls back to 'Other' so the shopping list
always renders."
```

---

## Phase 3: API routes (TDD)

### Task 7: `POST /api/meal-plan/slots`

**Files:**
- Create: `Source_Code/src/app/api/meal-plan/slots/route.ts`
- Create: `Source_Code/src/app/api/meal-plan/__tests__/slots.test.ts`

- [ ] **Step 1: Write failing tests**

Create `Source_Code/src/app/api/meal-plan/__tests__/slots.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { POST } from "@/app/api/meal-plan/slots/route";
import { registerUser, createSession } from "@/lib/auth";
import { createRecipe } from "@/lib/recipes";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";
import type { CreateRecipePayload } from "@/types/recipe";

const SAMPLE: CreateRecipePayload = {
  title: "T", description: "x", category: "Dinner",
  prepTime: 1, cookTime: 1, servings: 4,
  ingredients: [{ amount: "1", unit: "u", item: "stuff" }],
  instructions: ["x"], tags: [],
};

async function loginAndRecipe() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  cookieJar.set(AUTH_SESSION_COOKIE, (await createSession(reg.user.id)).token);
  const recipe = await createRecipe(reg.user.id, SAMPLE);
  return { userId: reg.user.id, recipeId: recipe.id };
}

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/meal-plan/slots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => cookieJar.clear());

describe("POST /api/meal-plan/slots", () => {
  it("returns 401 when not logged in", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing fields", async () => {
    await loginAndRecipe();
    const res = await POST(makeReq({ date: "2026-04-27" })); // missing other fields
    expect(res.status).toBe(400);
  });

  it("returns 400 on an invalid meal_type", async () => {
    const { recipeId } = await loginAndRecipe();
    const res = await POST(makeReq({
      date: "2026-04-27", mealType: "midnight", recipeId, servings: 2,
    }));
    expect(res.status).toBe(400);
  });

  it("creates a slot on valid input", async () => {
    const { recipeId } = await loginAndRecipe();
    const res = await POST(makeReq({
      date: "2026-04-27", mealType: "evening", recipeId, servings: 2,
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slot.mealType).toBe("evening");
    expect(body.slot.servings).toBe(2);
  });

  it("returns 409 on duplicate slot", async () => {
    const { recipeId } = await loginAndRecipe();
    const payload = { date: "2026-04-27", mealType: "evening", recipeId, servings: 2 };
    await POST(makeReq(payload));
    const dup = await POST(makeReq(payload));
    expect(dup.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run — verify RED**

```bash
npm test -- --run src/app/api/meal-plan/__tests__/slots.test.ts 2>&1 | tail -10
```

Expected: import error.

- [ ] **Step 3: Implement**

Create `Source_Code/src/app/api/meal-plan/slots/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { createSlot, MEAL_TYPES, type MealType } from "@/lib/meal-plan";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface CreateBody {
  readonly date: string;
  readonly mealType: MealType;
  readonly recipeId: string;
  readonly servings: number;
}

function isCreateBody(value: unknown): value is CreateBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.date === "string" &&
    ISO_DATE_RE.test(v.date) &&
    typeof v.mealType === "string" &&
    (MEAL_TYPES as readonly string[]).includes(v.mealType) &&
    typeof v.recipeId === "string" &&
    typeof v.servings === "number" &&
    Number.isInteger(v.servings) &&
    v.servings >= 1
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isCreateBody(body)) {
    return NextResponse.json(
      { error: "Body must include date (YYYY-MM-DD), mealType, recipeId, and servings >= 1." },
      { status: 400 }
    );
  }

  const result = await createSlot({
    userId: user.id,
    date: body.date,
    mealType: body.mealType,
    recipeId: body.recipeId,
    servings: body.servings,
  });
  if ("error" in result) {
    if (result.error === "This slot is already filled.") {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ slot: result.slot }, { status: 201 });
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/app/api/meal-plan/__tests__/slots.test.ts 2>&1 | tail -10
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add Source_Code/src/app/api/meal-plan/slots/route.ts \
        Source_Code/src/app/api/meal-plan/__tests__/slots.test.ts
git commit -m "feat: POST /api/meal-plan/slots"
```

---

### Task 8: `PATCH/DELETE /api/meal-plan/slots/[id]`

**Files:**
- Create: `Source_Code/src/app/api/meal-plan/slots/[id]/route.ts`
- Modify: `Source_Code/src/app/api/meal-plan/__tests__/slots.test.ts` (extend)

- [ ] **Step 1: Append tests for PATCH and DELETE**

Append to the existing `Source_Code/src/app/api/meal-plan/__tests__/slots.test.ts`:

```typescript
import { PATCH, DELETE } from "@/app/api/meal-plan/slots/[id]/route";

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/meal-plan/slots/[id]", () => {
  it("returns 401 when not logged in", async () => {
    const req = new Request("http://localhost/api/meal-plan/slots/x", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servings: 4 }),
    });
    const res = await PATCH(req, paramsFor("00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(401);
  });

  it("updates servings and returns the new slot", async () => {
    const { recipeId } = await loginAndRecipe();
    const create = await POST(makeReq({
      date: "2026-04-27", mealType: "morning", recipeId, servings: 1,
    }));
    const created = (await create.json()).slot;

    const patchReq = new Request("http://localhost/api/meal-plan/slots/x", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servings: 5 }),
    });
    const res = await PATCH(patchReq, paramsFor(created.id));
    expect(res.status).toBe(200);
    expect((await res.json()).slot.servings).toBe(5);
  });

  it("returns 404 for an unknown slot id", async () => {
    await loginAndRecipe();
    const req = new Request("http://localhost/api/meal-plan/slots/x", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servings: 5 }),
    });
    const res = await PATCH(req, paramsFor("00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/meal-plan/slots/[id]", () => {
  it("returns 204 on successful delete", async () => {
    const { recipeId } = await loginAndRecipe();
    const create = await POST(makeReq({
      date: "2026-04-27", mealType: "morning", recipeId, servings: 1,
    }));
    const created = (await create.json()).slot;

    const req = new Request(`http://localhost/api/meal-plan/slots/${created.id}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, paramsFor(created.id));
    expect(res.status).toBe(204);
  });

  it("returns 404 for an unknown slot", async () => {
    await loginAndRecipe();
    const req = new Request("http://localhost/api/meal-plan/slots/x", { method: "DELETE" });
    const res = await DELETE(req, paramsFor("00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run — verify RED**

```bash
npm test -- --run src/app/api/meal-plan/__tests__/slots.test.ts 2>&1 | tail -10
```

Expected: import error for `[id]/route`.

- [ ] **Step 3: Implement**

Create `Source_Code/src/app/api/meal-plan/slots/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { updateSlot, deleteSlot } from "@/lib/meal-plan";

interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

interface PatchBody {
  readonly recipeId?: string;
  readonly servings?: number;
}

function isPatchBody(value: unknown): value is PatchBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.recipeId !== undefined && typeof v.recipeId !== "string") return false;
  if (v.servings !== undefined) {
    if (typeof v.servings !== "number") return false;
    if (!Number.isInteger(v.servings) || v.servings < 1) return false;
  }
  return v.recipeId !== undefined || v.servings !== undefined;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!isPatchBody(body)) {
    return NextResponse.json(
      { error: "Body must include recipeId and/or servings (>= 1)." },
      { status: 400 }
    );
  }

  const updated = await updateSlot({
    slotId: id,
    userId: user.id,
    recipeId: body.recipeId,
    servings: body.servings,
  });
  if (!updated) {
    return NextResponse.json({ error: "Slot not found." }, { status: 404 });
  }
  return NextResponse.json({ slot: updated });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;
  const ok = await deleteSlot(id, user.id);
  if (!ok) {
    return NextResponse.json({ error: "Slot not found." }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/app/api/meal-plan/__tests__/slots.test.ts 2>&1 | tail -10
```

Expected: all tests PASS (5 from T7 + 5 new = 10).

- [ ] **Step 5: Commit**

```bash
git add Source_Code/src/app/api/meal-plan/slots/\[id\]/route.ts \
        Source_Code/src/app/api/meal-plan/__tests__/slots.test.ts
git commit -m "feat: PATCH/DELETE /api/meal-plan/slots/[id]"
```

---

### Task 9: `PATCH /api/meal-plan/slots/bulk-servings`

**Files:**
- Create: `Source_Code/src/app/api/meal-plan/slots/bulk-servings/route.ts`
- Create: `Source_Code/src/app/api/meal-plan/__tests__/bulk-servings.test.ts`

- [ ] **Step 1: Write failing tests**

Create `Source_Code/src/app/api/meal-plan/__tests__/bulk-servings.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { PATCH } from "@/app/api/meal-plan/slots/bulk-servings/route";
import { POST as createPOST } from "@/app/api/meal-plan/slots/route";
import { registerUser, createSession } from "@/lib/auth";
import { createRecipe } from "@/lib/recipes";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";

async function setup() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  cookieJar.set(AUTH_SESSION_COOKIE, (await createSession(reg.user.id)).token);
  const recipe = await createRecipe(reg.user.id, {
    title: "T", description: "x", category: "Dinner",
    prepTime: 1, cookTime: 1, servings: 4,
    ingredients: [{ amount: "1", unit: "u", item: "stuff" }],
    instructions: ["x"], tags: [],
  });
  return { recipeId: recipe.id };
}

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/meal-plan/slots/bulk-servings", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => cookieJar.clear());

describe("PATCH /api/meal-plan/slots/bulk-servings", () => {
  it("returns 401 when not logged in", async () => {
    const res = await PATCH(makeReq({ weekStart: "2026-04-27", servings: 4 }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on bad input", async () => {
    await setup();
    const res = await PATCH(makeReq({ weekStart: "not-a-date", servings: 4 }));
    expect(res.status).toBe(400);
  });

  it("updates all slots in the week and reports the count", async () => {
    const { recipeId } = await setup();
    const createReq = (date: string, mealType: string) =>
      new Request("http://localhost/api/meal-plan/slots", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, mealType, recipeId, servings: 1 }),
      });
    await createPOST(createReq("2026-04-27", "morning"));
    await createPOST(createReq("2026-04-29", "noon"));

    const res = await PATCH(makeReq({ weekStart: "2026-04-27", servings: 4 }));
    expect(res.status).toBe(200);
    expect((await res.json()).updated).toBe(2);
  });
});
```

- [ ] **Step 2: Run — verify RED**

```bash
npm test -- --run src/app/api/meal-plan/__tests__/bulk-servings.test.ts 2>&1 | tail -10
```

Expected: import error.

- [ ] **Step 3: Implement**

Create `Source_Code/src/app/api/meal-plan/slots/bulk-servings/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { bulkUpdateServings } from "@/lib/meal-plan";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface BulkBody {
  readonly weekStart: string;
  readonly servings: number;
}

function isBulkBody(value: unknown): value is BulkBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.weekStart === "string" &&
    ISO_DATE_RE.test(v.weekStart) &&
    typeof v.servings === "number" &&
    Number.isInteger(v.servings) &&
    v.servings >= 1
  );
}

export async function PATCH(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!isBulkBody(body)) {
    return NextResponse.json(
      { error: "Body must include weekStart (YYYY-MM-DD) and servings (>= 1)." },
      { status: 400 }
    );
  }

  const updated = await bulkUpdateServings(user.id, body.weekStart, body.servings);
  return NextResponse.json({ updated });
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/app/api/meal-plan/__tests__/bulk-servings.test.ts 2>&1 | tail -10
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add Source_Code/src/app/api/meal-plan/slots/bulk-servings/route.ts \
        Source_Code/src/app/api/meal-plan/__tests__/bulk-servings.test.ts
git commit -m "feat: PATCH /api/meal-plan/slots/bulk-servings"
```

---

### Task 10: `POST /api/meal-plan/shopping`

**Files:**
- Create: `Source_Code/src/app/api/meal-plan/shopping/route.ts`
- Create: `Source_Code/src/app/api/meal-plan/__tests__/shopping.test.ts`

- [ ] **Step 1: Write failing tests**

Create `Source_Code/src/app/api/meal-plan/__tests__/shopping.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { POST } from "@/app/api/meal-plan/shopping/route";
import { POST as slotsPOST } from "@/app/api/meal-plan/slots/route";
import { __setTestClient, __resetClient } from "@/lib/ai-recipe";
import { registerUser, createSession } from "@/lib/auth";
import { createRecipe } from "@/lib/recipes";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";

function makeFakeClient(responses: unknown[]) {
  let i = 0;
  return {
    chat: { completions: { create: async () => responses[i++] } },
  } as unknown as Parameters<typeof __setTestClient>[0];
}

function makeChatResponse(payload: unknown) {
  return {
    id: "x", object: "chat.completion", created: 0, model: "gpt-4.1-mini",
    choices: [{
      index: 0, finish_reason: "stop",
      message: { role: "assistant", content: JSON.stringify(payload), refusal: null },
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

async function setup() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  cookieJar.set(AUTH_SESSION_COOKIE, (await createSession(reg.user.id)).token);
  return { userId: reg.user.id };
}

function shoppingReq(body: unknown): Request {
  return new Request("http://localhost/api/meal-plan/shopping", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => cookieJar.clear());
afterEach(() => __resetClient());

describe("POST /api/meal-plan/shopping", () => {
  it("returns 401 when not logged in", async () => {
    const res = await POST(shoppingReq({ weekStart: "2026-04-27" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on a malformed weekStart", async () => {
    await setup();
    const res = await POST(shoppingReq({ weekStart: "not-a-date" }));
    expect(res.status).toBe(400);
  });

  it("returns an empty list when the week has no slots", async () => {
    await setup();
    __setTestClient(makeFakeClient([])); // no LLM should be called
    const res = await POST(shoppingReq({ weekStart: "2026-04-27" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.aisles).toEqual({});
  });

  it("aggregates and groups ingredients across slots in the week", async () => {
    const { userId } = await setup();
    __setTestClient(makeFakeClient([])); // all items resolved by keyword map

    const recipe = await createRecipe(userId, {
      title: "Pasta", description: "x", category: "Dinner",
      prepTime: 1, cookTime: 1, servings: 4,
      ingredients: [
        { amount: "200", unit: "g", item: "spaghetti" },
        { amount: "4", unit: "cloves", item: "garlic" },
      ],
      instructions: ["cook"], tags: [],
    });

    const slotReq = (date: string, mealType: string) =>
      new Request("http://localhost/api/meal-plan/slots", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, mealType, recipeId: recipe.id, servings: 4 }),
      });
    await slotsPOST(slotReq("2026-04-27", "evening"));
    await slotsPOST(slotReq("2026-04-29", "evening"));

    const res = await POST(shoppingReq({ weekStart: "2026-04-27" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // spaghetti and garlic both fall under Pantry / Produce respectively per the keyword map
    expect(body.aisles).toBeDefined();
    const flatItems = Object.values(body.aisles).flat() as Array<{ item: string; amount: string }>;
    const spag = flatItems.find((i) => i.item.toLowerCase() === "spaghetti");
    const garlic = flatItems.find((i) => i.item.toLowerCase() === "garlic");
    expect(spag?.amount).toBe("400"); // 200 + 200
    expect(garlic?.amount).toBe("8");  // 4 + 4
  });
});
```

- [ ] **Step 2: Run — verify RED**

```bash
npm test -- --run src/app/api/meal-plan/__tests__/shopping.test.ts 2>&1 | tail -10
```

Expected: import error.

- [ ] **Step 3: Implement**

Create `Source_Code/src/app/api/meal-plan/shopping/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { listSlotsForWeek } from "@/lib/meal-plan";
import { getRecipeById } from "@/lib/recipes";
import { aggregateIngredients } from "@/lib/shopping-list";
import { classifyIngredients, AISLES } from "@/lib/ingredient-aisles";
import type { Aisle } from "@/lib/ingredient-aisles";
import type { AggregatedItem } from "@/lib/shopping-list";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface ShoppingBody {
  readonly weekStart: string;
}

function isShoppingBody(value: unknown): value is ShoppingBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.weekStart === "string" && ISO_DATE_RE.test(v.weekStart);
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!isShoppingBody(body)) {
    return NextResponse.json(
      { error: "Body must include weekStart (YYYY-MM-DD)." },
      { status: 400 }
    );
  }

  // 1. Fetch slots + recipes for the week.
  const slots = await listSlotsForWeek(user.id, body.weekStart);
  if (slots.length === 0) {
    return NextResponse.json({ aisles: {} });
  }

  const recipeIds = [...new Set(slots.map((s) => s.recipeId))];
  const recipeMap = new Map<string, Awaited<ReturnType<typeof getRecipeById>>>();
  for (const rid of recipeIds) {
    recipeMap.set(rid, await getRecipeById(rid));
  }

  const slotsWithRecipes = slots
    .map((s) => {
      const r = recipeMap.get(s.recipeId);
      return r ? { servings: s.servings, recipe: r } : null;
    })
    .filter((x): x is { servings: number; recipe: NonNullable<typeof x extends null ? never : typeof x>["recipe"] } => x !== null);

  // 2. Aggregate (pure).
  const items = aggregateIngredients(slotsWithRecipes);

  // 3. Classify by aisle.
  const itemNames = items.map((i) => i.item);
  const classification = await classifyIngredients(itemNames);

  // 4. Group by aisle.
  const aisles: Partial<Record<Aisle, AggregatedItem[]>> = {};
  for (const item of items) {
    const aisle = classification[item.item.toLowerCase()] ?? "Other";
    if (!aisles[aisle]) aisles[aisle] = [];
    aisles[aisle]!.push(item);
  }

  // 5. Sort items within each aisle by item name; return aisles in canonical order.
  const ordered: Partial<Record<Aisle, AggregatedItem[]>> = {};
  for (const a of AISLES) {
    if (aisles[a] && aisles[a]!.length > 0) {
      ordered[a] = [...aisles[a]!].sort((x, y) => x.item.localeCompare(y.item));
    }
  }

  return NextResponse.json({ aisles: ordered });
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/app/api/meal-plan/__tests__/shopping.test.ts 2>&1 | tail -10
```

Expected: 4 tests PASS.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add Source_Code/src/app/api/meal-plan/shopping/route.ts \
        Source_Code/src/app/api/meal-plan/__tests__/shopping.test.ts
git commit -m "feat: POST /api/meal-plan/shopping (aggregate + classify + group by aisle)"
```

---

## Phase 4: Frontend

### Task 11: `/meal-plan` server page + Header link + minimal client shell

**Files:**
- Create: `Source_Code/src/app/meal-plan/page.tsx`
- Create: `Source_Code/src/components/meal-plan/MealPlanClient.tsx` (minimal stub for now)
- Modify: `Source_Code/src/components/Header.tsx`

- [ ] **Step 1: Add Header link**

Open `Source_Code/src/components/Header.tsx`. Find the existing nav links and add:

```tsx
<Link
  href="/meal-plan"
  className="text-sm font-medium text-zinc-700 hover:text-orange-600 dark:text-zinc-300 dark:hover:text-orange-400"
>
  Meal Plan
</Link>
```

(Place it near the existing top-nav links — the exact location depends on the current Header layout. Match its styling to the surrounding links.)

- [ ] **Step 2: Create the server page**

Create `Source_Code/src/app/meal-plan/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { listSlotsForWeek } from "@/lib/meal-plan";
import { currentWeekStart, mondayOf } from "@/lib/week";
import { MealPlanClient } from "@/components/meal-plan/MealPlanClient";
import { getRecipesByAuthor } from "@/lib/recipes";

export const metadata: Metadata = { title: "Meal Plan | RecipeBox" };

interface PageProps {
  readonly searchParams: Promise<{ week?: string }>;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function MealPlanPage({ searchParams }: PageProps) {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const requested = sp.week && ISO_DATE_RE.test(sp.week) ? sp.week : null;
  const weekStart = requested ? mondayOf(new Date(`${requested}T00:00:00Z`)) : currentWeekStart();

  const [slots, recipes] = await Promise.all([
    listSlotsForWeek(user.id, weekStart),
    getRecipesByAuthor(user.id),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          Meal Plan
        </h1>
        <MealPlanClient
          weekStart={weekStart}
          initialSlots={slots}
          allRecipes={recipes}
        />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Create a minimal client stub**

Create `Source_Code/src/components/meal-plan/MealPlanClient.tsx`:

```typescript
"use client";

import type { MealPlanSlot } from "@/lib/meal-plan";
import type { Recipe } from "@/types/recipe";

interface MealPlanClientProps {
  readonly weekStart: string;
  readonly initialSlots: readonly MealPlanSlot[];
  readonly allRecipes: readonly Recipe[];
}

export function MealPlanClient({ weekStart, initialSlots, allRecipes }: MealPlanClientProps) {
  return (
    <div className="text-sm text-zinc-700 dark:text-zinc-300">
      Week of {weekStart} — {initialSlots.length} slot(s), {allRecipes.length} recipe(s)
    </div>
  );
}
```

We'll fill this out in Tasks 12-16. For now, the page renders, the link works, and tests still pass.

- [ ] **Step 4: Type-check + run existing tests**

```bash
npx tsc --noEmit
npm test 2>&1 | tail -5
```

Expected: tsc clean, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add Source_Code/src/app/meal-plan/page.tsx \
        Source_Code/src/components/meal-plan/MealPlanClient.tsx \
        Source_Code/src/components/Header.tsx
git commit -m "feat: /meal-plan server page + Header link + client shell"
```

---

### Task 12: `WeekNav` component

**Files:**
- Create: `Source_Code/src/components/meal-plan/WeekNav.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import Link from "next/link";
import { addWeeks, currentWeekStart } from "@/lib/week";

interface WeekNavProps {
  readonly weekStart: string;
}

function formatRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startLabel = start.toLocaleDateString(undefined, opts);
  const endLabel = end.toLocaleDateString(undefined, opts);
  return `${startLabel} – ${endLabel}`;
}

export function WeekNav({ weekStart }: WeekNavProps) {
  const prev = addWeeks(weekStart, -1);
  const next = addWeeks(weekStart, 1);
  const today = currentWeekStart();

  return (
    <nav className="flex items-center gap-2 text-sm">
      <Link
        href={`/meal-plan?week=${prev}`}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
      >
        ‹ Prev
      </Link>
      <Link
        href={`/meal-plan?week=${today}`}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
      >
        Today
      </Link>
      <Link
        href={`/meal-plan?week=${next}`}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
      >
        Next ›
      </Link>
      <span className="ml-2 text-zinc-600 dark:text-zinc-400">
        {formatRange(weekStart)}
      </span>
    </nav>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/components/meal-plan/WeekNav.tsx
git commit -m "feat: WeekNav component (prev / today / next + range label)"
```

---

### Task 13: `RecipePickerModal` component

**Files:**
- Create: `Source_Code/src/components/meal-plan/RecipePickerModal.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useMemo, useState } from "react";
import type { Recipe } from "@/types/recipe";

interface RecipePickerModalProps {
  readonly open: boolean;
  readonly recipes: readonly Recipe[];
  readonly onSelect: (recipe: Recipe) => void;
  readonly onClose: () => void;
}

export function RecipePickerModal({ open, recipes, onSelect, onClose }: RecipePickerModalProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((r) =>
      r.title.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [recipes, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 py-12"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Pick a recipe
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your recipes..."
          autoFocus
          className="mt-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />

        <ul className="mt-4 max-h-96 space-y-1 overflow-y-auto">
          {filtered.length === 0 && (
            <li className="py-4 text-center text-sm text-zinc-500">
              {recipes.length === 0
                ? "You don't have any recipes yet. Create one first."
                : "No matches."}
            </li>
          )}
          {filtered.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r)}
                className="block w-full rounded-lg border border-transparent px-3 py-2 text-left hover:border-orange-200 hover:bg-orange-50 dark:hover:border-orange-900/40 dark:hover:bg-orange-950/30"
              >
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{r.title}</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {r.category} · serves {r.servings} · {r.prepTime + r.cookTime} min
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/components/meal-plan/RecipePickerModal.tsx
git commit -m "feat: RecipePickerModal component (search + tap-to-select)"
```

---

### Task 14: `EmptySlot` and `MealSlotCard` components

**Files:**
- Create: `Source_Code/src/components/meal-plan/EmptySlot.tsx`
- Create: `Source_Code/src/components/meal-plan/MealSlotCard.tsx`

- [ ] **Step 1: Create `EmptySlot`**

```typescript
"use client";

import type { MealType } from "@/lib/meal-plan";

const LABELS: Record<MealType, string> = {
  morning: "Morning",
  noon: "Noon",
  evening: "Evening",
};

interface EmptySlotProps {
  readonly mealType: MealType;
  readonly onAdd: () => void;
}

export function EmptySlot({ mealType, onAdd }: EmptySlotProps) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex w-full items-center justify-between rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-2 text-left text-sm text-zinc-500 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500 dark:hover:border-orange-900/60 dark:hover:bg-orange-950/30 dark:hover:text-orange-400"
    >
      <span className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {LABELS[mealType]}
      </span>
      <span>+ Add meal</span>
    </button>
  );
}
```

- [ ] **Step 2: Create `MealSlotCard`**

```typescript
"use client";

import { useState, useTransition } from "react";
import type { MealPlanSlot, MealType } from "@/lib/meal-plan";
import type { Recipe } from "@/types/recipe";

const LABELS: Record<MealType, string> = {
  morning: "Morning",
  noon: "Noon",
  evening: "Evening",
};

interface MealSlotCardProps {
  readonly slot: MealPlanSlot;
  readonly recipe: Recipe | undefined;
  readonly onUpdated: (slot: MealPlanSlot) => void;
  readonly onDeleted: (slotId: string) => void;
}

export function MealSlotCard({ slot, recipe, onUpdated, onDeleted }: MealSlotCardProps) {
  const [servings, setServings] = useState(slot.servings);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleServingsChange(value: number): void {
    if (!Number.isInteger(value) || value < 1) return;
    setServings(value);
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/meal-plan/slots/${slot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servings: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not update servings.");
        setServings(slot.servings);
        return;
      }
      const body = await res.json();
      onUpdated(body.slot);
    });
  }

  function handleDelete(): void {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/meal-plan/slots/${slot.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not delete.");
        return;
      }
      onDeleted(slot.id);
    });
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {LABELS[slot.mealType]}
        </span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          aria-label="Delete slot"
          className="text-zinc-400 hover:text-red-600 disabled:opacity-50"
        >
          ×
        </button>
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {recipe?.title ?? "(deleted recipe)"}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <label className="text-xs text-zinc-500 dark:text-zinc-400">Servings</label>
        <input
          type="number"
          min={1}
          value={servings}
          onChange={(e) => handleServingsChange(parseInt(e.target.value, 10) || 1)}
          disabled={isPending}
          className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/components/meal-plan/EmptySlot.tsx \
        Source_Code/src/components/meal-plan/MealSlotCard.tsx
git commit -m "feat: EmptySlot and MealSlotCard components"
```

---

### Task 15: `DayColumn` and `ServingsControls`

**Files:**
- Create: `Source_Code/src/components/meal-plan/DayColumn.tsx`
- Create: `Source_Code/src/components/meal-plan/ServingsControls.tsx`

- [ ] **Step 1: Create `DayColumn`**

```typescript
"use client";

import type { MealPlanSlot, MealType } from "@/lib/meal-plan";
import { MEAL_TYPES } from "@/lib/meal-plan";
import type { Recipe } from "@/types/recipe";
import { EmptySlot } from "@/components/meal-plan/EmptySlot";
import { MealSlotCard } from "@/components/meal-plan/MealSlotCard";

interface DayColumnProps {
  readonly date: string; // YYYY-MM-DD
  readonly slots: readonly MealPlanSlot[]; // already filtered to this date
  readonly recipesById: ReadonlyMap<string, Recipe>;
  readonly onAdd: (date: string, mealType: MealType) => void;
  readonly onUpdated: (slot: MealPlanSlot) => void;
  readonly onDeleted: (slotId: string) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const idx = (d.getUTCDay() + 6) % 7; // Mon=0, ..., Sun=6
  return `${WEEKDAYS[idx]} ${d.getUTCDate()}`;
}

export function DayColumn(props: DayColumnProps) {
  const slotByType = new Map<MealType, MealPlanSlot>();
  for (const s of props.slots) slotByType.set(s.mealType, s);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        {dayLabel(props.date)}
      </h3>
      {MEAL_TYPES.map((type) => {
        const slot = slotByType.get(type);
        if (slot) {
          return (
            <MealSlotCard
              key={type}
              slot={slot}
              recipe={props.recipesById.get(slot.recipeId)}
              onUpdated={props.onUpdated}
              onDeleted={props.onDeleted}
            />
          );
        }
        return (
          <EmptySlot
            key={type}
            mealType={type}
            onAdd={() => props.onAdd(props.date, type)}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create `ServingsControls`**

```typescript
"use client";

import { useState, useTransition } from "react";

interface ServingsControlsProps {
  readonly weekStart: string;
  readonly onApplied: (servings: number) => void;
}

export function ServingsControls({ weekStart, onApplied }: ServingsControlsProps) {
  const [value, setValue] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleApply(): void {
    if (!Number.isInteger(value) || value < 1) {
      setError("Must be a positive integer.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/meal-plan/slots/bulk-servings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, servings: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not apply.");
        return;
      }
      onApplied(value);
    });
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="text-zinc-600 dark:text-zinc-400">Default servings</label>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => setValue(parseInt(e.target.value, 10) || 1)}
        className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <button
        type="button"
        onClick={handleApply}
        disabled={isPending}
        className="rounded-md bg-orange-600 px-3 py-1 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
      >
        Apply to all
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/components/meal-plan/DayColumn.tsx \
        Source_Code/src/components/meal-plan/ServingsControls.tsx
git commit -m "feat: DayColumn and ServingsControls components"
```

---

### Task 16: Wire `MealPlanClient` together

**Files:**
- Modify: `Source_Code/src/components/meal-plan/MealPlanClient.tsx`

- [ ] **Step 1: Replace the stub with the full container**

Overwrite `Source_Code/src/components/meal-plan/MealPlanClient.tsx`:

```typescript
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MealPlanSlot, MealType } from "@/lib/meal-plan";
import type { Recipe } from "@/types/recipe";
import { addWeeks } from "@/lib/week";
import { WeekNav } from "@/components/meal-plan/WeekNav";
import { DayColumn } from "@/components/meal-plan/DayColumn";
import { ServingsControls } from "@/components/meal-plan/ServingsControls";
import { RecipePickerModal } from "@/components/meal-plan/RecipePickerModal";

interface MealPlanClientProps {
  readonly weekStart: string;
  readonly initialSlots: readonly MealPlanSlot[];
  readonly allRecipes: readonly Recipe[];
}

function weekDates(weekStart: string): readonly string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) out.push(addWeeks(weekStart, 0).replace(weekStart, weekStart));
  // Actual implementation: build by adding days, not weeks.
  return out;
}

// Replace weekDates with a correct implementation:
function buildWeekDates(weekStart: string): readonly string[] {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function MealPlanClient({ weekStart, initialSlots, allRecipes }: MealPlanClientProps) {
  const [slots, setSlots] = useState<readonly MealPlanSlot[]>(initialSlots);
  const [pickerTarget, setPickerTarget] = useState<{ date: string; mealType: MealType } | null>(null);
  const [defaultServings, setDefaultServings] = useState(4);

  const recipesById = useMemo(() => {
    const m = new Map<string, Recipe>();
    for (const r of allRecipes) m.set(r.id, r);
    return m;
  }, [allRecipes]);

  const dates = useMemo(() => buildWeekDates(weekStart), [weekStart]);

  function slotsForDate(date: string): readonly MealPlanSlot[] {
    return slots.filter((s) => s.date === date);
  }

  function handleAdd(date: string, mealType: MealType): void {
    setPickerTarget({ date, mealType });
  }

  async function handleSelectRecipe(recipe: Recipe): Promise<void> {
    if (!pickerTarget) return;
    const res = await fetch("/api/meal-plan/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: pickerTarget.date,
        mealType: pickerTarget.mealType,
        recipeId: recipe.id,
        servings: defaultServings,
      }),
    });
    if (res.ok) {
      const body = await res.json();
      setSlots([...slots, body.slot]);
    }
    setPickerTarget(null);
  }

  function handleUpdated(updated: MealPlanSlot): void {
    setSlots(slots.map((s) => (s.id === updated.id ? updated : s)));
  }

  function handleDeleted(id: string): void {
    setSlots(slots.filter((s) => s.id !== id));
  }

  function handleAppliedDefault(servings: number): void {
    setSlots(slots.map((s) => ({ ...s, servings })));
    setDefaultServings(servings);
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <WeekNav weekStart={weekStart} />
        <ServingsControls weekStart={weekStart} onApplied={handleAppliedDefault} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-7">
        {dates.map((d) => (
          <DayColumn
            key={d}
            date={d}
            slots={slotsForDate(d)}
            recipesById={recipesById}
            onAdd={handleAdd}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
          />
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <Link
          href={`/meal-plan/shopping?week=${weekStart}`}
          className="rounded-lg bg-orange-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-700"
        >
          Generate shopping list
        </Link>
      </div>

      <RecipePickerModal
        open={pickerTarget !== null}
        recipes={allRecipes}
        onSelect={(r) => void handleSelectRecipe(r)}
        onClose={() => setPickerTarget(null)}
      />
    </>
  );
}
```

(Note: the dead `weekDates` function above is illustrative; the actual file should only export the working `buildWeekDates` helper. When implementing, delete the broken `weekDates` and keep only `buildWeekDates`.)

- [ ] **Step 2: Type-check + run tests**

```bash
npx tsc --noEmit
npm test 2>&1 | tail -5
```

Expected: tsc clean, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/components/meal-plan/MealPlanClient.tsx
git commit -m "feat: wire MealPlanClient with grid + picker + nav + servings"
```

---

### Task 17: `/meal-plan/shopping` server page

**Files:**
- Create: `Source_Code/src/app/meal-plan/shopping/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { listSlotsForWeek } from "@/lib/meal-plan";
import { getRecipeById } from "@/lib/recipes";
import { aggregateIngredients } from "@/lib/shopping-list";
import { classifyIngredients, AISLES } from "@/lib/ingredient-aisles";
import type { Aisle } from "@/lib/ingredient-aisles";
import type { AggregatedItem } from "@/lib/shopping-list";
import { currentWeekStart, mondayOf } from "@/lib/week";
import { ShoppingListClient } from "@/components/shopping-list/ShoppingListClient";

export const metadata: Metadata = { title: "Shopping List | RecipeBox" };

interface PageProps {
  readonly searchParams: Promise<{ week?: string }>;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ShoppingListPage({ searchParams }: PageProps) {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const requested = sp.week && ISO_DATE_RE.test(sp.week) ? sp.week : null;
  const weekStart = requested ? mondayOf(new Date(`${requested}T00:00:00Z`)) : currentWeekStart();

  const slots = await listSlotsForWeek(user.id, weekStart);
  const recipeIds = [...new Set(slots.map((s) => s.recipeId))];
  const recipeMap = new Map<string, Awaited<ReturnType<typeof getRecipeById>>>();
  for (const rid of recipeIds) recipeMap.set(rid, await getRecipeById(rid));

  const slotsWithRecipes = slots
    .map((s) => {
      const r = recipeMap.get(s.recipeId);
      return r ? { servings: s.servings, recipe: r } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const items = aggregateIngredients(slotsWithRecipes);
  const classification = await classifyIngredients(items.map((i) => i.item));

  const aisles: Partial<Record<Aisle, AggregatedItem[]>> = {};
  for (const item of items) {
    const aisle = classification[item.item.toLowerCase()] ?? "Other";
    if (!aisles[aisle]) aisles[aisle] = [];
    aisles[aisle]!.push(item);
  }
  const ordered: Partial<Record<Aisle, AggregatedItem[]>> = {};
  for (const a of AISLES) {
    if (aisles[a] && aisles[a]!.length > 0) {
      ordered[a] = [...aisles[a]!].sort((x, y) => x.item.localeCompare(y.item));
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Shopping List
          </h1>
          <Link
            href={`/meal-plan?week=${weekStart}`}
            className="text-sm text-orange-600 hover:underline"
          >
            ← Back to meal plan
          </Link>
        </div>
        <ShoppingListClient weekStart={weekStart} aisles={ordered} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/app/meal-plan/shopping/page.tsx
git commit -m "feat: /meal-plan/shopping server page"
```

---

### Task 18: `ShoppingListClient` with localStorage check-state

**Files:**
- Create: `Source_Code/src/components/shopping-list/ShoppingListClient.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useEffect, useState } from "react";
import type { Aisle } from "@/lib/ingredient-aisles";
import type { AggregatedItem } from "@/lib/shopping-list";

interface ShoppingListClientProps {
  readonly weekStart: string;
  readonly aisles: Partial<Record<Aisle, AggregatedItem[]>>;
}

function storageKey(weekStart: string): string {
  return `mealplan-checks-${weekStart}`;
}

function itemKey(aisle: string, item: AggregatedItem): string {
  return `${aisle}|${item.item.toLowerCase()}|${item.unit.toLowerCase()}`;
}

export function ShoppingListClient({ weekStart, aisles }: ShoppingListClientProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // Load from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(weekStart));
      if (raw) setChecked(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, [weekStart]);

  // Persist whenever state changes.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(weekStart), JSON.stringify(checked));
    } catch {
      // ignore (quota exceeded, private mode, etc.)
    }
  }, [weekStart, checked]);

  function toggle(key: string): void {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const aisleNames = Object.keys(aisles) as Aisle[];
  const totalItems = aisleNames.reduce((n, a) => n + (aisles[a]?.length ?? 0), 0);

  if (totalItems === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
        No items. Plan some meals on the meal-plan page first.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {aisleNames.map((aisle) => (
        <section key={aisle}>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {aisle}
          </h2>
          <ul className="mt-2 space-y-1">
            {(aisles[aisle] ?? []).map((item) => {
              const k = itemKey(aisle, item);
              const isChecked = !!checked[k];
              return (
                <li key={k}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(k)}
                      className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
                    />
                    <span
                      className={`text-sm ${
                        isChecked
                          ? "text-zinc-400 line-through dark:text-zinc-500"
                          : "text-zinc-800 dark:text-zinc-200"
                      }`}
                    >
                      {item.amount} {item.unit} {item.item}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/components/shopping-list/ShoppingListClient.tsx
git commit -m "feat: ShoppingListClient with localStorage check-state"
```

---

## Phase 5: Verify + docs

### Task 19: Full suite + coverage gate

- [ ] **Step 1: Full suite**

```bash
npm test
```

Expected: every existing test plus the new ones (week, meal-plan, shopping-list, ingredient-aisles, slots, bulk-servings, shopping). Total ~110 + ~35 new ≈ ~145 tests.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Coverage**

```bash
npm run test:cov
```

Expected: ≥80% across all four metrics. The new lib + routes should each clear it on their own. If coverage drops, identify the gap (likely a defensive branch in `ingredient-aisles.ts` or a route error path) and add a focused test rather than expanding the exclude list.

- [ ] **Step 4: Commit (only if vitest.config.ts changed)**

```bash
git add Source_Code/vitest.config.ts
git commit -m "chore: tighten coverage exclusions after meal-plan additions"
```

(Skip if no edit was needed.)

---

### Task 20: Update INSTALL.md + README

**Files:**
- Modify: ` Deployment_Setup/INSTALL.md`
- Modify: `README.md`

- [ ] **Step 1: INSTALL.md — add migration step**

In the existing "Database setup (Supabase)" section, find the "Already on Phase X?" callout. Add a new bullet for Phase A1:

```markdown
- **Already on the AI Recipe Generator phase?** Run
  `Source_Code/supabase/migrations/2026-04-28-meal-plan.sql` in the SQL Editor
  to add the meal planner tables (`meal_plan_slots`, `ingredient_aisles`).
  No data is destroyed.
```

- [ ] **Step 2: README — mention the meal planner**

Open `README.md`. Update the feature list paragraph:

Find:

```markdown
A web application for personal recipe organization. Users register, log in,
and manage their own recipes — create (manually or via AI from a description
or photo), edit, search, filter by category, and delete.
```

Replace with:

```markdown
A web application for personal recipe organization. Users register, log in,
and manage their own recipes — create (manually or via AI from a description
or photo), edit, search, filter by category, and delete. They can plan a
week of meals (morning / noon / evening per day) and auto-generate a
categorized shopping list with check-off boxes.
```

- [ ] **Step 3: Commit**

```bash
git add " Deployment_Setup/INSTALL.md" README.md
git commit -m "docs: cover meal planner migration + feature list"
```

---

## Phase 6: Push + smoke

### Task 21: Push branch + merge to main

- [ ] **Step 1: Verify clean tree**

```bash
git status --short
```

Expected: empty.

- [ ] **Step 2: Push the branch**

```bash
git push -u upstream feat/meal-planner
```

- [ ] **Step 3: FF-merge to main from the main checkout**

```bash
cd /Users/teddy/code/class-project
git fetch upstream feat/meal-planner main
git merge --ff-only upstream/feat/meal-planner
git push upstream main
```

If the FF fails (main has moved): rebase the feature branch onto `upstream/main` first, then `--force-with-lease` push the branch and re-try the FF merge to main.

---

### Task 22: Apply migration to live Supabase + smoke

- [ ] **Step 1: Apply the migration**

Programmatic option (preferred, works headless):

```bash
cd /Users/teddy/code/class-project/Source_Code
DATABASE_URL=$(grep ^DATABASE_URL= .env.local | cut -d= -f2-) node -e "
const fs = require('node:fs');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const sql = fs.readFileSync('supabase/migrations/2026-04-28-meal-plan.sql', 'utf8');
(async () => {
  try {
    await pool.query(sql);
    const r = await pool.query(\"select table_name from information_schema.tables where table_schema='public' order by table_name\");
    console.log('Tables:', r.rows.map(x => x.table_name));
  } finally {
    await pool.end();
  }
})();
" 2>&1 | tail -3
```

Expected: `Tables: [ 'ingredient_aisles', 'meal_plan_slots', 'password_reset_tokens', 'recipes', 'sessions', 'users' ]` — six tables.

Manual fallback: paste the migration SQL into Supabase Dashboard → SQL Editor → Run.

- [ ] **Step 2: Wait for Vercel auto-deploy**

After the push to main in Task 21, Vercel kicks off a build. Wait ~90s, then:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://se-project-jade-eight.vercel.app/api/auth/me
```

Expected: `401` (no cookie). Confirms the new build is up.

- [ ] **Step 3: Manual smoke**

Visit `https://se-project-jade-eight.vercel.app/meal-plan` in a browser. Log in if needed. Click `+ Add meal` on a slot → pick a recipe → adjust servings. Repeat for 2–3 slots in the week. Click "Generate shopping list" → verify aisle grouping + check-off persistence (toggle some, refresh page, check still set).

- [ ] **Step 4: Optional — chrome-devtools smoke**

If desired, mirror the Phase 4 smoke pattern (puppeteer script in `.claude/skills/chrome-devtools/scripts/`) — login + add slots + generate list + screenshot. Saves to `docs/screenshots/meal-plan-*.png`.

---

## What's NOT in this plan (deferred)

- **Phase A2 (bucket layer):** dashboard drag-and-drop, mobile `/bucket` page, bucket → slot drag, "Empty bucket?" prompt.
- **Phase B (catalog + autocomplete):** seed `ingredient_aisles` with curated entries, `/api/ingredients/search` autocomplete API, typeahead in `RecipeForm`, AI generator schema constraints.
- **Reordering slots within a day** (slots are fixed to 3 meal_types).
- **Multi-week shopping list** (always single-week).
- **Persisted check-off across devices** (localStorage only).
- **Servings rounding for integer-only units** ("0.75 eggs" stays as-is).

---

## Self-review

**Spec coverage** (against `docs/superpowers/specs/2026-04-28-meal-planner-shopping-list-design.md`):

| Spec section | Implementing tasks |
|---|---|
| §1 In-scope items: week grid + 3 slots/day | T11, T15, T16 |
| §1 Hidden empty slots | T14 (`EmptySlot`), T15 (`DayColumn`) |
| §1 Prev/next nav | T12 (`WeekNav`) |
| §1 Servings (week default + per-slot + apply-to-all) | T14 (`MealSlotCard` per-slot), T15 (`ServingsControls`), T9 (route) |
| §1 Modal recipe picker | T13 (`RecipePickerModal`), T16 (wired) |
| §1 Aggregation by `(item, unit)` | T5 (`shopping-list.ts`) |
| §1 Hybrid keyword + LLM aisle classification | T6 (`ingredient-aisles.ts`) |
| §1 localStorage check-off | T18 (`ShoppingListClient`) |
| §1 Out of scope (bucket, autocomplete, AI generator schema) | Documented above as "Not in this plan" |
| §2 User flow steps | T11–T18 |
| §3 Schema | T1 (migration + schema.sql) |
| §3 Lib files | T3 (`week`), T4 (`meal-plan`), T5 (`shopping-list`), T6 (`ingredient-aisles`) |
| §3 API routes | T7–T10 |
| §3 Pages | T11, T17 |
| §3 Components | T12–T16, T18 |
| §3 Header link | T11 |
| §3 Test setup truncate | T2 |
| §4 All decisions | Encoded inline in task code (UNIQUE, CASCADE, scaling formula, aisle enum, etc.) |
| §5 Test strategy | T3–T10 follow TDD; T19 coverage gate |
| §6 Prerequisites | None new |
| §7 Risks | Behaviors implemented (LLM fallback to 'Other' in T6, UNIQUE 409 in T7, localStorage in T18) |

**Placeholder scan:** None of "TBD", "TODO", "implement later", "fill in details" present. Step 3 of T3 includes a small narrative note about the dead-equivalent placeholder which is for the engineer's awareness — they replace it with the working `sundayOf` body shown immediately after.

**Type / name consistency:**
- `MealPlanSlot`, `MealType`, `MEAL_TYPES` defined in T4 are referenced in T7–T10 and T14–T16.
- `AggregatedItem`, `ShoppingListSlot` defined in T5 are referenced in T10, T17, T18.
- `Aisle`, `AISLES`, `classifyIngredients` defined in T6 are referenced in T10, T17, T18.
- `mondayOf`, `addWeeks`, `currentWeekStart`, `sundayOf` defined in T3 are referenced in T11, T12, T17, T16.
- `getOpenAI`, `__setTestClient`, `__resetClient` re-imported from `lib/ai-recipe.ts` in T6 — no rename, no new test seam.

**Open assumptions to verify during execution:**
- Postgres `date` round-trips through `pg`/PGlite consistently as either ISO string or `Date`. The `toIsoDate` helper in T4 handles both.
- The `any($1::text[])` cast in T6's cache lookup works against PGlite (it does) and Supabase (it does).
- The `lib/ai-recipe.ts` LLM client cache is shared across `ingredient-aisles` tests and `ai-recipe` tests; both reset in their own `afterEach` so no cross-test leak.
