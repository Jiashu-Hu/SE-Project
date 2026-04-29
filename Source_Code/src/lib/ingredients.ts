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
