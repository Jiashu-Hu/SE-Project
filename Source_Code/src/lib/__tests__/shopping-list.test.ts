import { describe, it, expect } from "vitest";
import {
  parseAmount,
  formatAmount,
  aggregateIngredients,
} from "@/lib/shopping-list";
import type { Recipe } from "@/types/recipe";

function makeRecipe(
  overrides: Partial<Recipe> = {}
): Recipe {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    authorId: "22222222-2222-2222-2222-222222222222",
    title: "Test Recipe",
    description: "",
    category: "Dinner",
    prepTime: 0,
    cookTime: 0,
    servings: 4,
    imageUrl: null,
    ingredients: [],
    instructions: [],
    tags: [],
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("parseAmount", () => {
  it("parses a plain number", () => {
    expect(parseAmount("3")).toBe(3);
  });

  it("parses a decimal", () => {
    expect(parseAmount("1.5")).toBe(1.5);
  });

  it("parses a mixed fraction", () => {
    expect(parseAmount("1 1/2")).toBe(1.5);
  });

  it("parses a bare fraction", () => {
    expect(parseAmount("3/4")).toBe(0.75);
  });

  it("returns null for non-numeric strings", () => {
    expect(parseAmount("a pinch")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("to taste")).toBeNull();
  });
});

describe("formatAmount", () => {
  it("strips trailing zeros and decimal point", () => {
    expect(formatAmount(3)).toBe("3");
    expect(formatAmount(1.5)).toBe("1.5");
    expect(formatAmount(0.75)).toBe("0.75");
  });
});

describe("aggregateIngredients", () => {
  it("sums same item + same unit across slots", async () => {
    const recipe = makeRecipe({
      servings: 4,
      ingredients: [{ amount: "200", unit: "g", item: "spaghetti" }],
    });
    const items = aggregateIngredients([
      { servings: 4, recipe },
      { servings: 4, recipe },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].item).toBe("spaghetti");
    expect(items[0].unit).toBe("g");
    expect(items[0].amount).toBe("400");
  });

  it("scales by slot.servings / recipe.servings", () => {
    const recipe = makeRecipe({
      servings: 4,
      ingredients: [{ amount: "200", unit: "g", item: "spaghetti" }],
    });
    const items = aggregateIngredients([{ servings: 2, recipe }]);
    expect(items[0].amount).toBe("100");
  });

  it("keeps different units as separate rows for the same item", () => {
    const r1 = makeRecipe({
      servings: 1,
      ingredients: [{ amount: "200", unit: "g", item: "pasta" }],
    });
    const r2 = makeRecipe({
      id: "33333333-3333-3333-3333-333333333333",
      servings: 1,
      ingredients: [{ amount: "1", unit: "box", item: "pasta" }],
    });
    const items = aggregateIngredients([
      { servings: 1, recipe: r1 },
      { servings: 1, recipe: r2 },
    ]);
    expect(items).toHaveLength(2);
    const units = items.map((i) => i.unit).sort();
    expect(units).toEqual(["box", "g"]);
  });

  it("passes non-numeric amounts through unchanged", () => {
    const recipe = makeRecipe({
      servings: 1,
      ingredients: [{ amount: "to taste", unit: "", item: "salt" }],
    });
    const items = aggregateIngredients([{ servings: 2, recipe }]);
    expect(items[0].amount).toBe("to taste");
    expect(items[0].item).toBe("salt");
  });

  it("joins mixed numeric + non-numeric for the same item+unit with a comma", () => {
    const r1 = makeRecipe({
      servings: 1,
      ingredients: [{ amount: "1", unit: "tsp", item: "salt" }],
    });
    const r2 = makeRecipe({
      id: "33333333-3333-3333-3333-333333333333",
      servings: 1,
      ingredients: [{ amount: "to taste", unit: "tsp", item: "salt" }],
    });
    const items = aggregateIngredients([
      { servings: 1, recipe: r1 },
      { servings: 1, recipe: r2 },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe("1, to taste");
  });

  it("normalizes item and unit case for grouping but preserves first-seen casing for display", () => {
    const r1 = makeRecipe({
      servings: 1,
      ingredients: [{ amount: "2", unit: "Cup", item: "Flour" }],
    });
    const r2 = makeRecipe({
      id: "33333333-3333-3333-3333-333333333333",
      servings: 1,
      ingredients: [{ amount: "1", unit: "cup", item: "flour" }],
    });
    const items = aggregateIngredients([
      { servings: 1, recipe: r1 },
      { servings: 1, recipe: r2 },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe("3");
    expect(items[0].item).toBe("Flour");
    expect(items[0].unit).toBe("Cup");
  });

  it("skips ingredients with empty item names", () => {
    const recipe = makeRecipe({
      servings: 1,
      ingredients: [
        { amount: "1", unit: "cup", item: "" },
        { amount: "1", unit: "cup", item: "flour" },
      ],
    });
    const items = aggregateIngredients([{ servings: 1, recipe }]);
    expect(items).toHaveLength(1);
    expect(items[0].item).toBe("flour");
  });

  it("treats recipe.servings of 0 as ratio 1 to avoid division by zero", () => {
    const recipe = makeRecipe({
      servings: 0,
      ingredients: [{ amount: "10", unit: "g", item: "salt" }],
    });
    const items = aggregateIngredients([{ servings: 5, recipe }]);
    expect(items[0].amount).toBe("10");
  });
});

describe("parseAmount edge cases", () => {
  it("returns null for division by zero in fractions", () => {
    expect(parseAmount("1/0")).toBeNull();
    expect(parseAmount("1 1/0")).toBeNull();
  });
});
