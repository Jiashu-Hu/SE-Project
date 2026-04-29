# Bucket Layer Implementation Plan (Phase A2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-user bucket (wishlist) for recipes — desktop drag-and-drop (`@dnd-kit/core`) on `/dashboard` (drag → FAB) and `/meal-plan` (drag from drawer → slot); mobile header bucket icon → `/bucket` page (toggle: Manage / Browse-and-Add); A1's slot picker modal grows a Bucket | All tab switcher; "empty bucket?" banner on shopping list.

**Architecture:** One new Postgres table (`bucket_items` with `UNIQUE (user_id, recipe_id)`), one lib module (`lib/bucket.ts`), two API endpoints (`/api/bucket` for list/add/clear, `/api/bucket/[recipeId]` for remove), one new server page (`/bucket`), and four new client components (BucketPageClient, BucketFab, BucketDrawer, EmptyBucketBanner). Five existing files modified for drag-and-drop wiring (DndContext on `/dashboard` + `/meal-plan`, `RecipeCard` becomes draggable, `EmptySlot` becomes droppable, `RecipePickerModal` gets tabs, `ShoppingListClient` renders the banner, `Header` gets the mobile icon).

**Tech Stack:**
- `@dnd-kit/core` 6.3.1 — drag-and-drop on desktop only
- `pg` + PGlite (existing)
- Reuses: `lib/db.ts` test seam, `lib/recipes.ts` (for the recipe lookups), `lib/auth-server.ts`, A1's `RecipePickerModal`, A1's slot endpoint

**Spec:** [`docs/superpowers/specs/2026-04-28-bucket-layer-design.md`](../specs/2026-04-28-bucket-layer-design.md)

**Working directory:** Worktree at `../class-project-bucket/` on branch `feat/bucket-layer`.

---

## Decisions baked in (don't relitigate)

1. **One new table.** `bucket_items` with `UNIQUE (user_id, recipe_id)`, FK cascade to users + recipes.
2. **`@dnd-kit/core` 6.3.1.** No SortableJS, no react-beautiful-dnd, no native HTML5.
3. **Desktop drag-only.** Mobile cards aren't wrapped in `DndContext`; they have no drag handles.
4. **Bucket UNIQUE prevents dupes.** No reorder UI in A2; items render newest-first via `added_at desc`.
5. **Bucket → slot does NOT remove from bucket.** Wishlist behavior. Explicit clear via banner or `/bucket` Manage mode.
6. **No new env vars, no schema changes elsewhere.** Migration is additive on top of A1.
7. **Banner dismissal lives in sessionStorage** keyed by `weekStart`. Reappears next session.
8. **Recipe picker modal default tab** is **Bucket** (with All recipes as fallback). Bucket-empty case renders an empty-state with a "Browse all recipes" CTA that switches tabs.

---

## File structure

### Created
| Path | Responsibility |
|---|---|
| `Source_Code/supabase/migrations/2026-04-28-bucket.sql` | One-shot migration (idempotent) |
| `Source_Code/src/lib/bucket.ts` | Async CRUD: `listBucket`, `addToBucket`, `removeFromBucket`, `clearBucket` |
| `Source_Code/src/lib/__tests__/bucket.test.ts` | Lib unit tests against PGlite |
| `Source_Code/src/app/api/bucket/route.ts` | `GET` list, `POST` add, `DELETE` clear-all |
| `Source_Code/src/app/api/bucket/[recipeId]/route.ts` | `DELETE` remove specific recipe |
| `Source_Code/src/app/api/bucket/__tests__/bucket.test.ts` | Route integration tests |
| `Source_Code/src/app/bucket/page.tsx` | Auth-gated server component |
| `Source_Code/src/components/bucket/BucketPageClient.tsx` | Toggle + manage list + browse-and-add list |
| `Source_Code/src/components/bucket/BucketFab.tsx` | Desktop FAB + droppable target |
| `Source_Code/src/components/bucket/BucketDrawer.tsx` | Desktop drawer; bucket items are draggable in here |
| `Source_Code/src/components/bucket/EmptyBucketBanner.tsx` | Shopping-list banner |

### Modified
| Path | Change |
|---|---|
| `Source_Code/package.json` | Add `@dnd-kit/core@^6.3.1` |
| `Source_Code/supabase/schema.sql` | Append `bucket_items` block |
| `Source_Code/src/test/setup.ts` | Truncate `bucket_items` |
| `Source_Code/src/components/Header.tsx` | Mobile bucket-link icon (with count) |
| `Source_Code/src/components/DashboardClient.tsx` | Wrap in `DndContext`; pass enabled flag to recipe cards |
| `Source_Code/src/components/RecipeCard.tsx` | Optional `useDraggable` wrapper when `draggable` prop is true |
| `Source_Code/src/components/meal-plan/MealPlanClient.tsx` | Wrap in `DndContext`; mount drawer; wire drop handler |
| `Source_Code/src/components/meal-plan/EmptySlot.tsx` | `useDroppable` |
| `Source_Code/src/components/meal-plan/RecipePickerModal.tsx` | Bucket / All tabs |
| `Source_Code/src/components/shopping-list/ShoppingListClient.tsx` | Render `EmptyBucketBanner` |

---

## Phase 1: Foundation

### Task 1: Install `@dnd-kit/core`

**Files:**
- Modify: `Source_Code/package.json`, `Source_Code/package-lock.json`

- [ ] **Step 1: Install**

From `Source_Code/`:

```bash
npm install @dnd-kit/core@^6.3.1
```

Lands in `dependencies`.

- [ ] **Step 2: Smoke check**

```bash
node -e "const k = require('@dnd-kit/core'); console.log(typeof k.DndContext);"
```

Expected output: `object` (the DndContext is a React component object).

- [ ] **Step 3: Commit**

```bash
git add Source_Code/package.json Source_Code/package-lock.json
git commit -m "chore: add @dnd-kit/core for desktop drag-and-drop"
```

---

### Task 2: Schema migration + `schema.sql` append

**Files:**
- Create: `Source_Code/supabase/migrations/2026-04-28-bucket.sql`
- Modify: `Source_Code/supabase/schema.sql`

- [ ] **Step 1: Create the migration file**

```sql
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
```

- [ ] **Step 2: Append the same DDL to `schema.sql`**

Open `Source_Code/supabase/schema.sql` and append after the existing meal-planner block:

```sql

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
```

- [ ] **Step 3: Verify schema parses against PGlite**

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

Expected: 7 tables — `bucket_items`, `ingredient_aisles`, `meal_plan_slots`, `password_reset_tokens`, `recipes`, `sessions`, `users`.

- [ ] **Step 4: Commit**

```bash
git add Source_Code/supabase/schema.sql Source_Code/supabase/migrations/2026-04-28-bucket.sql
git commit -m "feat: add bucket_items table"
```

---

### Task 3: Extend test setup truncate

**Files:**
- Modify: `Source_Code/src/test/setup.ts`

- [ ] **Step 1: Update truncate**

Open `Source_Code/src/test/setup.ts`. Find the truncate string from A1:

```typescript
"truncate table users, sessions, password_reset_tokens, recipes, meal_plan_slots, ingredient_aisles restart identity cascade;"
```

