// Pure types + constants for meal-plan slots. Safe to import from client
// components — no DB / Node-only deps.

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
