"use client";

import { useEffect, useState } from "react";
import type { Aisle } from "@/lib/ingredient-aisles";
import type { AggregatedItem } from "@/lib/shopping-list";

interface ShoppingListClientProps {
  readonly weekStart: string;
  readonly aisles: Partial<Record<Aisle, AggregatedItem[]>>;
}

function storageKey(weekStart: string): string {
  return `mealplan-checks-${weekStart}`;
}

function itemKey(aisle: string, item: AggregatedItem): string {
  return `${aisle}|${item.item.toLowerCase()}|${item.unit.toLowerCase()}`;
}

export function ShoppingListClient({ weekStart, aisles }: ShoppingListClientProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // Load from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(weekStart));
      if (raw) setChecked(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, [weekStart]);

  // Persist whenever state changes.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(weekStart), JSON.stringify(checked));
    } catch {
      // ignore (quota exceeded, private mode, etc.)
    }
  }, [weekStart, checked]);

  function toggle(key: string): void {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const aisleNames = Object.keys(aisles) as Aisle[];
  const totalItems = aisleNames.reduce((n, a) => n + (aisles[a]?.length ?? 0), 0);

  if (totalItems === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
        No items. Plan some meals on the meal-plan page first.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {aisleNames.map((aisle) => (
        <section key={aisle}>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {aisle}
          </h2>
          <ul className="mt-2 space-y-1">
            {(aisles[aisle] ?? []).map((item) => {
              const k = itemKey(aisle, item);
              const isChecked = !!checked[k];
              return (
                <li key={k}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(k)}
                      className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
                    />
                    <span
                      className={`text-sm ${
                        isChecked
                          ? "text-zinc-400 line-through dark:text-zinc-500"
                          : "text-zinc-800 dark:text-zinc-200"
                      }`}
                    >
                      {item.amount} {item.unit} {item.item}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
