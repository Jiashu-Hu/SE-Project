import { MOCK_RECIPES } from "@/data/mock-recipes";
import type { Recipe } from "@/types/recipe";

export function getRecipeById(id: string): Recipe | undefined {
  return MOCK_RECIPES.find((recipe) => recipe.id === id);
}

export function getAllRecipeIds(): readonly string[] {
  return MOCK_RECIPES.map((recipe) => recipe.id);
}
