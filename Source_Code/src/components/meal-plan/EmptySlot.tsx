"use client";

import { useDroppable } from "@dnd-kit/core";
import type { MealType } from "@/lib/meal-plan-types";

const LABELS: Record<MealType, string> = {
  morning: "Morning",
  noon: "Noon",
  evening: "Evening",
};

interface EmptySlotProps {
  readonly date: string;
  readonly mealType: MealType;
  readonly onAdd: () => void;
}

export function EmptySlot({ date, mealType, onAdd }: EmptySlotProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `slot:${date}:${mealType}`,
    data: { date, mealType },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onAdd}
      className={`flex w-full items-center justify-between rounded-lg border border-dashed px-3 py-2 text-left text-sm transition-colors ${
        isOver
          ? "border-orange-500 bg-orange-100 text-orange-800 dark:border-orange-400 dark:bg-orange-950/50 dark:text-orange-200"
          : "border-zinc-300 bg-white text-zinc-500 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500 dark:hover:border-orange-900/60 dark:hover:bg-orange-950/30 dark:hover:text-orange-400"
      }`}
    >
      <span className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {LABELS[mealType]}
      </span>
      <span>+ Add meal</span>
    </button>
  );
}
