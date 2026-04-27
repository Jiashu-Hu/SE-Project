import { CATEGORIES } from "@/types/recipe";
import type { CreateRecipePayload, Ingredient, RecipeCategory } from "@/types/recipe";

const RECIPE_CATEGORIES = CATEGORIES.filter((c) => c !== "All") as RecipeCategory[];

function isRecipeCategory(value: unknown): value is RecipeCategory {
  return RECIPE_CATEGORIES.includes(value as RecipeCategory);
}

function validateIngredient(value: unknown): value is Ingredient {
  if (!value || typeof value !== "object") return false;
  const ing = value as Record<string, unknown>;
  return (
    typeof ing.amount === "string" &&
    typeof ing.unit === "string" &&
    typeof ing.item === "string" &&
    ing.item.trim().length > 0
  );
}

export function validateCreateRecipePayload(
  value: unknown
): { valid: true; payload: CreateRecipePayload } | { valid: false; error: string } {
  if (!value || typeof value !== "object") {
    return { valid: false, error: "Invalid request body." };
  }

  const body = value as Record<string, unknown>;

  if (typeof body.title !== "string" || body.title.trim().length === 0) {
    return { valid: false, error: "Title is required." };
  }
  if (body.title.trim().length > 120) {
    return { valid: false, error: "Title must be 120 characters or fewer." };
  }

  if (typeof body.description !== "string" || body.description.trim().length === 0) {
    return { valid: false, error: "Description is required." };
  }

  if (!isRecipeCategory(body.category)) {
    return { valid: false, error: "Invalid category." };
  }

  if (typeof body.prepTime !== "number" || body.prepTime < 0 || !Number.isInteger(body.prepTime)) {
    return { valid: false, error: "Prep time must be a non-negative integer (minutes)." };
  }

  if (typeof body.cookTime !== "number" || body.cookTime < 0 || !Number.isInteger(body.cookTime)) {
    return { valid: false, error: "Cook time must be a non-negative integer (minutes)." };
  }

  if (typeof body.servings !== "number" || body.servings < 1 || !Number.isInteger(body.servings)) {
    return { valid: false, error: "Servings must be a positive integer." };
  }

  if (!Array.isArray(body.ingredients) || body.ingredients.length === 0) {
    return { valid: false, error: "At least one ingredient is required." };
  }
  for (const ing of body.ingredients) {
    if (!validateIngredient(ing)) {
      return { valid: false, error: "Each ingredient must have an amount, unit, and item." };
    }
  }

  if (!Array.isArray(body.instructions) || body.instructions.length === 0) {
    return { valid: false, error: "At least one instruction step is required." };
  }
  for (const step of body.instructions) {
    if (typeof step !== "string" || step.trim().length === 0) {
      return { valid: false, error: "Each instruction step must be a non-empty string." };
    }
  }

  const tags = Array.isArray(body.tags)
    ? (body.tags as unknown[]).filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : [];

  return {
    valid: true,
    payload: {
      title: (body.title as string).trim(),
      description: (body.description as string).trim(),
      category: body.category as RecipeCategory,
      prepTime: body.prepTime as number,
      cookTime: body.cookTime as number,
      servings: body.servings as number,
      ingredients: body.ingredients as Ingredient[],
      instructions: (body.instructions as string[]).map((s) => s.trim()),
      tags,
    },
  };
}
