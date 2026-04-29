import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { listSlotsForWeek } from "@/lib/meal-plan";
import { getRecipeById } from "@/lib/recipes";
import { aggregateIngredients } from "@/lib/shopping-list";
import { classifyIngredients, AISLES } from "@/lib/ingredient-aisles";
import type { Aisle } from "@/lib/ingredient-aisles";
import type { AggregatedItem } from "@/lib/shopping-list";
import { currentWeekStart, mondayOf } from "@/lib/week";
import { listBucket } from "@/lib/bucket";
import { ShoppingListClient } from "@/components/shopping-list/ShoppingListClient";
import { EmptyBucketBanner } from "@/components/bucket/EmptyBucketBanner";

export const metadata: Metadata = { title: "Shopping List | RecipeBox" };

interface PageProps {
  readonly searchParams: Promise<{ week?: string }>;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ShoppingListPage({ searchParams }: PageProps) {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const requested = sp.week && ISO_DATE_RE.test(sp.week) ? sp.week : null;
  const weekStart = requested ? mondayOf(new Date(`${requested}T00:00:00Z`)) : currentWeekStart();

  const [slots, bucket] = await Promise.all([
    listSlotsForWeek(user.id, weekStart),
    listBucket(user.id),
  ]);
  const bucketCount = bucket.length;
  const recipeIds = [...new Set(slots.map((s) => s.recipeId))];
  const recipeMap = new Map<string, Awaited<ReturnType<typeof getRecipeById>>>();
  for (const rid of recipeIds) recipeMap.set(rid, await getRecipeById(rid));

  const slotsWithRecipes = slots
    .map((s) => {
      const r = recipeMap.get(s.recipeId);
      return r ? { servings: s.servings, recipe: r } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const items = aggregateIngredients(slotsWithRecipes);
  const classification = await classifyIngredients(items.map((i) => i.item));

  const aisles: Partial<Record<Aisle, AggregatedItem[]>> = {};
  for (const item of items) {
    const aisle = classification[item.item.toLowerCase()] ?? "Other";
    if (!aisles[aisle]) aisles[aisle] = [];
    aisles[aisle]!.push(item);
  }
  const ordered: Partial<Record<Aisle, AggregatedItem[]>> = {};
  for (const a of AISLES) {
    if (aisles[a] && aisles[a]!.length > 0) {
      ordered[a] = [...aisles[a]!].sort((x, y) => x.item.localeCompare(y.item));
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Shopping List
          </h1>
          <Link
            href={`/meal-plan?week=${weekStart}`}
            className="text-sm text-orange-600 hover:underline"
          >
            ← Back to meal plan
          </Link>
        </div>
        <EmptyBucketBanner weekStart={weekStart} initialCount={bucketCount} />
        <ShoppingListClient weekStart={weekStart} aisles={ordered} />
      </main>
    </div>
  );
}
