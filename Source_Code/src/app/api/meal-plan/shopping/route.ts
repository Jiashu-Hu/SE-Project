import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { listSlotsForWeek } from "@/lib/meal-plan";
import { getRecipeById } from "@/lib/recipes";
import { aggregateIngredients } from "@/lib/shopping-list";
import { classifyIngredients, AISLES } from "@/lib/ingredient-aisles";
import type { Aisle } from "@/lib/ingredient-aisles";
import type { AggregatedItem } from "@/lib/shopping-list";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface ShoppingBody {
  readonly weekStart: string;
}

function isShoppingBody(value: unknown): value is ShoppingBody {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.weekStart === "string" && ISO_DATE_RE.test(v.weekStart);
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!isShoppingBody(body)) {
    return NextResponse.json(
      { error: "Body must include weekStart (YYYY-MM-DD)." },
      { status: 400 }
    );
  }

  // 1. Fetch slots + recipes for the week.
  const slots = await listSlotsForWeek(user.id, body.weekStart);
  if (slots.length === 0) {
    return NextResponse.json({ aisles: {} });
  }

  const recipeIds = [...new Set(slots.map((s) => s.recipeId))];
  const recipeMap = new Map<string, Awaited<ReturnType<typeof getRecipeById>>>();
  for (const rid of recipeIds) {
    recipeMap.set(rid, await getRecipeById(rid));
  }

  const slotsWithRecipes = slots
    .map((s) => {
      const r = recipeMap.get(s.recipeId);
      return r ? { servings: s.servings, recipe: r } : null;
    })
    .filter((x): x is { servings: number; recipe: NonNullable<typeof x extends null ? never : typeof x>["recipe"] } => x !== null);

  // 2. Aggregate (pure).
  const items = aggregateIngredients(slotsWithRecipes);

  // 3. Classify by aisle.
  const itemNames = items.map((i) => i.item);
  const classification = await classifyIngredients(itemNames);

  // 4. Group by aisle.
  const aisles: Partial<Record<Aisle, AggregatedItem[]>> = {};
  for (const item of items) {
    const aisle = classification[item.item.toLowerCase()] ?? "Other";
    if (!aisles[aisle]) aisles[aisle] = [];
    aisles[aisle]!.push(item);
  }

  // 5. Sort items within each aisle by item name; return aisles in canonical order.
  const ordered: Partial<Record<Aisle, AggregatedItem[]>> = {};
  for (const a of AISLES) {
    if (aisles[a] && aisles[a]!.length > 0) {
      ordered[a] = [...aisles[a]!].sort((x, y) => x.item.localeCompare(y.item));
    }
  }

  return NextResponse.json({ aisles: ordered });
}
