# Supabase Migration — Phase 1: Recipes Subsystem

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-memory `globalThis.recipeStore` Map with a real Postgres-backed store hosted on Supabase, so recipes survive server restarts and the app can run on Vercel serverless. Auth (users/sessions/reset tokens) stays in-memory in this phase — Phase 2 migrates that.

**Architecture:** Add a single Postgres connection seam (`lib/db.ts`) that returns a `Pool` driven by `DATABASE_URL` in dev/prod and a `PGlite` in-process Postgres in tests. Rewrite `lib/recipes.ts` so each function executes a parameterized SQL query against that pool. The external function signatures stay the same shape (`Recipe`, `CreateRecipePayload`) but become `async`, so callers (API routes + server components) gain `await` calls. Test setup boots one PGlite per test run, applies `supabase/schema.sql`, and truncates between tests.

**Why this scope:**
- Recipes is the smaller, lower-risk subsystem: no password hashing, no session cookies, no reset-token flow.
- The 84-test suite from the previous plan is the safety net — every behavior is locked in. After migration the same tests must still pass.
- Auth migration (Phase 2) needs FK references back to `users`; doing it second means the recipes table can pre-exist with `author_id text` and tighten to `uuid references users(id)` later.

**Tech Stack:**
- `pg` 8.20 (node-postgres) — production driver
- `@electric-sql/pglite` 0.4 — in-process Postgres for tests
- `@types/pg` — types
- Supabase free tier — hosted Postgres for dev/prod
- Plain SQL (no ORM, no migration framework) — single `schema.sql` applied manually for v1

**Working directory note:** All paths are relative to the repo root `/Users/teddy/code/class-project`. The Next.js app lives in `Source_Code/`. Run npm commands from `Source_Code/`. Run git commands from the repo root.

---

## Decisions baked into this plan (don't relitigate during execution)

