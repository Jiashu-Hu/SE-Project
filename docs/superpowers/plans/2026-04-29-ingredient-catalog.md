# Ingredient Catalog Implementation Plan (Phase B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hybrid ingredient catalog (global seed + per-user growth) that powers recipe-form autocomplete and softly constrains the AI recipe generator.

**Architecture:** Single `ingredients` table with nullable `user_id` (null = global seed). One CRUD lib `lib/ingredients.ts` with `searchIngredients` + `getOrCreateIngredient` + `listUserCatalog` + `seedGlobal`. One `GET /api/ingredients?q=` route. Hand-rolled `IngredientCombobox` component plugged into the existing `RecipeForm` for the `item` field. AI generator gets up-to-80 catalog name hints injected into its system prompt; post-process auto-creates per-user catalog entries from AI output. One-shot scripts for seed generation (committed JSON) and one-time backfill from existing recipes.

**Tech Stack:**
- Postgres + PGlite (existing)
- Reuses: `lib/db.ts` test seam, `lib/auth-server.ts`, `lib/recipes.ts`, `lib/ai-recipe.ts` (factory), `lib/ingredient-aisles.ts` (`keywordClassify`)
- No new npm dependencies

**Spec:** [`docs/superpowers/specs/2026-04-29-ingredient-catalog-design.md`](../specs/2026-04-29-ingredient-catalog-design.md)

**Working directory:** Worktree at `../class-project-ingredients/` on branch `feat/ingredient-catalog`.

---

## Decisions baked in (don't relitigate)

1. **One table, nullable `user_id`.** `user_id is null` = global seed; non-null = per-user.
2. **Catalog entries hold name + default_unit + aisle.** `ingredient_aisles` (A1) stays as the shopping-list cache; `getOrCreateIngredient` mirrors new entries into it.
3. **Soft AI constraint, no schema enum.** System prompt gets up-to-80 catalog names; post-process maps output items via `getOrCreateIngredient`.
4. **No catalog management UI.** Only surface is the autocomplete dropdown.
5. **Manual recipe save grows the catalog.** `createRecipe` and `updateRecipe` in `lib/recipes.ts` call `getOrCreateIngredient` for each saved item.
6. **Seed is AI-generated once, committed as JSON.** `scripts/generate-ingredient-seed.mjs` is a dev tool; production deploys read the committed JSON.
7. **Existing recipes are backfilled once via `scripts/backfill-ingredient-catalog.mjs`.** Idempotent, runs after migration.
8. **Free text always allowed.** Autocomplete is suggestive, not enforced.

---

## File structure

### Created

| Path | Responsibility |
|---|---|
| `Source_Code/supabase/migrations/2026-04-29-ingredient-catalog.sql` | Migration — creates `ingredients` table; seed insert added in Task 9 |
| `Source_Code/data/ingredient-seed.json` | Committed seed (~200 rows) — produced in Task 9 |
| `Source_Code/scripts/generate-ingredient-seed.mjs` | Dev-only: writes `ingredient-seed.json` via GPTGOD |
| `Source_Code/scripts/backfill-ingredient-catalog.mjs` | One-shot: walks existing recipes, populates per-user catalogs |
| `Source_Code/src/lib/ingredients.ts` | `searchIngredients`, `getOrCreateIngredient`, `listUserCatalog`, `seedGlobal` |
| `Source_Code/src/lib/__tests__/ingredients.test.ts` | Lib unit tests against PGlite |
| `Source_Code/src/app/api/ingredients/route.ts` | `GET` only |
| `Source_Code/src/app/api/ingredients/__tests__/route.test.ts` | Route integration tests |
| `Source_Code/src/components/ingredients/IngredientCombobox.tsx` | Hand-rolled typeahead combobox |

### Modified

| Path | Change |
|---|---|
| `Source_Code/supabase/schema.sql` | Append `ingredients` block + seed insert (Task 9) |
| `Source_Code/src/test/setup.ts` | Truncate `ingredients` |
| `Source_Code/src/lib/recipes.ts` | `createRecipe` and `updateRecipe` call `getOrCreateIngredient` |
| `Source_Code/src/lib/ai-recipe.ts` | Inject catalog hints in system prompt; post-process to grow catalog |
| `Source_Code/src/components/recipe-form/RecipeForm.tsx` | Replace ingredient `item` `<input>` with `<IngredientCombobox>` |
| `Source_Code/Deployment_Setup/INSTALL.md` (path has leading space) | Migration callout + backfill command |
| `README.md` | Mention autocomplete in feature paragraph |

---

## Phase 1: Foundation

### Task 1: Schema migration

**Files:**
- Create: `Source_Code/supabase/migrations/2026-04-29-ingredient-catalog.sql`
- Modify: `Source_Code/supabase/schema.sql`

- [ ] **Step 1: Create the migration file**

Create `Source_Code/supabase/migrations/2026-04-29-ingredient-catalog.sql` with EXACTLY:

```sql
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
```

- [ ] **Step 2: Append the same DDL to `schema.sql`**

Open `Source_Code/supabase/schema.sql` and append at the bottom (after the `bucket_items` block):

```sql

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
```

- [ ] **Step 3: Verify schema parses against PGlite**

From the worktree root:

```bash
node -e "(async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { PGlite } = await import(path.resolve('Source_Code/node_modules/@electric-sql/pglite/dist/index.js'));
  const sql = fs.readFileSync('Source_Code/supabase/schema.sql','utf8');
  const p = new PGlite();
  await p.exec(sql);
  const r = await p.query(\"select table_name from information_schema.tables where table_schema='public' order by table_name\");
  console.log(r.rows.map(x => x.table_name));
  await p.close();
})()"
```

Expected: 8 tables — `bucket_items`, `ingredient_aisles`, `ingredients`, `meal_plan_slots`, `password_reset_tokens`, `recipes`, `sessions`, `users`.

- [ ] **Step 4: Commit**

```bash
git add Source_Code/supabase/schema.sql \
        Source_Code/supabase/migrations/2026-04-29-ingredient-catalog.sql
git commit -m "feat: add ingredients table"
```

---

### Task 2: Extend test setup truncate

**Files:**
- Modify: `Source_Code/src/test/setup.ts`

- [ ] **Step 1: Update truncate**

Open `Source_Code/src/test/setup.ts`. Find the existing truncate string from Phase A2:

```typescript
"truncate table users, sessions, password_reset_tokens, recipes, meal_plan_slots, ingredient_aisles, bucket_items restart identity cascade;"
```

Replace with:

```typescript
"truncate table users, sessions, password_reset_tokens, recipes, meal_plan_slots, ingredient_aisles, bucket_items, ingredients restart identity cascade;"
```

- [ ] **Step 2: Verify suite still passes**

From `Source_Code/`:

```bash
npm test 2>&1 | tail -5
```

Expected: 197 tests pass (same as A2 baseline).

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/test/setup.ts
git commit -m "test: truncate ingredients between tests"
```

---

## Phase 2: Lib (TDD)

### Task 3: `lib/ingredients.ts` — types + `searchIngredients`

**Files:**
- Create: `Source_Code/src/lib/ingredients.ts`
- Create: `Source_Code/src/lib/__tests__/ingredients.test.ts`

- [ ] **Step 1: Write the failing test**

Create `Source_Code/src/lib/__tests__/ingredients.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { searchIngredients, seedGlobal } from "@/lib/ingredients";
import { registerUser } from "@/lib/auth";

async function newUser() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  return reg.user.id;
}

