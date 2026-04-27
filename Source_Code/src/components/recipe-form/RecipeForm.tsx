"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CATEGORIES } from "@/types/recipe";
import type { CreateRecipePayload, Ingredient, Recipe, RecipeCategory } from "@/types/recipe";

interface IngredientRow {
  readonly amount: string;
  readonly unit: string;
  readonly item: string;
}

export interface RecipeFormProps {
  /** When provided the form PATCHes the existing recipe instead of POSTing a new one. */
  readonly existingRecipe?: Recipe;
}

const RECIPE_CATEGORIES = CATEGORIES.filter((c) => c !== "All") as RecipeCategory[];

const EMPTY_INGREDIENT: IngredientRow = { amount: "", unit: "", item: "" };

function toRows(ingredients: readonly Ingredient[]): readonly IngredientRow[] {
  return ingredients.length > 0 ? ingredients : [EMPTY_INGREDIENT];
}

function buildPayload(
  title: string,
  description: string,
  category: RecipeCategory,
  prepTime: string,
  cookTime: string,
  servings: string,
  ingredients: readonly IngredientRow[],
  instructions: readonly string[],
  tagsRaw: string
): CreateRecipePayload {
  return {
    title: title.trim(),
    description: description.trim(),
    category,
    prepTime: parseInt(prepTime, 10) || 0,
    cookTime: parseInt(cookTime, 10) || 0,
    servings: parseInt(servings, 10) || 1,
    ingredients: ingredients
      .filter((ing) => ing.item.trim().length > 0)
      .map((ing): Ingredient => ({
        amount: ing.amount.trim(),
        unit: ing.unit.trim(),
        item: ing.item.trim(),
      })),
    instructions: instructions.map((s) => s.trim()).filter((s) => s.length > 0),
    tags: tagsRaw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0),
  };
}

export function RecipeForm({ existingRecipe }: RecipeFormProps) {
  const router = useRouter();
  const isEditing = existingRecipe !== undefined;

  const [title, setTitle] = useState(existingRecipe?.title ?? "");
  const [description, setDescription] = useState(existingRecipe?.description ?? "");
  const [category, setCategory] = useState<RecipeCategory>(existingRecipe?.category ?? "Dinner");
  const [prepTime, setPrepTime] = useState(existingRecipe ? String(existingRecipe.prepTime) : "");
  const [cookTime, setCookTime] = useState(existingRecipe ? String(existingRecipe.cookTime) : "");
  const [servings, setServings] = useState(existingRecipe ? String(existingRecipe.servings) : "");
  const [ingredients, setIngredients] = useState<readonly IngredientRow[]>(
    existingRecipe ? toRows(existingRecipe.ingredients) : [EMPTY_INGREDIENT]
  );
  const [instructions, setInstructions] = useState<readonly string[]>(
    existingRecipe?.instructions.length ? existingRecipe.instructions : [""]
  );
  const [tagsRaw, setTagsRaw] = useState(existingRecipe?.tags.join(", ") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Ingredient helpers ---
  function updateIngredient(index: number, field: keyof IngredientRow, value: string): void {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing))
    );
  }

  function addIngredient(): void {
    setIngredients((prev) => [...prev, EMPTY_INGREDIENT]);
  }

  function removeIngredient(index: number): void {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  }

  // --- Instruction helpers ---
  function updateInstruction(index: number, value: string): void {
    setInstructions((prev) => prev.map((s, i) => (i === index ? value : s)));
  }

  function addInstruction(): void {
    setInstructions((prev) => [...prev, ""]);
  }

  function removeInstruction(index: number): void {
    setInstructions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const payload = buildPayload(
      title, description, category,
      prepTime, cookTime, servings,
      ingredients, instructions, tagsRaw
    );

    const url = isEditing ? `/api/recipes/${existingRecipe.id}` : "/api/recipes";
    const method = isEditing ? "PATCH" : "POST";

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as { error?: string; recipe?: { id: string } };

      if (!response.ok) {
        setError(body.error ?? "Failed to save recipe.");
        setIsSubmitting(false);
        return;
      }

      const recipeId = body.recipe?.id ?? existingRecipe?.id;
      router.push(recipeId ? `/recipes/${recipeId}` : "/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Basic info */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Basic info</h2>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="recipe-title" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="recipe-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={120}
              placeholder="e.g. Spaghetti Carbonara"
              className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div>
            <label htmlFor="recipe-description" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="recipe-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={3}
              placeholder="A short description of the recipe..."
              className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="recipe-category" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                id="recipe-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as RecipeCategory)}
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {RECIPE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="recipe-prep" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Prep time (min)
              </label>
              <input
                id="recipe-prep"
                type="number"
                min={0}
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <div>
              <label htmlFor="recipe-cook" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Cook time (min)
              </label>
              <input
                id="recipe-cook"
                type="number"
                min={0}
                value={cookTime}
                onChange={(e) => setCookTime(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <div>
              <label htmlFor="recipe-servings" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Servings
              </label>
              <input
                id="recipe-servings"
                type="number"
                min={1}
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                placeholder="4"
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor="recipe-tags" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Tags
            </label>
            <input
              id="recipe-tags"
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="quick, healthy, vegetarian (comma-separated)"
              className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
        </div>
      </section>

      {/* Ingredients */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Ingredients</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Add each ingredient with its amount and unit.</p>

        <div className="mt-4 space-y-2">
          {ingredients.map((ing, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={ing.amount}
                onChange={(e) => updateIngredient(index, "amount", e.target.value)}
                placeholder="1 1/2"
                aria-label={`Ingredient ${index + 1} amount`}
                className="w-20 shrink-0 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <input
                type="text"
                value={ing.unit}
                onChange={(e) => updateIngredient(index, "unit", e.target.value)}
                placeholder="cups"
                aria-label={`Ingredient ${index + 1} unit`}
                className="w-24 shrink-0 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <input
                type="text"
                value={ing.item}
                onChange={(e) => updateIngredient(index, "item", e.target.value)}
                placeholder="all-purpose flour"
                aria-label={`Ingredient ${index + 1} name`}
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={() => removeIngredient(index)}
                disabled={ingredients.length === 1}
                aria-label={`Remove ingredient ${index + 1}`}
                className="shrink-0 rounded-lg p-2 text-zinc-400 transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addIngredient}
          className="mt-3 text-sm font-medium text-orange-600 hover:text-orange-700"
        >
          + Add ingredient
        </button>
      </section>

      {/* Instructions */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Instructions</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">List each step in order.</p>

        <div className="mt-4 space-y-2">
          {instructions.map((step, index) => (
            <div key={index} className="flex items-start gap-3">
              <span className="mt-2 shrink-0 text-sm font-medium text-zinc-400">
                {index + 1}.
              </span>
              <textarea
                value={step}
                onChange={(e) => updateInstruction(index, e.target.value)}
                rows={2}
                placeholder={`Step ${index + 1}...`}
                aria-label={`Step ${index + 1}`}
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={() => removeInstruction(index)}
                disabled={instructions.length === 1}
                aria-label={`Remove step ${index + 1}`}
                className="mt-2 shrink-0 rounded-lg p-2 text-zinc-400 transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addInstruction}
          className="mt-3 text-sm font-medium text-orange-600 hover:text-orange-700"
        >
          + Add step
        </button>
      </section>

      {/* Submit */}
      {error && (
        <p className="text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-orange-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Saving..." : isEditing ? "Update recipe" : "Save recipe"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
