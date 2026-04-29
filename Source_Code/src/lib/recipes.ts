import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import type { QueryRow } from "@/lib/db";
import { getOrCreateIngredient } from "@/lib/ingredients";
import type {
  CreateRecipePayload,
  Recipe,
  RecipeCategory,
} from "@/types/recipe";

export type UpdateRecipePayload = Partial<CreateRecipePayload>;

interface RecipeRow extends QueryRow {
  id: string;
  author_id: string;
  title: string;
  description: string;
  category: RecipeCategory;
  prep_time: number;
  cook_time: number;
  servings: number;
  image_url: string | null;
  ingredients: Recipe["ingredients"];
  instructions: Recipe["instructions"];
  tags: Recipe["tags"];
  created_at: string | Date;
}

function toRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    description: row.description,
    category: row.category,
    prepTime: row.prep_time,
    cookTime: row.cook_time,
    servings: row.servings,
    imageUrl: row.image_url,
    ingredients: row.ingredients,
    instructions: row.instructions,
    tags: row.tags,
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : row.created_at.toISOString(),
  };
}

const SELECT_COLUMNS =
  "id, author_id, title, description, category, prep_time, cook_time, servings, image_url, ingredients, instructions, tags, created_at";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

async function growCatalog(
  userId: string,
  ingredients: readonly { item: string; unit: string }[],
  source: "user" | "backfill" = "user"
): Promise<void> {
  for (const ing of ingredients) {
    const item = ing.item.trim();
    if (item.length === 0) continue;
    try {
      await getOrCreateIngredient(userId, item, {
        unit: ing.unit.trim(),
        source,
      });
    } catch {
      // Don't fail the recipe save if a single classification call hiccups.
    }
  }
}

export async function getAllRecipes(): Promise<readonly Recipe[]> {
  const db = getDb();
  const result = await db.query<RecipeRow>(
    `select ${SELECT_COLUMNS} from recipes order by created_at desc`
  );
  return result.rows.map(toRecipe);
}

export async function getRecipeById(id: string): Promise<Recipe | undefined> {
  // Guard against malformed UUIDs so callers get "not found" instead of a 500
  // from the Postgres uuid parser.
  if (!isUuid(id)) return undefined;

  const db = getDb();
  const result = await db.query<RecipeRow>(
    `select ${SELECT_COLUMNS} from recipes where id = $1 limit 1`,
    [id]
  );
  const row = result.rows[0];
  return row ? toRecipe(row) : undefined;
}

export async function getRecipesByAuthor(
  authorId: string
): Promise<readonly Recipe[]> {
  const db = getDb();
  const result = await db.query<RecipeRow>(
    `select ${SELECT_COLUMNS} from recipes
       where author_id = $1
       order by created_at desc`,
    [authorId]
  );
  return result.rows.map(toRecipe);
}

export async function createRecipe(
  authorId: string,
  payload: CreateRecipePayload
): Promise<Recipe> {
  const db = getDb();
  const id = randomUUID();
  const result = await db.query<RecipeRow>(
    `insert into recipes
       (id, author_id, title, description, category,
        prep_time, cook_time, servings,
        ingredients, instructions, tags)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb)
     returning ${SELECT_COLUMNS}`,
    [
      id,
      authorId,
      payload.title.trim(),
      payload.description.trim(),
      payload.category,
      payload.prepTime,
      payload.cookTime,
      payload.servings,
      JSON.stringify(payload.ingredients),
      JSON.stringify(payload.instructions),
      JSON.stringify(payload.tags),
    ]
  );
  const created = toRecipe(result.rows[0]);
  await growCatalog(authorId, payload.ingredients);
  return created;
}

export async function updateRecipe(
  id: string,
  payload: CreateRecipePayload
): Promise<Recipe | null> {
  if (!isUuid(id)) return null;

  const db = getDb();
  const result = await db.query<RecipeRow>(
    `update recipes
        set title = $1,
            description = $2,
            category = $3,
            prep_time = $4,
            cook_time = $5,
            servings = $6,
            ingredients = $7::jsonb,
            instructions = $8::jsonb,
            tags = $9::jsonb
      where id = $10
      returning ${SELECT_COLUMNS}`,
    [
      payload.title.trim(),
      payload.description.trim(),
      payload.category,
      payload.prepTime,
      payload.cookTime,
      payload.servings,
      JSON.stringify(payload.ingredients),
      JSON.stringify(payload.instructions),
      JSON.stringify(payload.tags),
      id,
    ]
  );
  const row = result.rows[0];
  if (!row) return null;
  const recipe = toRecipe(row);
  await growCatalog(recipe.authorId, payload.ingredients);
  return recipe;
}

export async function deleteRecipe(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;

  const db = getDb();
  const result = await db.query(
    `delete from recipes where id = $1`,
    [id]
  );
  return result.rowCount > 0;
}
