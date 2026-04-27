import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { getRecipeById } from "@/lib/recipes";
import { RecipeForm } from "@/components/recipe-form";

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const recipe = await getRecipeById(id);
  return {
    title: recipe ? `Edit ${recipe.title} | RecipeBox` : "Edit Recipe | RecipeBox",
  };
}

export default async function EditRecipePage({ params }: PageProps) {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const recipe = await getRecipeById(id);

  if (!recipe) {
    notFound();
  }

  if (recipe.authorId !== user.id) {
    redirect(`/recipes/${id}`);
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
              Edit recipe
            </h1>
          </div>
          <Link
            href={`/recipes/${id}`}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
          >
            Back to recipe
          </Link>
        </div>

        <RecipeForm existingRecipe={recipe} />
      </main>
    </div>
  );
}
