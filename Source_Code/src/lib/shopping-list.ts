// Pure aggregation for the shopping list. No I/O.
//
// Input: a list of slot-with-recipe pairs, where each slot has its own
// `servings` (the user-facing override). Each recipe carries its own default
// `servings` plus the ingredient list. We scale per slot, then aggregate
// across all slots.

import type { Recipe } from "@/types/recipe";

export interface ShoppingListSlot {
  readonly servings: number;
  readonly recipe: Recipe;
}

export interface AggregatedItem {
  readonly item: string;   // first-seen casing
  readonly unit: string;   // first-seen casing
  readonly amount: string; // already-formatted for display
}

const FRACTION_RE = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/;       // "1 1/2"
const BARE_FRAC_RE = /^(\d+)\s*\/\s*(\d+)$/;              // "1/2"
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;                     // "1.5", "200"

export function parseAmount(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  let m = FRACTION_RE.exec(s);
  if (m) {
    const whole = Number(m[1]);
    const num = Number(m[2]);
    const den = Number(m[3]);
    if (den === 0) return null;
    return whole + num / den;
  }
  m = BARE_FRAC_RE.exec(s);
  if (m) {
    const num = Number(m[1]);
    const den = Number(m[2]);
    if (den === 0) return null;
    return num / den;
  }
  if (DECIMAL_RE.test(s)) return Number(s);
  return null;
}

export function formatAmount(n: number): string {
  // Trim trailing zeros + dot.
  return n.toFixed(2).replace(/\.?0+$/, "");
}

interface Bucket {
  readonly displayItem: string;
  readonly displayUnit: string;
  numericTotal: number;
  numericCount: number;
  nonNumericParts: string[];
}

export function aggregateIngredients(
  slots: readonly ShoppingListSlot[]
): readonly AggregatedItem[] {
  const buckets = new Map<string, Bucket>();

  for (const slot of slots) {
    const ratio =
      slot.recipe.servings > 0 ? slot.servings / slot.recipe.servings : 1;
    for (const ing of slot.recipe.ingredients) {
      const itemKey = ing.item.trim().toLowerCase();
      const unitKey = ing.unit.trim().toLowerCase();
      if (!itemKey) continue;
      const key = `${itemKey}|${unitKey}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          displayItem: ing.item.trim(),
          displayUnit: ing.unit.trim(),
          numericTotal: 0,
          numericCount: 0,
          nonNumericParts: [],
        };
        buckets.set(key, bucket);
      }
      const parsed = parseAmount(ing.amount);
      if (parsed !== null) {
        bucket.numericTotal += parsed * ratio;
        bucket.numericCount += 1;
      } else {
        const trimmed = ing.amount.trim();
        if (trimmed) bucket.nonNumericParts.push(trimmed);
      }
    }
  }

  const out: AggregatedItem[] = [];
  for (const b of buckets.values()) {
    const parts: string[] = [];
    if (b.numericCount > 0) parts.push(formatAmount(b.numericTotal));
    parts.push(...b.nonNumericParts);
    out.push({
      item: b.displayItem,
      unit: b.displayUnit,
      amount: parts.join(", "),
    });
  }
  return out;
}
