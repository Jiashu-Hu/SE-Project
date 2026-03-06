import Link from "next/link";
import type { Recipe } from "@/types/recipe";

const CATEGORY_COLORS: Record<string, string> = {
  Breakfast: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  Lunch: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Dinner: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Dessert: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  Snacks: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Other: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
};

interface RecipeCardProps {
  readonly recipe: Recipe;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const badgeColor = CATEGORY_COLORS[recipe.category] ?? CATEGORY_COLORS.Other;

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="group flex w-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white text-left transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950"
    >
      {/* Thumbnail Placeholder */}
      <div className="flex h-40 items-center justify-center bg-zinc-100 dark:bg-zinc-900">
        <svg
          className="h-12 w-12 text-zinc-300 dark:text-zinc-700"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>

      {/* Card Content */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-zinc-900 group-hover:text-orange-600 dark:text-zinc-50 dark:group-hover:text-orange-400">
            {recipe.title}
          </h3>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badgeColor}`}
          >
            {recipe.category}
          </span>
        </div>

        <div className="flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{recipe.prepTime} min</span>
        </div>
      </div>
    </Link>
  );
}