describe("searchIngredients", () => {
  it("returns [] for empty q", async () => {
    const u = await newUser();
    expect(await searchIngredients(u, "")).toEqual([]);
  });

  it("returns [] for whitespace-only q", async () => {
    const u = await newUser();
    expect(await searchIngredients(u, "   ")).toEqual([]);
  });

  it("returns [] for malformed userId", async () => {
    expect(await searchIngredients("not-a-uuid", "tomato")).toEqual([]);
  });

  it("matches global seed entries by prefix", async () => {
    const u = await newUser();
    await seedGlobal([
      { name: "Tomato", defaultUnit: "whole", aisle: "Produce" },
      { name: "Tomato sauce", defaultUnit: "cup", aisle: "Pantry" },
      { name: "Salt", defaultUnit: "tsp", aisle: "Pantry" },
    ]);
    const results = await searchIngredients(u, "tomat");
    expect(results.map((r) => r.name)).toEqual(["Tomato", "Tomato sauce"]);
  });

  it("user override beats global with same normalized name", async () => {
    const u = await newUser();
    await seedGlobal([{ name: "Olive oil", defaultUnit: "tbsp", aisle: "Pantry" }]);
    // Insert a user-scoped row with a different default unit.
    const { getDb } = await import("@/lib/db");
    await getDb().query(
      `insert into ingredients (user_id, name, name_normalized, default_unit, aisle, source)
         values ($1, 'Olive oil', 'olive oil', 'cup', 'Pantry', 'user')`,
      [u]
    );
    const results = await searchIngredients(u, "olive");
    expect(results).toHaveLength(1);
    expect(results[0].defaultUnit).toBe("cup"); // user override
  });

  it("respects limit (default 8)", async () => {
    const u = await newUser();
    const rows = Array.from({ length: 12 }, (_, i) => ({
      name: `Apple ${i}`,
      defaultUnit: "whole",
      aisle: "Produce" as const,
    }));
    await seedGlobal(rows);
    const results = await searchIngredients(u, "apple");
    expect(results).toHaveLength(8);
  });

  it("respects explicit limit", async () => {
    const u = await newUser();
    await seedGlobal([
      { name: "Apple", defaultUnit: "whole", aisle: "Produce" },
      { name: "Apricot", defaultUnit: "whole", aisle: "Produce" },
    ]);
    const results = await searchIngredients(u, "ap", 1);
    expect(results).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run — verify RED**

From `Source_Code/`:

```bash
npm test -- --run src/lib/__tests__/ingredients.test.ts 2>&1 | tail -10
```

Expected: import error (no `lib/ingredients.ts` yet).

- [ ] **Step 3: Implement minimal `lib/ingredients.ts`**

Create `Source_Code/src/lib/ingredients.ts`:

```typescript
import { getDb } from "@/lib/db";
import type { QueryRow } from "@/lib/db";
import type { Aisle } from "@/lib/ingredient-aisles";

export interface Ingredient {
  readonly id: string;
  readonly userId: string | null;
  readonly name: string;
  readonly defaultUnit: string;
  readonly aisle: Aisle;
  readonly source: "seed" | "user" | "ai" | "backfill";
}

export interface IngredientSuggestion {
  readonly name: string;
  readonly defaultUnit: string;
  readonly aisle: Aisle;
}

export interface SeedRow {
  readonly name: string;
  readonly defaultUnit: string;
  readonly aisle: Aisle;
}

interface IngredientRow extends QueryRow {
  id: string;
  user_id: string | null;
  name: string;
  name_normalized: string;
  default_unit: string;
  aisle: Aisle;
  source: "seed" | "user" | "ai" | "backfill";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function rowToSuggestion(row: IngredientRow): IngredientSuggestion {
  return {
    name: row.name,
    defaultUnit: row.default_unit,
    aisle: row.aisle,
  };
}

export async function searchIngredients(
  userId: string,
  q: string,
  limit: number = 8
): Promise<readonly IngredientSuggestion[]> {
  if (!isUuid(userId)) return [];
  const norm = normalize(q);
  if (norm.length === 0) return [];
  const cap = Math.max(1, Math.min(limit, 20));
  const db = getDb();
  const result = await db.query<IngredientRow>(
    `select id, user_id, name, name_normalized, default_unit, aisle, source
       from ingredients
      where (user_id is null or user_id = $1)
        and name_normalized like $2
      order by user_id desc nulls last, name_normalized
      limit $3`,
    [userId, `${norm}%`, cap]
  );

  // Dedupe by name_normalized: a user-specific row shadows a global with same name.
  const seen = new Set<string>();
  const out: IngredientSuggestion[] = [];
  for (const row of result.rows) {
    if (seen.has(row.name_normalized)) continue;
    seen.add(row.name_normalized);
    out.push(rowToSuggestion(row));
    if (out.length >= cap) break;
  }
  return out;
}

export async function seedGlobal(rows: readonly SeedRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const db = getDb();
  let inserted = 0;
  for (const r of rows) {
    const result = await db.query(
      `insert into ingredients (user_id, name, name_normalized, default_unit, aisle, source)
         values (null, $1, $2, $3, $4, 'seed')
         on conflict (user_id, name_normalized) do nothing`,
      [r.name, normalize(r.name), r.defaultUnit, r.aisle]
    );
    if (result.rowCount > 0) inserted++;
  }
  return inserted;
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/lib/__tests__/ingredients.test.ts 2>&1 | tail -10
```

Expected: 7 tests PASS.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add Source_Code/src/lib/ingredients.ts \
        Source_Code/src/lib/__tests__/ingredients.test.ts
git commit -m "feat: ingredients lib search + seed (TDD)"
```

---

### Task 4: `lib/ingredients.ts` — `getOrCreateIngredient` + `listUserCatalog`

**Files:**
- Modify: `Source_Code/src/lib/ingredients.ts`
- Modify: `Source_Code/src/lib/__tests__/ingredients.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `Source_Code/src/lib/__tests__/ingredients.test.ts`:

```typescript
import { getOrCreateIngredient, listUserCatalog } from "@/lib/ingredients";

describe("getOrCreateIngredient", () => {
  it("creates a new per-user entry with keyword-classified aisle", async () => {
    const u = await newUser();
    const ing = await getOrCreateIngredient(u, "Tomato");
    expect(ing.name).toBe("Tomato");
    expect(ing.userId).toBe(u);
    expect(ing.aisle).toBe("Produce");
    expect(ing.source).toBe("user");
  });

  it("uses the unit hint when provided", async () => {
    const u = await newUser();
    const ing = await getOrCreateIngredient(u, "Olive oil", { unit: "tbsp" });
    expect(ing.defaultUnit).toBe("tbsp");
  });

  it("returns existing user-scoped entry on second call", async () => {
    const u = await newUser();
    const a = await getOrCreateIngredient(u, "Garlic");
    const b = await getOrCreateIngredient(u, "garlic"); // case-insensitive
    expect(b.id).toBe(a.id);
  });

  it("treats different users as separate scopes", async () => {
    const u1 = await newUser();
    const u2 = await newUser();
    const a = await getOrCreateIngredient(u1, "Quinoa");
    const b = await getOrCreateIngredient(u2, "Quinoa");
    expect(a.id).not.toBe(b.id);
    expect(a.userId).toBe(u1);
    expect(b.userId).toBe(u2);
  });

  it("falls back to 'Other' when keyword classifier returns null", async () => {
    const u = await newUser();
    // "xyzzy" matches no keyword and we don't want to call the LLM in tests.
    // The implementation falls back to 'Other' on classifier failure.
    const ing = await getOrCreateIngredient(u, "Xyzzy");
    expect(ing.aisle).toBe("Other");
  });

  it("syncs new entries into ingredient_aisles cache", async () => {
    const u = await newUser();
    await getOrCreateIngredient(u, "Carrot");
    const { getDb } = await import("@/lib/db");
    const r = await getDb().query<{ aisle: string }>(
      `select aisle from ingredient_aisles where item_normalized = 'carrot'`
    );
    expect(r.rows[0]?.aisle).toBe("Produce");
  });

  it("rejects malformed userId", async () => {
    await expect(
      getOrCreateIngredient("not-a-uuid", "Tomato")
    ).rejects.toThrow();
  });

  it("rejects empty name", async () => {
    const u = await newUser();
    await expect(getOrCreateIngredient(u, "   ")).rejects.toThrow();
  });

  it("accepts source override", async () => {
    const u = await newUser();
    const ing = await getOrCreateIngredient(u, "Lentils", { source: "ai" });
    expect(ing.source).toBe("ai");
  });
});

describe("listUserCatalog", () => {
  it("returns only the user's own + global entries", async () => {
    const u = await newUser();
    await seedGlobal([{ name: "Salt", defaultUnit: "tsp", aisle: "Pantry" }]);
    await getOrCreateIngredient(u, "Tomato");
    const list = await listUserCatalog(u);
    const names = list.map((i) => i.name).sort();
    expect(names).toEqual(["Salt", "Tomato"]);
  });

  it("returns [] for malformed userId", async () => {
    expect(await listUserCatalog("not-a-uuid")).toEqual([]);
  });
});

describe("cascade", () => {
  it("removes per-user ingredients when user is deleted, keeps global", async () => {
    const u = await newUser();
    await seedGlobal([{ name: "Sugar", defaultUnit: "cup", aisle: "Pantry" }]);
    await getOrCreateIngredient(u, "Bok choy");
    const { getDb } = await import("@/lib/db");
    await getDb().query("delete from users where id = $1", [u]);
    const userList = await listUserCatalog(u);
    expect(userList.map((i) => i.name)).toEqual(["Sugar"]);
  });
});
```

- [ ] **Step 2: Run — verify RED**

```bash
npm test -- --run src/lib/__tests__/ingredients.test.ts 2>&1 | tail -10
```

Expected: import errors / undefined functions.

- [ ] **Step 3: Implement `getOrCreateIngredient` and `listUserCatalog`**

Append these functions to `Source_Code/src/lib/ingredients.ts`. Add the `keywordClassify` import at top:

```typescript
import { keywordClassify } from "@/lib/ingredient-aisles";
```

Then add (at the end of the file):

```typescript
function rowToIngredient(row: IngredientRow): Ingredient {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    defaultUnit: row.default_unit,
    aisle: row.aisle,
    source: row.source,
  };
}

async function syncAisleCache(
  itemNormalized: string,
  aisle: Aisle
): Promise<void> {
  const db = getDb();
  await db.query(
    `insert into ingredient_aisles (item_normalized, aisle, source)
       values ($1, $2, 'llm')
       on conflict (item_normalized) do nothing`,
    [itemNormalized, aisle]
  );
}

export async function getOrCreateIngredient(
  userId: string,
  rawName: string,
  hints: { unit?: string; source?: "user" | "ai" | "backfill" } = {}
): Promise<Ingredient> {
  if (!isUuid(userId)) throw new Error("Invalid userId.");
  const trimmed = rawName.trim();
  if (trimmed.length === 0) throw new Error("Empty ingredient name.");
  if (trimmed.length > 80) throw new Error("Ingredient name too long.");
  const norm = normalize(trimmed);
  const db = getDb();

  // 1. Try existing per-user row first.
  const existingUser = await db.query<IngredientRow>(
    `select id, user_id, name, name_normalized, default_unit, aisle, source
       from ingredients
      where user_id = $1 and name_normalized = $2
      limit 1`,
    [userId, norm]
  );
  if (existingUser.rows[0]) return rowToIngredient(existingUser.rows[0]);

  // 2. Try existing global row.
  const existingGlobal = await db.query<IngredientRow>(
    `select id, user_id, name, name_normalized, default_unit, aisle, source
       from ingredients
      where user_id is null and name_normalized = $1
      limit 1`,
    [norm]
  );
  if (existingGlobal.rows[0]) return rowToIngredient(existingGlobal.rows[0]);

  // 3. Classify aisle: keyword first, fall back to 'Other'.
  // (LLM fallback is reserved for the shopping-list batch path; per-item
  // misclassifications round-trip through that cache anyway.)
  const aisle: Aisle = keywordClassify(norm) ?? "Other";

  const inserted = await db.query<IngredientRow>(
    `insert into ingredients
       (user_id, name, name_normalized, default_unit, aisle, source)
     values ($1, $2, $3, $4, $5, $6)
     returning id, user_id, name, name_normalized, default_unit, aisle, source`,
    [userId, trimmed, norm, hints.unit ?? "", aisle, hints.source ?? "user"]
  );

  await syncAisleCache(norm, aisle);
  return rowToIngredient(inserted.rows[0]);
}

export async function listUserCatalog(
  userId: string
): Promise<readonly Ingredient[]> {
  if (!isUuid(userId)) return [];
  const db = getDb();
  const result = await db.query<IngredientRow>(
    `select id, user_id, name, name_normalized, default_unit, aisle, source
       from ingredients
      where user_id is null or user_id = $1
      order by user_id desc nulls last, name_normalized`,
    [userId]
  );
  return result.rows.map(rowToIngredient);
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/lib/__tests__/ingredients.test.ts 2>&1 | tail -10
```

Expected: 17 tests PASS (7 from Task 3 + 10 new).

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add Source_Code/src/lib/ingredients.ts \
        Source_Code/src/lib/__tests__/ingredients.test.ts
git commit -m "feat: ingredients lib getOrCreate + listUserCatalog"
```

---

## Phase 3: API route (TDD)

### Task 5: `GET /api/ingredients`

**Files:**
- Create: `Source_Code/src/app/api/ingredients/route.ts`
- Create: `Source_Code/src/app/api/ingredients/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `Source_Code/src/app/api/ingredients/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { GET } from "@/app/api/ingredients/route";
import { registerUser, createSession } from "@/lib/auth";
import { seedGlobal } from "@/lib/ingredients";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";

async function login() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  cookieJar.set(AUTH_SESSION_COOKIE, (await createSession(reg.user.id)).token);
  return { userId: reg.user.id };
}

beforeEach(() => cookieJar.clear());

describe("GET /api/ingredients", () => {
  it("returns 401 when not logged in", async () => {
    const res = await GET(new Request("http://localhost/api/ingredients?q=tom"));
    expect(res.status).toBe(401);
  });

  it("returns empty items when q is missing", async () => {
    await login();
    const res = await GET(new Request("http://localhost/api/ingredients"));
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });

  it("returns empty items when q is empty", async () => {
    await login();
    const res = await GET(new Request("http://localhost/api/ingredients?q="));
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });

  it("returns matching catalog entries by prefix", async () => {
    await login();
    await seedGlobal([
      { name: "Tomato", defaultUnit: "whole", aisle: "Produce" },
      { name: "Tomato sauce", defaultUnit: "cup", aisle: "Pantry" },
      { name: "Salt", defaultUnit: "tsp", aisle: "Pantry" },
    ]);
    const res = await GET(new Request("http://localhost/api/ingredients?q=tom"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.map((i: { name: string }) => i.name)).toEqual([
      "Tomato",
      "Tomato sauce",
    ]);
  });

  it("respects explicit limit param (capped at 20)", async () => {
    await login();
    const rows = Array.from({ length: 25 }, (_, i) => ({
      name: `Apple ${i.toString().padStart(2, "0")}`,
      defaultUnit: "whole",
      aisle: "Produce" as const,
    }));
    await seedGlobal(rows);
    const res = await GET(
      new Request("http://localhost/api/ingredients?q=apple&limit=999")
    );
    expect((await res.json()).items).toHaveLength(20);
  });
});
```

- [ ] **Step 2: Run — verify RED**

```bash
npm test -- --run src/app/api/ingredients/__tests__/route.test.ts 2>&1 | tail -10
```

Expected: import error for `@/app/api/ingredients/route`.

- [ ] **Step 3: Implement the route**

Create `Source_Code/src/app/api/ingredients/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { searchIngredients } from "@/lib/ingredients";

export async function GET(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 80);
  const rawLimit = url.searchParams.get("limit");
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 8;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 20)
      : 8;
  const items = await searchIngredients(user.id, q, limit);
  return NextResponse.json({ items });
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/app/api/ingredients/__tests__/route.test.ts 2>&1 | tail -10
```

Expected: 5 tests PASS.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add Source_Code/src/app/api/ingredients/route.ts \
        Source_Code/src/app/api/ingredients/__tests__/route.test.ts
git commit -m "feat: GET /api/ingredients with prefix search"
```

---

## Phase 4: Catalog growth on save

### Task 6: `lib/recipes.ts` — call `getOrCreateIngredient` on save

**Files:**
- Modify: `Source_Code/src/lib/recipes.ts`
- Create or modify: `Source_Code/src/lib/__tests__/recipes-catalog-grow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `Source_Code/src/lib/__tests__/recipes-catalog-grow.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createRecipe, updateRecipe } from "@/lib/recipes";
import { listUserCatalog } from "@/lib/ingredients";
import { registerUser } from "@/lib/auth";
import type { CreateRecipePayload } from "@/types/recipe";

const SAMPLE: CreateRecipePayload = {
  title: "T", description: "x", category: "Dinner",
  prepTime: 1, cookTime: 1, servings: 4,
  ingredients: [
    { amount: "1", unit: "cup", item: "Flour" },
    { amount: "2", unit: "tbsp", item: "Olive oil" },
  ],
  instructions: ["x"],
  tags: [],
};

async function newUser() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  return reg.user.id;
}

describe("createRecipe grows the catalog", () => {
  it("adds each saved ingredient to the user's catalog", async () => {
    const u = await newUser();
    await createRecipe(u, SAMPLE);
    const catalog = await listUserCatalog(u);
    const names = catalog.map((c) => c.name).sort();
    expect(names).toEqual(["Flour", "Olive oil"]);
  });

  it("does not fail when the same ingredient appears twice", async () => {
    const u = await newUser();
    await createRecipe(u, {
      ...SAMPLE,
      ingredients: [
        { amount: "1", unit: "cup", item: "Flour" },
        { amount: "2", unit: "cup", item: "flour" }, // case variant
      ],
    });
    const catalog = await listUserCatalog(u);
    expect(catalog.filter((c) => c.name === "Flour")).toHaveLength(1);
  });

  it("skips empty/whitespace-only items without erroring", async () => {
    const u = await newUser();
    await createRecipe(u, {
      ...SAMPLE,
      ingredients: [
        { amount: "1", unit: "cup", item: "Sugar" },
        { amount: "", unit: "", item: "  " },
      ],
    });
    const catalog = await listUserCatalog(u);
    expect(catalog.map((c) => c.name)).toEqual(["Sugar"]);
  });
});

describe("updateRecipe grows the catalog", () => {
  it("adds new ingredients introduced on edit", async () => {
    const u = await newUser();
    const recipe = await createRecipe(u, SAMPLE);
    await updateRecipe(recipe.id, {
      ...SAMPLE,
      ingredients: [
        ...SAMPLE.ingredients,
        { amount: "1", unit: "tsp", item: "Cumin" },
      ],
    });
    const catalog = await listUserCatalog(u);
    expect(catalog.map((c) => c.name).sort()).toEqual([
      "Cumin",
      "Flour",
      "Olive oil",
    ]);
  });
});
```

- [ ] **Step 2: Run — verify RED**

```bash
npm test -- --run src/lib/__tests__/recipes-catalog-grow.test.ts 2>&1 | tail -10
```

Expected: tests fail because `createRecipe` and `updateRecipe` don't yet write to the catalog.

- [ ] **Step 3: Modify `lib/recipes.ts`**

Open `Source_Code/src/lib/recipes.ts` and add an import at the top (after existing imports):

```typescript
import { getOrCreateIngredient } from "@/lib/ingredients";
```

Add this helper near the top of the file (above `createRecipe`):

```typescript
async function growCatalog(
  userId: string,
  ingredients: readonly { item: string; unit: string }[],
  source: "user" | "backfill" = "user"
): Promise<void> {
  for (const ing of ingredients) {
    const item = ing.item.trim();
    if (item.length === 0) continue;
    try {
      await getOrCreateIngredient(userId, item, {
        unit: ing.unit.trim(),
        source,
      });
    } catch {
      // Don't fail the recipe save if a single classification call hiccups.
    }
  }
}
```

In `createRecipe`, after the `insert` returns and before `return toRecipe(...)`:

```typescript
await growCatalog(authorId, payload.ingredients);
return toRecipe(result.rows[0]);
```

In `updateRecipe`, after the `update` returns and before `return toRecipe(...)`:

```typescript
const recipe = toRecipe(row);
await growCatalog(recipe.authorId, payload.ingredients);
return recipe;
```

(Replace the existing `return toRecipe(row)` line; keep the early return when `row` is missing.)

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/lib/__tests__/recipes-catalog-grow.test.ts 2>&1 | tail -10
```

Expected: 4 tests PASS.

- [ ] **Step 5: Run full suite (no regressions)**

```bash
npm test 2>&1 | tail -5
```

Expected: previous tests still pass; total bumps by 4.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add Source_Code/src/lib/recipes.ts \
        Source_Code/src/lib/__tests__/recipes-catalog-grow.test.ts
git commit -m "feat: grow user catalog on recipe create/update"
```

---

### Task 7: AI generator — inject hints + post-process

**Files:**
- Modify: `Source_Code/src/lib/ai-recipe.ts`
- Modify or create: `Source_Code/src/lib/__tests__/ai-recipe-catalog.test.ts`

- [ ] **Step 1: Inspect existing AI module**

Read `Source_Code/src/lib/ai-recipe.ts` from top to find:
- The exported entry points (likely `generateRecipeFromText` and `generateRecipeFromImage`).
- The `SYSTEM_PROMPT` constant.
- The test seam (`__setTestClient`, `__resetClient`).

You don't need to modify the test seam. The two entry-point functions need: (a) a userId parameter (already present, used for prompt scoping), (b) an injected hints string into the system prompt, (c) a post-process loop that calls `getOrCreateIngredient`.

If a function does NOT yet take a `userId`, add one as the FIRST parameter. Update the route handlers in `Source_Code/src/app/api/recipes/generate/` to pass `user.id`.

(If you discover the route already passes `userId` and the function already accepts one, skip the route changes.)

- [ ] **Step 2: Write the failing test**

Create `Source_Code/src/lib/__tests__/ai-recipe-catalog.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  generateRecipeFromText,
  __setTestClient,
  __resetClient,
} from "@/lib/ai-recipe";
import { listUserCatalog, seedGlobal } from "@/lib/ingredients";
import { registerUser } from "@/lib/auth";

let lastSystemPrompt = "";

function makeStubClient() {
  return {
    chat: {
      completions: {
        create: async (req: { messages: { role: string; content: string }[] }) => {
          lastSystemPrompt = req.messages.find((m) => m.role === "system")?.content ?? "";
          const body = JSON.stringify({
            title: "Stub",
            description: "x",
            category: "Dinner",
            prepTime: 1,
            cookTime: 1,
            servings: 2,
            ingredients: [
              { amount: "1", unit: "cup", item: "Quinoa" },
              { amount: "2", unit: "tbsp", item: "Olive oil" },
            ],
            instructions: ["x"],
            tags: [],
          });
          return {
            choices: [{ message: { content: body } }],
          };
        },
      },
    },
  } as unknown as Parameters<typeof __setTestClient>[0];
}

async function newUser() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  return reg.user.id;
}

beforeEach(() => {
  lastSystemPrompt = "";
  __resetClient();
});

describe("generateRecipeFromText catalog integration", () => {
  it("includes catalog hints in the system prompt", async () => {
    const u = await newUser();
    await seedGlobal([
      { name: "Olive oil", defaultUnit: "tbsp", aisle: "Pantry" },
      { name: "Salt",      defaultUnit: "tsp",  aisle: "Pantry" },
    ]);
    __setTestClient(makeStubClient());
    await generateRecipeFromText(u, "Make me lunch.");
    expect(lastSystemPrompt).toMatch(/Olive oil/);
    expect(lastSystemPrompt).toMatch(/Salt/);
  });

  it("auto-creates per-user catalog entries from AI output", async () => {
    const u = await newUser();
    __setTestClient(makeStubClient());
    await generateRecipeFromText(u, "Make me lunch.");
    const catalog = await listUserCatalog(u);
    expect(catalog.map((c) => c.name).sort()).toEqual(["Olive oil", "Quinoa"]);
    const ai = catalog.filter((c) => c.source === "ai");
    expect(ai.length).toBe(2);
  });
});
```

- [ ] **Step 3: Run — verify RED**

```bash
npm test -- --run src/lib/__tests__/ai-recipe-catalog.test.ts 2>&1 | tail -10
```

Expected: assertions fail (prompt doesn't include hints, catalog doesn't grow).

- [ ] **Step 4: Modify `lib/ai-recipe.ts`**

Add imports at the top:

```typescript
import { getOrCreateIngredient, listUserCatalog } from "@/lib/ingredients";
```

Add a helper (above the entry point functions):

```typescript
async function buildSystemPromptWithHints(userId: string): Promise<string> {
  try {
    const catalog = await listUserCatalog(userId);
    if (catalog.length === 0) return SYSTEM_PROMPT;
    const names = catalog.slice(0, 80).map((c) => c.name).join(", ");
    return (
      SYSTEM_PROMPT +
      `\n\nWhen choosing ingredient names, prefer these (the user has used them before): ${names}.`
    );
  } catch {
    return SYSTEM_PROMPT;
  }
}

async function growCatalogFromAI(
  userId: string,
  ingredients: readonly { item: string; unit: string }[]
): Promise<void> {
  for (const ing of ingredients) {
    const item = ing.item.trim();
    if (item.length === 0) continue;
    try {
      await getOrCreateIngredient(userId, item, {
        unit: ing.unit.trim(),
        source: "ai",
      });
    } catch {
      // Non-fatal.
    }
  }
}
```

In each entry-point function (`generateRecipeFromText`, `generateRecipeFromImage`):

1. Replace the line that uses the bare `SYSTEM_PROMPT` constant with `await buildSystemPromptWithHints(userId)`.
2. After the response validates and the `payload` (or `recipe`) is constructed but before returning, add: `await growCatalogFromAI(userId, payload.ingredients);` (replace `payload` with whatever the local variable is named).

- [ ] **Step 5: Run — verify GREEN**

```bash
npm test -- --run src/lib/__tests__/ai-recipe-catalog.test.ts 2>&1 | tail -10
```

Expected: 2 tests PASS.

- [ ] **Step 6: Run full suite**

```bash
npm test 2>&1 | tail -5
```

Expected: all green.

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add Source_Code/src/lib/ai-recipe.ts \
        Source_Code/src/lib/__tests__/ai-recipe-catalog.test.ts
git commit -m "feat: AI generator catalog hints + post-process growth"
```

---

## Phase 5: Frontend — autocomplete combobox

### Task 8: `IngredientCombobox` component

**Files:**
- Create: `Source_Code/src/components/ingredients/IngredientCombobox.tsx`

- [ ] **Step 1: Create the component**

Create `Source_Code/src/components/ingredients/IngredientCombobox.tsx`:

```typescript
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Aisle } from "@/lib/ingredient-aisles";

export interface IngredientSuggestion {
  readonly name: string;
  readonly defaultUnit: string;
  readonly aisle: Aisle;
}

interface IngredientComboboxProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSelect: (suggestion: IngredientSuggestion) => void;
  readonly placeholder?: string;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly ariaLabel?: string;
}

const DEBOUNCE_MS = 150;

export function IngredientCombobox({
  value,
  onChange,
  onSelect,
  placeholder,
  id,
  disabled,
  ariaLabel,
}: IngredientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<readonly IngredientSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useMemo(
    () => `${id ?? "ingredient-combobox"}-listbox`,
    [id]
  );

  const fetchSuggestions = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length === 0) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }
    try {
      const res = await fetch(
        `/api/ingredients?q=${encodeURIComponent(trimmed)}&limit=8`
      );
      if (!res.ok) {
        setSuggestions([]);
        setActiveIndex(-1);
        return;
      }
      const body = (await res.json()) as { items: IngredientSuggestion[] };
      setSuggestions(body.items ?? []);
      setActiveIndex(body.items?.length ? 0 : -1);
    } catch {
      setSuggestions([]);
      setActiveIndex(-1);
    }
  }, []);

  // Debounced fetch on value change.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(value);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, fetchSuggestions]);

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(s: IngredientSuggestion): void {
    onSelect(s);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length === 0) return;
      setOpen(true);
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length === 0) return;
      setOpen(true);
      setActiveIndex((i) =>
        i <= 0 ? suggestions.length - 1 : i - 1
      );
    } else if (e.key === "Enter") {
      if (open && activeIndex >= 0 && suggestions[activeIndex]) {
        e.preventDefault();
        pick(suggestions[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  const showList = open && suggestions.length > 0;

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-activedescendant={
          showList && activeIndex >= 0
            ? `${listboxId}-opt-${activeIndex}`
            : undefined
        }
        autoComplete="off"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />
      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.name}-${i}`}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex cursor-pointer items-center justify-between px-3 py-1.5 text-sm ${
                i === activeIndex
                  ? "bg-orange-50 text-zinc-900 dark:bg-orange-950/30 dark:text-zinc-50"
                  : "text-zinc-700 dark:text-zinc-300"
              }`}
            >
              <span className="font-medium">{s.name}</span>
              <span className="ml-2 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                {s.aisle}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Run full test suite**

```bash
npm test 2>&1 | tail -5
```

Expected: still green (no new tests yet).

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/components/ingredients/IngredientCombobox.tsx
git commit -m "feat: IngredientCombobox autocomplete component"
```

---

### Task 9: Recipe form integration

**Files:**
- Modify: `Source_Code/src/components/recipe-form/RecipeForm.tsx`

- [ ] **Step 1: Read the current ingredient block**

Look at `Source_Code/src/components/recipe-form/RecipeForm.tsx` lines ~280-320. The current `item` field is:

```tsx
<input
  type="text"
  value={ing.item}
  onChange={(e) => updateIngredient(index, "item", e.target.value)}
  placeholder="all-purpose flour"
  aria-label={`Ingredient ${index + 1} name`}
  className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
/>
```

- [ ] **Step 2: Add the import**

Near the top of `RecipeForm.tsx`, after existing imports:

```typescript
import { IngredientCombobox } from "@/components/ingredients/IngredientCombobox";
```

- [ ] **Step 3: Replace the `item` input with the combobox**

Replace the `<input type="text" value={ing.item} ...>` block above with:

```tsx
<div className="min-w-0 flex-1">
  <IngredientCombobox
    id={`ing-item-${index}`}
    ariaLabel={`Ingredient ${index + 1} name`}
    placeholder="all-purpose flour"
    value={ing.item}
    onChange={(v) => updateIngredient(index, "item", v)}
    onSelect={(sug) => {
      updateIngredient(index, "item", sug.name);
      if (ing.unit.trim() === "") {
        updateIngredient(index, "unit", sug.defaultUnit);
      }
    }}
  />
</div>
```

(The wrapping `<div className="min-w-0 flex-1">` preserves the existing flex layout — the combobox itself is `w-full`.)

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Run full test suite**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests still pass (no new tests).

- [ ] **Step 6: Commit**

```bash
git add Source_Code/src/components/recipe-form/RecipeForm.tsx
git commit -m "feat: wire IngredientCombobox into recipe form"
```

---

## Phase 6: Seed + backfill

### Task 10: Seed generation script + commit JSON + load in migration

**Files:**
- Create: `Source_Code/scripts/generate-ingredient-seed.mjs`
- Create: `Source_Code/data/ingredient-seed.json`
- Modify: `Source_Code/supabase/migrations/2026-04-29-ingredient-catalog.sql`
- Modify: `Source_Code/supabase/schema.sql`

- [ ] **Step 1: Create the generator script**

Create `Source_Code/scripts/generate-ingredient-seed.mjs`:

```javascript
// Dev-only: regenerates Source_Code/data/ingredient-seed.json via GPTGOD.
// Commit the JSON output. Production deploys never run this script.
//
// Usage:
//   cd Source_Code
//   GPTGOD_KEY=... node scripts/generate-ingredient-seed.mjs
//
// Idempotent — overwrites the file. Reviewers should eyeball the result.

import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";

const KEY = process.env.GPTGOD_KEY;
if (!KEY) {
  console.error("GPTGOD_KEY is required.");
  process.exit(1);
}

const client = new OpenAI({ apiKey: KEY, baseURL: "https://api.gptgod.online/v1" });

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ingredients"],
  properties: {
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "defaultUnit", "aisle"],
        properties: {
          name: { type: "string" },
          defaultUnit: { type: "string" },
          aisle: {
            type: "string",
            enum: [
              "Produce",
              "Dairy & Eggs",
              "Meat & Seafood",
              "Bakery",
              "Pantry",
              "Frozen",
              "Other",
            ],
          },
        },
      },
    },
  },
};

