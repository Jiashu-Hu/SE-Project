import type { Recipe } from "@/types/recipe";
import { RecipeCard } from "./RecipeCard";

interface RecipeGridProps {
  readonly recipes: readonly Recipe[];
}

export function RecipeGrid({ recipes }: RecipeGridProps) {
  if (recipes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-zinc-300 py-20 dark:border-zinc-700">
        <span className="text-5xl" aria-hidden="true">
          📖
        </span>
        <p className="text-lg font-medium text-zinc-600 dark:text-zinc-400">
          No recipes yet
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          Add your first recipe!
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {recipes.map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} />
      ))}
    </div>
  );
}
