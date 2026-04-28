"use client";

import type { MealPlanSlot, MealType } from "@/lib/meal-plan";
import { MEAL_TYPES } from "@/lib/meal-plan";
import type { Recipe } from "@/types/recipe";
import { EmptySlot } from "@/components/meal-plan/EmptySlot";
import { MealSlotCard } from "@/components/meal-plan/MealSlotCard";

interface DayColumnProps {
  readonly date: string; // YYYY-MM-DD
  readonly slots: readonly MealPlanSlot[]; // already filtered to this date
  readonly recipesById: ReadonlyMap<string, Recipe>;
  readonly onAdd: (date: string, mealType: MealType) => void;
  readonly onUpdated: (slot: MealPlanSlot) => void;
  readonly onDeleted: (slotId: string) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const idx = (d.getUTCDay() + 6) % 7; // Mon=0, ..., Sun=6
  return `${WEEKDAYS[idx]} ${d.getUTCDate()}`;
}

export function DayColumn(props: DayColumnProps) {
  const slotByType = new Map<MealType, MealPlanSlot>();
  for (const s of props.slots) slotByType.set(s.mealType, s);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        {dayLabel(props.date)}
      </h3>
      {MEAL_TYPES.map((type) => {
        const slot = slotByType.get(type);
        if (slot) {
          return (
            <MealSlotCard
              key={type}
              slot={slot}
              recipe={props.recipesById.get(slot.recipeId)}
              onUpdated={props.onUpdated}
              onDeleted={props.onDeleted}
            />
          );
        }
        return (
          <EmptySlot
            key={type}
            mealType={type}
            onAdd={() => props.onAdd(props.date, type)}
          />
        );
      })}
    </div>
  );
}
