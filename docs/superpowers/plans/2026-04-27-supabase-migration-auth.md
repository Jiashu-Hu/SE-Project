# Supabase Migration — Phase 2: Auth Subsystem

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-memory `globalThis.authStore` and `globalThis.passwordResetStore` with Postgres-backed `users`, `sessions`, and `password_reset_tokens` tables, and tighten `recipes.author_id` from `text` to `uuid references users(id) on delete cascade`. After this lands, the app holds zero user/session state in process memory — Vercel deploy (Phase 3) becomes trivial.

**Architecture:** Three new tables with FK relationships (`sessions.user_id → users.id`, `password_reset_tokens.user_id → users.id`, `recipes.author_id → users.id`). `lib/auth.ts` becomes async, all callers gain `await`. Sessions and reset-token expiry are enforced at query time (`where expires_at > now()`) instead of via the existing `cleanupExpired*` walk-the-Map helpers. PBKDF2-SHA512 hashing logic stays exactly as it is — only the storage swaps.

**Tech Stack:** Same as Phase 1 — `pg` 8 + PGlite for tests + plain SQL. Adds `scripts/seed-dev-user.mjs` (a Node script) so the dev environment gets the canonical `test@test.com` / `test` user without baking a static PBKDF2 hash into raw SQL.

**Working directory note:** All paths are relative to the repo root. The Next.js app lives in `Source_Code/`. Run npm commands from `Source_Code/`. Run git commands from the repo root.

**Branch strategy:** Create a NEW worktree from updated `main` after Phase 1 merges. Suggested path: `../class-project-auth/`. Branch: `feat/supabase-migration-auth`. Do NOT execute this plan in the Phase 1 worktree.

---

## Decisions baked into this plan

1. **Three new tables, all FK-cascade-on-delete.** Deleting a `users` row deletes their sessions, reset tokens, and recipes. Matches "I quit, scrub everything" semantics.
2. **`users.email` is `text not null unique`** (not citext). The lib already normalizes via `email.trim().toLowerCase()` before any insert/lookup; collation isn't carrying any weight.
3. **JS-side UUID generation for sessions and reset tokens** (not DB defaults). Matches Phase 1's recipes pattern; keeps the lib's existing `randomUUID()` calls. The `default gen_random_uuid()` clauses on `id` columns exist as a fallback only.
4. **No `cleanupExpired*` periodic functions.** Filtering `where expires_at > now()` in queries replaces the walk-the-Map logic. Stale rows accumulate but don't affect correctness; if disk pressure becomes a concern in Phase 3, add a cron in Supabase.
5. **`isUuid` guards in lib/auth.ts** for every function that accepts a token from a cookie/URL — same defensive pattern as Phase 1's lib/recipes.ts. Prevents 500 from the Postgres uuid parser when a malformed token sneaks in.
6. **Destructive migration on `recipes`.** Phase 1 leaves `recipes.author_id text` and may have a few demo rows. The Phase 2 migration `truncate`s recipes before altering the column to `uuid` + FK. This is dev data only; tests and the production smoke don't depend on it.
7. **Mock seed user moves out of `lib/auth.ts`** into a one-shot Node script (`scripts/seed-dev-user.mjs`) executed via `npm run db:seed`. The lib no longer auto-seeds — too magical, and it can't run before `users` exists in the test DB. Tests that previously relied on the seeded user register their own users.
8. **Drop the "authenticates the seeded test user" test** — same rationale as Phase 1 dropping "seeds mock recipes": over-specifies an internal-detail behavior of the previous in-memory implementation.
9. **No migrations framework.** Same as Phase 1: one `schema.sql` for fresh installs, plus one ad-hoc `migrations/` SQL file for upgrading an existing Phase 1 database. When schema #3 arrives, introduce a real framework.
10. **Tests truncate all four tables in `afterEach`.** `cascade` handles the FK chain. No per-table seeding.

---

## File structure

### Created
- `Source_Code/supabase/migrations/2026-04-27-phase-2-auth.sql` — incremental SQL to upgrade an existing Phase 1 Supabase project to Phase 2.
- `Source_Code/scripts/seed-dev-user.mjs` — Node script that inserts the `test@test.com` mock user with a freshly-hashed password. Idempotent (no-op if the row exists).

### Modified
- `Source_Code/supabase/schema.sql` — full target schema (users + sessions + password_reset_tokens + recipes with uuid FK).
- `Source_Code/src/test/setup.ts` — truncate now includes the four tables; remove the `delete g.authStore`/`delete g.passwordResetStore` lines.
- `Source_Code/src/lib/auth.ts` — full rewrite as async + SQL-backed.
- `Source_Code/src/lib/auth-server.ts` — `await getUserBySessionToken(token)`.
- `Source_Code/src/app/api/auth/login/route.ts` — `await authenticateUser(...)`, `await createSession(...)`.
- `Source_Code/src/app/api/auth/register/route.ts` — `await registerUser(...)`, `await createSession(...)`.
- `Source_Code/src/app/api/auth/logout/route.ts` — `await deleteSession(...)`.
- `Source_Code/src/app/api/auth/profile/route.ts` — `await updateUserProfile(...)`.
- `Source_Code/src/app/api/auth/profile/password/route.ts` — `await changeUserPassword(...)`.
- `Source_Code/src/app/api/auth/forgot-password/route.ts` — `await createPasswordResetToken(...)`.
- `Source_Code/src/app/api/auth/reset-password/route.ts` — `await resetPasswordWithToken(...)`.
- `Source_Code/src/lib/__tests__/auth.test.ts` — every test gains `await`; the seeded-test-user case is removed.
- `Source_Code/src/app/api/auth/__tests__/login.test.ts` — setup `await registerUser` (or just rely on the API).
- `Source_Code/src/app/api/auth/__tests__/me.test.ts` — `await registerUser`, `await createSession`.
- `Source_Code/src/app/api/auth/__tests__/profile.test.ts` — same.
- `Source_Code/src/app/api/auth/__tests__/profile-password.test.ts` — same.
- `Source_Code/src/app/api/auth/__tests__/forgot-password.test.ts` — `await registerUser`.
- `Source_Code/src/app/api/auth/__tests__/reset-password.test.ts` — `await registerUser`, `await createPasswordResetToken`.
- `Source_Code/package.json` — adds `"db:seed": "node scripts/seed-dev-user.mjs"`.
- ` Deployment_Setup/INSTALL.md` — adds the migration step + `npm run db:seed` instructions.
- `README.md` — drops the "auth still in-memory" caveat.