Replace with:

```typescript
"truncate table users, sessions, password_reset_tokens, recipes, meal_plan_slots, ingredient_aisles, bucket_items restart identity cascade;"
```

- [ ] **Step 2: Verify suite still passes**

```bash
npm test 2>&1 | tail -5
```

Expected: 172 tests pass (same as A1 baseline).

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/test/setup.ts
git commit -m "test: truncate bucket_items between tests"
```

---

## Phase 2: Lib (TDD)

### Task 4: `lib/bucket.ts` — DB CRUD

**Files:**
- Create: `Source_Code/src/lib/bucket.ts`
- Create: `Source_Code/src/lib/__tests__/bucket.test.ts`

- [ ] **Step 1: Write failing test**

Create `Source_Code/src/lib/__tests__/bucket.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  addToBucket,
  listBucket,
  removeFromBucket,
  clearBucket,
} from "@/lib/bucket";
import { registerUser } from "@/lib/auth";
import { createRecipe } from "@/lib/recipes";
import type { CreateRecipePayload } from "@/types/recipe";

const SAMPLE: CreateRecipePayload = {
  title: "T", description: "x", category: "Dinner",
  prepTime: 1, cookTime: 1, servings: 4,
  ingredients: [{ amount: "1", unit: "u", item: "stuff" }],
  instructions: ["x"], tags: [],
};

async function makeUserAndRecipe() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  const recipe = await createRecipe(reg.user.id, SAMPLE);
  return { userId: reg.user.id, recipeId: recipe.id };
}

describe("addToBucket + listBucket", () => {
  it("adds an item and lists it", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    const result = await addToBucket(userId, recipeId);
    expect("item" in result).toBe(true);
    const list = await listBucket(userId);
    expect(list).toHaveLength(1);
    expect(list[0].recipeId).toBe(recipeId);
  });

  it("rejects duplicates with a friendly error", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    await addToBucket(userId, recipeId);
    const dup = await addToBucket(userId, recipeId);
    expect("error" in dup).toBe(true);
    if ("error" in dup) {
      expect(dup.error).toMatch(/already in bucket/i);
    }
  });

  it("returns [] for a user with no items", async () => {
    const reg = await registerUser({
      name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
    });
    if (!("user" in reg)) throw new Error("setup failed");
    expect(await listBucket(reg.user.id)).toEqual([]);
  });

  it("orders newest first", async () => {
    const reg = await registerUser({
      name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
    });
    if (!("user" in reg)) throw new Error("setup failed");
    const r1 = await createRecipe(reg.user.id, SAMPLE);
    const r2 = await createRecipe(reg.user.id, SAMPLE);
    await addToBucket(reg.user.id, r1.id);
    await new Promise((r) => setTimeout(r, 10));
    await addToBucket(reg.user.id, r2.id);
    const list = await listBucket(reg.user.id);
    expect(list[0].recipeId).toBe(r2.id);
    expect(list[1].recipeId).toBe(r1.id);
  });

  it("returns [] for malformed userId", async () => {
    expect(await listBucket("not-a-uuid")).toEqual([]);
  });

  it("returns error for malformed userId in addToBucket", async () => {
    const result = await addToBucket("not-a-uuid", "00000000-0000-0000-0000-000000000000");
    expect("error" in result).toBe(true);
  });
});

describe("removeFromBucket", () => {
  it("removes an item and returns true", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    await addToBucket(userId, recipeId);
    expect(await removeFromBucket(userId, recipeId)).toBe(true);
    expect(await listBucket(userId)).toEqual([]);
  });

  it("returns false when the item isn't in the bucket", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    expect(await removeFromBucket(userId, recipeId)).toBe(false);
  });

  it("returns false for malformed userId", async () => {
    expect(
      await removeFromBucket("not-a-uuid", "00000000-0000-0000-0000-000000000000")
    ).toBe(false);
  });
});

describe("clearBucket", () => {
  it("removes all items for a user and returns the count", async () => {
    const reg = await registerUser({
      name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
    });
    if (!("user" in reg)) throw new Error("setup failed");
    const r1 = await createRecipe(reg.user.id, SAMPLE);
    const r2 = await createRecipe(reg.user.id, SAMPLE);
    await addToBucket(reg.user.id, r1.id);
    await addToBucket(reg.user.id, r2.id);

    expect(await clearBucket(reg.user.id)).toBe(2);
    expect(await listBucket(reg.user.id)).toEqual([]);
  });

  it("returns 0 when bucket is empty", async () => {
    const reg = await registerUser({
      name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
    });
    if (!("user" in reg)) throw new Error("setup failed");
    expect(await clearBucket(reg.user.id)).toBe(0);
  });

  it("returns 0 for malformed userId", async () => {
    expect(await clearBucket("not-a-uuid")).toBe(0);
  });
});