1. **Driver: `pg`, not `@supabase/supabase-js`.** Reasoning: supabase-js calls PostgREST (Supabase's REST layer) — it doesn't speak raw Postgres protocol. PGlite only speaks raw Postgres. Using `pg` directly means tests and prod run identical query code; only the connection differs. supabase-js has features we'd want later (auth, storage) — pull it in when those are needed.
2. **Test DB: PGlite, in-process, one per test run.** Spinning up a new PGlite instance is ~50ms; truncating is sub-ms. This avoids Docker, networks, and shared state between developers' machines.
3. **JSONB columns for `ingredients`/`instructions`/`tags`.** They're already arrays of objects/strings in the TypeScript types and are read/written atomically. JSONB matches the existing shape one-for-one. Normalizing into separate tables is a YAGNI for this phase.
4. **`author_id` is `text` (not `uuid`/FK) in this phase.** The seeded `lib/auth.ts` mock user has `id: "seed-test-user"` — a non-UUID string. Phase 2 migrates auth and converts this column to `uuid references users(id) on delete cascade`.
5. **Schema validation lives in two places.** SQL `check` constraints (defense in depth) AND `lib/recipe-validation.ts` (early failure with a helpful error message). The lib validator runs first; the DB constraint catches any code path that somehow bypasses it.
6. **No ORM.** A class project with one table doesn't earn ORM complexity. SQL is more readable and the type mapping is one `toRecipe()` function.
7. **No migration framework yet.** One schema, one `schema.sql`. When schema #2 arrives, introduce migrations then.
8. **Drop the "seeds mock recipes" test.** It asserts an internal-detail behavior of the in-memory store, not an SRS requirement. After migration, dev-time seeding (if we add it) will be a SQL `INSERT … ON CONFLICT DO NOTHING` script — independent from the test setup.

---

## File structure

### Created
- `Source_Code/supabase/schema.sql` — single source of truth for the schema. Applied to Supabase via the SQL editor (manual, one-shot) and to PGlite at test bootstrap.
- `Source_Code/src/lib/db.ts` — exports `getDb()` returning a `QueryClient` adapter. Routes all queries to either `pg.Pool` or `PGlite` depending on env.
- `Source_Code/.env.local.example` — documents `DATABASE_URL`.

### Modified
- `Source_Code/src/lib/recipes.ts` — rewritten as 6 async functions, each one parameterized SQL through `getDb()`. The `MOCK_RECIPES` import goes away.
- `Source_Code/src/app/api/recipes/route.ts` — `await createRecipe(...)`.
- `Source_Code/src/app/api/recipes/[id]/route.ts` — `await getRecipeById`, `await updateRecipe`, `await deleteRecipe`.
- `Source_Code/src/app/page.tsx` — `await getRecipesByAuthor(user.id)` (DashboardPage is already async).
- `Source_Code/src/app/recipes/[id]/page.tsx` — `await getRecipeById`.
- `Source_Code/src/app/recipes/[id]/edit/page.tsx` — `await getRecipeById`.
- `Source_Code/src/lib/__tests__/recipes.test.ts` — every assertion `await`s the function under test.
- `Source_Code/src/app/api/recipes/__tests__/recipes.test.ts` — already awaits the route, but the seed-data test goes away.
- `Source_Code/src/app/api/recipes/__tests__/recipe-id.test.ts` — `createRecipe` setup calls become `await createRecipe(...)`.
- `Source_Code/src/test/setup.ts` — adds PGlite bootstrap + truncate between tests.
- `Source_Code/package.json` — adds `pg`, `@types/pg`, `@electric-sql/pglite`.
- `README.md` — adds Supabase setup section.
- ` Deployment_Setup/INSTALL.md` — adds Supabase setup section + `DATABASE_URL` instructions.

### Untouched (deferred to later phases)
- `Source_Code/src/lib/auth.ts` — auth migration is Phase 2.
- `Source_Code/src/lib/auth-server.ts` — same.
- All `__tests__/auth.test.ts`, `__tests__/auth-validation.test.ts`, `__tests__/forgot-password.test.ts`, etc. — same.
- `Source_Code/src/data/mock-recipes.ts` — kept as a reference for seed data, but no longer imported by `lib/recipes.ts`. May become the source of a future `seed.sql` script.

---

## Phase 1: Infrastructure setup

### Task 1: Install dependencies

**Files:**
- Modify: `Source_Code/package.json`, `Source_Code/package-lock.json`

- [ ] **Step 1: Install runtime + types + test driver**

From `Source_Code/`:

```bash
npm install pg@^8.20.0
npm install -D @types/pg @electric-sql/pglite@^0.4.5
```

Expected: `package.json` gains `pg` under `dependencies` and `@types/pg`, `@electric-sql/pglite` under `devDependencies`. `package-lock.json` updates.

- [ ] **Step 2: Sanity-check the install**

```bash
node -e "const { Pool } = require('pg'); console.log(typeof Pool)"
```

Expected output: `function`

```bash
node -e "(async () => { const { PGlite } = await import('@electric-sql/pglite'); const p = new PGlite(); const r = await p.query('select 1 as n'); console.log(r.rows); await p.close(); })()"
```

Expected output: `[ { n: 1 } ]`

- [ ] **Step 3: Commit**

From repo root:

```bash
git add Source_Code/package.json Source_Code/package-lock.json
git commit -m "chore: add pg and PGlite for Postgres-backed recipes store"
```

---

### Task 2: Author the schema

**Files:**
- Create: `Source_Code/supabase/schema.sql`

- [ ] **Step 1: Create the schema file**

Create `Source_Code/supabase/schema.sql`:

```sql
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
```

**Why each constraint:**
- `length(title) between 1 and 120` mirrors `recipe-validation.ts` line 33.
- The `category in (...)` enum mirrors `types/recipe.ts` `CATEGORIES`.
- Numeric checks mirror `recipe-validation.ts` lines 45–55.
- `gen_random_uuid()` is built into Postgres ≥13 (no extension needed).

- [ ] **Step 2: Verify it parses (using PGlite as the syntax linter)**

```bash
node -e "(async () => { const fs = require('node:fs'); const { PGlite } = await import('@electric-sql/pglite'); const sql = fs.readFileSync('Source_Code/supabase/schema.sql','utf8'); const p = new PGlite(); await p.exec(sql); const r = await p.query(\"select column_name, data_type from information_schema.columns where table_name='recipes' order by ordinal_position\"); console.log(r.rows); await p.close(); })()"
```

Expected: prints 13 columns including `id (uuid)`, `author_id (text)`, `title (text)`, … `created_at (timestamp with time zone)`.

If parsing fails, re-read the SQL — typos in `check` constraints are easy.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/supabase/schema.sql
git commit -m "feat: add recipes schema for Postgres backing store

Single-source-of-truth SQL for the recipes table. Applied to Supabase
manually via the SQL editor and to PGlite at test bootstrap. CHECK
constraints mirror lib/recipe-validation.ts so the DB rejects bad
data even if validation is bypassed."
```

---

### Task 3: Build `lib/db.ts`

**Files:**
- Create: `Source_Code/src/lib/db.ts`

- [ ] **Step 1: Write the seam**

Create `Source_Code/src/lib/db.ts`:

```typescript
import { Pool } from "pg";
import type { PoolConfig } from "pg";

export interface QueryResult<T> {
  readonly rows: readonly T[];
  readonly rowCount: number;
}

export interface QueryClient {
  query<T = unknown>(
    text: string,
    params?: readonly unknown[]
  ): Promise<QueryResult<T>>;
}

let cachedClient: QueryClient | null = null;
let cachedPool: Pool | null = null;

function buildPgClient(): QueryClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required. Add it to .env.local — see .env.local.example."
    );
  }

  const config: PoolConfig = {
    connectionString: url,
    // Supabase requires SSL.
    ssl: url.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  };

  cachedPool = new Pool(config);

  return {
    async query<T>(text: string, params?: readonly unknown[]) {
      const result = await cachedPool!.query<T>(
        text,
        params as unknown[] | undefined
      );
      return {
        rows: result.rows,
        rowCount: result.rowCount ?? 0,
      };
    },
  };
}

export function getDb(): QueryClient {
  if (!cachedClient) {
    cachedClient = buildPgClient();
  }
  return cachedClient;
}

// Test-only seam: setup.ts injects a PGlite-backed QueryClient.
export function __setTestDb(client: QueryClient): void {
  cachedClient = client;
}

