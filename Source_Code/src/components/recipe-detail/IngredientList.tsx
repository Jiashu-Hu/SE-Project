import type { Ingredient } from "@/types/recipe";

interface IngredientListProps {
  readonly ingredients: readonly Ingredient[];
}

export function IngredientList({ ingredients }: IngredientListProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Ingredients
      </h2>
      <ul className="space-y-3">
        {ingredients.map((ingredient, index) => (
          <li
            key={index}
            className="flex items-start gap-3 text-zinc-700 dark:text-zinc-300"
          >
            <svg
              className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400 dark:text-zinc-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              <span className="font-medium">{ingredient.amount}</span>{" "}
              {ingredient.unit} {ingredient.item}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