describe("cascade behavior", () => {
  it("removes bucket items when the user is deleted", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    await addToBucket(userId, recipeId);
    // Delete user via raw SQL
    const { getDb } = await import("@/lib/db");
    await getDb().query("delete from users where id = $1", [userId]);
    expect(await listBucket(userId)).toEqual([]);
  });

  it("removes bucket items when the recipe is deleted", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    await addToBucket(userId, recipeId);
    const { getDb } = await import("@/lib/db");
    await getDb().query("delete from recipes where id = $1", [recipeId]);
    expect(await listBucket(userId)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — verify RED**

```bash
npm test -- --run src/lib/__tests__/bucket.test.ts 2>&1 | tail -10
```

Expected: import error.

- [ ] **Step 3: Implement**

Create `Source_Code/src/lib/bucket.ts`:

```typescript
import { getDb } from "@/lib/db";
import type { QueryRow } from "@/lib/db";

export interface BucketItem {
  readonly id: string;
  readonly userId: string;
  readonly recipeId: string;
  readonly addedAt: string;
}

interface BucketRow extends QueryRow {
  id: string;
  user_id: string;
  recipe_id: string;
  added_at: string | Date;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function toIsoTimestamp(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString();
}

function rowToItem(row: BucketRow): BucketItem {
  return {
    id: row.id,
    userId: row.user_id,
    recipeId: row.recipe_id,
    addedAt: toIsoTimestamp(row.added_at),
  };
}

const SELECT_COLUMNS = "id, user_id, recipe_id, added_at";

export async function listBucket(
  userId: string
): Promise<readonly BucketItem[]> {
  if (!isUuid(userId)) return [];
  const db = getDb();
  const result = await db.query<BucketRow>(
    `select ${SELECT_COLUMNS}
       from bucket_items
      where user_id = $1
      order by added_at desc`,
    [userId]
  );
  return result.rows.map(rowToItem);
}

export async function addToBucket(
  userId: string,
  recipeId: string
): Promise<{ item: BucketItem } | { error: string }> {
  if (!isUuid(userId)) return { error: "Invalid user." };
  if (!isUuid(recipeId)) return { error: "Invalid recipe." };
  const db = getDb();
  try {
    const result = await db.query<BucketRow>(
      `insert into bucket_items (user_id, recipe_id)
         values ($1, $2)
         returning ${SELECT_COLUMNS}`,
      [userId, recipeId]
    );
    return { item: rowToItem(result.rows[0]) };
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505") {
      return { error: "Already in bucket." };
    }
    throw err;
  }
}

export async function removeFromBucket(
  userId: string,
  recipeId: string
): Promise<boolean> {
  if (!isUuid(userId) || !isUuid(recipeId)) return false;
  const db = getDb();
  const result = await db.query(
    `delete from bucket_items where user_id = $1 and recipe_id = $2`,
    [userId, recipeId]
  );
  return result.rowCount > 0;
}

export async function clearBucket(userId: string): Promise<number> {
  if (!isUuid(userId)) return 0;
  const db = getDb();
  const result = await db.query(
    `delete from bucket_items where user_id = $1`,
    [userId]
  );
  return result.rowCount;
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/lib/__tests__/bucket.test.ts 2>&1 | tail -10
```

Expected: 13 tests PASS.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add Source_Code/src/lib/bucket.ts Source_Code/src/lib/__tests__/bucket.test.ts
git commit -m "feat: bucket lib with add/list/remove/clear + cascade tests"
```

---

## Phase 3: API routes (TDD)

### Task 5: `GET / POST / DELETE /api/bucket`

**Files:**
- Create: `Source_Code/src/app/api/bucket/route.ts`
- Create: `Source_Code/src/app/api/bucket/__tests__/bucket.test.ts`

- [ ] **Step 1: Write failing tests**

Create `Source_Code/src/app/api/bucket/__tests__/bucket.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { GET, POST, DELETE as DELETE_ALL } from "@/app/api/bucket/route";
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

async function login() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  cookieJar.set(AUTH_SESSION_COOKIE, (await createSession(reg.user.id)).token);
  return { userId: reg.user.id };
}

beforeEach(() => cookieJar.clear());

describe("GET /api/bucket", () => {
  it("returns 401 when not logged in", async () => {
    const res = await GET(new Request("http://localhost/api/bucket"));
    expect(res.status).toBe(401);
  });

  it("returns an empty list for a fresh user", async () => {
    await login();
    const res = await GET(new Request("http://localhost/api/bucket"));
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });
});

describe("POST /api/bucket", () => {
  function makeReq(body: unknown): Request {
    return new Request("http://localhost/api/bucket", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when not logged in", async () => {
    const res = await POST(makeReq({ recipeId: "00000000-0000-0000-0000-000000000000" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing recipeId", async () => {
    await login();
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("returns 201 on successful add", async () => {
    const { userId } = await login();
    const recipe = await createRecipe(userId, SAMPLE);
    const res = await POST(makeReq({ recipeId: recipe.id }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.item.recipeId).toBe(recipe.id);
  });

  it("returns 409 on duplicate add", async () => {
    const { userId } = await login();
    const recipe = await createRecipe(userId, SAMPLE);
    await POST(makeReq({ recipeId: recipe.id }));
    const dup = await POST(makeReq({ recipeId: recipe.id }));
    expect(dup.status).toBe(409);
  });
});

describe("DELETE /api/bucket (clear all)", () => {
  it("returns 401 when not logged in", async () => {
    const res = await DELETE_ALL(new Request("http://localhost/api/bucket", { method: "DELETE" }));
    expect(res.status).toBe(401);
  });

  it("clears the bucket and returns the count", async () => {
    const { userId } = await login();
    const r1 = await createRecipe(userId, SAMPLE);
    const r2 = await createRecipe(userId, SAMPLE);
    await POST(new Request("http://localhost/api/bucket", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId: r1.id }),
    }));
    await POST(new Request("http://localhost/api/bucket", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId: r2.id }),
    }));
    const res = await DELETE_ALL(new Request("http://localhost/api/bucket", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect((await res.json()).cleared).toBe(2);
  });
});
```

- [ ] **Step 2: Run — verify RED**

```bash
npm test -- --run src/app/api/bucket/__tests__/bucket.test.ts 2>&1 | tail -10
```

Expected: import error.

- [ ] **Step 3: Implement the route**

Create `Source_Code/src/app/api/bucket/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import {
  listBucket,
  addToBucket,
  clearBucket,
} from "@/lib/bucket";

export async function GET(_request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const items = await listBucket(user.id);
  return NextResponse.json({ items });
}

interface AddBody {
  readonly recipeId: string;
}

function isAddBody(value: unknown): value is AddBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.recipeId === "string";
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

  if (!isAddBody(body)) {
    return NextResponse.json(
      { error: "Body must include recipeId (string)." },
      { status: 400 }
    );
  }

  const result = await addToBucket(user.id, body.recipeId);
  if ("error" in result) {
    if (result.error === "Already in bucket.") {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ item: result.item }, { status: 201 });
}

export async function DELETE(_request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const cleared = await clearBucket(user.id);
  return NextResponse.json({ cleared });
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/app/api/bucket/__tests__/bucket.test.ts 2>&1 | tail -10
```

Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add Source_Code/src/app/api/bucket/route.ts \
        Source_Code/src/app/api/bucket/__tests__/bucket.test.ts
git commit -m "feat: GET/POST/DELETE /api/bucket"
```

---

### Task 6: `DELETE /api/bucket/[recipeId]`

**Files:**
- Create: `Source_Code/src/app/api/bucket/[recipeId]/route.ts`
- Modify: `Source_Code/src/app/api/bucket/__tests__/bucket.test.ts`

- [ ] **Step 1: Append tests for the by-recipe DELETE**

Append to `Source_Code/src/app/api/bucket/__tests__/bucket.test.ts`:

```typescript
import { DELETE as DELETE_ONE } from "@/app/api/bucket/[recipeId]/route";

function paramsFor(recipeId: string) {
  return { params: Promise.resolve({ recipeId }) };
}

describe("DELETE /api/bucket/[recipeId]", () => {
  it("returns 401 when not logged in", async () => {
    const res = await DELETE_ONE(
      new Request("http://localhost/api/bucket/x", { method: "DELETE" }),
      paramsFor("00000000-0000-0000-0000-000000000000")
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when the recipe isn't in the bucket", async () => {
    await login();
    const res = await DELETE_ONE(
      new Request("http://localhost/api/bucket/x", { method: "DELETE" }),
      paramsFor("00000000-0000-0000-0000-000000000000")
    );
    expect(res.status).toBe(404);
  });

  it("returns 204 on successful remove", async () => {
    const { userId } = await login();
    const recipe = await createRecipe(userId, SAMPLE);
    await POST(new Request("http://localhost/api/bucket", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId: recipe.id }),
    }));
    const res = await DELETE_ONE(
      new Request(`http://localhost/api/bucket/${recipe.id}`, { method: "DELETE" }),
      paramsFor(recipe.id)
    );
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run — verify RED**

```bash
npm test -- --run src/app/api/bucket/__tests__/bucket.test.ts 2>&1 | tail -10
```

Expected: import error for `[recipeId]/route`.

- [ ] **Step 3: Implement**

Create `Source_Code/src/app/api/bucket/[recipeId]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { removeFromBucket } from "@/lib/bucket";

interface RouteContext {
  readonly params: Promise<{ recipeId: string }>;
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { recipeId } = await params;
  const ok = await removeFromBucket(user.id, recipeId);
  if (!ok) {
    return NextResponse.json({ error: "Not in bucket." }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/app/api/bucket/__tests__/bucket.test.ts 2>&1 | tail -10
```

Expected: 10 tests PASS (7 from T5 + 3 new).

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add 'Source_Code/src/app/api/bucket/[recipeId]/route.ts' \
        Source_Code/src/app/api/bucket/__tests__/bucket.test.ts
git commit -m "feat: DELETE /api/bucket/[recipeId]"
```

---

## Phase 4: Frontend

### Task 7: `/bucket` server page

**Files:**
- Create: `Source_Code/src/app/bucket/page.tsx`
- Create: `Source_Code/src/components/bucket/BucketPageClient.tsx` (stub)

- [ ] **Step 1: Server page**

Create `Source_Code/src/app/bucket/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { listBucket } from "@/lib/bucket";
import { getRecipesByAuthor } from "@/lib/recipes";
import { BucketPageClient } from "@/components/bucket/BucketPageClient";

export const metadata: Metadata = { title: "Bucket | RecipeBox" };

export default async function BucketPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect("/login");

  const [items, allRecipes] = await Promise.all([
    listBucket(user.id),
    getRecipesByAuthor(user.id),
  ]);

  const bucketRecipeIds = new Set(items.map((i) => i.recipeId));

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          Bucket
        </h1>
        <BucketPageClient
          initialItems={items}
          allRecipes={allRecipes}
          initialBucketRecipeIds={Array.from(bucketRecipeIds)}
        />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Stub the client**

Create `Source_Code/src/components/bucket/BucketPageClient.tsx`:

```typescript
"use client";

import type { BucketItem } from "@/lib/bucket";
import type { Recipe } from "@/types/recipe";

interface BucketPageClientProps {
  readonly initialItems: readonly BucketItem[];
  readonly allRecipes: readonly Recipe[];
  readonly initialBucketRecipeIds: readonly string[];
}

export function BucketPageClient({
  initialItems,
  allRecipes,
  initialBucketRecipeIds,
}: BucketPageClientProps) {
  return (
    <div className="text-sm text-zinc-700 dark:text-zinc-300">
      Bucket has {initialItems.length} item(s); user has {allRecipes.length} recipe(s); already-in-bucket count {initialBucketRecipeIds.length}
    </div>
  );
}
```

(T8 fills in the real client.)

- [ ] **Step 3: Type-check + run tests**

```bash
npx tsc --noEmit
npm test 2>&1 | tail -5
```

Expected: tsc clean. All tests still pass.

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/app/bucket/page.tsx \
        Source_Code/src/components/bucket/BucketPageClient.tsx
git commit -m "feat: /bucket server page + client shell"
```

---

### Task 8: `BucketPageClient` — toggle, manage, browse-and-add

**Files:**
- Modify: `Source_Code/src/components/bucket/BucketPageClient.tsx`

- [ ] **Step 1: Replace the stub**

Overwrite `Source_Code/src/components/bucket/BucketPageClient.tsx`:

```typescript
"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { BucketItem } from "@/lib/bucket";
import type { Recipe } from "@/types/recipe";

type Mode = "manage" | "add";

interface BucketPageClientProps {
  readonly initialItems: readonly BucketItem[];
  readonly allRecipes: readonly Recipe[];
  readonly initialBucketRecipeIds: readonly string[];
}

export function BucketPageClient({
  initialItems,
  allRecipes,
  initialBucketRecipeIds,
}: BucketPageClientProps) {
  const [items, setItems] = useState<readonly BucketItem[]>(initialItems);
  const [bucketIds, setBucketIds] = useState<Set<string>>(
    new Set(initialBucketRecipeIds)
  );
  const [mode, setMode] = useState<Mode>(items.length > 0 ? "manage" : "add");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const recipesById = useMemo(() => {
    const m = new Map<string, Recipe>();
    for (const r of allRecipes) m.set(r.id, r);
    return m;
  }, [allRecipes]);

  const filteredRecipes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRecipes;
    return allRecipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [allRecipes, search]);

  function handleAdd(recipeId: string): void {
    if (bucketIds.has(recipeId)) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/bucket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Could not add.");
        return;
      }
      const body = await res.json();
      setItems([body.item, ...items]);
      setBucketIds(new Set([...bucketIds, recipeId]));
    });
  }

  function handleRemove(recipeId: string): void {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/bucket/${recipeId}`, { method: "DELETE" });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Could not remove.");
        return;
      }
      setItems(items.filter((i) => i.recipeId !== recipeId));
      const next = new Set(bucketIds);
      next.delete(recipeId);
      setBucketIds(next);
    });
  }

  return (
    <div>
      {/* Mode toggle */}
      <div className="mb-6 inline-flex rounded-lg border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setMode("manage")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            mode === "manage"
              ? "bg-orange-600 text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          Manage ({items.length})
        </button>
        <button
          type="button"
          onClick={() => setMode("add")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            mode === "add"
              ? "bg-orange-600 text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          Browse & Add
        </button>
      </div>

      {error && (
        <p className="mb-4 text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      )}

      {mode === "manage" && (
        <div>
          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
              Your bucket is empty. Switch to <button
                type="button"
                onClick={() => setMode("add")}
                className="font-medium text-orange-600 underline"
              >
                Browse &amp; Add
              </button> to start filling it.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((it) => {
                const recipe = recipesById.get(it.recipeId);
                return (
                  <li
                    key={it.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <Link
                      href={`/recipes/${it.recipeId}`}
                      className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                    >
                      {recipe?.title ?? "(deleted recipe)"}
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleRemove(it.recipeId)}
                      disabled={isPending}
                      aria-label="Remove from bucket"
                      className="text-zinc-400 hover:text-red-600 disabled:opacity-50"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {mode === "add" && (
        <div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your recipes..."
            className="mb-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          {filteredRecipes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
              {allRecipes.length === 0
                ? "You don't have any recipes yet."
                : "No matches."}
            </p>
          ) : (
            <ul className="space-y-1">
              {filteredRecipes.map((r) => {
                const inBucket = bucketIds.has(r.id);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => handleAdd(r.id)}
                      disabled={inBucket || isPending}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                        inBucket
                          ? "border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/50"
                          : "border-zinc-200 bg-white hover:border-orange-300 hover:bg-orange-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-orange-900/40 dark:hover:bg-orange-950/30"
                      }`}
                    >
                      <span className="text-sm font-medium">
                        {r.title}
                      </span>
                      {inBucket ? (
                        <span className="text-xs text-zinc-500">✓ In bucket</span>
                      ) : (
                        <span className="text-xs text-orange-600">+ Add</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
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
git add Source_Code/src/components/bucket/BucketPageClient.tsx
git commit -m "feat: BucketPageClient with Manage / Browse-and-Add toggle"
```

---

### Task 9: Header — mobile bucket icon

**Files:**
- Modify: `Source_Code/src/components/Header.tsx`

- [ ] **Step 1: Read the file**

Open `Source_Code/src/components/Header.tsx`. Find where the existing nav items live (Meal Plan link, profile, etc.).

- [ ] **Step 2: Add the mobile bucket link**

Add a new `<Link>` element visible only below the `md` breakpoint. Place near the existing Meal Plan link. Use Tailwind responsive class `md:hidden`:

```tsx
<Link
  href="/bucket"
  className="shrink-0 text-sm font-medium text-zinc-700 hover:text-orange-600 md:hidden dark:text-zinc-300 dark:hover:text-orange-400"
  aria-label="Bucket"
>
  🛒
</Link>
```

(Emoji is fine for class scope; replace with an SVG icon later if desired. The `md:hidden` ensures desktop sees the FAB instead.)

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/components/Header.tsx
git commit -m "feat: mobile-only bucket icon in header"
```

---

### Task 10: `BucketFab` — desktop FAB + droppable target

**Files:**
- Create: `Source_Code/src/components/bucket/BucketFab.tsx`

- [ ] **Step 1: Create the component**

Create `Source_Code/src/components/bucket/BucketFab.tsx`:

```typescript
"use client";

import { useDroppable } from "@dnd-kit/core";

interface BucketFabProps {
  readonly count: number;
  readonly isOpen: boolean;
  readonly onClick: () => void;
}

export function BucketFab({ count, isOpen, onClick }: BucketFabProps) {
  const { isOver, setNodeRef } = useDroppable({ id: "bucket" });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      aria-label={`Bucket (${count} item${count === 1 ? "" : "s"})`}
      className={`fixed bottom-6 right-6 z-40 hidden h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all md:flex ${
        isOver
          ? "scale-110 bg-orange-500 ring-4 ring-orange-200"
          : isOpen
          ? "bg-orange-700"
          : "bg-orange-600 hover:bg-orange-700"
      }`}
    >
      <span className="text-2xl text-white" aria-hidden="true">🛒</span>
      {count > 0 && (
        <span
          className="absolute -top-1 -right-1 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-white px-1 text-xs font-semibold text-orange-700 shadow"
          aria-hidden="true"
        >
          {count}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/components/bucket/BucketFab.tsx
git commit -m "feat: BucketFab — desktop FAB with droppable target"
```

---

### Task 11: `BucketDrawer` — desktop drawer with draggable items

**Files:**
- Create: `Source_Code/src/components/bucket/BucketDrawer.tsx`

- [ ] **Step 1: Create the component**

Create `Source_Code/src/components/bucket/BucketDrawer.tsx`:

```typescript
"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import type { BucketItem } from "@/lib/bucket";
import type { Recipe } from "@/types/recipe";

interface BucketDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly items: readonly BucketItem[];
  readonly recipesById: ReadonlyMap<string, Recipe>;
  readonly draggable: boolean; // true on /meal-plan, false on /dashboard
  readonly onRemove: (recipeId: string) => void;
}

function DraggableBucketItem({
  item,
  recipe,
  onRemove,
}: {
  readonly item: BucketItem;
  readonly recipe: Recipe | undefined;
  readonly onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `bucket-item:${item.recipeId}`,
      data: { recipeId: item.recipeId },
    });
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined;
  return (
    <li
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`flex cursor-grab items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900 ${
        isDragging ? "opacity-60 shadow-lg" : ""
      }`}
    >
      <span className="font-medium text-zinc-900 dark:text-zinc-50">
        {recipe?.title ?? "(deleted recipe)"}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label="Remove from bucket"
        className="text-zinc-400 hover:text-red-600"
      >
        ×
      </button>
    </li>
  );
}

function StaticBucketItem({
  item,
  recipe,
  onRemove,
}: {
  readonly item: BucketItem;
  readonly recipe: Recipe | undefined;
  readonly onRemove: () => void;
}) {
  return (
    <li className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <Link
        href={`/recipes/${item.recipeId}`}
        className="font-medium text-zinc-900 hover:underline dark:text-zinc-50"
      >
        {recipe?.title ?? "(deleted recipe)"}
      </Link>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove from bucket"
        className="text-zinc-400 hover:text-red-600"
      >
        ×
      </button>
    </li>
  );
}

export function BucketDrawer({
  open,
  onClose,
  items,
  recipesById,
  draggable,
  onRemove,
}: BucketDrawerProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-30 hidden md:block"
      onClick={onClose}
      role="presentation"
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="fixed right-0 top-0 h-full w-80 overflow-y-auto bg-white p-6 shadow-2xl dark:bg-zinc-900"
        aria-label="Bucket"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            🛒 Bucket
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ×
          </button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Drag a recipe card here, or browse on the dashboard.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((it) =>
              draggable ? (
                <DraggableBucketItem
                  key={it.id}
                  item={it}
                  recipe={recipesById.get(it.recipeId)}
                  onRemove={() => onRemove(it.recipeId)}
                />
              ) : (
                <StaticBucketItem
                  key={it.id}
                  item={it}
                  recipe={recipesById.get(it.recipeId)}
                  onRemove={() => onRemove(it.recipeId)}
                />
              )
            )}
          </ul>
        )}
      </aside>
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
git add Source_Code/src/components/bucket/BucketDrawer.tsx
git commit -m "feat: BucketDrawer with draggable bucket items on /meal-plan"
```

---

### Task 12: Wire `DndContext` on `/dashboard`

**Files:**
- Modify: `Source_Code/src/components/DashboardClient.tsx`
- Modify: `Source_Code/src/components/RecipeCard.tsx`

- [ ] **Step 1: Make `RecipeCard` optionally draggable**

Open `Source_Code/src/components/RecipeCard.tsx`. Wrap the card root with `useDraggable` when a `draggable` prop is set.

Add this near the top:

```typescript
import { useDraggable } from "@dnd-kit/core";
```

Update the props interface:

```typescript
export interface RecipeCardProps {
  readonly recipe: Recipe;
  readonly draggable?: boolean;
}
```

Inside the component, before the return, add:

```typescript
const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
  id: `recipe:${recipe.id}`,
  data: { recipeId: recipe.id },
  disabled: !draggable,
});
const dragStyle = transform
  ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: isDragging ? 50 : undefined }
  : undefined;
```

Then on the existing root element (Link or div), spread the drag props. If the existing root is a `<Link>`, wrap it in a `<div ref={setNodeRef} ...>` instead so the drag handlers don't interfere with link navigation. Example pattern:

```tsx
<div ref={setNodeRef} style={dragStyle} {...(draggable ? listeners : {})} {...(draggable ? attributes : {})}>
  {/* existing card JSX */}
</div>
```

(The exact change depends on the current `RecipeCard` shape — read the existing file and adapt minimally.)

- [ ] **Step 2: Wrap dashboard in `DndContext`**

Open `Source_Code/src/components/DashboardClient.tsx`. Add imports:

```typescript
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { useState, useEffect } from "react";
import { BucketFab } from "@/components/bucket/BucketFab";
import { BucketDrawer } from "@/components/bucket/BucketDrawer";
import type { BucketItem } from "@/lib/bucket";
```

Inside the component body, manage bucket state:

```typescript
const [bucketItems, setBucketItems] = useState<readonly BucketItem[]>([]);
const [drawerOpen, setDrawerOpen] = useState(false);

useEffect(() => {
  void fetch("/api/bucket")
    .then((r) => r.ok ? r.json() : { items: [] })
    .then((b) => setBucketItems(b.items ?? []))
    .catch(() => {});
}, []);

async function handleDragEnd(event: DragEndEvent) {
  if (event.over?.id !== "bucket") return;
  const recipeId = (event.active.data.current as { recipeId?: string })?.recipeId;
  if (!recipeId) return;
  const res = await fetch("/api/bucket", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipeId }),
  });
  if (res.ok) {
    const body = await res.json();
    setBucketItems([body.item, ...bucketItems]);
  }
  // 409 (already in bucket) and other errors: silent — user gets visual feedback via the drawer count
}

async function handleRemove(recipeId: string) {
  const res = await fetch(`/api/bucket/${recipeId}`, { method: "DELETE" });
  if (res.ok) {
    setBucketItems(bucketItems.filter((i) => i.recipeId !== recipeId));
  }
}

const recipesById = new Map(recipes.map((r) => [r.id, r]));
```

Wrap the existing dashboard JSX in `<DndContext onDragEnd={handleDragEnd}>` and append the FAB + drawer. Pass `draggable={true}` to each `RecipeCard`.

```tsx
<DndContext onDragEnd={handleDragEnd}>
  {/* existing dashboard JSX with <RecipeCard ... draggable /> */}
  <BucketFab
    count={bucketItems.length}
    isOpen={drawerOpen}
    onClick={() => setDrawerOpen(!drawerOpen)}
  />
  <BucketDrawer
    open={drawerOpen}
    onClose={() => setDrawerOpen(false)}
    items={bucketItems}
    recipesById={recipesById}
    draggable={false}
    onRemove={handleRemove}
  />
</DndContext>
```

- [ ] **Step 3: Type-check + run tests**

```bash
npx tsc --noEmit
npm test 2>&1 | tail -5
```

Expected: tsc clean, all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/components/RecipeCard.tsx \
        Source_Code/src/components/DashboardClient.tsx
git commit -m "feat: dashboard drag-to-bucket via DndContext"
```

---

### Task 13: Wire `DndContext` on `/meal-plan`

**Files:**
- Modify: `Source_Code/src/components/meal-plan/MealPlanClient.tsx`
- Modify: `Source_Code/src/components/meal-plan/EmptySlot.tsx`

- [ ] **Step 1: Make `EmptySlot` droppable**

Open `Source_Code/src/components/meal-plan/EmptySlot.tsx`. Add:

```typescript
import { useDroppable } from "@dnd-kit/core";
```

Update the `EmptySlotProps`:

```typescript
interface EmptySlotProps {
  readonly date: string;
  readonly mealType: MealType;
  readonly onAdd: () => void;
}
```

Inside the component:

```typescript
const { isOver, setNodeRef } = useDroppable({
  id: `slot:${date}:${mealType}`,
  data: { date, mealType },
});
```

On the existing button element, set `ref={setNodeRef}` and conditionally style on `isOver` (e.g., `isOver ? "border-orange-500 bg-orange-100" : ""`).

Update `DayColumn.tsx` to pass `date={props.date}` to each `EmptySlot`.

- [ ] **Step 2: Wrap `MealPlanClient` in `DndContext`**

In `Source_Code/src/components/meal-plan/MealPlanClient.tsx`, add the bucket state, drawer/FAB, and drag-end handler:

```typescript
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { useEffect } from "react";
import { BucketFab } from "@/components/bucket/BucketFab";
import { BucketDrawer } from "@/components/bucket/BucketDrawer";
import type { BucketItem } from "@/lib/bucket";
```

Inside the component:

```typescript
const [bucketItems, setBucketItems] = useState<readonly BucketItem[]>([]);
const [drawerOpen, setDrawerOpen] = useState(false);

useEffect(() => {
  void fetch("/api/bucket")
    .then((r) => r.ok ? r.json() : { items: [] })
    .then((b) => setBucketItems(b.items ?? []))
    .catch(() => {});
}, []);

async function handleDragEnd(event: DragEndEvent) {
  const overId = event.over?.id?.toString();
  const activeId = event.active.id.toString();
  if (!overId || !activeId.startsWith("bucket-item:") || !overId.startsWith("slot:")) return;

  const recipeId = (event.active.data.current as { recipeId?: string })?.recipeId;
  const slotData = event.over.data.current as { date?: string; mealType?: string } | undefined;
  if (!recipeId || !slotData?.date || !slotData?.mealType) return;

  const res = await fetch("/api/meal-plan/slots", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date: slotData.date,
      mealType: slotData.mealType,
      recipeId,
      servings: defaultServings,
    }),
  });
  if (res.ok) {
    const body = await res.json();
    setSlots([...slots, body.slot]);
  }
  // Bucket item stays in bucket either way (wishlist behavior).
}

