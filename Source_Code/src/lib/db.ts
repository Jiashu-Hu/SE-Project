import { Pool } from "pg";
import type { PoolConfig } from "pg";

export interface QueryResult<T> {
  readonly rows: readonly T[];
  readonly rowCount: number;
}

// Row shape constraint: matches pg's `QueryResultRow` (essentially
// Record<string, unknown>) so we can forward the type parameter without a cast.
export type QueryRow = Record<string, unknown>;

export interface QueryClient {
  query<T extends QueryRow = QueryRow>(
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
    async query<T extends QueryRow = QueryRow>(
      text: string,
      params?: readonly unknown[]
    ) {
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
