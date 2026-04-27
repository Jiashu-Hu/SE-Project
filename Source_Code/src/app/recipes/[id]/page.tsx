import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getRecipeById } from "@/lib/recipes";
import {
  RecipeHero,
  IngredientList,
  InstructionList,
  RecipeMetadata,
  RecipeActions,
} from "@/components/recipe-detail";
import { getCurrentUserFromCookies } from "@/lib/auth-server";

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const recipe = await getRecipeById(id);

  if (!recipe) {
    return { title: "Recipe Not Found" };
  }

  return {
    title: `${recipe.title} | RecipeBox`,
    description: recipe.description,
  };
}

export default async function RecipeDetailPage({ params }: PageProps) {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const recipe = await getRecipeById(id);

  if (!recipe) {
    notFound();
  }

  const isOwner = recipe.authorId === user.id;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <RecipeHero recipe={recipe} />

        {isOwner && (
          <div className="mt-4">
            <RecipeActions recipeId={recipe.id} />
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <IngredientList ingredients={recipe.ingredients} />
          </div>
          <div className="space-y-6 lg:col-span-2">
            <InstructionList instructions={recipe.instructions} />
            <RecipeMetadata tags={recipe.tags} createdAt={recipe.createdAt} />
          </div>
        </div>
      </main>
    </div>
  );
}