async function handleBucketRemove(recipeId: string) {
  const res = await fetch(`/api/bucket/${recipeId}`, { method: "DELETE" });
  if (res.ok) setBucketItems(bucketItems.filter((i) => i.recipeId !== recipeId));
}
```

Wrap the existing render in `<DndContext onDragEnd={handleDragEnd}>` and append the FAB + drawer (with `draggable={true}` on the drawer).

- [ ] **Step 3: Type-check + run tests**

```bash
npx tsc --noEmit
npm test 2>&1 | tail -5
```

Expected: tsc clean, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/components/meal-plan/MealPlanClient.tsx \
        Source_Code/src/components/meal-plan/EmptySlot.tsx \
        Source_Code/src/components/meal-plan/DayColumn.tsx
git commit -m "feat: meal-plan drag-from-bucket-to-slot via DndContext"
```

---

### Task 14: `RecipePickerModal` — Bucket | All tabs

**Files:**
- Modify: `Source_Code/src/components/meal-plan/RecipePickerModal.tsx`

- [ ] **Step 1: Add bucket items prop + tabs**

The current modal accepts `recipes: readonly Recipe[]`. Add a new `bucketRecipes: readonly Recipe[]` prop and a tabs UI inside the modal.

Update the props:

```typescript
interface RecipePickerModalProps {
  readonly open: boolean;
  readonly recipes: readonly Recipe[];
  readonly bucketRecipes: readonly Recipe[];
  readonly onSelect: (recipe: Recipe) => void;
  readonly onClose: () => void;
}
```

