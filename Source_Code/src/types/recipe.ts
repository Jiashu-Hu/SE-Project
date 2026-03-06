export const CATEGORIES = [
  "All",
  "Breakfast",
  "Lunch",
  "Dinner",
  "Dessert",
  "Snacks",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Ingredient {
  readonly amount: string;
  readonly unit: string;
  readonly item: string;
}

export interface Recipe {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: Exclude<Category, "All">;
  readonly prepTime: number;
  readonly cookTime: number;
  readonly servings: number;
  readonly imageUrl: string | null;
  readonly ingredients: readonly Ingredient[];
  readonly instructions: readonly string[];
  readonly tags: readonly string[];
  readonly createdAt: string;
}
