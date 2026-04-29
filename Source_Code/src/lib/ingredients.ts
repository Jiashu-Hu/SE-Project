import { getDb } from "@/lib/db";
import type { QueryRow } from "@/lib/db";
import type { Aisle } from "@/lib/ingredient-aisles";
import { keywordClassify } from "@/lib/ingredient-aisles";

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
  const valueClauses: string[] = [];
  const params: unknown[] = [];
  for (const r of rows) {
    const i = params.length;
    valueClauses.push(`(null, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, 'seed')`);
    params.push(r.name, normalize(r.name), r.defaultUnit, r.aisle);
  }
  const result = await db.query(
    `insert into ingredients (user_id, name, name_normalized, default_unit, aisle, source)
       values ${valueClauses.join(", ")}
       on conflict (user_id, name_normalized) do nothing`,
    params
  );
  return result.rowCount;
}

function rowToIngredient(row: IngredientRow): Ingredient {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    defaultUnit: row.default_unit,
    aisle: row.aisle,
    source: row.source,
  };
}

async function syncAisleCache(
  itemNormalized: string,
  aisle: Aisle
): Promise<void> {
  const db = getDb();
  await db.query(
    `insert into ingredient_aisles (item_normalized, aisle, source)
       values ($1, $2, 'llm')
       on conflict (item_normalized) do nothing`,
    [itemNormalized, aisle]
  );
}

export async function getOrCreateIngredient(
  userId: string,
  rawName: string,
  hints: { unit?: string; source?: "user" | "ai" | "backfill" } = {}
): Promise<Ingredient> {
  if (!isUuid(userId)) throw new Error("Invalid userId.");
  const trimmed = rawName.trim();
  if (trimmed.length === 0) throw new Error("Empty ingredient name.");
  if (trimmed.length > 80) throw new Error("Ingredient name too long.");
  const norm = normalize(trimmed);
  const db = getDb();

  // 1. Try existing per-user row first.
  const existingUser = await db.query<IngredientRow>(
    `select id, user_id, name, name_normalized, default_unit, aisle, source
       from ingredients
      where user_id = $1 and name_normalized = $2
      limit 1`,
    [userId, norm]
  );
  if (existingUser.rows[0]) return rowToIngredient(existingUser.rows[0]);

  // 2. Try existing global row.
  const existingGlobal = await db.query<IngredientRow>(
    `select id, user_id, name, name_normalized, default_unit, aisle, source
       from ingredients
      where user_id is null and name_normalized = $1
      limit 1`,
    [norm]
  );
  if (existingGlobal.rows[0]) return rowToIngredient(existingGlobal.rows[0]);

  // 3. Classify aisle: keyword first, fall back to 'Other'.
  // (LLM fallback is reserved for the shopping-list batch path; per-item
  // misclassifications round-trip through that cache anyway.)
  const aisle: Aisle = keywordClassify(norm) ?? "Other";

  const inserted = await db.query<IngredientRow>(
    `insert into ingredients
       (user_id, name, name_normalized, default_unit, aisle, source)
     values ($1, $2, $3, $4, $5, $6)
     returning id, user_id, name, name_normalized, default_unit, aisle, source`,
    [userId, trimmed, norm, hints.unit ?? "", aisle, hints.source ?? "user"]
  );

  await syncAisleCache(norm, aisle);
  return rowToIngredient(inserted.rows[0]);
}

export async function listUserCatalog(
  userId: string
): Promise<readonly Ingredient[]> {
  if (!isUuid(userId)) return [];
  const db = getDb();
  const result = await db.query<IngredientRow>(
    `select id, user_id, name, name_normalized, default_unit, aisle, source
       from ingredients
      where user_id is null or user_id = $1
      order by user_id desc nulls last, name_normalized`,
    [userId]
  );
  return result.rows.map(rowToIngredient);
}
