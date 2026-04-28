import { getDb } from "@/lib/db";
import type { QueryRow } from "@/lib/db";
import { sundayOf } from "@/lib/week";

export type MealType = "morning" | "noon" | "evening";

export const MEAL_TYPES: readonly MealType[] = ["morning", "noon", "evening"];

export interface MealPlanSlot {
  readonly id: string;
  readonly userId: string;
  readonly date: string;
  readonly mealType: MealType;
  readonly recipeId: string;
  readonly servings: number;
  readonly createdAt: string;
}

interface SlotRow extends QueryRow {
  id: string;
  user_id: string;
  date: string | Date;
  meal_type: MealType;
  recipe_id: string;
  servings: number;
  created_at: string | Date;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function toIsoDate(value: string | Date): string {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function toIsoTimestamp(value: string | Date): string {
  return typeof value === "string" ? value : value.toISOString();
}

function rowToSlot(row: SlotRow): MealPlanSlot {
  return {
    id: row.id,
    userId: row.user_id,
    date: toIsoDate(row.date),
    mealType: row.meal_type,
    recipeId: row.recipe_id,
    servings: row.servings,
    createdAt: toIsoTimestamp(row.created_at),
  };
}

const SELECT_COLUMNS =
  "id, user_id, date, meal_type, recipe_id, servings, created_at";

export async function listSlotsForWeek(
  userId: string,
  weekStart: string
): Promise<readonly MealPlanSlot[]> {
  if (!isUuid(userId)) return [];
  const weekEnd = sundayOf(weekStart);
  const db = getDb();
  const result = await db.query<SlotRow>(
    `select ${SELECT_COLUMNS}
       from meal_plan_slots
      where user_id = $1 and date >= $2 and date <= $3
      order by date, meal_type`,
    [userId, weekStart, weekEnd]
  );
  return result.rows.map(rowToSlot);
}

interface CreateSlotInput {
  readonly userId: string;
  readonly date: string;
  readonly mealType: MealType;
  readonly recipeId: string;
  readonly servings: number;
}

export async function createSlot(
  input: CreateSlotInput
): Promise<{ slot: MealPlanSlot } | { error: string }> {
  if (!isUuid(input.userId)) return { error: "Invalid user." };
  if (!isUuid(input.recipeId)) return { error: "Invalid recipe." };
  const db = getDb();
  try {
    const result = await db.query<SlotRow>(
      `insert into meal_plan_slots (user_id, date, meal_type, recipe_id, servings)
         values ($1, $2, $3, $4, $5)
         returning ${SELECT_COLUMNS}`,
      [input.userId, input.date, input.mealType, input.recipeId, input.servings]
    );
    return { slot: rowToSlot(result.rows[0]) };
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505") {
      return { error: "This slot is already filled." };
    }
    throw err;
  }
}

interface UpdateSlotInput {
  readonly slotId: string;
  readonly userId: string;
  readonly recipeId?: string;
  readonly servings?: number;
}

export async function updateSlot(
  input: UpdateSlotInput
): Promise<MealPlanSlot | null> {
  if (!isUuid(input.slotId) || !isUuid(input.userId)) return null;
  const sets: string[] = [];
  const values: unknown[] = [];
  if (input.recipeId !== undefined) {
    if (!isUuid(input.recipeId)) return null;
    values.push(input.recipeId);
    sets.push(`recipe_id = $${values.length}`);
  }
  if (input.servings !== undefined) {
    values.push(input.servings);
    sets.push(`servings = $${values.length}`);
  }
  if (sets.length === 0) return null;
  values.push(input.slotId);
  values.push(input.userId);
  const db = getDb();
  const result = await db.query<SlotRow>(
    `update meal_plan_slots
        set ${sets.join(", ")}
      where id = $${values.length - 1} and user_id = $${values.length}
      returning ${SELECT_COLUMNS}`,
    values
  );
  return result.rows[0] ? rowToSlot(result.rows[0]) : null;
}

export async function deleteSlot(
  slotId: string,
  userId: string
): Promise<boolean> {
  if (!isUuid(slotId) || !isUuid(userId)) return false;
  const db = getDb();
  const result = await db.query(
    `delete from meal_plan_slots where id = $1 and user_id = $2`,
    [slotId, userId]
  );
  return result.rowCount > 0;
}

export async function bulkUpdateServings(
  userId: string,
  weekStart: string,
  servings: number
): Promise<number> {
  if (!isUuid(userId)) return 0;
  if (!Number.isInteger(servings) || servings < 1) return 0;
  const weekEnd = sundayOf(weekStart);
  const db = getDb();
  const result = await db.query(
    `update meal_plan_slots
        set servings = $1
      where user_id = $2 and date >= $3 and date <= $4`,
    [servings, userId, weekStart, weekEnd]
  );
  return result.rowCount;
}
