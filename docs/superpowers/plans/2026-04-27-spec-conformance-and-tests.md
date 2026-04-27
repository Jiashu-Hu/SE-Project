# Spec Conformance + Test Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close five small SRS conformance gaps (per-user recipe filtering, 24h sessions, MIT license, README, dashboard empty-state behavior) and stand up a test suite with ≥80% coverage so future work has a safety net.

**Architecture:** Phase 1 (Part B) ships behavior fixes one at a time, each with a passing test written first. Phase 2 (Part C) installs Vitest + React Testing Library + jsdom, adds unit tests for `lib/*` and integration tests for every API route handler (route handlers are imported directly and invoked with hand-built `Request` objects, with `next/headers` mocked via `vi.mock`). E2E (Playwright) is explicitly out of scope for this plan and deferred to a follow-up.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript 5 · Vitest 2 · @testing-library/react · jsdom · @vitest/coverage-v8

**Working directory note:** All file paths below are relative to the repo root (`/Users/teddy/code/class-project`). Commands assume your shell is at `Source_Code/` unless stated otherwise.

---

## File Structure

### Created
- `LICENSE` (repo root) — MIT
- `README.md` (repo root) — overwrite the create-next-app boilerplate with project README
- `Source_Code/vitest.config.ts` — Vitest config wiring jsdom + path alias + coverage thresholds
- `Source_Code/src/test/setup.ts` — global test setup (resets `globalThis` stores between tests so each test gets a clean store)
- `Source_Code/src/lib/__tests__/auth.test.ts`
- `Source_Code/src/lib/__tests__/auth-validation.test.ts`
- `Source_Code/src/lib/__tests__/recipes.test.ts`
- `Source_Code/src/lib/__tests__/recipe-validation.test.ts`
- `Source_Code/src/app/api/auth/__tests__/login.test.ts`
- `Source_Code/src/app/api/auth/__tests__/register.test.ts`
- `Source_Code/src/app/api/auth/__tests__/logout.test.ts`
- `Source_Code/src/app/api/auth/__tests__/me.test.ts`
- `Source_Code/src/app/api/auth/__tests__/profile.test.ts`
- `Source_Code/src/app/api/auth/__tests__/profile-password.test.ts`
- `Source_Code/src/app/api/auth/__tests__/forgot-password.test.ts`
- `Source_Code/src/app/api/auth/__tests__/reset-password.test.ts`
- `Source_Code/src/app/api/recipes/__tests__/recipes.test.ts`
- `Source_Code/src/app/api/recipes/__tests__/recipe-id.test.ts`

### Modified
- `Source_Code/src/lib/recipes.ts` — add `getRecipesByAuthor(authorId)`
- `Source_Code/src/app/page.tsx` — call `getRecipesByAuthor(user.id)` instead of `getAllRecipes()`
- `Source_Code/src/lib/auth.ts` — change `SESSION_DURATION_MS` from 7 days to 24 hours
- `Source_Code/package.json` — add devDeps + `test` / `test:cov` scripts
- `Source_Code/tsconfig.json` — include `src/test/**` if needed (verify after vitest config)

### Why this split
- One file per concern. `recipes.ts` already owns recipe queries; we add to it instead of creating a new module. Tests live next to source under `__tests__/` so jumping between code and test is one keystroke in any editor.
- Setup file resets the in-memory stores so tests don't bleed into each other — this is the single biggest gotcha with the current `globalThis` design.

---

## Part B: Spec conformance fixes

### Task B1: Add `getRecipesByAuthor` query

**Files:**
- Modify: `Source_Code/src/lib/recipes.ts:32-34`

- [ ] **Step 1: Add the query function**

Open `Source_Code/src/lib/recipes.ts` and add this export immediately after `getAllRecipes`:

```typescript
export function getRecipesByAuthor(authorId: string): readonly Recipe[] {
  return Array.from(getRecipeStore().recipesById.values()).filter(
    (recipe) => recipe.authorId === authorId
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/teddy/code/class-project
git add Source_Code/src/lib/recipes.ts
git commit -m "feat: add getRecipesByAuthor query

Adds a per-user filter at the data layer so the dashboard can
restrict the recipe list to the logged-in user (SRS REQ-3.9-1).
"
```

---

### Task B2: Use per-user filter on the dashboard

**Files:**
- Modify: `Source_Code/src/app/page.tsx:13`

- [ ] **Step 1: Update the dashboard page**

Replace lines 1–16 of `Source_Code/src/app/page.tsx` with:

```typescript
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/DashboardClient";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { getRecipesByAuthor } from "@/lib/recipes";

export default async function DashboardPage() {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    redirect("/login");
  }

  const recipes = getRecipesByAuthor(user.id);

  return <DashboardClient user={user} recipes={recipes} />;
}
```

- [ ] **Step 2: Manual smoke test**

Run: `npm run dev`
1. Navigate to http://localhost:3000/login
2. Log in as `test@test.com` / `test` — expect to see the seeded mock recipes (their `authorId === "seed-test-user"`).
3. Log out, register a brand-new account.
4. Log in with the new account — expect the empty-state message ("No recipes yet" or similar from `RecipeGrid`), NOT the seed user's recipes.

Stop the dev server (Ctrl+C) when done.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/app/page.tsx
git commit -m "fix: scope dashboard to the logged-in user's recipes

Previously every user saw every recipe in the in-memory store, which
violated SRS REQ-3.9-1 ('all the recipes of the user'). Switches the
dashboard query to getRecipesByAuthor.
"
```

---

### Task B3: Drop session lifetime to 24h

**Files:**
- Modify: `Source_Code/src/lib/auth.ts:35`

- [ ] **Step 1: Change the constant**

Find this line in `Source_Code/src/lib/auth.ts`:

```typescript
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
```

Replace with:

```typescript
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/lib/auth.ts
git commit -m "fix: shorten session lifetime to 24h per SRS 5.3

