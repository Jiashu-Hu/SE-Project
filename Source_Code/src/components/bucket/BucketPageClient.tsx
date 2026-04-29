"use client";

import type { BucketItem } from "@/lib/bucket";
import type { Recipe } from "@/types/recipe";

interface BucketPageClientProps {
  readonly initialItems: readonly BucketItem[];
  readonly allRecipes: readonly Recipe[];
  readonly initialBucketRecipeIds: readonly string[];
}

export function BucketPageClient({
  initialItems,
  allRecipes,
  initialBucketRecipeIds,
}: BucketPageClientProps) {
  return (
    <div className="text-sm text-zinc-700 dark:text-zinc-300">
      Bucket has {initialItems.length} item(s); user has {allRecipes.length} recipe(s); already-in-bucket count {initialBucketRecipeIds.length}
    </div>
  );
}