// Test-only: clear the cache so the next getDb() rebuilds from scratch.
export function __resetDb(): void {
  cachedClient = null;
  if (cachedPool) {
    void cachedPool.end();
    cachedPool = null;
  }
}
```

Why `getDb()` is sync but `query()` is async: the connection pool is constructed lazily and synchronously (it doesn't hit the network until the first query). Making `getDb()` async would force every caller to `await` an extra hop for no benefit.

- [ ] **Step 2: Type-check**

From `Source_Code/`:

```bash
npx tsc --noEmit
```

Expected: clean (no errors).

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/lib/db.ts
git commit -m "feat: add lib/db.ts Postgres connection seam

Single QueryClient interface returned by getDb(). Production builds
get a pg.Pool driven by DATABASE_URL; tests inject a PGlite-backed
client via the __setTestDb hook in src/test/setup.ts."
```

---

### Task 4: Wire PGlite into the test setup

**Files:**
- Modify: `Source_Code/src/test/setup.ts`

- [ ] **Step 1: Read the current setup**

Open `Source_Code/src/test/setup.ts`. It currently resets the in-memory auth/recipe stores via `delete g.recipeStore`. We're replacing the recipe-store reset with a SQL truncate, but auth/passwordReset stores still need clearing (they live in-memory until Phase 2).

- [ ] **Step 2: Replace the file**

Overwrite `Source_Code/src/test/setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { __setTestDb, __resetDb } from "@/lib/db";
import type { QueryClient } from "@/lib/db";

let pglite: PGlite | null = null;

beforeAll(async () => {
  pglite = new PGlite();
  const schemaPath = path.join(process.cwd(), "supabase", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  await pglite.exec(schema);

  const client: QueryClient = {
    async query<T>(text: string, params?: readonly unknown[]) {
      const result = await pglite!.query<T>(
        text,
        params as unknown[] | undefined
      );
      return {
        rows: result.rows,
        rowCount: result.affectedRows ?? result.rows.length,
      };
    },
  };

  __setTestDb(client);
});

afterEach(async () => {
  // Drop all recipe rows; schema persists across tests.
  if (pglite) {
    await pglite.exec("truncate table recipes restart identity cascade;");
  }

  // Reset still-in-memory auth stores (Phase 2 will move these into Postgres).
  const g = globalThis as Record<string, unknown>;
  delete g.authStore;
  delete g.passwordResetStore;
});

afterAll(async () => {
  await pglite?.close();
  __resetDb();
});
```

Note `process.cwd()` is `Source_Code/` when Vitest runs — confirm this is true for your setup. If not, switch to `path.resolve(__dirname, "../../supabase/schema.sql")`.

- [ ] **Step 3: Verify the existing suite still boots (most tests should still pass — only recipes ones will fail since lib/recipes.ts is still in-memory)**

From `Source_Code/`:

```bash
npm test 2>&1 | tail -20
```

Expected: existing tests for `auth.ts`, `auth-validation.ts`, `recipe-validation.ts`, and the auth API routes still pass. The recipes tests (`lib/__tests__/recipes.test.ts`, `app/api/recipes/__tests__/*`) may fail because they're sync against the in-memory store — that's fine, they get rewritten in the next phase.

If a non-recipe test fails, STOP and investigate the setup change.

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/test/setup.ts
git commit -m "test: bootstrap PGlite for recipes tests in setup

Applies supabase/schema.sql once per test run and truncates the
recipes table between tests. Auth stores (still in-memory in this
phase) continue to be reset via globalThis cache deletion."
```

---

### Task 5: Smoke-test the full DB seam

**Files:**
- Create (then delete in Step 4): `Source_Code/src/lib/__tests__/db.smoke.test.ts`

This task is a temporary scratch test to prove the wiring end-to-end before we touch production code.

- [ ] **Step 1: Write a smoke test**

Create `Source_Code/src/lib/__tests__/db.smoke.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";

describe("db smoke", () => {
  it("can insert and read back from the recipes table via PGlite", async () => {
    const db = getDb();
    await db.query(
      `insert into recipes
         (id, author_id, title, category, prep_time, cook_time, servings)
       values ('11111111-1111-1111-1111-111111111111', 'alice', 't', 'Breakfast', 1, 1, 1)`
    );
    const result = await db.query<{ title: string }>(
      `select title from recipes where author_id = 'alice'`
    );
    expect(result.rows.map((r) => r.title)).toEqual(["t"]);
  });
});
```

- [ ] **Step 2: Run it**

From `Source_Code/`:

```bash
npm test -- --run src/lib/__tests__/db.smoke.test.ts
```

Expected: 1 test PASS.

If this fails with `relation "recipes" does not exist`, the setup file isn't applying the schema — debug `path.join(process.cwd(), …)` (typical fix is `path.resolve(__dirname, "../../supabase/schema.sql")`).

- [ ] **Step 3: Delete the smoke test**

The real recipe library tests (in Task 6) will exercise the same path with proper coverage. The smoke is throwaway proof.

```bash
rm Source_Code/src/lib/__tests__/db.smoke.test.ts
```

- [ ] **Step 4: Commit (the deletion is implicit because the file was never tracked)**

No commit needed. Move to Task 6.

---

## Phase 2: Repository migration

### Task 6: Update `lib/__tests__/recipes.test.ts` to the new async contract (RED)

**Files:**
- Modify: `Source_Code/src/lib/__tests__/recipes.test.ts`

- [ ] **Step 1: Replace the file**

Overwrite `Source_Code/src/lib/__tests__/recipes.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  getAllRecipes,
  getRecipeById,
  getRecipesByAuthor,
  createRecipe,
  updateRecipe,
  deleteRecipe,
} from "@/lib/recipes";
import type { CreateRecipePayload } from "@/types/recipe";

