"use client";

import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { CategoryFilter } from "@/components/CategoryFilter";
import { RecipeGrid } from "@/components/RecipeGrid";
import { MOCK_RECIPES } from "@/data/mock-recipes";
import type { AuthUser } from "@/types/auth";
import type { Category, Recipe } from "@/types/recipe";

interface DashboardClientProps {
  readonly user: AuthUser;
}

function sortByNewest(recipes: readonly Recipe[]): readonly Recipe[] {
  return [...recipes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function filterRecipes(
  recipes: readonly Recipe[],
  category: Category,
  search: string
): readonly Recipe[] {
  return recipes.filter((recipe) => {
    const matchesCategory = category === "All" || recipe.category === category;
    const matchesSearch =
      search.trim() === "" ||
      recipe.title.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });
}

export function DashboardClient({ user }: DashboardClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category>("All");

  const filteredRecipes = useMemo(
    () => sortByNewest(filterRecipes(MOCK_RECIPES, selectedCategory, searchQuery)),
    [selectedCategory, searchQuery]
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        userName={user.name}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <CategoryFilter selected={selectedCategory} onSelect={setSelectedCategory} />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {filteredRecipes.length} recipe{filteredRecipes.length !== 1 ? "s" : ""}
          </p>
        </div>

        <RecipeGrid recipes={filteredRecipes} />
      </main>
    </div>
  );
}
