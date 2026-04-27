import { randomUUID } from "node:crypto";
import { MOCK_RECIPES } from "@/data/mock-recipes";
import type { CreateRecipePayload, Recipe } from "@/types/recipe";

export type UpdateRecipePayload = Partial<CreateRecipePayload>;

const SEED_AUTHOR_ID = "seed-test-user";

interface RecipeStore {
  readonly recipesById: Map<string, Recipe>;
}

const globalForRecipes = globalThis as typeof globalThis & {
  recipeStore?: RecipeStore;
};

function getRecipeStore(): RecipeStore {
  if (!globalForRecipes.recipeStore) {
    const recipesById = new Map<string, Recipe>();

    for (const recipe of MOCK_RECIPES) {
      const seeded: Recipe = { ...recipe, authorId: SEED_AUTHOR_ID };
      recipesById.set(seeded.id, seeded);
    }

    globalForRecipes.recipeStore = { recipesById };
  }

  return globalForRecipes.recipeStore;
}

export function getAllRecipes(): readonly Recipe[] {
  return Array.from(getRecipeStore().recipesById.values());
}

export function getRecipesByAuthor(authorId: string): readonly Recipe[] {
  return Array.from(getRecipeStore().recipesById.values()).filter(
    (recipe) => recipe.authorId === authorId
  );
}

export function getRecipeById(id: string): Recipe | undefined {
  return getRecipeStore().recipesById.get(id);
}

export function createRecipe(
  authorId: string,
  payload: CreateRecipePayload
): Recipe {
  const now = new Date().toISOString();
  const recipe: Recipe = {
    id: randomUUID(),
    authorId,
    title: payload.title.trim(),
    description: payload.description.trim(),
    category: payload.category,
    prepTime: payload.prepTime,
    cookTime: payload.cookTime,
    servings: payload.servings,
    imageUrl: null,
    ingredients: payload.ingredients,
    instructions: payload.instructions,
    tags: payload.tags,
    createdAt: now,
  };

  getRecipeStore().recipesById.set(recipe.id, recipe);
  return recipe;
}

export function updateRecipe(
  id: string,
  payload: CreateRecipePayload
): Recipe | null {
  const store = getRecipeStore();
  const existing = store.recipesById.get(id);

  if (!existing) {
    return null;
  }

  const updated: Recipe = {
    ...existing,
    title: payload.title.trim(),
    description: payload.description.trim(),
    category: payload.category,
    prepTime: payload.prepTime,
    cookTime: payload.cookTime,
    servings: payload.servings,
    ingredients: payload.ingredients,
    instructions: payload.instructions,
    tags: payload.tags,
  };

  store.recipesById.set(id, updated);
  return updated;
}

export function deleteRecipe(id: string): boolean {
  return getRecipeStore().recipesById.delete(id);
}
