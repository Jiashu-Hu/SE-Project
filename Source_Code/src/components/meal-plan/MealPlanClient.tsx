"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import type { MealPlanSlot, MealType } from "@/lib/meal-plan-types";
import type { Recipe } from "@/types/recipe";
import type { BucketItem } from "@/lib/bucket";
import { WeekNav } from "@/components/meal-plan/WeekNav";
import { DayColumn } from "@/components/meal-plan/DayColumn";
import { ServingsControls } from "@/components/meal-plan/ServingsControls";
import { RecipePickerModal } from "@/components/meal-plan/RecipePickerModal";
import { BucketFab } from "@/components/bucket/BucketFab";
import { BucketDrawer } from "@/components/bucket/BucketDrawer";

interface MealPlanClientProps {
  readonly weekStart: string;
  readonly initialSlots: readonly MealPlanSlot[];
  readonly allRecipes: readonly Recipe[];
}

function buildWeekDates(weekStart: string): readonly string[] {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function MealPlanClient({ weekStart, initialSlots, allRecipes }: MealPlanClientProps) {
  const [slots, setSlots] = useState<readonly MealPlanSlot[]>(initialSlots);
  const [pickerTarget, setPickerTarget] = useState<{ date: string; mealType: MealType } | null>(null);
  const [defaultServings, setDefaultServings] = useState(4);
  const [bucketItems, setBucketItems] = useState<readonly BucketItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const recipesById = useMemo(() => {
    const m = new Map<string, Recipe>();
    for (const r of allRecipes) m.set(r.id, r);
    return m;
  }, [allRecipes]);

  const bucketRecipes = useMemo(
    () =>
      bucketItems
        .map((it) => recipesById.get(it.recipeId))
        .filter((r): r is Recipe => r !== undefined),
    [bucketItems, recipesById]
  );

  const dates = useMemo(() => buildWeekDates(weekStart), [weekStart]);

  useEffect(() => {
    void fetch("/api/bucket")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((b) => setBucketItems(b.items ?? []))
      .catch(() => {});
  }, []);

  function slotsForDate(date: string): readonly MealPlanSlot[] {
    return slots.filter((s) => s.date === date);
  }

  function handleAdd(date: string, mealType: MealType): void {
    setPickerTarget({ date, mealType });
  }

  async function handleSelectRecipe(recipe: Recipe): Promise<void> {
    if (!pickerTarget) return;
    const res = await fetch("/api/meal-plan/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: pickerTarget.date,
        mealType: pickerTarget.mealType,
        recipeId: recipe.id,
        servings: defaultServings,
      }),
    });
    if (res.ok) {
      const body = await res.json();
      setSlots([...slots, body.slot]);
    }
    setPickerTarget(null);
  }

  function handleUpdated(updated: MealPlanSlot): void {
    setSlots(slots.map((s) => (s.id === updated.id ? updated : s)));
  }

  function handleDeleted(id: string): void {
    setSlots(slots.filter((s) => s.id !== id));
  }

  function handleAppliedDefault(servings: number): void {
    setSlots(slots.map((s) => ({ ...s, servings })));
    setDefaultServings(servings);
  }

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    const overId = event.over?.id?.toString();
    const activeId = event.active.id.toString();
    if (!overId || !activeId.startsWith("bucket-item:") || !overId.startsWith("slot:")) return;

    const recipeId = (event.active.data.current as { recipeId?: string } | undefined)?.recipeId;
    const slotData = event.over?.data.current as { date?: string; mealType?: MealType } | undefined;
    if (!recipeId || !slotData?.date || !slotData?.mealType) return;

    const res = await fetch("/api/meal-plan/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: slotData.date,
        mealType: slotData.mealType,
        recipeId,
        servings: defaultServings,
      }),
    });
    if (res.ok) {
      const body = await res.json();
      setSlots([...slots, body.slot]);
    }
    // Bucket item stays in bucket either way (wishlist behavior).
  }

  async function handleBucketRemove(recipeId: string): Promise<void> {
    const res = await fetch(`/api/bucket/${recipeId}`, { method: "DELETE" });
    if (res.ok) setBucketItems(bucketItems.filter((i) => i.recipeId !== recipeId));
  }

  return (
    <DndContext onDragEnd={(e) => void handleDragEnd(e)}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <WeekNav weekStart={weekStart} />
        <ServingsControls weekStart={weekStart} onApplied={handleAppliedDefault} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-7">
        {dates.map((d) => (
          <DayColumn
            key={d}
            date={d}
            slots={slotsForDate(d)}
            recipesById={recipesById}
            onAdd={handleAdd}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
          />
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <Link
          href={`/meal-plan/shopping?week=${weekStart}`}
          className="rounded-lg bg-orange-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-700"
        >
          Generate shopping list
        </Link>
      </div>

      <RecipePickerModal
        open={pickerTarget !== null}
        recipes={allRecipes}
        bucketRecipes={bucketRecipes}
        onSelect={(r) => void handleSelectRecipe(r)}
        onClose={() => setPickerTarget(null)}
      />

      <BucketFab
        count={bucketItems.length}
        isOpen={drawerOpen}
        onClick={() => setDrawerOpen(!drawerOpen)}
      />
      <BucketDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={bucketItems}
        recipesById={recipesById}
        draggable={true}
        onRemove={(recipeId) => void handleBucketRemove(recipeId)}
      />
    </DndContext>
  );
}