Inside the component (before the return), add:

```typescript
type Tab = "bucket" | "all";
const [tab, setTab] = useState<Tab>(bucketRecipes.length > 0 ? "bucket" : "all");
```

Render the tabs:

```tsx
<div className="mt-3 inline-flex rounded-lg border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
  <button
    type="button"
    onClick={() => setTab("bucket")}
    className={`rounded-md px-3 py-1 text-sm font-medium ${tab === "bucket" ? "bg-orange-600 text-white" : "text-zinc-600 dark:text-zinc-400"}`}
  >
    Bucket ({bucketRecipes.length})
  </button>
  <button
    type="button"
    onClick={() => setTab("all")}
    className={`rounded-md px-3 py-1 text-sm font-medium ${tab === "all" ? "bg-orange-600 text-white" : "text-zinc-600 dark:text-zinc-400"}`}
  >
    All recipes
  </button>
</div>
```

Use `tab === "bucket" ? bucketRecipes : recipes` as the source for the existing list.

Caller updates: `MealPlanClient` already has `bucketItems` state. Compute `bucketRecipes` from `bucketItems` + `recipesById` and pass:

```typescript
const bucketRecipes = bucketItems
  .map((it) => recipesById.get(it.recipeId))
  .filter((r): r is Recipe => r !== undefined);
```