SRS section 5.3 specifies 24-hour session lifetime; the implementation
was 7 days. This constant feeds both the in-memory session expiry and
the cookie 'expires' attribute, so the change applies end-to-end.
"
```

---

### Task B4: Add MIT LICENSE

**Files:**
- Create: `LICENSE` (repo root)

- [ ] **Step 1: Write the LICENSE file**

Create `/Users/teddy/code/class-project/LICENSE` with this content (replace `YYYY` with the current year, `Jiashu Hu` is the project author per the SRS title page):

```
MIT License

Copyright (c) 2026 Jiashu Hu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Commit**

```bash
git add LICENSE
git commit -m "chore: add MIT LICENSE per SRS section 6"
```

---

### Task B5: Replace boilerplate README

**Files:**
- Modify: `README.md` (repo root) — full rewrite

- [ ] **Step 1: Overwrite the README**

Replace the entire contents of `/Users/teddy/code/class-project/README.md` with:

```markdown
# Recipe Management System

A web application for personal recipe organization. Users register, log in,
and manage their own recipes — create, edit, search, filter by category, and
delete.

Built with Next.js 16, React 19, TypeScript, and Tailwind CSS 4. Sessions are
in-memory; persistence (Supabase/PostgreSQL) is planned in a follow-up.

## Quick start

```bash
cd Source_Code
npm install
npm run dev
```

Open http://localhost:3000.

A seeded test account is available: `test@test.com` / `test`.

## Project layout

- `Source_Code/` — Next.js app
- `Documentation/` — SRS (PDF + DOCX)
- `User_Documentation/` — end-user guide and screenshots
- ` Deployment_Setup/` — install instructions
- `docs/superpowers/plans/` — implementation plans

## Documentation

- [Software Requirements Specification](Documentation/JIASHU_HU_SRS.pdf)
- [Installation Guide](./%20Deployment_Setup/INSTALL.md)
- [User Guide](User_Documentation/USER_GUIDE.md)

## Scripts

Run from `Source_Code/`:

- `npm run dev` — development server with hot reload
- `npm run build` — production build
- `npm run start` — run production build
- `npm run lint` — ESLint
- `npm test` — run unit + integration tests (after Part C lands)
- `npm run test:cov` — tests with coverage report (after Part C lands)

## License

MIT — see [LICENSE](LICENSE).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README to describe the recipe app

Replaces the create-next-app boilerplate with project-specific
information, links to the SRS, install guide, and user guide, and
documents the seeded test account.
"
```

---

### Task B6: Push Part B

- [ ] **Step 1: Push**

```bash
git push upstream main
```

- [ ] **Step 2: Verify on GitHub**

Open https://github.com/Jiashu-Hu/SE-Project/commits/main and confirm the five Part B commits are present.

---

## Part C: Test infrastructure + coverage

### Task C1: Install Vitest and supporting libraries

**Files:**
- Modify: `Source_Code/package.json`

- [ ] **Step 1: Install devDependencies**

Run from `Source_Code/`:

```bash
npm install -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/dom @testing-library/jest-dom jsdom @types/node
```

Expected: `package.json` and `package-lock.json` updated; `node_modules` populated.

- [ ] **Step 2: Add test scripts**

Edit `Source_Code/package.json`. Replace the `"scripts"` block with:

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

- [ ] **Step 3: Commit**

```bash
cd /Users/teddy/code/class-project
git add Source_Code/package.json Source_Code/package-lock.json
git commit -m "chore: add Vitest, RTL, and jsdom test deps"
```

---

### Task C2: Configure Vitest

**Files:**
- Create: `Source_Code/vitest.config.ts`
- Create: `Source_Code/src/test/setup.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

Create `Source_Code/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/__tests__/**",
        "src/test/**",
        "src/app/**/layout.tsx",
        "src/app/**/page.tsx",
        "src/components/**",
        "src/middleware.ts",
        "src/data/**",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Note: page/layout/component coverage is excluded — these are exercised in E2E tests (a future plan). The 80% threshold applies to the `lib/` and route-handler logic, which is what this plan covers.

- [ ] **Step 2: Write the test setup file**

Create `Source_Code/src/test/setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// Reset the in-memory stores between tests. Both lib/auth.ts and
// lib/recipes.ts attach a store object to globalThis on first access;
// deleting the cache forces a fresh seed for the next test.
afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.authStore;
  delete g.passwordResetStore;
  delete g.recipeStore;
});
```

- [ ] **Step 3: Verify Vitest can boot**

Run: `npm test -- --reporter=verbose`
Expected: `No test files found, exiting with code 1`. (Empty config is fine — we just want to confirm Vitest itself loads without an error.)

- [ ] **Step 4: Commit**

```bash
git add Source_Code/vitest.config.ts Source_Code/src/test/setup.ts
git commit -m "chore: configure vitest with jsdom and 80% coverage gate"
```

---

### Task C3: Unit tests — `lib/auth-validation.ts`

**Files:**
- Create: `Source_Code/src/lib/__tests__/auth-validation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `Source_Code/src/lib/__tests__/auth-validation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  validateName,
  validateEmail,
  validatePassword,
} from "@/lib/auth-validation";

describe("validateName", () => {
  it("rejects names shorter than 2 characters", () => {
    expect(validateName("a").valid).toBe(false);
    expect(validateName(" ").valid).toBe(false);
  });

  it("rejects names longer than 80 characters", () => {
    expect(validateName("x".repeat(81)).valid).toBe(false);
  });

  it("accepts a normal name", () => {
    expect(validateName("Jiashu Hu").valid).toBe(true);
  });
});

