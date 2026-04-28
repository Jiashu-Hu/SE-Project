"use client";

import { useMemo, useState } from "react";
import type { Recipe } from "@/types/recipe";

interface RecipePickerModalProps {
  readonly open: boolean;
  readonly recipes: readonly Recipe[];
  readonly onSelect: (recipe: Recipe) => void;
  readonly onClose: () => void;
}

export function RecipePickerModal({ open, recipes, onSelect, onClose }: RecipePickerModalProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((r) =>
      r.title.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [recipes, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 py-12"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Pick a recipe
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your recipes..."
          autoFocus
          className="mt-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />

        <ul className="mt-4 max-h-96 space-y-1 overflow-y-auto">
          {filtered.length === 0 && (
            <li className="py-4 text-center text-sm text-zinc-500">
              {recipes.length === 0
                ? "You don't have any recipes yet. Create one first."
                : "No matches."}
            </li>
          )}
          {filtered.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r)}
                className="block w-full rounded-lg border border-transparent px-3 py-2 text-left hover:border-orange-200 hover:bg-orange-50 dark:hover:border-orange-900/40 dark:hover:bg-orange-950/30"
              >
                <p className="font-medium text-zinc-900 dark:text-zinc-50">{r.title}</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {r.category} · serves {r.servings} · {r.prepTime + r.cookTime} min
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
