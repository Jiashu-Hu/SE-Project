import Link from "next/link";
import Image from "next/image";
import type { Recipe } from "@/types/recipe";

const CATEGORY_COLORS: Record<string, string> = {
  Breakfast: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  Lunch: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Dinner: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Dessert: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  Snacks: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Other: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
};

interface RecipeHeroProps {
  readonly recipe: Recipe;
}

export function RecipeHero({ recipe }: RecipeHeroProps) {
  const badgeColor = CATEGORY_COLORS[recipe.category] ?? CATEGORY_COLORS.Other;
  const totalTime = recipe.prepTime + recipe.cookTime;

  return (
    <div className="w-full">
      {/* Back Button */}
      <div className="mb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
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
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to recipes
        </Link>
      </div>

      {/* Hero Image */}
      <div className="relative mb-6 flex h-64 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900 sm:h-80 lg:h-96">
        {recipe.imageUrl ? (
          <Image
            src={recipe.imageUrl}
            alt={recipe.title}
            fill
            className="object-cover"
          />
        ) : (
          <svg
            className="h-20 w-20 text-zinc-300 dark:text-zinc-700"
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
        )}
      </div>

      {/* Recipe Header */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            {recipe.title}
          </h1>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${badgeColor}`}
          >
            {recipe.category}
          </span>
        </div>

        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          {recipe.description}
        </p>

        {/* Recipe Meta Info */}
        <div className="flex flex-wrap gap-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-zinc-500 dark:text-zinc-400"
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
            <div className="text-sm">
              <span className="font-medium text-zinc-900 dark:text-zinc-50">
                Prep:{" "}
              </span>
              <span className="text-zinc-600 dark:text-zinc-400">
                {recipe.prepTime} min
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-zinc-500 dark:text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"
              />
            </svg>
            <div className="text-sm">
              <span className="font-medium text-zinc-900 dark:text-zinc-50">
                Cook:{" "}
              </span>
              <span className="text-zinc-600 dark:text-zinc-400">
                {recipe.cookTime} min
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-zinc-500 dark:text-zinc-400"
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
            <div className="text-sm">
              <span className="font-medium text-zinc-900 dark:text-zinc-50">
                Total:{" "}
              </span>
              <span className="text-zinc-600 dark:text-zinc-400">
                {totalTime} min
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-zinc-500 dark:text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <div className="text-sm">
              <span className="font-medium text-zinc-900 dark:text-zinc-50">
                Servings:{" "}
              </span>
              <span className="text-zinc-600 dark:text-zinc-400">
                {recipe.servings}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
