"use client";

import { useState } from "react";
import { AIInputPanel } from "@/components/recipe-generator/AIInputPanel";
import { RecipeForm } from "@/components/recipe-form/RecipeForm";
import type { CreateRecipePayload } from "@/types/recipe";

export function RecipeGeneratorClient() {
  const [defaults, setDefaults] = useState<CreateRecipePayload | undefined>(
    undefined
  );
  // The RecipeForm reads its initial state once, so we remount it via key
  // when a new draft arrives — otherwise the form would keep stale state
  // from a previous "Generate" run.
  const [formKey, setFormKey] = useState(0);

  function handleGenerated(recipe: CreateRecipePayload): void {
    setDefaults(recipe);
    setFormKey((k) => k + 1);
  }

  return (
    <div className="space-y-8">
      <AIInputPanel onGenerated={handleGenerated} />

      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Review & save
        </h2>
        <p className="mt-1 mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Edit any field before saving. Saving uses the same flow as a
          manually-created recipe.
        </p>
        <RecipeForm key={formKey} defaults={defaults} />
      </div>
    </div>
  );
}
