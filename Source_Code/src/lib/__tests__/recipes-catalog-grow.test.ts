import { describe, it, expect } from "vitest";
import { createRecipe, updateRecipe } from "@/lib/recipes";
import { listUserCatalog } from "@/lib/ingredients";
import { registerUser } from "@/lib/auth";
import type { CreateRecipePayload } from "@/types/recipe";

const SAMPLE: CreateRecipePayload = {
  title: "T", description: "x", category: "Dinner",
  prepTime: 1, cookTime: 1, servings: 4,
  ingredients: [
    { amount: "1", unit: "cup", item: "Flour" },
    { amount: "2", unit: "tbsp", item: "Olive oil" },
  ],
  instructions: ["x"],
  tags: [],
};

async function newUser() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  return reg.user.id;
}

describe("createRecipe grows the catalog", () => {
  it("adds each saved ingredient to the user's catalog", async () => {
    const u = await newUser();
    await createRecipe(u, SAMPLE);
    const catalog = await listUserCatalog(u);
    const names = catalog.map((c) => c.name).sort();
    expect(names).toEqual(["Flour", "Olive oil"]);
  });

  it("does not fail when the same ingredient appears twice", async () => {
    const u = await newUser();
    await createRecipe(u, {
      ...SAMPLE,
      ingredients: [
        { amount: "1", unit: "cup", item: "Flour" },
        { amount: "2", unit: "cup", item: "flour" }, // case variant
      ],
    });
    const catalog = await listUserCatalog(u);
    expect(catalog.filter((c) => c.name === "Flour")).toHaveLength(1);
  });

  it("skips empty/whitespace-only items without erroring", async () => {
    const u = await newUser();
    await createRecipe(u, {
      ...SAMPLE,
      ingredients: [
        { amount: "1", unit: "cup", item: "Sugar" },
        { amount: "", unit: "", item: "  " },
      ],
    });
    const catalog = await listUserCatalog(u);
    expect(catalog.map((c) => c.name)).toEqual(["Sugar"]);
  });
});

describe("updateRecipe grows the catalog", () => {
  it("adds new ingredients introduced on edit", async () => {
    const u = await newUser();
    const recipe = await createRecipe(u, SAMPLE);
    await updateRecipe(recipe.id, {
      ...SAMPLE,
      ingredients: [
        ...SAMPLE.ingredients,
        { amount: "1", unit: "tsp", item: "Cumin" },
      ],
    });
    const catalog = await listUserCatalog(u);
    expect(catalog.map((c) => c.name).sort()).toEqual([
      "Cumin",
      "Flour",
      "Olive oil",
    ]);
  });
});
