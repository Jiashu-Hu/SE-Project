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