describe("validateEmail", () => {
  it("rejects malformed addresses", () => {
    expect(validateEmail("not-an-email").valid).toBe(false);
    expect(validateEmail("missing@tld").valid).toBe(false);
    expect(validateEmail("@no-local.com").valid).toBe(false);
  });

  it("accepts a well-formed address", () => {
    expect(validateEmail("a@b.co").valid).toBe(true);
  });
});

describe("validatePassword", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(validatePassword("Aa1").valid).toBe(false);
  });

  it("requires upper, lower, and digit", () => {
    expect(validatePassword("alllowercase1").valid).toBe(false);
    expect(validatePassword("ALLUPPERCASE1").valid).toBe(false);
    expect(validatePassword("NoDigitsHere").valid).toBe(false);
  });

  it("accepts a strong password", () => {
    expect(validatePassword("Strong1Pass").valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm test -- src/lib/__tests__/auth-validation.test.ts`
Expected: 9 tests PASS (the validators already exist and the assertions match their behavior).

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/lib/__tests__/auth-validation.test.ts
git commit -m "test: cover auth-validation name/email/password rules"
```

---

### Task C4: Unit tests — `lib/recipe-validation.ts`

**Files:**
- Create: `Source_Code/src/lib/__tests__/recipe-validation.test.ts`

- [ ] **Step 1: Write the test**

Create `Source_Code/src/lib/__tests__/recipe-validation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { validateCreateRecipePayload } from "@/lib/recipe-validation";

const validPayload = {
  title: "Pasta",
  description: "A simple weeknight dinner.",
  category: "Dinner",
  prepTime: 10,
  cookTime: 20,
  servings: 2,
  ingredients: [{ amount: "200", unit: "g", item: "spaghetti" }],
  instructions: ["Boil water", "Cook pasta"],
  tags: ["italian"],
};

describe("validateCreateRecipePayload", () => {
  it("accepts a complete valid payload", () => {
    const result = validateCreateRecipePayload(validPayload);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.title).toBe("Pasta");
      expect(result.payload.tags).toEqual(["italian"]);
    }
  });

  it("rejects non-object input", () => {
    expect(validateCreateRecipePayload(null).valid).toBe(false);
    expect(validateCreateRecipePayload("nope").valid).toBe(false);
  });

  it("rejects missing or oversized title", () => {
    expect(validateCreateRecipePayload({ ...validPayload, title: "" }).valid).toBe(false);
    expect(
      validateCreateRecipePayload({ ...validPayload, title: "x".repeat(121) }).valid
    ).toBe(false);
  });

  it("rejects missing description", () => {
    expect(validateCreateRecipePayload({ ...validPayload, description: "" }).valid).toBe(false);
  });

  it("rejects unknown category", () => {
    expect(
      validateCreateRecipePayload({ ...validPayload, category: "Brunch" }).valid
    ).toBe(false);
  });

  it("rejects negative or non-integer prep/cook times", () => {
    expect(validateCreateRecipePayload({ ...validPayload, prepTime: -1 }).valid).toBe(false);
    expect(validateCreateRecipePayload({ ...validPayload, prepTime: 1.5 }).valid).toBe(false);
    expect(validateCreateRecipePayload({ ...validPayload, cookTime: -5 }).valid).toBe(false);
  });

  it("requires servings >= 1", () => {
    expect(validateCreateRecipePayload({ ...validPayload, servings: 0 }).valid).toBe(false);
  });

  it("requires at least one ingredient with all fields", () => {
    expect(validateCreateRecipePayload({ ...validPayload, ingredients: [] }).valid).toBe(false);
    expect(
      validateCreateRecipePayload({
        ...validPayload,
        ingredients: [{ amount: "1", unit: "cup", item: "" }],
      }).valid
    ).toBe(false);
  });

  it("requires at least one non-empty instruction", () => {
    expect(validateCreateRecipePayload({ ...validPayload, instructions: [] }).valid).toBe(false);
    expect(
      validateCreateRecipePayload({ ...validPayload, instructions: ["  "] }).valid
    ).toBe(false);
  });

  it("filters non-string tags silently", () => {
    const result = validateCreateRecipePayload({
      ...validPayload,
      tags: ["good", 42, "", "  "],
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.tags).toEqual(["good"]);
    }
  });
});
```

- [ ] **Step 2: Run**

Run: `npm test -- src/lib/__tests__/recipe-validation.test.ts`
Expected: 10 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/lib/__tests__/recipe-validation.test.ts
git commit -m "test: cover recipe-validation happy path and error cases"
```

---

### Task C5: Unit tests — `lib/recipes.ts`

**Files:**
- Create: `Source_Code/src/lib/__tests__/recipes.test.ts`

- [ ] **Step 1: Write the test**

Create `Source_Code/src/lib/__tests__/recipes.test.ts`:

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

describe("recipes store", () => {
  it("seeds mock recipes under the test user", () => {
    const all = getAllRecipes();
    expect(all.length).toBeGreaterThan(0);
    for (const r of all) {
      expect(r.authorId).toBe("seed-test-user");
    }
  });

  it("getRecipeById returns the seeded recipe", () => {
    const all = getAllRecipes();
    const fetched = getRecipeById(all[0].id);
    expect(fetched).toEqual(all[0]);
  });

  it("getRecipeById returns undefined for unknown id", () => {
    expect(getRecipeById("does-not-exist")).toBeUndefined();
  });

  it("getRecipesByAuthor returns only that author's recipes", () => {
    const created = createRecipe("alice", samplePayload);
    const aliceRecipes = getRecipesByAuthor("alice");
    expect(aliceRecipes).toHaveLength(1);
    expect(aliceRecipes[0]).toEqual(created);
    // seed user's recipes are unaffected
    expect(getRecipesByAuthor("seed-test-user").length).toBeGreaterThan(0);
  });

  it("getRecipesByAuthor returns [] for unknown author", () => {
    expect(getRecipesByAuthor("nobody")).toEqual([]);
  });

  it("createRecipe assigns id, authorId, createdAt, and trims fields", () => {
    const created = createRecipe("bob", { ...samplePayload, title: "  Eggs  " });
    expect(created.id).toMatch(/[0-9a-f-]{36}/);
    expect(created.authorId).toBe("bob");
    expect(created.title).toBe("Eggs");
    expect(typeof created.createdAt).toBe("string");
    expect(getRecipeById(created.id)).toEqual(created);
  });

  it("updateRecipe replaces fields but preserves id, authorId, createdAt", () => {
    const created = createRecipe("bob", samplePayload);
    const updated = updateRecipe(created.id, {
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

  it("updateRecipe returns null for unknown id", () => {
    expect(updateRecipe("does-not-exist", samplePayload)).toBeNull();
  });

  it("deleteRecipe removes the recipe and returns true", () => {
    const created = createRecipe("carol", samplePayload);
    expect(deleteRecipe(created.id)).toBe(true);
    expect(getRecipeById(created.id)).toBeUndefined();
  });

  it("deleteRecipe returns false for unknown id", () => {
    expect(deleteRecipe("does-not-exist")).toBe(false);
  });
});
```

- [ ] **Step 2: Run**

Run: `npm test -- src/lib/__tests__/recipes.test.ts`
Expected: 10 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/lib/__tests__/recipes.test.ts
git commit -m "test: cover recipes store CRUD and per-author query"
```

---

### Task C6: Unit tests — `lib/auth.ts`

**Files:**
- Create: `Source_Code/src/lib/__tests__/auth.test.ts`

- [ ] **Step 1: Write the test**

Create `Source_Code/src/lib/__tests__/auth.test.ts`:

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
  it("creates a new user", () => {
    const result = registerUser({
      name: "Alice",
      email: "alice@example.com",
      password: "Strong1Pass",
    });
    expect("user" in result).toBe(true);
    if ("user" in result) {
      expect(result.user.email).toBe("alice@example.com");
      expect(result.user.name).toBe("Alice");
    }
  });

  it("rejects duplicate emails (case insensitive)", () => {
    registerUser({ name: "Alice", email: "alice@example.com", password: "Strong1Pass" });
    const dup = registerUser({
      name: "Alice 2",
      email: "ALICE@example.com",
      password: "Strong1Pass",
    });
    expect("error" in dup).toBe(true);
  });
});

describe("authenticateUser", () => {
  it("returns the user for correct credentials", () => {
    registerUser({ name: "Bob", email: "bob@example.com", password: "Strong1Pass" });
    const u = authenticateUser("bob@example.com", "Strong1Pass");
    expect(u?.email).toBe("bob@example.com");
  });

  it("returns null for wrong password", () => {
    registerUser({ name: "Bob", email: "bob@example.com", password: "Strong1Pass" });
    expect(authenticateUser("bob@example.com", "wrong")).toBeNull();
  });

  it("returns null for unknown email", () => {
    expect(authenticateUser("ghost@example.com", "whatever")).toBeNull();
  });

  it("authenticates the seeded test user", () => {
    expect(authenticateUser("test@test.com", "test")?.name).toBe("Test User");
  });
});

describe("session lifecycle", () => {
  it("creates, retrieves, and deletes a session", () => {
    const reg = registerUser({ name: "Carol", email: "c@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const session = createSession(reg.user.id);
    expect(session.userId).toBe(reg.user.id);
    expect(getSession(session.token)).toEqual(session);
    expect(getUserBySessionToken(session.token)?.id).toBe(reg.user.id);

    deleteSession(session.token);
    expect(getSession(session.token)).toBeNull();
  });

  it("session expiresAt is approximately 24h from now", () => {
    const reg = registerUser({ name: "D", email: "d@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");
    const session = createSession(reg.user.id);

    const expectedMs = Date.now() + 1000 * 60 * 60 * 24;
    const actualMs = new Date(session.expiresAt).getTime();
    // Allow a 5-second slack for test execution.
    expect(Math.abs(actualMs - expectedMs)).toBeLessThan(5_000);
  });
});

describe("updateUserProfile", () => {
  it("updates name and email", () => {
    const reg = registerUser({ name: "E", email: "e@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const result = updateUserProfile({
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

  it("rejects email already in use by another user", () => {
    registerUser({ name: "F1", email: "f1@x.com", password: "Strong1Pass" });
    const reg2 = registerUser({ name: "F2", email: "f2@x.com", password: "Strong1Pass" });
    if (!("user" in reg2)) throw new Error("setup failed");

    const result = updateUserProfile({
      userId: reg2.user.id,
      name: "F2",
      email: "f1@x.com",
    });
    expect("error" in result).toBe(true);
  });
});

describe("changeUserPassword", () => {
  it("rotates password when current password is correct", () => {
    const reg = registerUser({ name: "G", email: "g@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const result = changeUserPassword({
      userId: reg.user.id,
      currentPassword: "Strong1Pass",
      newPassword: "Different1Pass",
    });
    expect("success" in result).toBe(true);
    expect(authenticateUser("g@x.com", "Strong1Pass")).toBeNull();
    expect(authenticateUser("g@x.com", "Different1Pass")?.email).toBe("g@x.com");
  });

  it("rejects when current password is wrong", () => {
    const reg = registerUser({ name: "H", email: "h@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const result = changeUserPassword({
      userId: reg.user.id,
      currentPassword: "WrongCurrent1",
      newPassword: "Different1Pass",
    });
    expect("error" in result).toBe(true);
  });

  it("rejects when new password equals current", () => {
    const reg = registerUser({ name: "I", email: "i@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const result = changeUserPassword({
      userId: reg.user.id,
      currentPassword: "Strong1Pass",
      newPassword: "Strong1Pass",
    });
    expect("error" in result).toBe(true);
  });
});

describe("password reset flow", () => {
  it("issues a token for an existing email and resets the password", () => {
    registerUser({ name: "J", email: "j@x.com", password: "Strong1Pass" });

    const issued = createPasswordResetToken("j@x.com");
    expect("token" in issued).toBe(true);
    if (!("token" in issued)) return;
    expect(issued.token).not.toBe("");

    const reset = resetPasswordWithToken(issued.token, "Different1Pass");
    expect("success" in reset).toBe(true);
    expect(authenticateUser("j@x.com", "Different1Pass")?.email).toBe("j@x.com");
  });

  it("returns an empty token for an unknown email (no enumeration)", () => {
    const issued = createPasswordResetToken("ghost@example.com");
    expect("token" in issued).toBe(true);
    if ("token" in issued) {
      expect(issued.token).toBe("");
    }
  });

  it("rejects an unknown reset token", () => {
    const reset = resetPasswordWithToken("not-a-real-token", "Different1Pass");
    expect("error" in reset).toBe(true);
  });
});
```

- [ ] **Step 2: Run**

Run: `npm test -- src/lib/__tests__/auth.test.ts`
Expected: 16 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/lib/__tests__/auth.test.ts
git commit -m "test: cover auth register/login/session/profile/password/reset"
```

---

### Task C7: Helper for API route tests

**Context:** API route handlers call `getCurrentUserFromCookies()`, which uses `next/headers` `cookies()`. We mock `next/headers` per test file using `vi.mock`. Each handler test builds a `Request` directly and invokes the exported `POST`/`PATCH`/`DELETE` function — no HTTP server needed.

This task is documentation-only — no code change. The pattern is shown inline in C8.

- [ ] **Step 1: Read and understand the pattern**

Open `Source_Code/src/lib/auth-server.ts` and confirm it imports `cookies` from `next/headers`. The pattern is:

```typescript
import { vi } from "vitest";

// Per-test cookie state: set this from inside each test before invoking the route.
const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

beforeEach(() => cookieJar.clear());
```

That's the only seam — every other dependency (`@/lib/auth`, `@/lib/recipes`) is plain functions that read the in-memory store, which `setup.ts` already resets between tests.

No commit for this task.

---

### Task C8: API tests — `/api/auth/register`

**Files:**
- Create: `Source_Code/src/app/api/auth/__tests__/register.test.ts`

- [ ] **Step 1: Write the test**

Create `Source_Code/src/app/api/auth/__tests__/register.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/auth/register/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  it("creates a new user and sets a session cookie", async () => {
    const res = await POST(makeRequest({
      name: "Alice",
      email: "alice@example.com",
      password: "Strong1Pass",
    }));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.user.email).toBe("alice@example.com");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/session/i);
  });

  it("rejects an invalid email", async () => {
    const res = await POST(makeRequest({
      name: "Alice",
      email: "not-an-email",
      password: "Strong1Pass",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects a weak password", async () => {
    const res = await POST(makeRequest({
      name: "Alice",
      email: "alice@example.com",
      password: "short",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects duplicate registrations", async () => {
    const payload = {
      name: "Alice",
      email: "alice@example.com",
      password: "Strong1Pass",
    };
    await POST(makeRequest(payload));
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(409);
  });

  it("rejects malformed JSON body", async () => {
    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run**

Run: `npm test -- src/app/api/auth/__tests__/register.test.ts`
Expected: 5 tests PASS.

If any test fails because the route returns a different status code, **read the route handler** at `Source_Code/src/app/api/auth/register/route.ts` and update the expected status to match. Do NOT change the route to match the test — the route is the source of truth here.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/app/api/auth/__tests__/register.test.ts
git commit -m "test: integration tests for /api/auth/register"
```

---

### Task C9: API tests — `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`

**Files:**
- Create: `Source_Code/src/app/api/auth/__tests__/login.test.ts`
- Create: `Source_Code/src/app/api/auth/__tests__/logout.test.ts`
- Create: `Source_Code/src/app/api/auth/__tests__/me.test.ts`

- [ ] **Step 1: Read each route handler**

Before writing, open each of these to confirm the request shape and expected status codes:
- `Source_Code/src/app/api/auth/login/route.ts`
- `Source_Code/src/app/api/auth/logout/route.ts`
- `Source_Code/src/app/api/auth/me/route.ts`

- [ ] **Step 2: Write `login.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { POST as loginPOST } from "@/app/api/auth/login/route";

function makeRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await registerPOST(makeRequest("/api/auth/register", {
    name: "Alice",
    email: "alice@example.com",
    password: "Strong1Pass",
  }));
});

describe("POST /api/auth/login", () => {
  it("authenticates valid credentials and sets cookie", async () => {
    const res = await loginPOST(makeRequest("/api/auth/login", {
      email: "alice@example.com",
      password: "Strong1Pass",
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("alice@example.com");
    expect(res.headers.get("set-cookie")).toMatch(/session/i);
  });

  it("rejects wrong password with 401", async () => {
    const res = await loginPOST(makeRequest("/api/auth/login", {
      email: "alice@example.com",
      password: "WrongOne1Pass",
    }));
    expect(res.status).toBe(401);
  });

  it("rejects unknown email with 401", async () => {
    const res = await loginPOST(makeRequest("/api/auth/login", {
      email: "ghost@example.com",
      password: "Strong1Pass",
    }));
    expect(res.status).toBe(401);
  });

  it("rejects malformed payload with 400", async () => {
    const res = await loginPOST(makeRequest("/api/auth/login", {
      email: "not-an-email",
      password: "",
    }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Write `logout.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/auth/logout/route";

describe("POST /api/auth/logout", () => {
  it("returns 200 and clears the session cookie", async () => {
    const req = new Request("http://localhost/api/auth/logout", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    // Either Max-Age=0 or an Expires in the past clears the cookie.
    expect(setCookie.toLowerCase()).toMatch(/max-age=0|expires=/);
  });
});
```

- [ ] **Step 4: Write `me.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { GET } from "@/app/api/auth/me/route";
import { registerUser, createSession } from "@/lib/auth";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";

beforeEach(() => cookieJar.clear());

describe("GET /api/auth/me", () => {
  it("returns 401 when no session cookie is present", async () => {
    const res = await GET(new Request("http://localhost/api/auth/me"));
    expect(res.status).toBe(401);
  });

  it("returns the current user when the cookie is valid", async () => {
    const reg = registerUser({
      name: "Alice",
      email: "alice@example.com",
      password: "Strong1Pass",
    });
    if (!("user" in reg)) throw new Error("setup failed");
    const session = createSession(reg.user.id);
    cookieJar.set(AUTH_SESSION_COOKIE, session.token);

    const res = await GET(new Request("http://localhost/api/auth/me"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("alice@example.com");
  });
});
```

- [ ] **Step 5: Run all three**

```bash
npm test -- src/app/api/auth/__tests__/login.test.ts src/app/api/auth/__tests__/logout.test.ts src/app/api/auth/__tests__/me.test.ts
```

Expected: all PASS. If a status code mismatches, **inspect the route, not the test** — adjust the assertion to match the route's actual contract.

- [ ] **Step 6: Commit**

```bash
git add Source_Code/src/app/api/auth/__tests__/login.test.ts \
        Source_Code/src/app/api/auth/__tests__/logout.test.ts \
        Source_Code/src/app/api/auth/__tests__/me.test.ts
git commit -m "test: integration tests for login/logout/me endpoints"
```

---

### Task C10: API tests — `/api/auth/profile` and `/api/auth/profile/password`

**Files:**
- Create: `Source_Code/src/app/api/auth/__tests__/profile.test.ts`
- Create: `Source_Code/src/app/api/auth/__tests__/profile-password.test.ts`

- [ ] **Step 1: Read both route handlers**

Open `Source_Code/src/app/api/auth/profile/route.ts` and `Source_Code/src/app/api/auth/profile/password/route.ts`. Note the HTTP methods exported (likely `PATCH`/`PUT`/`POST`) and the expected request body shape.

- [ ] **Step 2: Write `profile.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

// Import the route AFTER vi.mock is registered.
import * as profileRoute from "@/app/api/auth/profile/route";
import { registerUser, createSession } from "@/lib/auth";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";

const handler =
  profileRoute.PATCH ?? profileRoute.PUT ?? profileRoute.POST;

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function logIn(email: string): void {
  const reg = registerUser({ name: "User", email, password: "Strong1Pass" });
  if (!("user" in reg)) throw new Error("setup failed");
  const session = createSession(reg.user.id);
  cookieJar.set(AUTH_SESSION_COOKIE, session.token);
}

beforeEach(() => cookieJar.clear());

describe("profile update endpoint", () => {
  it("returns 401 when not logged in", async () => {
    const res = await handler(makeRequest({ name: "X", email: "x@x.com" }));
    expect(res.status).toBe(401);
  });

  it("updates name and email when logged in", async () => {
    logIn("a@x.com");
    const res = await handler(makeRequest({ name: "New Name", email: "new@x.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("new@x.com");
    expect(body.user.name).toBe("New Name");
  });

  it("rejects taking another user's email", async () => {
    registerUser({ name: "Other", email: "taken@x.com", password: "Strong1Pass" });
    logIn("me@x.com");
    const res = await handler(makeRequest({ name: "Me", email: "taken@x.com" }));
    expect([400, 409]).toContain(res.status);
  });
});
```

- [ ] **Step 3: Write `profile-password.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import * as pwRoute from "@/app/api/auth/profile/password/route";
import { authenticateUser, registerUser, createSession } from "@/lib/auth";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";

const handler = pwRoute.PATCH ?? pwRoute.PUT ?? pwRoute.POST;

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/profile/password", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => cookieJar.clear());

describe("password change endpoint", () => {
  it("returns 401 when not logged in", async () => {
    const res = await handler(makeRequest({
      currentPassword: "Strong1Pass",
      newPassword: "Different1Pass",
    }));
    expect(res.status).toBe(401);
  });

  it("rotates the password when current is correct", async () => {
    const reg = registerUser({
      name: "U", email: "u@x.com", password: "Strong1Pass",
    });
    if (!("user" in reg)) throw new Error("setup failed");
    cookieJar.set(AUTH_SESSION_COOKIE, createSession(reg.user.id).token);

    const res = await handler(makeRequest({
      currentPassword: "Strong1Pass",
      newPassword: "Different1Pass",
    }));
    expect(res.status).toBe(200);
    expect(authenticateUser("u@x.com", "Different1Pass")?.email).toBe("u@x.com");
    expect(authenticateUser("u@x.com", "Strong1Pass")).toBeNull();
  });

  it("rejects wrong current password", async () => {
    const reg = registerUser({
      name: "V", email: "v@x.com", password: "Strong1Pass",
    });
    if (!("user" in reg)) throw new Error("setup failed");
    cookieJar.set(AUTH_SESSION_COOKIE, createSession(reg.user.id).token);

    const res = await handler(makeRequest({
      currentPassword: "WrongOne1Pass",
      newPassword: "Different1Pass",
    }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 4: Run**

```bash
npm test -- src/app/api/auth/__tests__/profile.test.ts src/app/api/auth/__tests__/profile-password.test.ts
```

Expected: all PASS. Adjust status assertions to match actual route contracts if needed.

- [ ] **Step 5: Commit**

```bash
git add Source_Code/src/app/api/auth/__tests__/profile.test.ts \
        Source_Code/src/app/api/auth/__tests__/profile-password.test.ts
git commit -m "test: integration tests for profile and password endpoints"
```

---

### Task C11: API tests — forgot/reset password

**Files:**
- Create: `Source_Code/src/app/api/auth/__tests__/forgot-password.test.ts`
- Create: `Source_Code/src/app/api/auth/__tests__/reset-password.test.ts`

- [ ] **Step 1: Read both route handlers**

Open `Source_Code/src/app/api/auth/forgot-password/route.ts` and `Source_Code/src/app/api/auth/reset-password/route.ts`. Note response shapes — the route may or may not include the reset token in the response (it shouldn't for prod, but might for the demo). The test below uses `createPasswordResetToken` from `lib/auth` directly to obtain a token without depending on the response shape.

- [ ] **Step 2: Write `forgot-password.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/auth/forgot-password/route";
import { registerUser } from "@/lib/auth";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/forgot-password", () => {
  it("returns 200 for a known email", async () => {
    registerUser({ name: "A", email: "a@x.com", password: "Strong1Pass" });
    const res = await POST(makeRequest({ email: "a@x.com" }));
    expect(res.status).toBe(200);
  });

  it("returns 200 even for an unknown email (no enumeration)", async () => {
    const res = await POST(makeRequest({ email: "ghost@x.com" }));
    expect(res.status).toBe(200);
  });

  it("rejects malformed body with 400", async () => {
    const res = await POST(makeRequest({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Write `reset-password.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/auth/reset-password/route";
import {
  registerUser,
  createPasswordResetToken,
  authenticateUser,
} from "@/lib/auth";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/reset-password", () => {
  it("resets the password when given a valid token", async () => {
    registerUser({ name: "A", email: "a@x.com", password: "Strong1Pass" });
    const issued = createPasswordResetToken("a@x.com");
    if (!("token" in issued) || issued.token === "") {
      throw new Error("setup failed");
    }

    const res = await POST(makeRequest({
      token: issued.token,
      newPassword: "Different1Pass",
    }));
    expect(res.status).toBe(200);
    expect(authenticateUser("a@x.com", "Different1Pass")?.email).toBe("a@x.com");
  });

  it("rejects an unknown token", async () => {
    const res = await POST(makeRequest({
      token: "not-a-real-token",
      newPassword: "Different1Pass",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects a weak new password", async () => {
    registerUser({ name: "A", email: "a@x.com", password: "Strong1Pass" });
    const issued = createPasswordResetToken("a@x.com");
    if (!("token" in issued) || issued.token === "") return;

    const res = await POST(makeRequest({
      token: issued.token,
      newPassword: "weak",
    }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 4: Run**

```bash
npm test -- src/app/api/auth/__tests__/forgot-password.test.ts src/app/api/auth/__tests__/reset-password.test.ts
```

Expected: all PASS. Adjust status codes to match actual route contracts.

- [ ] **Step 5: Commit**

```bash
git add Source_Code/src/app/api/auth/__tests__/forgot-password.test.ts \
        Source_Code/src/app/api/auth/__tests__/reset-password.test.ts
git commit -m "test: integration tests for forgot-password and reset-password"
```

---

### Task C12: API tests — `/api/recipes` (POST)

**Files:**
- Create: `Source_Code/src/app/api/recipes/__tests__/recipes.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { POST } from "@/app/api/recipes/route";
import { registerUser, createSession } from "@/lib/auth";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";

const validBody = {
  title: "Pasta",
  description: "A simple weeknight dinner.",
  category: "Dinner",
  prepTime: 10,
  cookTime: 20,
  servings: 2,
  ingredients: [{ amount: "200", unit: "g", item: "spaghetti" }],
  instructions: ["Boil water", "Cook pasta"],
  tags: ["italian"],
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function logIn(): string {
  const reg = registerUser({
    name: "Chef", email: "chef@x.com", password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  const session = createSession(reg.user.id);
  cookieJar.set(AUTH_SESSION_COOKIE, session.token);
  return reg.user.id;
}

beforeEach(() => cookieJar.clear());

describe("POST /api/recipes", () => {
  it("returns 401 when not logged in", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("creates a recipe owned by the logged-in user", async () => {
    const userId = logIn();
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.recipe.title).toBe("Pasta");
    expect(body.recipe.authorId).toBe(userId);
  });

  it("rejects an invalid payload with 400", async () => {
    logIn();
    const res = await POST(makeRequest({ ...validBody, title: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON with 400", async () => {
    logIn();
    const req = new Request("http://localhost/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run**

Run: `npm test -- src/app/api/recipes/__tests__/recipes.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/app/api/recipes/__tests__/recipes.test.ts
git commit -m "test: integration tests for POST /api/recipes"
```

---

### Task C13: API tests — `/api/recipes/[id]` (PATCH, DELETE)

**Files:**
- Create: `Source_Code/src/app/api/recipes/__tests__/recipe-id.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { PATCH, DELETE } from "@/app/api/recipes/[id]/route";
import {
  registerUser,
  createSession,
} from "@/lib/auth";
import { createRecipe } from "@/lib/recipes";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";
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

function logInAs(email: string): string {
  const reg = registerUser({ name: "U", email, password: "Strong1Pass" });
  if (!("user" in reg)) throw new Error("setup failed");
  cookieJar.set(AUTH_SESSION_COOKIE, createSession(reg.user.id).token);
  return reg.user.id;
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/recipes/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => cookieJar.clear());

describe("PATCH /api/recipes/[id]", () => {
  it("returns 401 when not logged in", async () => {
    const res = await PATCH(patchRequest(samplePayload), paramsFor("any"));
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown recipe id", async () => {
    logInAs("a@x.com");
    const res = await PATCH(patchRequest(samplePayload), paramsFor("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when editing another user's recipe", async () => {
    const aliceId = logInAs("alice@x.com");
    const recipe = createRecipe(aliceId, samplePayload);
    cookieJar.clear();
    logInAs("bob@x.com");

    const res = await PATCH(patchRequest({ ...samplePayload, title: "Hacked" }), paramsFor(recipe.id));
    expect(res.status).toBe(403);
  });

  it("updates a recipe owned by the logged-in user", async () => {
    const userId = logInAs("a@x.com");
    const recipe = createRecipe(userId, samplePayload);

    const res = await PATCH(
      patchRequest({ ...samplePayload, title: "Better Toast" }),
      paramsFor(recipe.id)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recipe.title).toBe("Better Toast");
    expect(body.recipe.id).toBe(recipe.id);
  });

  it("rejects an invalid payload with 400", async () => {
    const userId = logInAs("a@x.com");
    const recipe = createRecipe(userId, samplePayload);
    const res = await PATCH(patchRequest({ ...samplePayload, title: "" }), paramsFor(recipe.id));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/recipes/[id]", () => {
  function deleteRequest(): Request {
    return new Request("http://localhost/api/recipes/x", { method: "DELETE" });
  }

  it("returns 401 when not logged in", async () => {
    const res = await DELETE(deleteRequest(), paramsFor("any"));
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown id", async () => {
    logInAs("a@x.com");
    const res = await DELETE(deleteRequest(), paramsFor("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when deleting another user's recipe", async () => {
    const aliceId = logInAs("alice@x.com");
    const recipe = createRecipe(aliceId, samplePayload);
    cookieJar.clear();
    logInAs("bob@x.com");

    const res = await DELETE(deleteRequest(), paramsFor(recipe.id));
    expect(res.status).toBe(403);
  });

  it("returns 204 and removes the recipe when the owner deletes it", async () => {
    const userId = logInAs("a@x.com");
    const recipe = createRecipe(userId, samplePayload);

    const res = await DELETE(deleteRequest(), paramsFor(recipe.id));
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run**

Run: `npm test -- src/app/api/recipes/__tests__/recipe-id.test.ts`
Expected: 9 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/app/api/recipes/__tests__/recipe-id.test.ts
git commit -m "test: integration tests for PATCH/DELETE /api/recipes/[id]"
```

---

### Task C14: Run full suite + coverage gate

**Files:**
- Possibly modify: `Source_Code/vitest.config.ts` (only if coverage misses thresholds and additional `exclude` entries are warranted — do NOT lower the 80% threshold).

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: every test passes.

- [ ] **Step 2: Run with coverage**

Run: `npm run test:cov`
Expected: ≥80% lines, functions, branches, statements across the included files (`src/lib/**`, `src/app/api/**`).

- [ ] **Step 3: If coverage < 80%, identify the gap**

Open `Source_Code/coverage/index.html` in a browser. Find the file(s) below threshold. Decide:
- If the gap is real-but-small uncovered code (e.g. an error branch), add a test for it.
- If the gap is in defensive code paths that genuinely can't be reached without contrived setup, add a focused test using `vi.spyOn` rather than expanding the exclude list.
- Only expand the `exclude` config for files that don't belong in the coverage scope (e.g. pure type files, migration scripts).

- [ ] **Step 4: Commit any added tests**

```bash
git add Source_Code/src
git commit -m "test: backfill coverage to clear 80% gate"
```

(Skip this commit if no tests were added.)

---

### Task C15: Push Part C

- [ ] **Step 1: Push**

```bash
git push upstream main
```

- [ ] **Step 2: Verify on GitHub**

Open https://github.com/Jiashu-Hu/SE-Project/commits/main and confirm the Part C commits are present.

- [ ] **Step 3: Update README script section**

The README written in B5 already mentions `npm test` and `npm run test:cov`; no change needed unless coverage commands changed. Skip.

---

## What's explicitly NOT in this plan (deferred)

- **E2E tests (Playwright)** — different runtime, separate dependency tree, browser orchestration. A follow-up plan should add a single Playwright test for the critical flow: register → log in → create recipe → see it on dashboard → delete it.
- **Supabase / PostgreSQL migration** — the largest remaining SRS gap. Should be its own plan; Part B's per-user filtering and Part C's tests are the right safety net to have in place first.
- **Component tests for `RecipeForm`, `LoginForm`, etc.** — coverage thresholds in this plan exclude `src/components/**` for that reason. A follow-up plan can add RTL component tests once the Supabase migration settles the data shape.

---

## Self-review

**Spec coverage (Part B):**
- Per-user filter (REQ-3.9-1) → B1+B2 ✅
- 24h sessions (5.3) → B3 ✅
- MIT license (§6) → B4 ✅
- README (§2.6) → B5 ✅
- Push → B6 ✅

**Coverage (Part C):**
- Vitest setup → C1+C2 ✅
- `lib/auth-validation.ts` → C3 ✅
- `lib/recipe-validation.ts` → C4 ✅
- `lib/recipes.ts` (incl. new `getRecipesByAuthor`) → C5 ✅
- `lib/auth.ts` → C6 ✅
- `/api/auth/*` → C8, C9, C10, C11 ✅ (register, login, logout, me, profile, profile-password, forgot, reset)
- `/api/recipes` → C12 ✅
- `/api/recipes/[id]` → C13 ✅
- 80% gate → C14 ✅
- Push → C15 ✅

**Placeholder scan:** No "TBD", "TODO", "implement later", or vague "add tests" steps. Every code step shows the actual code. Status code tolerances note "if route returns different code, adjust the assertion to match the route" rather than telling the engineer to invent values.

**Type/name consistency:** `getRecipesByAuthor` is the same name in B1 (definition), B2 (call site), and C5 (test). `SESSION_DURATION_MS` referenced consistently in B3 and C6 (where the 24h-from-now assertion validates the change). `cookieJar` pattern is consistent across C7, C9 (me), C10, C12, C13.

**Open assumption:** I assumed the response status from `/api/auth/register` for duplicates is `409`. The current route handler's exact code wasn't read; the test instructs the engineer to reconcile if needed (C8 step 2's note).
