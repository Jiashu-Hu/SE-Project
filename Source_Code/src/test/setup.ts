import { afterEach, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { __setTestDb, __resetDb } from "@/lib/db";
import type { QueryClient, QueryRow } from "@/lib/db";
import { seedGlobal } from "@/lib/ingredients";

const seedPath = path.resolve(__dirname, "../../data/ingredient-seed.json");
const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));

let pglite: PGlite | null = null;

beforeAll(async () => {
  pglite = new PGlite();
  const cwdSchemaPath = path.join(process.cwd(), "supabase", "schema.sql");
  const schemaPath = fs.existsSync(cwdSchemaPath)
    ? cwdSchemaPath
    : path.resolve(__dirname, "../../supabase/schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  await pglite.exec(schema);

  const client: QueryClient = {
    async query<T extends QueryRow = QueryRow>(
      text: string,
      params?: readonly unknown[]
    ) {
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

beforeEach(async () => {
  await seedGlobal(seed);
});

afterEach(async () => {
  // Reset all four tables; schema persists across tests. CASCADE handles
  // FK chains (sessions/reset_tokens/recipes all reference users).
  if (pglite) {
    await pglite.exec(
      "truncate table users, sessions, password_reset_tokens, recipes, meal_plan_slots, ingredient_aisles, bucket_items, ingredients restart identity cascade;"
    );
  }
});

afterAll(async () => {
  await pglite?.close();
  __resetDb();
});
