import { describe, it, expect } from "vitest";
import { createRecipe, updateRecipe } from "@/lib/recipes";
import { listUserCatalog } from "@/lib/ingredients";
import { registerUser } from "@/lib/auth";
import type { CreateRecipePayload } from "@/types/recipe";

// Use ingredient names that are NOT in the global seed so the catalog-grow
// path actually creates per-user rows. If the name is already a global seed
// row, getOrCreateIngredient returns that row unchanged, which isn't what
// these tests are exercising.
const SAMPLE: CreateRecipePayload = {
  title: "T", description: "x", category: "Dinner",
  prepTime: 1, cookTime: 1, servings: 4,
  ingredients: [
    { amount: "1", unit: "cup", item: "Sorrel" },
    { amount: "2", unit: "tbsp", item: "Jicama" },
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
    // Filter to source === "user" so the assertion ignores the ~200 globals
    // already present from the seed bootstrap.
    const names = catalog
      .filter((c) => c.source === "user")
      .map((c) => c.name)
      .sort();
    expect(names).toEqual(["Jicama", "Sorrel"]);
  });

  it("does not fail when the same ingredient appears twice", async () => {
    const u = await newUser();
    // Use a non-seed name so the user-row path is actually exercised.
    await createRecipe(u, {
      ...SAMPLE,
      ingredients: [
        { amount: "1", unit: "cup", item: "Gherkin" },
        { amount: "2", unit: "cup", item: "gherkin" }, // case variant
      ],
    });
    const catalog = await listUserCatalog(u);
    expect(catalog.filter((c) => c.name === "Gherkin")).toHaveLength(1);
  });

  it("skips empty/whitespace-only items without erroring", async () => {
    const u = await newUser();
    // Use a non-seed name; otherwise the recipe save no-ops the catalog grow.
    await createRecipe(u, {
      ...SAMPLE,
      ingredients: [
        { amount: "1", unit: "cup", item: "Daikon" },
        { amount: "", unit: "", item: "  " },
      ],
    });
    const catalog = await listUserCatalog(u);
    const userNames = catalog
      .filter((c) => c.source === "user")
      .map((c) => c.name);
    expect(userNames).toEqual(["Daikon"]);
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
        // Non-seed name; the new edit should add this as a per-user row.
        { amount: "1", unit: "tsp", item: "Epazote" },
      ],
    });
    const catalog = await listUserCatalog(u);
    const userNames = catalog
      .filter((c) => c.source === "user")
      .map((c) => c.name)
      .sort();
    expect(userNames).toEqual(["Epazote", "Jicama", "Sorrel"]);
  });
});
