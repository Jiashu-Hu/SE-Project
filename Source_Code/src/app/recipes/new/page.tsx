import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { RecipeForm } from "@/components/recipe-form";

export const metadata: Metadata = {
  title: "New Recipe | RecipeBox",
};

export default async function NewRecipePage() {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-orange-600">
              Recipes
            </p>
            <h1 className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
              New recipe
            </h1>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
          >
            Back to dashboard
          </Link>
        </div>

        <Link
          href="/recipes/generate"
          className="mb-6 flex items-center justify-between rounded-2xl border border-orange-200 bg-orange-50/60 px-5 py-4 transition-colors hover:bg-orange-100/60 dark:border-orange-900/40 dark:bg-orange-950/30 dark:hover:bg-orange-950/50"
        >
          <div>
            <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">
              ✨ Generate with AI
            </p>
            <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
              Describe what you have or upload a photo — AI will fill the form for you.
            </p>
          </div>
          <span className="text-orange-600 dark:text-orange-400">→</span>
        </Link>

        <RecipeForm />
      </main>
    </div>
  );
}