const samplePayload: CreateRecipePayload = {
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

describe("recipes store (Postgres-backed)", () => {
  it("getAllRecipes returns [] on an empty database", async () => {
    expect(await getAllRecipes()).toEqual([]);
  });

  it("getRecipeById returns undefined for an unknown id", async () => {
    expect(
      await getRecipeById("00000000-0000-0000-0000-000000000000")
    ).toBeUndefined();
  });

  it("getRecipeById returns a created recipe", async () => {
    const created = await createRecipe("alice", samplePayload);
    const fetched = await getRecipeById(created.id);
    expect(fetched).toEqual(created);
  });

  it("getRecipesByAuthor returns only that author's recipes", async () => {
    const created = await createRecipe("alice", samplePayload);
    const aliceRecipes = await getRecipesByAuthor("alice");
    expect(aliceRecipes).toHaveLength(1);
    expect(aliceRecipes[0]).toEqual(created);
    expect(await getRecipesByAuthor("bob")).toEqual([]);
  });

  it("getRecipesByAuthor returns [] for unknown author", async () => {
    expect(await getRecipesByAuthor("nobody")).toEqual([]);
  });

  it("createRecipe assigns id, authorId, createdAt, and trims fields", async () => {
    const created = await createRecipe("bob", { ...samplePayload, title: "  Eggs  " });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.authorId).toBe("bob");
    expect(created.title).toBe("Eggs");
    expect(typeof created.createdAt).toBe("string");
    expect(await getRecipeById(created.id)).toEqual(created);
  });

  it("updateRecipe replaces fields but preserves id, authorId, createdAt", async () => {
    const created = await createRecipe("bob", samplePayload);
    const updated = await updateRecipe(created.id, {
      ...samplePayload,
      title: "Different",
      servings: 4,
    });
    expect(updated).not.toBeNull();
    expect(updated?.id).toBe(created.id);
    expect(updated?.authorId).toBe("bob");
    expect(updated?.createdAt).toBe(created.createdAt);
    expect(updated?.title).toBe("Different");
    expect(updated?.servings).toBe(4);
  });

  it("updateRecipe returns null for an unknown id", async () => {
    expect(
      await updateRecipe("00000000-0000-0000-0000-000000000000", samplePayload)
    ).toBeNull();
  });

  it("deleteRecipe removes the recipe and returns true", async () => {
    const created = await createRecipe("carol", samplePayload);
    expect(await deleteRecipe(created.id)).toBe(true);
    expect(await getRecipeById(created.id)).toBeUndefined();
  });

  it("deleteRecipe returns false for an unknown id", async () => {
    expect(
      await deleteRecipe("00000000-0000-0000-0000-000000000000")
    ).toBe(false);
  });
});
```

The "seeds mock recipes under the test user" case from the previous suite is intentionally dropped — see decision #8 in the plan header.

- [ ] **Step 2: Run — verify RED**

From `Source_Code/`:

```bash
npm test -- --run src/lib/__tests__/recipes.test.ts 2>&1 | tail -30
```

Expected: tests fail because `lib/recipes.ts` is still synchronous and returns values, so `await` resolves to plain arrays/values BUT the in-memory implementation knows nothing about the empty PGlite schema — so the seed data won't be there. You'll see failures like:

- `getAllRecipes returns []` may pass or fail depending on whether the in-memory store has been seeded.
- `createRecipe` will succeed in-memory but `getRecipeById` will look at the in-memory map and find it; later the assertion `await getRecipeById(...)` will see a value with `id` of `randomUUID` — likely passes.

The point of this RED step is: **most of these tests will fail or give weird results because the implementation hasn't been updated**. Capture which ones fail and which pass. We're about to replace the implementation entirely, so the exact failure shape doesn't matter — we just want to confirm the test file itself compiles and runs.

If `tsc` complains about `await` on a non-Promise, that's the actual RED: TypeScript treats sync return values awaitably (`await x` resolves to `x`), so this won't fail at type-check. Move on.

- [ ] **Step 3: Don't commit yet** — Task 7 ships the implementation in the same commit.

---

### Task 7: Rewrite `lib/recipes.ts` against Postgres (GREEN)

**Files:**
- Modify (full rewrite): `Source_Code/src/lib/recipes.ts`

- [ ] **Step 1: Replace the file**

Overwrite `Source_Code/src/lib/recipes.ts`:

```typescript
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import type {
  CreateRecipePayload,
  Recipe,
  RecipeCategory,
} from "@/types/recipe";

export type UpdateRecipePayload = Partial<CreateRecipePayload>;

interface RecipeRow {
  id: string;
  author_id: string;
  title: string;
  description: string;
  category: RecipeCategory;
  prep_time: number;
  cook_time: number;
  servings: number;
  image_url: string | null;
  ingredients: Recipe["ingredients"];
  instructions: Recipe["instructions"];
  tags: Recipe["tags"];
  created_at: string | Date;
}

function toRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    description: row.description,
    category: row.category,
    prepTime: row.prep_time,
    cookTime: row.cook_time,
    servings: row.servings,
    imageUrl: row.image_url,
    ingredients: row.ingredients,
    instructions: row.instructions,
    tags: row.tags,
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : row.created_at.toISOString(),
  };
}

const SELECT_COLUMNS =
  "id, author_id, title, description, category, prep_time, cook_time, servings, image_url, ingredients, instructions, tags, created_at";

export async function getAllRecipes(): Promise<readonly Recipe[]> {
  const db = getDb();
  const result = await db.query<RecipeRow>(
    `select ${SELECT_COLUMNS} from recipes order by created_at desc`
  );
  return result.rows.map(toRecipe);
}

export async function getRecipeById(id: string): Promise<Recipe | undefined> {
  const db = getDb();
  const result = await db.query<RecipeRow>(
    `select ${SELECT_COLUMNS} from recipes where id = $1 limit 1`,
    [id]
  );
  const row = result.rows[0];
  return row ? toRecipe(row) : undefined;
}

export async function getRecipesByAuthor(
  authorId: string
): Promise<readonly Recipe[]> {
  const db = getDb();
  const result = await db.query<RecipeRow>(
    `select ${SELECT_COLUMNS} from recipes
       where author_id = $1
       order by created_at desc`,
    [authorId]
  );
  return result.rows.map(toRecipe);
}

export async function createRecipe(
  authorId: string,
  payload: CreateRecipePayload
): Promise<Recipe> {
  const db = getDb();
  const id = randomUUID();
  const result = await db.query<RecipeRow>(
    `insert into recipes
       (id, author_id, title, description, category,
        prep_time, cook_time, servings,
        ingredients, instructions, tags)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)
     returning ${SELECT_COLUMNS}`,
    [
      id,
      authorId,
      payload.title.trim(),
      payload.description.trim(),
      payload.category,
      payload.prepTime,
      payload.cookTime,
      payload.servings,
      JSON.stringify(payload.ingredients),
      JSON.stringify(payload.instructions),
      JSON.stringify(payload.tags),
    ]
  );
  return toRecipe(result.rows[0]);
}

export async function updateRecipe(
  id: string,
  payload: CreateRecipePayload
): Promise<Recipe | null> {
  const db = getDb();
  const result = await db.query<RecipeRow>(
    `update recipes
        set title = $1,
            description = $2,
            category = $3,
            prep_time = $4,
            cook_time = $5,
            servings = $6,
            ingredients = $7::jsonb,
            instructions = $8::jsonb,
            tags = $9::jsonb
      where id = $10
      returning ${SELECT_COLUMNS}`,
    [
      payload.title.trim(),
      payload.description.trim(),
      payload.category,
      payload.prepTime,
      payload.cookTime,
      payload.servings,
      JSON.stringify(payload.ingredients),
      JSON.stringify(payload.instructions),
      JSON.stringify(payload.tags),
      id,
    ]
  );
  const row = result.rows[0];
  return row ? toRecipe(row) : null;
}

export async function deleteRecipe(id: string): Promise<boolean> {
  const db = getDb();
  const result = await db.query(
    `delete from recipes where id = $1`,
    [id]
  );
  return result.rowCount > 0;
}
```

Note: The `MOCK_RECIPES` import is gone. The seeded test user's recipes will live in `mock-recipes.ts` for reference and may eventually feed a `seed.sql`, but they're no longer auto-loaded.

- [ ] **Step 2: Run — verify GREEN for the lib unit tests**

From `Source_Code/`:

```bash
npm test -- --run src/lib/__tests__/recipes.test.ts 2>&1 | tail -20
```

Expected: 9 tests PASS.

If `JSON.stringify` round-trips break the `ingredients`/`instructions`/`tags` equality assertions, it's because PGlite returns JSONB columns as parsed objects (good) but pg can return them as either parsed objects or raw strings depending on driver config (not great). Both `pg` and PGlite default to parsed-on-read, so this should just work. If you see `'[{"amount"...}]'` (a string) instead of `[{ amount: ... }]` (an object), explicitly cast in the SQL: `select ... ingredients::jsonb as ingredients ...` — but you shouldn't need this.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors will appear in API route handlers and page components that still call the now-async functions synchronously. That's fine — those are fixed in Tasks 8–12. Capture the error list as a checklist for those tasks.

- [ ] **Step 4: Commit (test + impl together)**

```bash
git add Source_Code/src/lib/recipes.ts Source_Code/src/lib/__tests__/recipes.test.ts
git commit -m "feat: back recipes store with Postgres

Replaces the in-memory globalThis Map with parameterized SQL queries
through getDb(). All six functions become async; signatures otherwise
unchanged. Schema-level CHECK constraints provide defense in depth on
top of lib/recipe-validation.ts.

Drops the 'seeds mock recipes under the test user' test case — that
was an internal-detail assertion of the in-memory implementation, not
an SRS requirement. mock-recipes.ts is retained for reference.