- [ ] **Step 2: Type-check + tests**

```bash
npx tsc --noEmit
npm test 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/components/meal-plan/RecipePickerModal.tsx \
        Source_Code/src/components/meal-plan/MealPlanClient.tsx
git commit -m "feat: RecipePickerModal Bucket | All tabs with Bucket default"
```

---

### Task 15: `EmptyBucketBanner` + integration

**Files:**
- Create: `Source_Code/src/components/bucket/EmptyBucketBanner.tsx`
- Modify: `Source_Code/src/components/shopping-list/ShoppingListClient.tsx`
- Modify: `Source_Code/src/app/meal-plan/shopping/page.tsx` (pass bucket count)

- [ ] **Step 1: Create the banner**

Create `Source_Code/src/components/bucket/EmptyBucketBanner.tsx`:

```typescript
"use client";

import { useEffect, useState, useTransition } from "react";

interface EmptyBucketBannerProps {
  readonly weekStart: string;
  readonly initialCount: number;
}

function dismissKey(weekStart: string): string {
  return `bucket-banner-dismissed-${weekStart}`;
}

export function EmptyBucketBanner({
  weekStart,
  initialCount,
}: EmptyBucketBannerProps) {
  const [count, setCount] = useState(initialCount);
  const [dismissed, setDismissed] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    try {
      const flag = sessionStorage.getItem(dismissKey(weekStart));
      if (flag === "1") setDismissed(true);
    } catch {
      // ignore
    }
  }, [weekStart]);

  function dismiss(): void {
    setDismissed(true);
    try {
      sessionStorage.setItem(dismissKey(weekStart), "1");
    } catch {
      // ignore
    }
  }

  function handleClear(): void {
    startTransition(async () => {
      const res = await fetch("/api/bucket", { method: "DELETE" });
      if (res.ok) setCount(0);
      dismiss();
    });
  }

  if (dismissed || count === 0) return null;

  return (
    <div className="mb-6 flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-900/40 dark:bg-orange-950/30">
      <p className="text-sm text-zinc-800 dark:text-zinc-200">
        Done planning? You have <strong>{count}</strong> recipe{count === 1 ? "" : "s"} in your bucket.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleClear}
          disabled={isPending}
          className="rounded-md bg-orange-600 px-3 py-1 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
        >
          Yes, empty it
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm font-medium text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          Keep them
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update the shopping list page to fetch bucket count**

Modify `Source_Code/src/app/meal-plan/shopping/page.tsx`. Add:

```typescript
import { listBucket } from "@/lib/bucket";
```

Inside the page, add `bucketCount`:

```typescript
const bucket = await listBucket(user.id);
const bucketCount = bucket.length;
```

Pass it through to the client (modify `ShoppingListClient`'s props or render the banner directly above it).

- [ ] **Step 3: Render the banner**

Update `Source_Code/src/components/shopping-list/ShoppingListClient.tsx` to accept `weekStart` (likely already a prop) and render `<EmptyBucketBanner weekStart={weekStart} initialCount={bucketCount} />` at the top.

Actually simpler: render the banner directly in the server page above the `<ShoppingListClient />`:

```tsx
<EmptyBucketBanner weekStart={weekStart} initialCount={bucketCount} />
<ShoppingListClient weekStart={weekStart} aisles={ordered} />
```

- [ ] **Step 4: Type-check + tests**

```bash
npx tsc --noEmit
npm test 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add Source_Code/src/components/bucket/EmptyBucketBanner.tsx \
        Source_Code/src/app/meal-plan/shopping/page.tsx
