"use client";

import { useEffect, useMemo, useState } from "react";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { Header } from "@/components/Header";
import { CategoryFilter } from "@/components/CategoryFilter";
import { RecipeGrid } from "@/components/RecipeGrid";
import { BucketFab } from "@/components/bucket/BucketFab";
import { BucketDrawer } from "@/components/bucket/BucketDrawer";
import type { BucketItem } from "@/lib/bucket";
import type { AuthUser } from "@/types/auth";
import type { Category, Recipe } from "@/types/recipe";

interface DashboardClientProps {
  readonly user: AuthUser;
  readonly recipes: readonly Recipe[];
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

export function DashboardClient({ user, recipes }: DashboardClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category>("All");
  const [bucketItems, setBucketItems] = useState<readonly BucketItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filteredRecipes = useMemo(
    () => sortByNewest(filterRecipes(recipes, selectedCategory, searchQuery)),
    [recipes, selectedCategory, searchQuery]
  );

  useEffect(() => {
    void fetch("/api/bucket")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((b) => setBucketItems(b.items ?? []))
      .catch(() => {});
  }, []);

  async function handleDragEnd(event: DragEndEvent) {
    if (event.over?.id !== "bucket") return;
    const recipeId = (event.active.data.current as { recipeId?: string })
      ?.recipeId;
    if (!recipeId) return;
    const res = await fetch("/api/bucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId }),
    });
    if (res.ok) {
      const body = await res.json();
      setBucketItems([body.item, ...bucketItems]);
    }
    // 409 (already in bucket) and other errors: silent — user gets visual feedback via the drawer count
  }

  async function handleRemove(recipeId: string) {
    const res = await fetch(`/api/bucket/${recipeId}`, { method: "DELETE" });
    if (res.ok) {
      setBucketItems(bucketItems.filter((i) => i.recipeId !== recipeId));
    }
  }

  const recipesById = useMemo(
    () => new Map(recipes.map((r) => [r.id, r])),
    [recipes]
  );

  return (
    <DndContext onDragEnd={handleDragEnd}>
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

          <RecipeGrid recipes={filteredRecipes} totalRecipes={recipes.length} draggable />
        </main>
      </div>
      <BucketFab
        count={bucketItems.length}
        isOpen={drawerOpen}
        onClick={() => setDrawerOpen(!drawerOpen)}
      />
      <BucketDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={bucketItems}
        recipesById={recipesById}
        draggable={false}
        onRemove={handleRemove}
      />
    </DndContext>
  );
}
