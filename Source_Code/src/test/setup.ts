import { afterEach, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { __setTestDb, __resetDb } from "@/lib/db";
import type { QueryClient, QueryRow } from "@/lib/db";

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
