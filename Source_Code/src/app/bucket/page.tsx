import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { listBucket } from "@/lib/bucket";
import { getRecipesByAuthor } from "@/lib/recipes";
import { BucketPageClient } from "@/components/bucket/BucketPageClient";

export const metadata: Metadata = { title: "Bucket | RecipeBox" };

export default async function BucketPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect("/login");

  const [items, allRecipes] = await Promise.all([
    listBucket(user.id),
    getRecipesByAuthor(user.id),
  ]);

  const bucketRecipeIds = new Set(items.map((i) => i.recipeId));

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          Bucket
        </h1>
        <BucketPageClient
          initialItems={items}
          allRecipes={allRecipes}
          initialBucketRecipeIds={Array.from(bucketRecipeIds)}
        />
      </main>
    </div>
  );
}
