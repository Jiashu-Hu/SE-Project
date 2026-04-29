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
