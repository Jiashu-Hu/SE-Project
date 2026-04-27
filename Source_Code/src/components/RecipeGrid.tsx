import Link from "next/link";
import type { Recipe } from "@/types/recipe";
import { RecipeCard } from "./RecipeCard";

interface RecipeGridProps {
  readonly recipes: readonly Recipe[];
  readonly totalRecipes: number;
}

export function RecipeGrid({ recipes, totalRecipes }: RecipeGridProps) {
  if (recipes.length === 0) {
    const isFiltered = totalRecipes > 0;

    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-zinc-300 py-20 dark:border-zinc-700">
        <span className="text-5xl" aria-hidden="true">
          {isFiltered ? "🔍" : "📖"}
        </span>
        <p className="text-lg font-medium text-zinc-600 dark:text-zinc-400">
          {isFiltered ? "No recipes match your search" : "No recipes yet"}
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          {isFiltered
            ? "Try adjusting your filters or search term."
            : "Get started by adding your first recipe."}
        </p>
        {!isFiltered && (
          <Link
            href="/recipes/new"
            className="mt-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700"
          >
            + Add Recipe
          </Link>
        )}
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