const SYSTEM = `You produce structured JSON of common cooking ingredients.

Each ingredient has:
- name: canonical English name, capitalized first letter (e.g. "Olive oil", "Tomato")
- defaultUnit: a typical measure unit; one of: tbsp, tsp, cup, g, kg, ml, l, whole, oz, lb, slice, clove, can, bunch, pinch, "" (empty if none typical)
- aisle: the supermarket aisle from the listed enum`;

const USER = `Give me about 200 of the most commonly used cooking ingredients in home cooking, spanning Produce, Dairy & Eggs, Meat & Seafood, Bakery, Pantry, and Frozen. Include staples (salt, sugar, flour, butter, eggs), common produce, common proteins, common condiments and spices, common baking goods. No duplicates by lowercased name. Return strictly the JSON object.`;

const response = await client.chat.completions.create({
  model: "gpt-4.1-mini",
  max_tokens: 4096,
  messages: [
    { role: "system", content: SYSTEM },
    { role: "user", content: USER },
  ],
  response_format: {
    type: "json_schema",
    json_schema: { name: "ingredient_seed", strict: true, schema: SCHEMA },
  },
});

const content = response.choices[0]?.message?.content;
if (!content) {
  console.error("No content from model.");
  process.exit(1);
}

const parsed = JSON.parse(content);
const seen = new Set();
const dedup = [];
for (const r of parsed.ingredients) {
  const key = String(r.name).trim().toLowerCase();
  if (!key || seen.has(key)) continue;
  seen.add(key);
  dedup.push({
    name: String(r.name).trim(),
    defaultUnit: String(r.defaultUnit ?? "").trim(),
    aisle: r.aisle,
  });
}