git commit -m "feat: EmptyBucketBanner on shopping-list page"
```

---

## Phase 5: Verify + docs

### Task 16: Coverage gate

- [ ] **Step 1: Full suite**

```bash
npm test
```

Expected: every existing test plus the new bucket lib (13) + bucket route (10) = 23 new tests. Total ~195.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Coverage**

```bash
npm run test:cov
```

Expected: ≥80% across all four metrics. New `lib/bucket.ts` and routes should clear it. If branch coverage drops, add 2-3 targeted tests for defensive paths in `lib/bucket.ts` (mirroring the Phase 4 pattern).

- [ ] **Step 4: Commit (only if tests added or vitest.config.ts changed)**

If you added tests: `git add ... && git commit -m "test: cover defensive guards in lib/bucket"`.
If no changes needed: skip.

---

### Task 17: Update INSTALL.md + README

**Files:**
- Modify: ` Deployment_Setup/INSTALL.md`
- Modify: `README.md`

- [ ] **Step 1: INSTALL.md — add migration callout**

Find the "Database setup (Supabase)" section. Add a new bullet under the "Already on…?" callouts:

```markdown
- **Already on the Meal Planner phase?** Run
  `Source_Code/supabase/migrations/2026-04-28-bucket.sql` in the SQL Editor
  to add the `bucket_items` table. No data is destroyed.
```

- [ ] **Step 2: README — mention the bucket**

Update the feature list paragraph to mention the bucket:

Find:

```markdown
... They can plan a week of meals (morning / noon / evening per day) and
auto-generate a categorized shopping list with check-off boxes.
```

Replace with:

```markdown
... They can save recipes into a "bucket" (drag-and-drop on desktop,
tap on mobile), then plan a week of meals (morning / noon / evening per
day) by dragging from the bucket onto day slots, and auto-generate a
categorized shopping list with check-off boxes.
```

- [ ] **Step 3: Commit**

```bash
git add " Deployment_Setup/INSTALL.md" README.md
git commit -m "docs: cover bucket migration + feature list"
```

---

## Phase 6: Push + smoke

### Task 18: Push branch + FF-merge to main

- [ ] **Step 1: Verify clean tree**

```bash
git status --short
```

Expected: empty.

- [ ] **Step 2: Push**

```bash
git push -u upstream feat/bucket-layer
```

- [ ] **Step 3: FF-merge to main from the main checkout**

```bash
cd /Users/teddy/code/class-project
git fetch upstream feat/bucket-layer main
git merge --ff-only upstream/feat/bucket-layer
git push upstream main
```

If FF fails due to main moving: rebase the feature branch onto `upstream/main`, force-with-lease push, retry.

---

### Task 19: Apply migration to live Supabase + smoke

- [ ] **Step 1: Apply the migration**

From the main checkout's `Source_Code/`:

```bash
DATABASE_URL=$(grep ^DATABASE_URL= .env.local | cut -d= -f2-) node -e "
const fs = require('node:fs');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const sql = fs.readFileSync('supabase/migrations/2026-04-28-bucket.sql', 'utf8');
(async () => {
  try {
    await pool.query(sql);
    const r = await pool.query(\"select count(*) from bucket_items\");
    console.log('bucket_items rows:', r.rows[0].count);
  } finally {
    await pool.end();
  }
})();
" 2>&1 | tail -3
```

Expected: `bucket_items rows: 0`.

- [ ] **Step 2: Wait for Vercel auto-deploy**

```bash
sleep 90
curl -sS -o /dev/null -w "%{http_code}\n" https://se-project-jade-eight.vercel.app/api/auth/me
```

Expected: `401` (no cookie). Confirms new build is up.

- [ ] **Step 3: Programmatic smoke (curl)**

```bash
DEPLOY_URL=https://se-project-jade-eight.vercel.app
JAR=/tmp/bucket-jar.txt && rm -f $JAR

echo "1. login"
curl -sS -c $JAR -H 'Content-Type: application/json' \
  -d '{"email":"test@test.com","password":"test"}' \
  $DEPLOY_URL/api/auth/login -o /dev/null

echo "2. GET /api/bucket — empty"
curl -sS -b $JAR $DEPLOY_URL/api/bucket | head -c 100; echo

echo "3. create a recipe"
RECIPE_ID=$(curl -sS -b $JAR -H 'Content-Type: application/json' -X POST \
  -d '{"title":"Bucket smoke","description":"x","category":"Dinner","prepTime":1,"cookTime":1,"servings":2,"ingredients":[{"amount":"1","unit":"u","item":"x"}],"instructions":["x"],"tags":[]}' \
  $DEPLOY_URL/api/recipes | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).recipe.id))")
