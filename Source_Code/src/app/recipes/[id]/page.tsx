import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getRecipeById, getAllRecipeIds } from "@/lib/recipes";
import {
  RecipeHero,
  IngredientList,
  InstructionList,
  RecipeMetadata,
} from "@/components/recipe-detail";
import { getCurrentUserFromCookies } from "@/lib/auth-server";

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  return getAllRecipeIds().map((id) => ({
    id,
  }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const recipe = getRecipeById(id);

  if (!recipe) {
    return {
      title: "Recipe Not Found",
    };
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
  const recipe = getRecipeById(id);

  if (!recipe) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <RecipeHero recipe={recipe} />

        {/* Main Content Grid */}
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {/* Left Column - Ingredients */}
          <div className="lg:col-span-1">
            <IngredientList ingredients={recipe.ingredients} />
          </div>

          {/* Right Column - Instructions & Metadata */}
          <div className="space-y-6 lg:col-span-2">
            <InstructionList instructions={recipe.instructions} />
            <RecipeMetadata tags={recipe.tags} createdAt={recipe.createdAt} />
          </div>
        </div>
      </main>
    </div>
  );
}