const outPath = path.resolve("data/ingredient-seed.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(dedup, null, 2));
console.log(`Wrote ${dedup.length} entries to ${outPath}`);
```

- [ ] **Step 2: Run the script and inspect**

From `Source_Code/`:

```bash
GPTGOD_KEY=$(grep ^GPTGOD_KEY= .env.local | cut -d= -f2-) node scripts/generate-ingredient-seed.mjs
```

Expected: writes `Source_Code/data/ingredient-seed.json` with around 200 entries. Open the file and skim a few entries to confirm sane values (no obvious garbage). If the count is dramatically off (e.g., <100), re-run.

- [ ] **Step 3: Update the migration to load the seed**

Append to `Source_Code/supabase/migrations/2026-04-29-ingredient-catalog.sql`:

```sql

-- Phase B seed: insert canonical entries from data/ingredient-seed.json.
-- The application loads this same JSON on boot for PGlite tests; in production,
-- run scripts/load-ingredient-seed.mjs after the table is created.
-- (Migration leaves seed insertion to the application boot path so the SQL
-- file stays portable and PGlite-friendly.)
```

(The migration intentionally does NOT contain the seed rows inline. Production uses the loader script in Step 5; PGlite tests use the loader called from a small bootstrap added in this task.)

- [ ] **Step 4: Append schema.sql with the same comment marker**

Open `Source_Code/supabase/schema.sql` and after the new ingredients block (added in Task 1), append:

```sql

-- Phase B seed entries are loaded at app/test boot via
-- src/test/setup.ts → seedGlobal(...) reading data/ingredient-seed.json.
```

- [ ] **Step 5: Bootstrap the seed in test setup**

Open `Source_Code/src/test/setup.ts`. After the truncate logic but before tests begin (typically inside `beforeEach` or a `beforeAll` block — match the existing structure), add a one-time global seed load:

```typescript
import seed from "../../data/ingredient-seed.json";
import { seedGlobal } from "@/lib/ingredients";

let seededOnce = false;
async function maybeSeed() {
  if (seededOnce) return;
  await seedGlobal(seed);
  seededOnce = true;
}
```

Then call `await maybeSeed()` after the truncate inside the existing `beforeEach`. Truncate removes the seed rows; re-seeding each test is fine (the seed is ~200 inserts, fast on PGlite).

Actually simpler — put seed inside the per-test `beforeEach`, AFTER truncate, so each test starts with a populated global catalog:

Replace the existing setup file's beforeEach body to include:

```typescript
beforeEach(async () => {
  // existing truncate
  await db.exec(
    "truncate table users, sessions, password_reset_tokens, recipes, meal_plan_slots, ingredient_aisles, bucket_items, ingredients restart identity cascade;"
  );
  // re-seed the global catalog
  await seedGlobal(seed);
});
```

(Adapt to the file's actual structure — the file uses an `__setTestDb` pattern, so reach into the same `db` reference used by existing setup.)

- [ ] **Step 6: Update existing tests if any rely on the catalog being empty**

If a test from Tasks 3-7 explicitly asserted "catalog is empty for a fresh user", it may now have ~200 global entries. Specifically:

- `searchIngredients("")` test — still returns `[]` (empty q).
- `listUserCatalog(u)` "fresh user" — would now include ~200 globals. Update those tests to be relative ("at least N"), or filter to user-scoped only by checking `userId` non-null.

Run the tests and fix up any breakages now:

```bash
npm test -- --run src/lib/__tests__/ingredients.test.ts 2>&1 | tail -25
```

Specifically, if `listUserCatalog returns only the user's own + global entries` now expects only ["Salt", "Tomato"] but sees 200+, fix the test by filtering to source `'user'` items the test created:

```typescript
const list = await listUserCatalog(u);
const names = list
  .filter((i) => i.source === "user")
  .map((i) => i.name)
  .sort();
expect(names).toEqual(["Tomato"]);  // since "Salt" was inserted via seedGlobal which is source 'seed'
```

Adjust test expectations until green.

- [ ] **Step 7: Run the full suite**

```bash
npm test 2>&1 | tail -5
```

Expected: all green.

- [ ] **Step 8: Add the production seed loader script**

Create `Source_Code/scripts/load-ingredient-seed.mjs`:

```javascript
// Loads the committed ingredient seed into the database.
// Run once after the Phase B migration is applied.
//
// Usage:
//   cd Source_Code
//   DATABASE_URL=... node scripts/load-ingredient-seed.mjs
//
// Idempotent: ON CONFLICT DO NOTHING.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const seed = JSON.parse(
  fs.readFileSync(path.resolve("data/ingredient-seed.json"), "utf8")
);

let inserted = 0;
let skipped = 0;
try {
  for (const r of seed) {
    const norm = String(r.name).trim().toLowerCase();
    const result = await pool.query(
      `insert into ingredients (user_id, name, name_normalized, default_unit, aisle, source)
         values (null, $1, $2, $3, $4, 'seed')
         on conflict (user_id, name_normalized) do nothing`,
      [r.name, norm, r.defaultUnit, r.aisle]
    );
    if (result.rowCount > 0) inserted++;
    else skipped++;
  }
  console.log(`Seed load: ${inserted} inserted, ${skipped} skipped (already present).`);
} finally {
  await pool.end();
}
```

- [ ] **Step 9: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add Source_Code/scripts/generate-ingredient-seed.mjs \
        Source_Code/scripts/load-ingredient-seed.mjs \
        Source_Code/data/ingredient-seed.json \
        Source_Code/src/test/setup.ts \
        Source_Code/supabase/migrations/2026-04-29-ingredient-catalog.sql \
        Source_Code/supabase/schema.sql \
        Source_Code/src/lib/__tests__/ingredients.test.ts
git commit -m "feat: ingredient seed JSON + loaders + test bootstrap"
```

---

### Task 11: Backfill script

**Files:**
- Create: `Source_Code/scripts/backfill-ingredient-catalog.mjs`

- [ ] **Step 1: Create the backfill script**

Create `Source_Code/scripts/backfill-ingredient-catalog.mjs`:

```javascript
// One-time backfill: walks every recipe in the database and seeds each author's
// per-user catalog from that recipe's ingredient items. Idempotent — relies on
// the (user_id, name_normalized) unique constraint.
//
// Usage:
//   cd Source_Code
//   DATABASE_URL=... node scripts/backfill-ingredient-catalog.mjs
//
// Notes:
//   - Aisle is classified by the same keyword map used in lib/ingredient-aisles.ts.
//     Items the keyword map can't classify get 'Other'. Users can fix by re-saving.
//   - Source is recorded as 'backfill' so future audits can distinguish them.

import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

// Inline copy of the keyword classifier (avoids importing TS into a plain mjs).
const KEYWORDS = {
  Produce: ["tomato","onion","garlic","lettuce","carrot","spinach","kale",
    "apple","banana","orange","lemon","lime","grape","berry","strawberry",
    "potato","cucumber","celery","pepper","mushroom","zucchini","broccoli",
    "cauliflower","ginger","cilantro","parsley","basil","mint","avocado","cabbage"],
  "Dairy & Eggs": ["milk","cheese","yogurt","butter","cream","sour cream","egg","eggs",
    "mozzarella","cheddar","parmesan","ricotta","feta"],
  "Meat & Seafood": ["chicken","beef","pork","lamb","turkey","bacon","sausage","ham",
    "fish","salmon","tuna","cod","shrimp","scallop","prawn"],
  Bakery: ["bread","baguette","croissant","bun","tortilla","pita","naan","bagel"],
  Pantry: ["pasta","spaghetti","rice","flour","sugar","salt","pepper","oil","olive oil",
    "vinegar","soy sauce","honey","cumin","paprika","cinnamon",
    "tomato sauce","stock","broth","baking powder","yeast","oat","cereal",
    "bean","lentil","chickpea","nut","almond","walnut","pecan","peanut"],
  Frozen: ["frozen", "ice cream"],
};

function classify(item) {
  const norm = item.trim().toLowerCase();
  if (!norm) return null;
  for (const [aisle, words] of Object.entries(KEYWORDS)) {
    for (const w of words) if (norm.includes(w)) return aisle;
  }
  return "Other";
}

let recipesSeen = 0;
let pairsConsidered = 0;
let inserted = 0;

try {
  const r = await pool.query(
    "select id, author_id, ingredients from recipes order by created_at"
  );
  for (const row of r.rows) {
    recipesSeen++;
    const ingArr = Array.isArray(row.ingredients) ? row.ingredients : [];
    const seen = new Set();
    for (const ing of ingArr) {
      const item = String(ing?.item ?? "").trim();
      if (!item) continue;
      const norm = item.toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      pairsConsidered++;
      const aisle = classify(item);
      const result = await pool.query(
        `insert into ingredients
           (user_id, name, name_normalized, default_unit, aisle, source)
         values ($1, $2, $3, $4, $5, 'backfill')
         on conflict (user_id, name_normalized) do nothing`,
        [row.author_id, item, norm, String(ing?.unit ?? ""), aisle]
      );
      if (result.rowCount > 0) {
        inserted++;
        // Also sync ingredient_aisles cache.
        await pool.query(
          `insert into ingredient_aisles (item_normalized, aisle, source)
             values ($1, $2, 'llm')
             on conflict (item_normalized) do nothing`,
          [norm, aisle]
        );
      }
    }
  }
  console.log(
    `Backfill done: recipes=${recipesSeen} pairs=${pairsConsidered} inserted=${inserted}`
  );
} finally {
  await pool.end();
}
```

- [ ] **Step 2: Smoke-run against PGlite-emulating test DB (optional sanity)**

The backfill script targets a real Postgres URL, not PGlite. Skip running it locally unless you have a Postgres test DB. The next phase will validate it against the live Supabase DB.

- [ ] **Step 3: Type-check (no TS but validate the script parses)**

```bash
node --check scripts/backfill-ingredient-catalog.mjs
```

Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add Source_Code/scripts/backfill-ingredient-catalog.mjs
git commit -m "chore: ingredient catalog backfill script"
```

---

## Phase 7: Verify + docs

### Task 12: Coverage gate

- [ ] **Step 1: Full suite**

From `Source_Code/`:

```bash
npm test
```

Expected: all green. Total ≥ 197 (A2 baseline) + new tests from this phase.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Coverage**

```bash
npm run test:cov 2>&1 | tail -25
```

Expected: ≥80% across statements, branches, functions, lines.

- [ ] **Step 4: If coverage falls below 80% on any metric**

Identify the file(s) and add 2-3 defensive-path tests targeting the uncovered branches:
- `lib/ingredients.ts` malformed-input guards if not already covered.
- `app/api/ingredients/route.ts` invalid `limit` query param.
- `lib/recipes.ts` `growCatalog` no-op on empty array.

Re-run coverage; commit added tests with message `test: cover defensive guards in ingredients lib + route`.

If on the first run all metrics are ≥80%, no commit needed.

---

### Task 13: Update INSTALL.md + README

**Files:**
- Modify: `Deployment_Setup/INSTALL.md` (the directory has a leading space — `' Deployment_Setup'`)
- Modify: `README.md`

- [ ] **Step 1: INSTALL.md — add migration callout + load + backfill steps**

Find the "Database setup (Supabase)" section. After the Phase A2 callout (the bucket migration), add:

```markdown
- **Already on the Bucket Layer phase?** Run
  `Source_Code/supabase/migrations/2026-04-29-ingredient-catalog.sql` in the
  Supabase SQL Editor to add the `ingredients` table. Then load the seed:
  `cd Source_Code && DATABASE_URL=... node scripts/load-ingredient-seed.mjs`.
  Optionally backfill existing recipes:
  `DATABASE_URL=... node scripts/backfill-ingredient-catalog.mjs`. Both scripts are idempotent.
```

- [ ] **Step 2: README — mention autocomplete in the feature paragraph**

Find the bucket paragraph in README.md (touched in Phase A2 docs):

> ... save recipes into a "bucket" (drag-and-drop on desktop, tap on mobile), then plan a week of meals (morning / noon / evening per day) by dragging from the bucket onto day slots, and auto-generate a categorized shopping list with check-off boxes.

Replace with:

> ... save recipes into a "bucket" (drag-and-drop on desktop, tap on mobile), then plan a week of meals (morning / noon / evening per day) by dragging from the bucket onto day slots, and auto-generate a categorized shopping list with check-off boxes. The recipe form features ingredient autocomplete with default-unit pre-fill, backed by a hybrid global + per-user catalog that grows automatically.

- [ ] **Step 3: Commit**

```bash
git add ' Deployment_Setup/INSTALL.md' README.md
git commit -m "docs: cover ingredient catalog migration + autocomplete"
```

---

## Phase 8: Push + apply to live

### Task 14: Push branch + FF-merge to main

- [ ] **Step 1: Verify clean tree**

```bash
git status --short
```

Expected: empty.

- [ ] **Step 2: Push**

```bash
git push -u upstream feat/ingredient-catalog
```

- [ ] **Step 3: FF-merge to main from the main checkout**

```bash
cd /Users/teddy/code/class-project
git fetch upstream feat/ingredient-catalog main
git merge --ff-only upstream/feat/ingredient-catalog
git push upstream main
```

If FF fails because main moved: rebase `feat/ingredient-catalog` on `upstream/main`, force-with-lease push, retry.

---

### Task 15: Apply migration to live Supabase + load seed + backfill + smoke

- [ ] **Step 1: Apply the migration**

From the main checkout's `Source_Code/`:

```bash
DATABASE_URL=$(grep ^DATABASE_URL= .env.local | cut -d= -f2-) node -e "
const fs = require('node:fs');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const sql = fs.readFileSync('supabase/migrations/2026-04-29-ingredient-catalog.sql', 'utf8');
(async () => {
  try {
    await pool.query(sql);
    const r = await pool.query('select count(*) from ingredients');
    console.log('ingredients rows after migration:', r.rows[0].count);
  } finally {
    await pool.end();
  }
})();
" 2>&1 | tail -3
```

Expected: `ingredients rows after migration: 0`.

- [ ] **Step 2: Load the seed**

```bash
DATABASE_URL=$(grep ^DATABASE_URL= .env.local | cut -d= -f2-) node scripts/load-ingredient-seed.mjs
```

Expected: `Seed load: ~200 inserted, 0 skipped (already present).`

- [ ] **Step 3: Backfill existing recipes**

```bash
DATABASE_URL=$(grep ^DATABASE_URL= .env.local | cut -d= -f2-) node scripts/backfill-ingredient-catalog.mjs
```

Expected: `Backfill done: recipes=N pairs=M inserted=K`. Re-running prints `inserted=0`.

- [ ] **Step 4: Wait for Vercel auto-deploy**

```bash
sleep 90
curl -sS -o /dev/null -w "%{http_code}\n" https://se-project-jade-eight.vercel.app/api/auth/me
```

Expected: `401` (no cookie, route alive).

- [ ] **Step 5: Programmatic smoke**

```bash
DEPLOY_URL=https://se-project-jade-eight.vercel.app
JAR=/tmp/ingredient-jar.txt && rm -f $JAR

echo "1. login"
curl -sS -c $JAR -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"test"}' \
  $DEPLOY_URL/api/auth/login -w "  HTTP %{http_code}\n" -o /dev/null

echo "2. autocomplete: tom"
curl -sS -b $JAR "$DEPLOY_URL/api/ingredients?q=tom" | head -c 300; echo

echo "3. autocomplete: oli"
curl -sS -b $JAR "$DEPLOY_URL/api/ingredients?q=oli" | head -c 300; echo

echo "4. unauthenticated 401"
curl -sS -o /dev/null -w "  HTTP %{http_code}\n" "$DEPLOY_URL/api/ingredients?q=tom"

echo "5. create a recipe with a new item; verify catalog grows"
RECIPE_ID=$(curl -sS -b $JAR -H 'Content-Type: application/json' -X POST \
  -d '{"title":"Catalog smoke","description":"x","category":"Dinner","prepTime":1,"cookTime":1,"servings":2,"ingredients":[{"amount":"1","unit":"pinch","item":"Smoke spice"}],"instructions":["x"],"tags":[]}' \
  $DEPLOY_URL/api/recipes | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).recipe.id))")
echo "  Recipe id: $RECIPE_ID"

echo "6. autocomplete: smoke (should hit the new entry)"
curl -sS -b $JAR "$DEPLOY_URL/api/ingredients?q=smoke" | head -c 300; echo

echo "7. cleanup"
curl -sS -b $JAR -X DELETE -w "  HTTP %{http_code}\n" $DEPLOY_URL/api/recipes/$RECIPE_ID -o /dev/null
```

Expected: 200 login, 200 with seeded matches, 200, 401, recipe created, 200 with the new "Smoke spice" entry visible, 204 cleanup.

- [ ] **Step 6: Manual UI smoke (optional)**

Visit `https://se-project-jade-eight.vercel.app/recipes/new`. Type `tom` in any ingredient `name` field — dropdown should show seeded matches. Pick "Tomato" — unit field should pre-fill "whole" (or whatever the seed has). Save the recipe. Re-open the form — autocomplete shows the entry from the just-saved recipe.

---

## What's NOT in this plan (deferred)

- **Catalog management UI** — `/ingredients` page with browse/edit/delete. YAGNI for v1.
- **Synonym handling** ("scallion" ↔ "green onion"). Both go to Produce via the keyword classifier; shopping list still works. Out of scope.
- **Closed-enum unit normalization** — the `unit` field stays free text.
- **Levenshtein / fuzzy matching** in autocomplete — prefix only.
- **Public catalog sharing across users.** Out of scope.

---

## Self-review

**Spec coverage** (against `docs/superpowers/specs/2026-04-29-ingredient-catalog-design.md`):

| Spec section | Implementing tasks |
|---|---|
| §3.1 schema + indices + nullable user_id + UNIQUE | T1 |
| §3.2 file structure | T1, T3, T4, T5, T6, T7, T8, T9, T10, T11 |
| §3.3 lib API (`searchIngredients`, `getOrCreateIngredient`, `listUserCatalog`, `seedGlobal`) | T3 (search + seedGlobal), T4 (getOrCreate + listUserCatalog) |
| §3.3 syncs into `ingredient_aisles` | T4 (`syncAisleCache`) |
| §3.4 GET /api/ingredients | T5 |
| §3.5 AI hints + post-process | T7 |
| §3.6 IngredientCombobox | T8 |
| §3.6 RecipeForm integration | T9 |
| §3.7 backfill script | T11 |
| §3.8 seed generator + commit JSON + production loader | T10 |
| §4 data flow | implicit across T6, T7, T8, T9 |
| §5 error handling | T3-T7 (each function's guards), T8 (silent fallback) |
| §6 testing strategy | T3-T7 (TDD), T12 (coverage gate) |
| §7 prerequisites | implicit (no new deps) |
| §8 risks | mitigations baked in: 150ms debounce + 8-cap (T8), 80-name cap (T7), unit-only-when-empty (T9) |

**Placeholder scan:** No "TBD", "TODO", "implement later", "fill in details". Every code step has full code. Every command has expected output.

**Type / name consistency:**
- `Ingredient`, `IngredientSuggestion`, `SeedRow`, `Aisle` defined in T3, used T4 / T5 / T7 / T8.
- `searchIngredients`, `getOrCreateIngredient`, `listUserCatalog`, `seedGlobal` all spelled identically across T3-T11.
- API path `/api/ingredients` consistent across T5, T8 (`fetchSuggestions` URL), T15 (smoke).
- Drag/drop and bucket from prior phases are not touched — no name collisions.

**Open assumptions to verify during execution:**
- The exact entry-point function names in `lib/ai-recipe.ts` (`generateRecipeFromText`, `generateRecipeFromImage`). T7 instructs the implementer to read first and adapt.
- The exact shape of `Source_Code/src/test/setup.ts` (uses `__setTestDb`?). T2 and T10 instruct the implementer to read first.
- Whether the AI route handlers already pass `userId` to the AI lib functions. T7 covers either case.