echo "Recipe id: $RECIPE_ID"

echo "4. POST /api/bucket — add"
curl -sS -b $JAR -H 'Content-Type: application/json' -X POST \
  -d "{\"recipeId\":\"$RECIPE_ID\"}" \
  -w "\nHTTP %{http_code}\n" \
  $DEPLOY_URL/api/bucket | tail -3

echo "5. GET /api/bucket — should have 1"
curl -sS -b $JAR $DEPLOY_URL/api/bucket | head -c 200; echo

echo "6. POST same recipe again — should be 409"
curl -sS -b $JAR -H 'Content-Type: application/json' -X POST \
  -d "{\"recipeId\":\"$RECIPE_ID\"}" \
  -w "HTTP %{http_code}\n" \
  $DEPLOY_URL/api/bucket -o /dev/null

echo "7. DELETE /api/bucket/<id> — remove"
curl -sS -b $JAR -X DELETE -w "HTTP %{http_code}\n" $DEPLOY_URL/api/bucket/$RECIPE_ID

echo "8. cleanup the recipe"
curl -sS -b $JAR -X DELETE -w "HTTP %{http_code}\n" $DEPLOY_URL/api/recipes/$RECIPE_ID
```

Expected: 200, 200, 201, 200, 409, 204, 204.

- [ ] **Step 4: Manual UI smoke (browser)**

Visit `https://se-project-jade-eight.vercel.app/dashboard` (desktop). Log in. Drag a recipe card → FAB → drop. Verify count badge updates. Click FAB → drawer opens. Navigate to `/meal-plan` → drag from drawer to a slot → verify slot fills + bucket count unchanged. Click "Generate shopping list" → verify the banner appears. Click "Yes, empty it" → bucket clears.

Mobile: visit on phone or set browser viewport to mobile width. Header bucket icon visible. Tap → `/bucket` page. Toggle modes. Add a recipe via Browse & Add. Switch to Manage → see the item. Remove it.

- [ ] **Step 5: Optional — chrome-devtools puppeteer smoke**

Mirror the Phase 4 pattern (`_smoke-bucket.mjs` in `.claude/skills/chrome-devtools/scripts/`) for an automated capture. Save screenshots to `docs/screenshots/bucket-*.png`.

---

## What's NOT in this plan (deferred)

- **Phase B** — Ingredient catalog + autocomplete + AI generator schema constraints. Separate spec + plan.
- **Bucket reordering** in Manage mode (drag-to-reorder). YAGNI; chronological is fine.
- **Bucket sharing across users / public buckets.** Out of scope.
- **Persistent drawer-open state across page navigations.** Drawer always opens closed.
- **Optimistic UI for add/remove** — currently waits for server roundtrip; could revisit if perceived latency is bad on Vercel cold starts.

---

## Self-review

**Spec coverage** (against `docs/superpowers/specs/2026-04-28-bucket-layer-design.md`):

| Spec section | Implementing tasks |
|---|---|
| §1 In-scope: bucket_items table | T2 |
| §1 Desktop FAB + drawer | T10 (FAB), T11 (Drawer), T12 + T13 (DndContext wiring) |
| §1 Mobile header icon → /bucket | T9 (Header), T7 + T8 (page) |
| §1 /bucket Manage / Browse-and-Add toggle | T8 |
| §1 RecipePickerModal Bucket / All tabs | T14 |
| §1 Empty-bucket banner | T15 |
| §1 Bucket → slot keeps item | T13 (handleDragEnd doesn't remove) |
| §2 User flow steps | T8, T10–T15 |
| §3 Schema | T2 |
| §3 Lib + tests | T4 |
| §3 API routes | T5, T6 |
| §3 Server page + components | T7, T8, T9, T10, T11, T15 |
| §3 Modified files | T1 (package.json), T3 (setup.ts), T9 (Header), T12 (RecipeCard, DashboardClient), T13 (MealPlanClient, EmptySlot), T14 (RecipePickerModal), T15 (ShoppingListClient + page) |
| §3 DnD wiring | T12 (dashboard side), T13 (meal-plan side) |
| §4 Decisions | All baked into the relevant tasks (UNIQUE in T2, dnd-kit in T1, tabs default in T14, etc.) |
| §5 Test strategy | T4 (lib), T5 + T6 (routes), T16 (coverage gate) |
| §6 Prerequisites | T1 (npm install) |
| §7 Risks | UNIQUE handled in T4, mobile cards undraggable via T9 (md:hidden), bucket count fetch on mount in T12/T13 |

**Placeholder scan:** No "TBD", "TODO", "implement later", "fill in details" markers. Code shown for every step that touches code.

**Type / name consistency:**
- `BucketItem` (type) defined in T4, used in T7, T8, T11, T12, T13.
- `listBucket / addToBucket / removeFromBucket / clearBucket` defined in T4, used by T5/T6/T7/T15.
- Drag IDs consistent: `recipe:<uuid>` (T12), `bucket-item:<recipeId>` (T11/T13), `slot:<date>:<type>` (T13), `bucket` (T10).
- `EmptySlot` props gain `date` in T13 — caller `DayColumn` is updated in the same task.

**Open assumptions to verify during execution:**
- The exact existing shape of `RecipeCard.tsx` and `DashboardClient.tsx` — read first, adapt the wrapping minimally to avoid breaking the existing layout.
- `next/link` in the `RecipeCard` may need to be moved inside the draggable div to avoid intercepting drag events. Verify with manual smoke after T12.
- The `RecipePickerModal` already exists from A1; the Bucket | All tabs are an additive change, not a rewrite.
