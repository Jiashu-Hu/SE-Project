"use client";

import { useState, useTransition } from "react";
import type { MealPlanSlot, MealType } from "@/lib/meal-plan-types";
import type { Recipe } from "@/types/recipe";

const LABELS: Record<MealType, string> = {
  morning: "Morning",
  noon: "Noon",
  evening: "Evening",
};

interface MealSlotCardProps {
  readonly slot: MealPlanSlot;
  readonly recipe: Recipe | undefined;
  readonly onUpdated: (slot: MealPlanSlot) => void;
  readonly onDeleted: (slotId: string) => void;
}

export function MealSlotCard({ slot, recipe, onUpdated, onDeleted }: MealSlotCardProps) {
  const [servings, setServings] = useState(slot.servings);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleServingsChange(value: number): void {
    if (!Number.isInteger(value) || value < 1) return;
    setServings(value);
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/meal-plan/slots/${slot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servings: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not update servings.");
        setServings(slot.servings);
        return;
      }
      const body = await res.json();
      onUpdated(body.slot);
    });
  }

  function handleDelete(): void {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/meal-plan/slots/${slot.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not delete.");
        return;
      }
      onDeleted(slot.id);
    });
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {LABELS[slot.mealType]}
        </span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          aria-label="Delete slot"
          className="text-zinc-400 hover:text-red-600 disabled:opacity-50"
        >
          ×
        </button>
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {recipe?.title ?? "(deleted recipe)"}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <label className="text-xs text-zinc-500 dark:text-zinc-400">Servings</label>
        <input
          type="number"
          min={1}
          value={servings}
          onChange={(e) => handleServingsChange(parseInt(e.target.value, 10) || 1)}
          disabled={isPending}
          className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
