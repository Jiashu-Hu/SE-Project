import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // PGlite (used by lib/db.ts via the test seam) is incompatible with
    // jsdom's File polyfill — switching to "node" sidesteps that. No test
    // currently renders React components or touches document/window, so
    // jsdom buys us nothing today. If component tests are added later,
    // use environmentMatchGlobs to scope jsdom to those files only.
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // PGlite WASM load + schema apply takes 5-15s per worker on cold start.
    hookTimeout: 30_000,
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
        "src/app/**/not-found.tsx",
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
