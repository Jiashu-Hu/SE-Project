"use client";

import type { MealType } from "@/lib/meal-plan";

const LABELS: Record<MealType, string> = {
  morning: "Morning",
  noon: "Noon",
  evening: "Evening",
};

interface EmptySlotProps {
  readonly mealType: MealType;
  readonly onAdd: () => void;
}

export function EmptySlot({ mealType, onAdd }: EmptySlotProps) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex w-full items-center justify-between rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-2 text-left text-sm text-zinc-500 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500 dark:hover:border-orange-900/60 dark:hover:bg-orange-950/30 dark:hover:text-orange-400"
    >
      <span className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {LABELS[mealType]}
      </span>
      <span>+ Add meal</span>
    </button>
  );
}