### Untouched
- `Source_Code/src/lib/db.ts` — already exists, no change.
- `Source_Code/src/lib/recipes.ts` — already async + DB-backed.
- `Source_Code/src/lib/auth-validation.ts` — pure functions.
- `Source_Code/src/types/auth.ts` — public types unchanged.
- All recipe tests — auth migration doesn't touch recipe code paths.

---

## Phase 1: Schema + infra

### Task 1: Update `schema.sql` to the full Phase-2 shape

**Files:**
- Modify: `Source_Code/supabase/schema.sql`

- [ ] **Step 1: Replace the file contents**

Overwrite `Source_Code/supabase/schema.sql`:

```sql
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
```

- [ ] **Step 2: Verify it parses**

```bash
node -e "(async () => { const fs = require('node:fs'); const { PGlite } = await import('@electric-sql/pglite'); const sql = fs.readFileSync('Source_Code/supabase/schema.sql','utf8'); const p = new PGlite(); await p.exec(sql); const r = await p.query(\"select table_name from information_schema.tables where table_schema='public' order by table_name\"); console.log(r.rows); await p.close(); })()"
```

Expected: prints four tables — `password_reset_tokens`, `recipes`, `sessions`, `users`.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/supabase/schema.sql
git commit -m "feat: extend schema with users/sessions/password_reset_tokens

Adds the three auth tables and tightens recipes.author_id to a uuid
FK referencing users.id with on-delete cascade. This is the target
shape for fresh installs; existing Phase 1 Supabase projects upgrade
via migrations/2026-04-27-phase-2-auth.sql (next task)."
```

---

### Task 2: Author the incremental migration file

**Files:**
- Create: `Source_Code/supabase/migrations/2026-04-27-phase-2-auth.sql`

- [ ] **Step 1: Create the migrations directory and file**

```bash
mkdir -p Source_Code/supabase/migrations
```

Create `Source_Code/supabase/migrations/2026-04-27-phase-2-auth.sql`:

```sql
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
```

- [ ] **Step 2: Verify the migration runs against a fresh Phase 1 schema**

```bash
node -e "(async () => {
  const fs = require('node:fs');
  const { PGlite } = await import('@electric-sql/pglite');
  const p = new PGlite();
  // Apply Phase 1 schema (recipes only, author_id text)
  await p.exec(\`
    create table recipes (
      id uuid primary key default gen_random_uuid(),
      author_id text not null,
      title text not null,
      description text not null default '',
      category text not null,
      prep_time integer not null,
      cook_time integer not null,
      servings integer not null,
      image_url text,
      ingredients jsonb not null default '[]'::jsonb,
      instructions jsonb not null default '[]'::jsonb,
      tags jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now()
    );
  \`);
  // Insert a demo row so we know truncate + alter works
  await p.exec(\"insert into recipes (author_id, title, category, prep_time, cook_time, servings) values ('seed-test-user', 't', 'Breakfast', 1, 1, 1)\");
  // Apply the migration
  const sql = fs.readFileSync('Source_Code/supabase/migrations/2026-04-27-phase-2-auth.sql','utf8');
  await p.exec(sql);
  // Verify shape
  const cols = await p.query(\"select column_name, data_type from information_schema.columns where table_name='recipes' and column_name='author_id'\");
  console.log('recipes.author_id:', cols.rows);
  const tables = await p.query(\"select table_name from information_schema.tables where table_schema='public' order by table_name\");
  console.log('tables:', tables.rows.map(r => r.table_name));
  await p.close();
})()"
```

Expected output:
```
recipes.author_id: [ { column_name: 'author_id', data_type: 'uuid' } ]
tables: [ 'password_reset_tokens', 'recipes', 'sessions', 'users' ]
```

- [ ] **Step 3: Commit**

```bash
git add Source_Code/supabase/migrations/2026-04-27-phase-2-auth.sql
git commit -m "feat: incremental migration from Phase 1 to Phase 2

One-shot SQL to upgrade an existing Phase 1 Supabase project. Adds
the three auth tables, then truncates recipes and tightens
author_id to uuid + FK. Truncate is acceptable because Phase 1 was
dev/demo data only and the seed-test-user author_id wouldn't cast
to uuid anyway."
```

---

### Task 3: Update `src/test/setup.ts` for the new tables

**Files:**
- Modify: `Source_Code/src/test/setup.ts`

- [ ] **Step 1: Read the current file**

The file currently:
- bootstraps PGlite + applies `supabase/schema.sql` in `beforeAll`
- truncates `recipes` and deletes `globalThis.authStore` / `globalThis.passwordResetStore` in `afterEach`

After this task, the in-memory store deletes go away (auth lives in PG too) and the truncate covers all four tables.

- [ ] **Step 2: Replace the `afterEach` block**

In `Source_Code/src/test/setup.ts`, find:

```typescript
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
```

Replace with:

```typescript
afterEach(async () => {
  // Reset all four tables; schema persists across tests. CASCADE handles
  // FK chains (sessions/reset_tokens/recipes all reference users).
  if (pglite) {
    await pglite.exec(
      "truncate table users, sessions, password_reset_tokens, recipes restart identity cascade;"
    );
  }
});
```

- [ ] **Step 3: Run the existing test suite**

From `Source_Code/`:

```bash
npm test 2>&1 | tail -10
```

Expected: many auth tests now FAIL (expected — `lib/auth.ts` is still using the in-memory store, but `globalThis.authStore` no longer gets reset between tests AND the user-related queries it issues will silently work since they hit the now-empty in-memory store). Recipe tests should still pass (they never depended on `globalThis.authStore`).

This intermediate state is fine — Tasks 4–5 fix it.

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/test/setup.ts
git commit -m "test: truncate all four tables between tests

Replaces the deletes of globalThis.authStore and passwordResetStore
with a single CASCADE truncate of users + sessions +
password_reset_tokens + recipes. The in-memory stores are about to
go away (next task)."
```

---

### Task 4: Author `scripts/seed-dev-user.mjs` and add `npm run db:seed`

**Files:**
- Create: `Source_Code/scripts/seed-dev-user.mjs`
- Modify: `Source_Code/package.json`

- [ ] **Step 1: Create the scripts directory + file**

```bash
mkdir -p Source_Code/scripts
```

Create `Source_Code/scripts/seed-dev-user.mjs`:

```javascript
// Idempotent dev seed: inserts the canonical test user (test@test.com / test).
// No-op if the email already exists. Run via: `npm run db:seed`.
//
// Reads DATABASE_URL from .env.local (Next.js loads it at runtime, but this
// script doesn't go through Next.js — it loads .env.local manually).
import fs from "node:fs";
import path from "node:path";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { Pool } from "pg";

function loadEnvLocal() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2];
    }
  }
}