Callers (API routes, server components, integration tests) are still
synchronous and will fail to compile until updated in subsequent
commits."
```

---

## Phase 3: Caller migration

Each of these tasks is a small mechanical change: add `await` to a single call site, run `tsc`, run the relevant test, commit.

### Task 8: Update `POST /api/recipes` route

**Files:**
- Modify: `Source_Code/src/app/api/recipes/route.ts:25`

- [ ] **Step 1: Add await**

Change line 25 of `Source_Code/src/app/api/recipes/route.ts` from:

```typescript
  const recipe = createRecipe(user.id, result.payload);
```

to:

```typescript
  const recipe = await createRecipe(user.id, result.payload);
```

- [ ] **Step 2: Run the contract test**

From `Source_Code/`:

```bash
npm test -- --run src/app/api/recipes/__tests__/recipes.test.ts
```

Expected: 4 tests PASS. (They were already `await`-ing the route, so no test change is needed for this one.)

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/app/api/recipes/route.ts
git commit -m "fix: await createRecipe in POST /api/recipes"
```

---

### Task 9: Update `PATCH/DELETE /api/recipes/[id]` route

**Files:**
- Modify: `Source_Code/src/app/api/recipes/[id]/route.ts`

- [ ] **Step 1: Read the file**

The route handler calls `getRecipeById`, `updateRecipe`, and `deleteRecipe` — all three are now async.

- [ ] **Step 2: Add awaits**

Apply these three edits in `Source_Code/src/app/api/recipes/[id]/route.ts`:

Line 17 — change:
```typescript
  const recipe = getRecipeById(id);
```
to:
```typescript
  const recipe = await getRecipeById(id);
```

Line 39 — change:
```typescript
  const updated = updateRecipe(id, result.payload);
```
to:
```typescript
  const updated = await updateRecipe(id, result.payload);
```

Line 54 — change:
```typescript
  const recipe = getRecipeById(id);
```
to:
```typescript
  const recipe = await getRecipeById(id);
```

Line 64 — change:
```typescript
  deleteRecipe(id);
```
to:
```typescript
  await deleteRecipe(id);
```

- [ ] **Step 3: Run the contract test**

```bash
npm test -- --run src/app/api/recipes/__tests__/recipe-id.test.ts
```

Expected: tests fail. The setup helpers in this file call `createRecipe(...)` synchronously — they need `await` too. Move to Step 4.

- [ ] **Step 4: Update the integration test setup**

In `Source_Code/src/app/api/recipes/__tests__/recipe-id.test.ts`, every place `createRecipe(...)` is called inside a setup line, prefix with `await`. Specifically:

- Around line 64 (`it("returns 403 when editing another user's recipe"...)`): `const recipe = createRecipe(aliceId, samplePayload);` → `const recipe = await createRecipe(aliceId, samplePayload);`
- Around line 76 (`it("updates a recipe owned by the logged-in user"...)`): same change.
- Around line 90 (`it("rejects an invalid payload with 400"...)`): same change.
- Around line 113 (`it("returns 403 when deleting another user's recipe"...)`): same change.
- Around line 122 (`it("returns 204 and removes the recipe..."...)`): same change.

Each `it(...)` callback already has `async`, so `await` is legal.

- [ ] **Step 5: Run again**

```bash
npm test -- --run src/app/api/recipes/__tests__/recipe-id.test.ts
```

Expected: 9 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add Source_Code/src/app/api/recipes/[id]/route.ts \
        Source_Code/src/app/api/recipes/__tests__/recipe-id.test.ts
git commit -m "fix: await async recipe queries in [id] route + tests"
```

---

### Task 10: Update DashboardPage

**Files:**
- Modify: `Source_Code/src/app/page.tsx:13`

- [ ] **Step 1: Add await**

Change line 13 of `Source_Code/src/app/page.tsx` from:

```typescript
  const recipes = getRecipesByAuthor(user.id);
```

to:

```typescript
  const recipes = await getRecipesByAuthor(user.id);
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: this file is now clean. Other page components (`recipes/[id]/page.tsx`, `recipes/[id]/edit/page.tsx`) still error — they're fixed in Tasks 11–12.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/app/page.tsx
git commit -m "fix: await getRecipesByAuthor in DashboardPage"
```

---

### Task 11: Update recipe detail page

**Files:**
- Modify: `Source_Code/src/app/recipes/[id]/page.tsx`

- [ ] **Step 1: Read the file**

Find every call to `getRecipeById(...)`. There's one (around line 14 or so depending on your version).

- [ ] **Step 2: Add await**

Change:

```typescript
  const recipe = getRecipeById(id);
```

to:

```typescript
  const recipe = await getRecipeById(id);
```

The page is already an `async function` (server component), so `await` is legal.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/app/recipes/[id]/page.tsx
git commit -m "fix: await getRecipeById in recipe detail page"
```

---

### Task 12: Update recipe edit page

**Files:**
- Modify: `Source_Code/src/app/recipes/[id]/edit/page.tsx`

- [ ] **Step 1: Read the file**

Find the `getRecipeById(...)` call (around line 18).

- [ ] **Step 2: Add await**

Change:

```typescript
  const recipe = getRecipeById(id);
```

to:

