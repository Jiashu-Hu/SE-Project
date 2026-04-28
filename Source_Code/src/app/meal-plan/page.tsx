import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { listSlotsForWeek } from "@/lib/meal-plan";
import { currentWeekStart, mondayOf } from "@/lib/week";
import { MealPlanClient } from "@/components/meal-plan/MealPlanClient";
import { getRecipesByAuthor } from "@/lib/recipes";

export const metadata: Metadata = { title: "Meal Plan | RecipeBox" };

interface PageProps {
  readonly searchParams: Promise<{ week?: string }>;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function MealPlanPage({ searchParams }: PageProps) {
  const user = await getCurrentUserFromCookies();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const requested = sp.week && ISO_DATE_RE.test(sp.week) ? sp.week : null;
  const weekStart = requested ? mondayOf(new Date(`${requested}T00:00:00Z`)) : currentWeekStart();

  const [slots, recipes] = await Promise.all([
    listSlotsForWeek(user.id, weekStart),
    getRecipesByAuthor(user.id),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          Meal Plan
        </h1>
        <MealPlanClient
          weekStart={weekStart}
          initialSlots={slots}
          allRecipes={recipes}
        />
      </main>
    </div>
  );
}