const HASH_ITERATIONS = 120_000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

const SEED_EMAIL = "test@test.com";
const SEED_NAME = "Test User";
const SEED_PASSWORD = "test";

async function main() {
  loadEnvLocal();

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set. Add it to Source_Code/.env.local.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const existing = await pool.query(
      "select id from users where email = $1",
      [SEED_EMAIL]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      console.log(`Seed user ${SEED_EMAIL} already exists. Nothing to do.`);
      return;
    }

    const salt = randomBytes(16).toString("hex");
    const hash = pbkdf2Sync(
      SEED_PASSWORD,
      salt,
      HASH_ITERATIONS,
      KEY_LENGTH,
      DIGEST
    ).toString("hex");

    await pool.query(
      `insert into users (email, name, password_salt, password_hash)
       values ($1, $2, $3, $4)`,
      [SEED_EMAIL, SEED_NAME, salt, hash]
    );

    console.log(`Seeded ${SEED_EMAIL} (password: "${SEED_PASSWORD}").`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

Open `Source_Code/package.json`. The `"scripts"` block currently has:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:cov": "vitest run --coverage"
}
```

Replace with:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:cov": "vitest run --coverage",
  "db:seed": "node scripts/seed-dev-user.mjs"
}
```

- [ ] **Step 3: Verify the script's dry-run path (it should fail loudly with no DATABASE_URL)**

Make sure `DATABASE_URL` is not set in your shell, then from `Source_Code/`:

```bash
DATABASE_URL="" node scripts/seed-dev-user.mjs 2>&1 | head -3
```

If `.env.local` has `DATABASE_URL`, the script will pick it up and try to connect (and probably succeed). That's fine — just confirm the script ran end-to-end.

If `.env.local` does NOT have `DATABASE_URL`, expected output: `DATABASE_URL not set. Add it to Source_Code/.env.local.` with exit code 1.

- [ ] **Step 4: Commit**

```bash
git add Source_Code/scripts/seed-dev-user.mjs Source_Code/package.json
git commit -m "feat: add db:seed script for the canonical dev user

Inserts test@test.com / test into the users table with a freshly
hashed password. Idempotent (no-op if the row exists). Replaces the
in-memory auto-seed in lib/auth.ts that this PR removes."
```

---

## Phase 2: Migrate `lib/auth.ts`

### Task 5: Rewrite `lib/__tests__/auth.test.ts` as async (RED)

**Files:**
- Modify (full rewrite): `Source_Code/src/lib/__tests__/auth.test.ts`

- [ ] **Step 1: Replace the file**

Overwrite `Source_Code/src/lib/__tests__/auth.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  registerUser,
  authenticateUser,
  createSession,
  getSession,
  getUserBySessionToken,
  deleteSession,
  updateUserProfile,
  changeUserPassword,
  createPasswordResetToken,
  resetPasswordWithToken,
} from "@/lib/auth";

describe("registerUser", () => {
  it("creates a new user", async () => {
    const result = await registerUser({
      name: "Alice",
      email: "alice@example.com",
      password: "Strong1Pass",
    });
    expect("user" in result).toBe(true);
    if ("user" in result) {
      expect(result.user.email).toBe("alice@example.com");
      expect(result.user.name).toBe("Alice");
      expect(result.user.id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("rejects duplicate emails (case insensitive)", async () => {
    await registerUser({ name: "Alice", email: "alice@example.com", password: "Strong1Pass" });
    const dup = await registerUser({
      name: "Alice 2",
      email: "ALICE@example.com",
      password: "Strong1Pass",
    });
    expect("error" in dup).toBe(true);
  });
});

describe("authenticateUser", () => {
  it("returns the user for correct credentials", async () => {
    await registerUser({ name: "Bob", email: "bob@example.com", password: "Strong1Pass" });
    const u = await authenticateUser("bob@example.com", "Strong1Pass");
    expect(u?.email).toBe("bob@example.com");
  });

  it("returns null for wrong password", async () => {
    await registerUser({ name: "Bob", email: "bob@example.com", password: "Strong1Pass" });
    expect(await authenticateUser("bob@example.com", "wrong")).toBeNull();
  });

  it("returns null for unknown email", async () => {
    expect(await authenticateUser("ghost@example.com", "whatever")).toBeNull();
  });
});

describe("session lifecycle", () => {
  it("creates, retrieves, and deletes a session", async () => {
    const reg = await registerUser({ name: "Carol", email: "c@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const session = await createSession(reg.user.id);
    expect(session.userId).toBe(reg.user.id);
    expect(await getSession(session.token)).toEqual(session);
    expect((await getUserBySessionToken(session.token))?.id).toBe(reg.user.id);

    await deleteSession(session.token);
    expect(await getSession(session.token)).toBeNull();
  });

  it("session expiresAt is approximately 24h from now", async () => {
    const reg = await registerUser({ name: "D", email: "d@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");
    const session = await createSession(reg.user.id);

    const expectedMs = Date.now() + 1000 * 60 * 60 * 24;
    const actualMs = new Date(session.expiresAt).getTime();
    expect(Math.abs(actualMs - expectedMs)).toBeLessThan(5_000);
  });

  it("getSession returns null for expired sessions", async () => {
    const reg = await registerUser({ name: "E", email: "e@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");
    const session = await createSession(reg.user.id);
    // Force-expire by updating the row directly. Imported here to keep the
    // test independent of any hypothetical "advance clock" lib helper.
    const { getDb } = await import("@/lib/db");
    await getDb().query(
      "update sessions set expires_at = now() - interval '1 minute' where token = $1",
      [session.token]
    );
    expect(await getSession(session.token)).toBeNull();
  });

  it("getSession returns null for malformed tokens", async () => {
    expect(await getSession("not-a-uuid")).toBeNull();
  });
});

describe("updateUserProfile", () => {
  it("updates name and email", async () => {
    const reg = await registerUser({ name: "F", email: "f@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const result = await updateUserProfile({
      userId: reg.user.id,
      name: "Eve",
      email: "eve@x.com",
    });
    expect("user" in result).toBe(true);
    if ("user" in result) {
      expect(result.user.name).toBe("Eve");
      expect(result.user.email).toBe("eve@x.com");
    }
  });

  it("rejects email already in use by another user", async () => {
    await registerUser({ name: "G1", email: "g1@x.com", password: "Strong1Pass" });
    const reg2 = await registerUser({ name: "G2", email: "g2@x.com", password: "Strong1Pass" });
    if (!("user" in reg2)) throw new Error("setup failed");

    const result = await updateUserProfile({
      userId: reg2.user.id,
      name: "G2",
      email: "g1@x.com",
    });
    expect("error" in result).toBe(true);
  });

  it("returns error for unknown userId (malformed UUID)", async () => {
    const result = await updateUserProfile({
      userId: "not-a-uuid",
      name: "X",
      email: "x@x.com",
    });
    expect("error" in result).toBe(true);
  });
});

describe("changeUserPassword", () => {
  it("rotates password when current password is correct", async () => {
    const reg = await registerUser({ name: "H", email: "h@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const result = await changeUserPassword({
      userId: reg.user.id,
      currentPassword: "Strong1Pass",
      newPassword: "Different1Pass",
    });
    expect("success" in result).toBe(true);
    expect(await authenticateUser("h@x.com", "Strong1Pass")).toBeNull();
    expect((await authenticateUser("h@x.com", "Different1Pass"))?.email).toBe("h@x.com");
  });

  it("rejects when current password is wrong", async () => {
    const reg = await registerUser({ name: "I", email: "i@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const result = await changeUserPassword({
      userId: reg.user.id,
      currentPassword: "WrongCurrent1",
      newPassword: "Different1Pass",
    });
    expect("error" in result).toBe(true);
  });

  it("rejects when new password equals current", async () => {
    const reg = await registerUser({ name: "J", email: "j@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const result = await changeUserPassword({
      userId: reg.user.id,
      currentPassword: "Strong1Pass",
      newPassword: "Strong1Pass",
    });
    expect("error" in result).toBe(true);
  });
});

describe("password reset flow", () => {
  it("issues a token for an existing email and resets the password", async () => {
    await registerUser({ name: "K", email: "k@x.com", password: "Strong1Pass" });

    const issued = await createPasswordResetToken("k@x.com");
    expect("token" in issued).toBe(true);
    if (!("token" in issued)) return;
    expect(issued.token).not.toBe("");

    const reset = await resetPasswordWithToken(issued.token, "Different1Pass");
    expect("success" in reset).toBe(true);
    expect((await authenticateUser("k@x.com", "Different1Pass"))?.email).toBe("k@x.com");
  });

  it("returns an empty token for an unknown email (no enumeration)", async () => {
    const issued = await createPasswordResetToken("ghost@example.com");
    expect("token" in issued).toBe(true);
    if ("token" in issued) {
      expect(issued.token).toBe("");
    }
  });

  it("rejects a malformed reset token", async () => {
    const reset = await resetPasswordWithToken("not-a-real-token", "Different1Pass");
    expect("error" in reset).toBe(true);
  });

  it("rejects an expired reset token", async () => {
    const reg = await registerUser({ name: "L", email: "l@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");
    const issued = await createPasswordResetToken("l@x.com");
    if (!("token" in issued) || issued.token === "") {
      throw new Error("setup failed");
    }
    const { getDb } = await import("@/lib/db");
    await getDb().query(
      "update password_reset_tokens set expires_at = now() - interval '1 minute' where token = $1",
      [issued.token]
    );
    const reset = await resetPasswordWithToken(issued.token, "Different1Pass");
    expect("error" in reset).toBe(true);
  });
});
```

- [ ] **Step 2: Run — verify RED**

```bash
npm test -- --run src/lib/__tests__/auth.test.ts 2>&1 | tail -20
```

Expected: all tests fail because `lib/auth.ts` is still synchronous against an in-memory store that no longer survives between tests (the setup.ts no longer resets it; truncate doesn't touch globalThis state). Don't worry about which specific tests fail — Task 6 replaces `lib/auth.ts` wholesale.

- [ ] **Step 3: Don't commit yet** — Task 6 ships the implementation in the same commit.

---

### Task 6: Rewrite `lib/auth.ts` as async + DB-backed (GREEN)

**Files:**
- Modify (full rewrite): `Source_Code/src/lib/auth.ts`

- [ ] **Step 1: Replace the file**

Overwrite `Source_Code/src/lib/auth.ts`:

```typescript
import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db";
import type { QueryRow } from "@/lib/db";
import type { AuthSession, AuthUser } from "@/types/auth";

interface RegisterInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

interface UpdateProfileInput {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
}

interface ChangePasswordInput {
  readonly userId: string;
  readonly currentPassword: string;
  readonly newPassword: string;
}

const HASH_ITERATIONS = 120_000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24;
const RESET_TOKEN_DURATION_MS = 1000 * 60 * 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, HASH_ITERATIONS, KEY_LENGTH, DIGEST).toString(
    "hex"
  );
}

function isPasswordMatch(
  password: string,
  salt: string,
  expectedHash: string
): boolean {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

interface UserRow extends QueryRow {
  id: string;
  email: string;
  name: string;
  password_salt: string;
  password_hash: string;
  created_at: string | Date;
}

interface SessionRow extends QueryRow {
  token: string;
  user_id: string;
  created_at: string | Date;
  expires_at: string | Date;
}

function rowToPublicUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : row.created_at.toISOString(),
  };
}

function rowToSession(row: SessionRow): AuthSession {
  return {
    token: row.token,
    userId: row.user_id,
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : row.created_at.toISOString(),
    expiresAt:
      typeof row.expires_at === "string"
        ? row.expires_at
        : row.expires_at.toISOString(),
  };
}

export async function registerUser(input: RegisterInput): Promise<
  { readonly user: AuthUser } | { readonly error: string }
> {
  const db = getDb();
  const email = normalizeEmail(input.email);
  const salt = randomBytes(16).toString("hex");
  const hash = hashPassword(input.password, salt);
  const name = input.name.trim();

  try {
    const result = await db.query<UserRow>(
      `insert into users (email, name, password_salt, password_hash)
       values ($1, $2, $3, $4)
       returning id, email, name, password_salt, password_hash, created_at`,
      [email, name, salt, hash]
    );
    return { user: rowToPublicUser(result.rows[0]) };
  } catch (err: unknown) {
    // unique violation on email
    if ((err as { code?: string }).code === "23505") {
      return { error: "An account with this email already exists." };
    }
    throw err;
  }
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<AuthUser | null> {
  const db = getDb();
  const result = await db.query<UserRow>(
    `select id, email, name, password_salt, password_hash, created_at
       from users where email = $1 limit 1`,
    [normalizeEmail(email)]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (!isPasswordMatch(password, row.password_salt, row.password_hash)) {
    return null;
  }
  return rowToPublicUser(row);
}

export async function createSession(userId: string): Promise<AuthSession> {
  const db = getDb();
  const token = randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DURATION_MS);
  const result = await db.query<SessionRow>(
    `insert into sessions (token, user_id, expires_at)
     values ($1, $2, $3)
     returning token, user_id, created_at, expires_at`,
    [token, userId, expires.toISOString()]
  );
  return rowToSession(result.rows[0]);
}

export async function getSession(token: string): Promise<AuthSession | null> {
  if (!isUuid(token)) return null;
  const db = getDb();
  const result = await db.query<SessionRow>(
    `select token, user_id, created_at, expires_at
       from sessions
      where token = $1 and expires_at > now()
      limit 1`,
    [token]
  );
  const row = result.rows[0];
  return row ? rowToSession(row) : null;
}

export async function getUserBySessionToken(
  token: string
): Promise<AuthUser | null> {
  if (!isUuid(token)) return null;
  const db = getDb();
  const result = await db.query<UserRow>(
    `select u.id, u.email, u.name, u.password_salt, u.password_hash, u.created_at
       from users u
       inner join sessions s on s.user_id = u.id
      where s.token = $1 and s.expires_at > now()
      limit 1`,
    [token]
  );
  const row = result.rows[0];
  return row ? rowToPublicUser(row) : null;
}

export async function deleteSession(token: string): Promise<void> {
  if (!isUuid(token)) return;
  const db = getDb();
  await db.query(`delete from sessions where token = $1`, [token]);
}

export async function updateUserProfile(input: UpdateProfileInput): Promise<
  { readonly user: AuthUser } | { readonly error: string }
> {
  if (!isUuid(input.userId)) return { error: "User not found." };
  const db = getDb();
  const newEmail = normalizeEmail(input.email);
  const newName = input.name.trim();

  try {
    const result = await db.query<UserRow>(
      `update users set name = $1, email = $2
        where id = $3
        returning id, email, name, password_salt, password_hash, created_at`,
      [newName, newEmail, input.userId]
    );
    if (result.rowCount === 0) return { error: "User not found." };
    return { user: rowToPublicUser(result.rows[0]) };
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505") {
      return { error: "An account with this email already exists." };
    }
    throw err;
  }
}

export async function changeUserPassword(
  input: ChangePasswordInput
): Promise<{ readonly success: true } | { readonly error: string }> {
  if (!isUuid(input.userId)) return { error: "User not found." };

  const db = getDb();
  const userResult = await db.query<UserRow>(
    `select id, email, name, password_salt, password_hash, created_at
       from users where id = $1 limit 1`,
    [input.userId]
  );
  const user = userResult.rows[0];
  if (!user) return { error: "User not found." };

  if (
    !isPasswordMatch(
      input.currentPassword,
      user.password_salt,
      user.password_hash
    )
  ) {
    return { error: "Current password is incorrect." };
  }

  if (input.currentPassword === input.newPassword) {
    return {
      error: "New password must be different from your current password.",
    };
  }

  const newSalt = randomBytes(16).toString("hex");
  const newHash = hashPassword(input.newPassword, newSalt);
  await db.query(
    `update users set password_salt = $1, password_hash = $2 where id = $3`,
    [newSalt, newHash, input.userId]
  );
  return { success: true };
}

export async function createPasswordResetToken(
  email: string
): Promise<{ readonly token: string } | { readonly error: string }> {
  const db = getDb();
  const userResult = await db.query<UserRow>(
    `select id from users where email = $1 limit 1`,
    [normalizeEmail(email)]
  );
  const user = userResult.rows[0];
  if (!user) {
    // Generic empty-token response to avoid leaking enumeration.
    return { token: "" };
  }

  const token = randomUUID();
  const expires = new Date(Date.now() + RESET_TOKEN_DURATION_MS);
  await db.query(
    `insert into password_reset_tokens (token, user_id, expires_at)
     values ($1, $2, $3)`,
    [token, user.id, expires.toISOString()]
  );
  return { token };
}

export async function resetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<{ readonly success: true } | { readonly error: string }> {
  if (!isUuid(token)) return { error: "Invalid or expired reset token." };

  const db = getDb();
  // Atomic: select + delete the token in one round trip via CTE.
  const tokenResult = await db.query<{ user_id: string } & QueryRow>(
    `with deleted as (
       delete from password_reset_tokens
        where token = $1 and expires_at > now()
        returning user_id
     )
     select user_id from deleted`,
    [token]
  );
  const tokenRow = tokenResult.rows[0];
  if (!tokenRow) return { error: "Invalid or expired reset token." };

  const newSalt = randomBytes(16).toString("hex");
  const newHash = hashPassword(newPassword, newSalt);
  await db.query(
    `update users set password_salt = $1, password_hash = $2 where id = $3`,
    [newSalt, newHash, tokenRow.user_id]
  );
  return { success: true };
}
```

Notes on the rewrite:
- The seed-on-first-access logic is gone. Use `npm run db:seed` (Task 4) for the dev mock user.
- All `cleanupExpired*` helpers are gone — `expires_at > now()` filtering replaces them.
- `resetPasswordWithToken` uses a CTE so the token consumption is atomic with the select.
- Every function that takes a token/userId from the outside world has an `isUuid` guard.
- The unique-violation handling (`code === "23505"`) replaces the in-memory "email already exists" Map check.

- [ ] **Step 2: Run — verify GREEN**

```bash
npm test -- --run src/lib/__tests__/auth.test.ts 2>&1 | tail -10
```

Expected: 17 tests PASS.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors in callers (auth-server.ts and the auth API routes) — they call sync versions. Tasks 7–11 fix them.

- [ ] **Step 4: Commit (test + impl together)**

```bash
git add Source_Code/src/lib/auth.ts Source_Code/src/lib/__tests__/auth.test.ts
git commit -m "feat: back auth subsystem with Postgres

Replaces the in-memory globalThis stores with parameterized SQL
queries through getDb(). All ten functions become async; signatures
otherwise unchanged.

- Sessions and reset tokens enforce expiry via 'expires_at > now()'
  filtering, replacing the cleanupExpired* walk-the-Map helpers.
- isUuid guards on every function that accepts a token/userId from
  outside (matches the lib/recipes.ts pattern).
- resetPasswordWithToken uses a CTE so token consumption is atomic.
- The seed-on-first-access mock user is gone; use npm run db:seed.

Callers (auth-server.ts, every auth API route) are still synchronous
and will fail to compile until updated in subsequent commits."
```

---

## Phase 3: Update auth callers

### Task 7: Update `auth-server.ts`

**Files:**
- Modify: `Source_Code/src/lib/auth-server.ts:14`

- [ ] **Step 1: Add the await**

Open `Source_Code/src/lib/auth-server.ts`. Find:

```typescript
  return getUserBySessionToken(token);
```

Replace with:

```typescript
  return await getUserBySessionToken(token);
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: this file is now clean. Other auth route handlers still error.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/lib/auth-server.ts
git commit -m "fix: await getUserBySessionToken in auth-server"
```

---

### Task 8: Update `POST /api/auth/login`

**Files:**
- Modify: `Source_Code/src/app/api/auth/login/route.ts`

- [ ] **Step 1: Add awaits**

In `Source_Code/src/app/api/auth/login/route.ts`, change line 38:

```typescript
  const user = authenticateUser(payload.email, payload.password);
```

to:

```typescript
  const user = await authenticateUser(payload.email, payload.password);
```

And line 46:

```typescript
  const session = createSession(user.id);
```

to:

```typescript
  const session = await createSession(user.id);
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/app/api/auth/login/route.ts
git commit -m "fix: await authenticateUser and createSession in login route"
```

---

### Task 9: Update `POST /api/auth/register`

**Files:**
- Modify: `Source_Code/src/app/api/auth/register/route.ts`

- [ ] **Step 1: Read the file**

Open the file and locate the `registerUser(...)` and `createSession(...)` calls. Both are currently synchronous.

- [ ] **Step 2: Add awaits**

Change every `registerUser(input)` call to `await registerUser(input)`. Change every `createSession(userId)` call to `await createSession(userId)`.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/app/api/auth/register/route.ts
git commit -m "fix: await registerUser and createSession in register route"
```

---

### Task 10: Update `POST /api/auth/logout`

**Files:**
- Modify: `Source_Code/src/app/api/auth/logout/route.ts`

- [ ] **Step 1: Add the await**

Find the `deleteSession(token)` call and prepend `await`:

```typescript
  await deleteSession(token);
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/app/api/auth/logout/route.ts
git commit -m "fix: await deleteSession in logout route"
```

---

### Task 11: Update profile + password routes

**Files:**
- Modify: `Source_Code/src/app/api/auth/profile/route.ts`
- Modify: `Source_Code/src/app/api/auth/profile/password/route.ts`

- [ ] **Step 1: Add awaits in `profile/route.ts`**

Change `updateUserProfile({ ... })` to `await updateUserProfile({ ... })`.

- [ ] **Step 2: Add awaits in `profile/password/route.ts`**

Change `changeUserPassword({ ... })` to `await changeUserPassword({ ... })`.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/app/api/auth/profile/route.ts \
        Source_Code/src/app/api/auth/profile/password/route.ts
git commit -m "fix: await profile + password lib calls in routes"
```

---

### Task 12: Update forgot-password + reset-password routes

**Files:**
- Modify: `Source_Code/src/app/api/auth/forgot-password/route.ts`
- Modify: `Source_Code/src/app/api/auth/reset-password/route.ts`

- [ ] **Step 1: Add awaits in `forgot-password/route.ts`**

Find `createPasswordResetToken(email)` and prepend `await`:

```typescript
  const result = await createPasswordResetToken(email);
```

- [ ] **Step 2: Add awaits in `reset-password/route.ts`**

Find `resetPasswordWithToken(token, newPassword)` and prepend `await`:

```typescript
  const result = await resetPasswordWithToken(token, newPassword);
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: completely clean now. Every async lib call is awaited.

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/app/api/auth/forgot-password/route.ts \
        Source_Code/src/app/api/auth/reset-password/route.ts
git commit -m "fix: await reset-token lib calls in forgot/reset routes"
```

---

## Phase 4: Update auth integration tests

### Task 13: Update `me.test.ts` setup

**Files:**
- Modify: `Source_Code/src/app/api/auth/__tests__/me.test.ts`

- [ ] **Step 1: Find the setup helpers**

The file currently calls `registerUser({...})` and `createSession(reg.user.id)` synchronously inside an `it()` callback. Both are now async.

- [ ] **Step 2: Add awaits**

For each setup line, prepend `await`. Specifically:
- `const reg = registerUser(...)` → `const reg = await registerUser(...)`
- `const session = createSession(reg.user.id)` → `const session = await createSession(reg.user.id)`

- [ ] **Step 3: Run**

```bash
npm test -- --run src/app/api/auth/__tests__/me.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/app/api/auth/__tests__/me.test.ts
git commit -m "test: await async lib setup in me.test.ts"
```

---

### Task 14: Update `login.test.ts`

**Files:**
- Modify: `Source_Code/src/app/api/auth/__tests__/login.test.ts`

- [ ] **Step 1: Add awaits**

Find every `registerUser(...)` call (these were used to seed a user before login). Prepend `await`.

- [ ] **Step 2: Run**

```bash
npm test -- --run src/app/api/auth/__tests__/login.test.ts
```

Expected: 4 tests PASS. (The login test file already used the API endpoint for the actual login, so most calls were already awaited.)

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/app/api/auth/__tests__/login.test.ts
git commit -m "test: await registerUser in login.test setup"
```

---

### Task 15: Update profile + password tests

**Files:**
- Modify: `Source_Code/src/app/api/auth/__tests__/profile.test.ts`
- Modify: `Source_Code/src/app/api/auth/__tests__/profile-password.test.ts`

- [ ] **Step 1: Add awaits in `profile.test.ts`**

The file has a `logIn(email)` helper that calls `registerUser({...})` and `createSession(...)`. Prepend `await` to each.

- [ ] **Step 2: Add awaits in `profile-password.test.ts`**

Same pattern — `registerUser` and `createSession` setup calls become `await`.

- [ ] **Step 3: Run**

```bash
npm test -- --run src/app/api/auth/__tests__/profile.test.ts src/app/api/auth/__tests__/profile-password.test.ts
```

Expected: 6 tests PASS (3 + 3).

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/app/api/auth/__tests__/profile.test.ts \
        Source_Code/src/app/api/auth/__tests__/profile-password.test.ts
git commit -m "test: await lib setup in profile + password tests"
```

---

### Task 16: Update forgot-password + reset-password tests

**Files:**
- Modify: `Source_Code/src/app/api/auth/__tests__/forgot-password.test.ts`
- Modify: `Source_Code/src/app/api/auth/__tests__/reset-password.test.ts`

- [ ] **Step 1: Add awaits in `forgot-password.test.ts`**

Find every `registerUser(...)` call and prepend `await`.

- [ ] **Step 2: Add awaits in `reset-password.test.ts`**

Same — `registerUser(...)` and `createPasswordResetToken(...)` setup calls become `await`.

- [ ] **Step 3: Run**

```bash
npm test -- --run src/app/api/auth/__tests__/forgot-password.test.ts src/app/api/auth/__tests__/reset-password.test.ts
```

Expected: 9 tests PASS (6 forgot-password + 3 reset-password).

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/app/api/auth/__tests__/forgot-password.test.ts \
        Source_Code/src/app/api/auth/__tests__/reset-password.test.ts
git commit -m "test: await lib setup in forgot/reset password tests"
```

---

## Phase 5: Verification + documentation

### Task 17: Full suite + coverage gate

**Files:**
- Possibly modify: `Source_Code/vitest.config.ts` (only if coverage drops below 80% and an exclude is genuinely warranted)

- [ ] **Step 1: Run all tests**

```bash
npm test 2>&1 | tail -10
```

Expected: every test passes. If anything fails, read the error and fix at the test level (don't change lib code unless the failure points to a real bug).

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Coverage**

```bash
npm run test:cov
```

Expected: ≥80% across all four metrics. Coverage of `lib/auth.ts` should be high — the test file covers register, login, sessions, profile, password, and reset flows. Coverage of `lib/db.ts` may be lower due to its production-pg branch — that's the same as Phase 1.

- [ ] **Step 4: Commit only if `vitest.config.ts` was edited**

```bash
git add Source_Code/vitest.config.ts
git commit -m "chore: tweak coverage scope after auth migration"
```

(Skip if no edit was needed.)

---

### Task 18: Update INSTALL.md

**Files:**
- Modify: ` Deployment_Setup/INSTALL.md`

- [ ] **Step 1: Update the database setup section**

Find the "Database setup (Supabase)" section. It currently lists 5 numbered steps (create project, run schema.sql, get connection string, copy .env.local.example, verify connection).

After step 4 (filling in `DATABASE_URL`), insert a new step:

```markdown
5. **Seed the dev user:**

   ```bash
   npm run db:seed
   ```

   Inserts `test@test.com` / `test` into the `users` table. Idempotent — re-running is a no-op.
```

Renumber the original step 5 ("Verify the connection") to step 6.

Also update the "Mock User Credentials" subsection — remove the "still in-memory" parenthetical:

```markdown
#### Mock User Credentials

- Email: `test@test.com`
- Password: `test`
- Created by `npm run db:seed`.
```

And update the "Database setup" section header note to mention the migration file:

```markdown
**Already on Phase 1?** Run `Source_Code/supabase/migrations/2026-04-27-phase-2-auth.sql`
in the SQL Editor instead of `schema.sql`. The migration adds the auth tables
without re-creating the `recipes` table (though it does truncate it — see the
file's header comment).
```

- [ ] **Step 2: Commit**

```bash
git add " Deployment_Setup/INSTALL.md"
git commit -m "docs: install guide covers Phase 2 auth migration

Adds the npm run db:seed step and the Phase 1 -> Phase 2 migration
file note. Drops the 'auth still in-memory' caveat from the mock
credentials section."
```

---

### Task 19: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the persistence note**

Find:

```markdown
Built with Next.js 16, React 19, TypeScript, and Tailwind CSS 4. Recipes are
persisted to Postgres (Supabase). Auth (users, sessions, reset tokens) is
still in-memory and migrates in a follow-up phase.
```

Replace with:

```markdown
Built with Next.js 16, React 19, TypeScript, and Tailwind CSS 4. Recipes,
users, sessions, and password reset tokens are all persisted to Postgres
(Supabase). The app holds no user state in process memory.
```

- [ ] **Step 2: Add the seed step under Quick start**

Find the existing "Quick start" code block:

```bash
cd Source_Code
npm install
npm run dev
```

Replace with:

```bash
cd Source_Code
npm install
# Configure Source_Code/.env.local with DATABASE_URL — see INSTALL.md
npm run db:seed
npm run dev
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README reflects Phase 2 (auth in Postgres)"
```

---

## Phase 6: Push + smoke

### Task 20: Push branch + open PR

- [ ] **Step 1: Verify clean working tree**

```bash
git status --short
```

Expected: empty.

- [ ] **Step 2: Push**

```bash
git push -u upstream feat/supabase-migration-auth
```

- [ ] **Step 3: Open the PR**

If `gh` CLI is available:

```bash
gh pr create --base main --head feat/supabase-migration-auth \
  --title "feat: migrate auth subsystem to Postgres (Supabase) — Phase 2" \
  --body-file PR_BODY_PHASE_2.md
```

Otherwise, write the PR body to `PR_BODY_PHASE_2.md` and paste it manually at:

```
https://github.com/Jiashu-Hu/SE-Project/pull/new/feat/supabase-migration-auth
```

PR body template (write to `PR_BODY_PHASE_2.md`):

```markdown
## Summary

- Migrates auth (users, sessions, password reset tokens) from `globalThis` Maps to Postgres tables.
- Tightens `recipes.author_id` from `text` to `uuid references users(id) on delete cascade`.
- After this lands, the app holds zero user state in process memory.

## Plan
[`docs/superpowers/plans/2026-04-27-supabase-migration-auth.md`](https://github.com/Jiashu-Hu/SE-Project/blob/main/docs/superpowers/plans/2026-04-27-supabase-migration-auth.md)

## Schema changes
- New tables: `users`, `sessions`, `password_reset_tokens` (FK cascade to `users`).
- `recipes.author_id`: `text` → `uuid references users(id) on delete cascade`.
- One-shot incremental migration: `Source_Code/supabase/migrations/2026-04-27-phase-2-auth.sql`. **Destructive** on existing recipes data (truncate before alter).

## New developer step
- `npm run db:seed` inserts the canonical `test@test.com` / `test` user. Idempotent.

## Test plan

- [x] `npm test` — full suite green
- [x] `npm run test:cov` — ≥80% all metrics
- [x] `npx tsc --noEmit` — clean
- [ ] Apply `migrations/2026-04-27-phase-2-auth.sql` to the Supabase project
- [ ] Run `npm run db:seed` against the Supabase project
- [ ] Manual smoke: register → login → create recipe → restart server → confirm everything persists

## Out of scope
- Phase 3: Vercel deployment (now unblocked).
- Cleanup cron for expired sessions / reset tokens — not needed for class scale.
```

---

### Task 21: Apply migration to real Supabase

This is the human-driven action. The migration file is at `Source_Code/supabase/migrations/2026-04-27-phase-2-auth.sql`.

- [ ] **Step 1: Apply via Supabase SQL Editor**

1. Supabase dashboard → SQL Editor → New query
2. Paste the contents of `Source_Code/supabase/migrations/2026-04-27-phase-2-auth.sql`
3. Run

Expected: "Success. No rows returned." Confirm via Table Editor that `users`, `sessions`, `password_reset_tokens`, and `recipes` are all present, and that `recipes.author_id` is `uuid` type.

- [ ] **Step 2: Run db:seed**

```bash
cd Source_Code && npm run db:seed
```

Expected: `Seeded test@test.com (password: "test").`

Re-run it to confirm idempotency:

```bash
npm run db:seed
```

Expected: `Seed user test@test.com already exists. Nothing to do.`

---

### Task 22: Smoke test against real Supabase

- [ ] **Step 1: Start the dev server**

```bash
cd Source_Code && npm run dev
```

Wait for "Ready in Xs". Note the port (usually 3000, may be 3001 if 3000 is occupied).

- [ ] **Step 2: Walk the flow programmatically**

Use a cookie jar with curl (replace `PORT` with the actual port):

```bash
JAR=/tmp/phase2-jar.txt && rm -f $JAR

# Register a brand-new user
curl -sS -c $JAR -H 'Content-Type: application/json' \
  -d '{"name":"Phase2 Smoke","email":"phase2@example.com","password":"Strong1Pass"}' \
  http://localhost:PORT/api/auth/register | head -c 200

# Sign that user in (overwrites cookie)
curl -sS -c $JAR -H 'Content-Type: application/json' \
  -d '{"email":"phase2@example.com","password":"Strong1Pass"}' \
  http://localhost:PORT/api/auth/login | head -c 200

# Create a recipe
curl -sS -b $JAR -c $JAR -H 'Content-Type: application/json' -X POST \
  -d '{"title":"Phase 2 Recipe","description":"e2e","category":"Dinner","prepTime":5,"cookTime":10,"servings":2,"ingredients":[{"amount":"1","unit":"cup","item":"flour"}],"instructions":["Mix"],"tags":["e2e"]}' \
  http://localhost:PORT/api/recipes | head -c 300
```

Expected: each call returns a JSON body with the relevant entity. Note the recipe's `id`.

- [ ] **Step 3: Restart the dev server, then re-fetch**

Stop the dev server (Ctrl+C). Start again. Then in a browser at `http://localhost:PORT`, log in with `phase2@example.com` / `Strong1Pass` and confirm:
- The dashboard shows the recipe you just created (proves it survived restart).
- Open the recipe — it shows correct title and ingredients.

This is the real-deal proof: register, login, create, restart, see-it-still-there.

- [ ] **Step 4: Cleanup**

```bash
# Delete the recipe (use the id from step 2)
curl -sS -b $JAR -X DELETE -w "HTTP %{http_code}\n" \
  http://localhost:PORT/api/recipes/RECIPE_ID

# Optionally delete the test user via SQL (no admin endpoint exposed):
# In Supabase SQL Editor:
#   delete from users where email = 'phase2@example.com';
```

- [ ] **Step 5: Stop the dev server**

Ctrl+C in the terminal running `npm run dev`.

---

## What's NOT in this plan (deferred)

- **Phase 3: Vercel deployment.** All persistence concerns are now resolved; deploy is mostly env-var wiring + a `vercel.json` if needed.
- **Periodic cleanup of expired sessions / reset tokens.** Filtering at query time is correct; rows accumulate but don't affect behavior. Add a Supabase cron later if needed.
- **Rate limiting** on `/api/auth/login`, `/api/auth/register`, `/api/auth/forgot-password`. Real security improvement, separate plan.
- **CSRF tokens** on state-changing endpoints. The current `sameSite: lax` cookie is decent for this scope; a real CSRF mechanism is a separate plan.
- **`middleware.ts` → `proxy.ts` rename** (Next.js 16 deprecation warning noted in Phase 1 smoke). Trivial; could fold into Phase 3 or a one-off plan.

---

## Self-review

**Spec coverage (against SRS sections):**
- §3.1 (User Registration) — Tasks 5–6, 9 ✅
- §3.2 (Login/Authentication) — Tasks 5–6, 8 ✅
- §3.10 (User Profile Management) — Tasks 5–6, 11 ✅
- §5.3 (Password hashing, 24h sessions, SQL injection prevention via parameterized queries) — Task 6 ✅
- §6 (Database based on PostgreSQL through Supabase with User table) — Tasks 1–2 ✅

**Placeholder scan:** Searched for "TBD", "TODO", "implement later", "fill in details", "similar to Task N". None present. Every code step shows actual code; every command shows expected output.

**Type/name consistency:**
- `getDb()` is sync everywhere; `db.query()` is async everywhere (matches Phase 1).
- `UserRow` and `SessionRow` are private to `lib/auth.ts` and both `extends QueryRow`.
- `isUuid` is defined in `lib/auth.ts` (re-implementation; could extract to a shared `lib/uuid.ts` helper but YAGNI for now — Phase 1's `lib/recipes.ts` has its own copy).
- `rowToPublicUser` and `rowToSession` map snake_case → camelCase consistently.
- `npm run db:seed` is referenced in Tasks 4, 18, 19, 21 — same name everywhere.
- The `2026-04-27-phase-2-auth.sql` migration filename is consistent across Tasks 2, 18, 21, and the PR body.

**Open assumptions:**
- Postgres unique-violation error code is `23505`. This is standard, used in the lib's catch.
- PGlite returns `created_at` and `expires_at` as ISO strings; `pg` returns them as `Date` objects. The `rowToPublicUser` and `rowToSession` helpers handle both shapes.
- The CTE syntax in `resetPasswordWithToken` (`with deleted as (delete ... returning ...) select ...`) works on both Postgres 17 (Supabase) and PGlite. If PGlite chokes, fall back to two queries inside a transaction.
- Tests assume `truncate ... cascade` is fast enough on PGlite to run between every test (~1ms typical). If it slows the suite noticeably, consider `delete from` + `restart identity` instead.

**Open scope-creep risks during execution:**
- The `isUuid` helper exists in both `lib/recipes.ts` and `lib/auth.ts`. Tempting to extract into `lib/uuid.ts` mid-execution. **Don't** — it's a 4-line helper and extraction adds an import chain. Revisit when a third caller appears.
- The CTE-based atomic delete in `resetPasswordWithToken` is more elegant than the current "delete after select" pattern. If it's too clever for someone reading the code later, swap it for two separate queries inside `BEGIN; ... COMMIT;`. Both work.
