import { describe, it, expect } from "vitest";
import {
  createSlot,
  listSlotsForWeek,
  updateSlot,
  deleteSlot,
  bulkUpdateServings,
} from "@/lib/meal-plan";
import { registerUser } from "@/lib/auth";
import { createRecipe } from "@/lib/recipes";
import type { CreateRecipePayload } from "@/types/recipe";

const SAMPLE_RECIPE: CreateRecipePayload = {
  title: "Toast",
  description: "Bread, but warm.",
  category: "Breakfast",
  prepTime: 1,
  cookTime: 3,
  servings: 1,
  ingredients: [{ amount: "2", unit: "slice", item: "bread" }],
  instructions: ["Toast the bread"],
  tags: [],
};

async function makeUserAndRecipe() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  const recipe = await createRecipe(reg.user.id, SAMPLE_RECIPE);
  return { userId: reg.user.id, recipeId: recipe.id };
}

describe("createSlot + listSlotsForWeek", () => {
  it("creates a slot and finds it within the week range", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    const result = await createSlot({
      userId, date: "2026-04-27", mealType: "evening", recipeId, servings: 2,
    });
    expect("slot" in result).toBe(true);

    const slots = await listSlotsForWeek(userId, "2026-04-27");
    expect(slots).toHaveLength(1);
    expect(slots[0].date).toBe("2026-04-27");
    expect(slots[0].mealType).toBe("evening");
    expect(slots[0].servings).toBe(2);
  });

  it("rejects a duplicate (user, date, meal_type) with an error", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    await createSlot({ userId, date: "2026-04-27", mealType: "evening", recipeId, servings: 2 });
    const dup = await createSlot({ userId, date: "2026-04-27", mealType: "evening", recipeId, servings: 4 });
    expect("error" in dup).toBe(true);
  });

  it("excludes slots outside the requested week", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    await createSlot({ userId, date: "2026-04-27", mealType: "morning", recipeId, servings: 1 });
    await createSlot({ userId, date: "2026-05-04", mealType: "morning", recipeId, servings: 1 });
    const week = await listSlotsForWeek(userId, "2026-04-27");
    expect(week).toHaveLength(1);
    expect(week[0].date).toBe("2026-04-27");
  });
});

describe("updateSlot", () => {
  it("updates servings", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    const created = await createSlot({ userId, date: "2026-04-27", mealType: "noon", recipeId, servings: 2 });
    if (!("slot" in created)) throw new Error("setup failed");
    const updated = await updateSlot({ slotId: created.slot.id, userId, servings: 6 });
    expect(updated?.servings).toBe(6);
  });

  it("returns null when the slot does not belong to the user", async () => {
    const a = await makeUserAndRecipe();
    const b = await makeUserAndRecipe();
    const created = await createSlot({
      userId: a.userId, date: "2026-04-27", mealType: "noon", recipeId: a.recipeId, servings: 2,
    });
    if (!("slot" in created)) throw new Error("setup failed");
    const trespass = await updateSlot({ slotId: created.slot.id, userId: b.userId, servings: 99 });
    expect(trespass).toBeNull();
  });
});

describe("deleteSlot", () => {
  it("removes the slot and returns true", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    const created = await createSlot({ userId, date: "2026-04-27", mealType: "evening", recipeId, servings: 2 });
    if (!("slot" in created)) throw new Error("setup failed");
    expect(await deleteSlot(created.slot.id, userId)).toBe(true);
    expect(await listSlotsForWeek(userId, "2026-04-27")).toEqual([]);
  });

  it("returns false when the slot does not belong to the user", async () => {
    const a = await makeUserAndRecipe();
    const b = await makeUserAndRecipe();
    const created = await createSlot({
      userId: a.userId, date: "2026-04-27", mealType: "evening", recipeId: a.recipeId, servings: 2,
    });
    if (!("slot" in created)) throw new Error("setup failed");
    expect(await deleteSlot(created.slot.id, b.userId)).toBe(false);
  });
});

describe("bulkUpdateServings", () => {
  it("applies servings to every slot in the requested week", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    await createSlot({ userId, date: "2026-04-27", mealType: "morning", recipeId, servings: 1 });
    await createSlot({ userId, date: "2026-04-29", mealType: "noon", recipeId, servings: 1 });
    await createSlot({ userId, date: "2026-05-04", mealType: "morning", recipeId, servings: 1 });

    const n = await bulkUpdateServings(userId, "2026-04-27", 4);
    expect(n).toBe(2);

    const week1 = await listSlotsForWeek(userId, "2026-04-27");
    expect(week1.every((s) => s.servings === 4)).toBe(true);
    const week2 = await listSlotsForWeek(userId, "2026-05-04");
    expect(week2.every((s) => s.servings === 1)).toBe(true);
  });
});
