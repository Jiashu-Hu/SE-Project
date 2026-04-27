import { describe, it, expect } from "vitest";
import {
  getAllRecipes,
  getRecipeById,
  getRecipesByAuthor,
  createRecipe,
  updateRecipe,
  deleteRecipe,
} from "@/lib/recipes";
import type { CreateRecipePayload } from "@/types/recipe";

const samplePayload: CreateRecipePayload = {
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

describe("recipes store", () => {
  it("seeds mock recipes under the test user", () => {
    const all = getAllRecipes();
    expect(all.length).toBeGreaterThan(0);
    for (const r of all) {
      expect(r.authorId).toBe("seed-test-user");
    }
  });

  it("getRecipeById returns the seeded recipe", () => {
    const all = getAllRecipes();
    const fetched = getRecipeById(all[0].id);
    expect(fetched).toEqual(all[0]);
  });

  it("getRecipeById returns undefined for unknown id", () => {
    expect(getRecipeById("does-not-exist")).toBeUndefined();
  });

  it("getRecipesByAuthor returns only that author's recipes", () => {
    const created = createRecipe("alice", samplePayload);
    const aliceRecipes = getRecipesByAuthor("alice");
    expect(aliceRecipes).toHaveLength(1);
    expect(aliceRecipes[0]).toEqual(created);
    // seed user's recipes are unaffected
    expect(getRecipesByAuthor("seed-test-user").length).toBeGreaterThan(0);
  });

  it("getRecipesByAuthor returns [] for unknown author", () => {
    expect(getRecipesByAuthor("nobody")).toEqual([]);
  });

  it("createRecipe assigns id, authorId, createdAt, and trims fields", () => {
    const created = createRecipe("bob", { ...samplePayload, title: "  Eggs  " });
    expect(created.id).toMatch(/[0-9a-f-]{36}/);
    expect(created.authorId).toBe("bob");
    expect(created.title).toBe("Eggs");
    expect(typeof created.createdAt).toBe("string");
    expect(getRecipeById(created.id)).toEqual(created);
  });

  it("updateRecipe replaces fields but preserves id, authorId, createdAt", () => {
    const created = createRecipe("bob", samplePayload);
    const updated = updateRecipe(created.id, {
      ...samplePayload,
      title: "Different",
      servings: 4,
    });
    expect(updated).not.toBeNull();
    expect(updated?.id).toBe(created.id);
    expect(updated?.authorId).toBe("bob");
    expect(updated?.createdAt).toBe(created.createdAt);
    expect(updated?.title).toBe("Different");
    expect(updated?.servings).toBe(4);
  });

  it("updateRecipe returns null for unknown id", () => {
    expect(updateRecipe("does-not-exist", samplePayload)).toBeNull();
  });

  it("deleteRecipe removes the recipe and returns true", () => {
    const created = createRecipe("carol", samplePayload);
    expect(deleteRecipe(created.id)).toBe(true);
    expect(getRecipeById(created.id)).toBeUndefined();
  });

  it("deleteRecipe returns false for unknown id", () => {
    expect(deleteRecipe("does-not-exist")).toBe(false);
  });
});