```typescript
  const recipe = await getRecipeById(id);
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: completely clean now — every call site of an async recipe function awaits properly.

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/app/recipes/[id]/edit/page.tsx
git commit -m "fix: await getRecipeById in recipe edit page"
```

---

## Phase 4: Verification + documentation

### Task 13: Run full suite + coverage

**Files:**
- Possibly: `Source_Code/vitest.config.ts` (only if coverage drops below 80% and an exclude is genuinely warranted — do NOT lower the 80% threshold)

- [ ] **Step 1: Run all tests**

From `Source_Code/`:

```bash
npm test
```

Expected: every test passes. If `lib/__tests__/recipes.test.ts` lost a case (the seeded-mocks one) and any auth/integration test depended on seeded data, fix those tests now.

- [ ] **Step 2: Run with coverage**

```bash
npm run test:cov
```

Expected: ≥80% across all four metrics. Coverage of `lib/recipes.ts` and `lib/db.ts` should be high since the lib unit tests + API integration tests both exercise them.

If coverage on `lib/db.ts` is low: the production-pg branch isn't exercised by tests (we never start a real Postgres in tests). That's expected — exclude `src/lib/db.ts` from the coverage scope **only if** it drags totals below 80% AND you've verified by reading the file that the un-covered branches are the production-only ones. If so, add `"src/lib/db.ts"` to the `exclude` list in `vitest.config.ts` with a comment explaining why.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit only if `vitest.config.ts` was edited**

```bash
git add Source_Code/vitest.config.ts
git commit -m "chore: exclude lib/db.ts production branch from coverage scope"
```

(Skip if no edit was needed.)

---

### Task 14: Add `.env.local.example`

**Files:**
- Create: `Source_Code/.env.local.example`

- [ ] **Step 1: Write the file**

Create `Source_Code/.env.local.example`:

```bash
# Copy this file to .env.local and fill in real values.
# .env.local is gitignored.

# Postgres connection string. From Supabase: Project Settings → Database →
# Connection string → URI. Use the "Session" pooler for Vercel deployments,
# and the "Transaction" pooler for short-lived local scripts.
#
# Example:
# DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres
DATABASE_URL=
```

- [ ] **Step 2: Verify .gitignore covers .env.local**

```bash
grep -E "\.env\.local" .gitignore
```

Expected: a match (the create-next-app default already ignores `.env*.local`).

- [ ] **Step 3: Commit**

```bash
git add Source_Code/.env.local.example
git commit -m "docs: document required env vars for the recipes DB"
```

---

### Task 15: Update INSTALL.md with Supabase setup

**Files:**
- Modify: ` Deployment_Setup/INSTALL.md`

- [ ] **Step 1: Find the "Environment Setup" section**

Open ` Deployment_Setup/INSTALL.md` (note the leading space in the directory name). Locate the "Environment Setup" section (around line 146).

- [ ] **Step 2: Replace the "in-memory storage" claim**

The current text reads:
> This application uses **in-memory storage** and requires **no external databases** or environment variables for basic operation.

Replace that paragraph with:

```markdown
This application requires a Postgres database for recipes. Auth (users,
sessions, password reset tokens) is still in-memory in this phase and
needs no configuration.

### Database setup (Supabase)

1. Create a free Supabase project at https://supabase.com.
2. In your project dashboard: **SQL Editor → New query**, paste the
   contents of `Source_Code/supabase/schema.sql`, and run it.
3. Get your connection string: **Project Settings → Database → Connection
   string → URI**. Copy the **Session** pooler URI (for Vercel) or the
   direct URI (for local dev).
4. Copy `Source_Code/.env.local.example` to `Source_Code/.env.local` and
   fill in `DATABASE_URL`.
5. Verify the connection:

   ```bash
   cd Source_Code
   npm run dev
   ```

   Then sign in (test@test.com / test) and create a recipe. Restart
   `npm run dev` — the recipe should still be there.

#### Mock User Credentials (still in-memory)

- Email: `test@test.com`
- Password: `test`

#### Session Duration

- 24 hours
- Authentication: PBKDF2 with SHA-512 (120,000 iterations)
```

- [ ] **Step 3: Commit**

```bash
git add " Deployment_Setup/INSTALL.md"
git commit -m "docs: install guide covers Supabase setup for recipes DB"
```

---

### Task 16: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the persistence note**

In `README.md`, replace the line:

```markdown
Built with Next.js 16, React 19, TypeScript, and Tailwind CSS 4. Sessions are
in-memory; persistence (Supabase/PostgreSQL) is planned in a follow-up.
```

with:

```markdown
Built with Next.js 16, React 19, TypeScript, and Tailwind CSS 4. Recipes are
persisted to Postgres (Supabase). Auth (users, sessions, reset tokens) is
still in-memory and migrates in a follow-up phase.
```

- [ ] **Step 2: Add a "Database" subsection under "Quick start"**

Insert this immediately after the existing "Quick start" code block:

```markdown
### Database

This phase requires a Postgres database for recipes. See
[Installation Guide](./%20Deployment_Setup/INSTALL.md#database-setup-supabase)
for the Supabase setup.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README points at the new Supabase setup section"
```

---

### Task 17: Push everything

- [ ] **Step 1: Verify clean working tree**

```bash
git status --short
```

Expected: empty (all changes committed). If anything is left, decide whether it belongs in a final commit or should be dropped.

