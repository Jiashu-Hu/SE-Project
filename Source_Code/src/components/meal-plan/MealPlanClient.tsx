"use client";

import type { MealPlanSlot } from "@/lib/meal-plan";
import type { Recipe } from "@/types/recipe";

interface MealPlanClientProps {
  readonly weekStart: string;
  readonly initialSlots: readonly MealPlanSlot[];
  readonly allRecipes: readonly Recipe[];
}

export function MealPlanClient({ weekStart, initialSlots, allRecipes }: MealPlanClientProps) {
  return (
    <div className="text-sm text-zinc-700 dark:text-zinc-300">
      Week of {weekStart} — {initialSlots.length} slot(s), {allRecipes.length} recipe(s)
    </div>
  );
}