- [ ] **Step 2: Push**

```bash
git push upstream main
```

- [ ] **Step 3: Verify on GitHub**

Open https://github.com/Jiashu-Hu/SE-Project/commits/main and confirm all phase-1 commits are present.

---

### Task 18: Smoke test against a real Supabase project (manual)

This task is the human-driven smoke. It cannot be fully scripted because it requires a Supabase account.

- [ ] **Step 1: Provision a Supabase project**

Sign up at https://supabase.com if you haven't. Create a new project (free tier). Choose a region close to you.

- [ ] **Step 2: Apply the schema**

Project dashboard → SQL Editor → New query → paste `Source_Code/supabase/schema.sql` → Run. Confirm "Success. No rows returned."

- [ ] **Step 3: Get the connection string**

Project Settings → Database → Connection string → URI. Use the **Session** pooler form. Copy it.

- [ ] **Step 4: Set up .env.local**

```bash
cp Source_Code/.env.local.example Source_Code/.env.local
```

Edit `Source_Code/.env.local` and paste the URI as `DATABASE_URL`.

- [ ] **Step 5: Run the dev server**

```bash
cd Source_Code
npm run dev
```

- [ ] **Step 6: Walk the flow**

In a browser at http://localhost:3000:
1. Log in with `test@test.com` / `test`.
2. Click "+ New recipe", create a recipe with all required fields.
3. Verify it shows up on the dashboard.
4. Click into it. Edit the title. Save. Verify the change persists.
5. Stop the dev server (Ctrl+C). Start it again (`npm run dev`).
6. Reload the dashboard. **The recipe should still be there.** This is the proof that data now lives in Postgres rather than the in-memory store.
7. Delete the recipe via the recipe detail page. Confirm it's gone.

- [ ] **Step 7: Spot-check Supabase**

In the Supabase dashboard → Table Editor → recipes. Confirm rows you created/deleted match what you saw in the UI.

- [ ] **Step 8: Tear down for tests**

Tests use PGlite, not Supabase, so nothing to tear down. The Supabase project stays for Phase 2 (auth migration) and Phase 3 (Vercel deploy).

---

## What's NOT in this plan (deferred)

- **Auth migration to Postgres** (Phase 2). Users, sessions, password reset tokens still live in `globalThis` Maps. Multiple browsers/devices won't share auth state until this lands.
- **Vercel deployment** (Phase 3). The codebase still won't run on Vercel until the auth tables exist — Vercel functions are stateless, so any in-memory store loses data between invocations.
- **`author_id` → `uuid references users(id)`**. Tightening to a real foreign key happens with the auth migration in Phase 2.
- **Migration framework** (Flyway / node-pg-migrate / Supabase CLI migrations). One schema, no need yet.
- **Image upload** for `recipes.image_url`. The column is in the schema; no UI yet.
- **`updated_at` column / trigger**. Not present in current types; if added, it's an SRS-shaped concern (the Appendix B ERD has it) — handle in a follow-up.

---

## Self-review

**Spec coverage (against SRS sections):**
- §2.1 / §4.3 / §6 (Postgres-backed persistence for recipes) → Tasks 2–7 ✅
- §3.3 / §3.4 / §3.5 / §3.6 (recipe CRUD) → Tasks 6–12 (behavior preserved through tests) ✅
- §3.9 (per-user dashboard) → Task 10 ✅
- §5.4 (10K recipes per user is now feasible since storage isn't bounded by Node heap) → Tasks 6–7 ✅
- §6 (database based on PostgreSQL through Supabase) → Tasks 2, 15, 18 ✅

**Spec NOT covered in this plan (and where it goes):**
- §3.1 / §3.2 / §3.10 (auth, login, profile) — Phase 2 plan.
- §5.3 (24h sessions) — already covered in the previous plan (still in-memory; same behavior).

**Placeholder scan:** No "TBD", "TODO", "implement later", or "fill in details" markers. Every step shows the actual code, command, or expected output.

**Type / name consistency:**
- `QueryClient` defined in `db.ts` (Task 3), used in `setup.ts` (Task 4) and via `getDb()` in `recipes.ts` (Task 7). Same name throughout.
- `getDb()` is sync everywhere; `db.query()` is async everywhere.
- `RecipeRow` is private to `recipes.ts`. The public type is still `Recipe` from `types/recipe.ts`.
- `__setTestDb` and `__resetDb` test hooks defined in Task 3, used in Task 4 only.
- `SELECT_COLUMNS` is one constant in `recipes.ts` so the column list stays in sync between `select`, `returning`, and the row type.

**Open assumptions (verify during execution):**
- PGlite returns JSONB columns as parsed JS values. The plan assumes this; if tests show stringified JSON in the assertions, switch the `RecipeRow.ingredients` type to `string` and parse in `toRecipe`. (The fallback path is documented in Task 7 Step 2.)
- `process.cwd()` is `Source_Code/` when Vitest runs. The plan documents the `path.resolve(__dirname, ...)` fallback in Task 4 Step 2.
- Supabase requires SSL on the connection string. The plan adds `ssl: { rejectUnauthorized: false }` in `db.ts` when the URL contains "supabase". If using a self-hosted Postgres, that branch is skipped.
