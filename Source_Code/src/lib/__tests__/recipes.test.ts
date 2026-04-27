import { describe, it, expect } from "vitest";
import {
  getRecipesByAuthor,
  createRecipe,
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

describe("getRecipesByAuthor", () => {
  it("returns only recipes whose authorId matches", () => {
    const created = createRecipe("alice", samplePayload);
    const aliceRecipes = getRecipesByAuthor("alice");
    expect(aliceRecipes).toHaveLength(1);
    expect(aliceRecipes[0]).toEqual(created);
  });

  it("returns [] when no recipes match the author", () => {
    expect(getRecipesByAuthor("nobody")).toEqual([]);
  });

  it("does not mix recipes from different authors", () => {
    createRecipe("alice", samplePayload);
    createRecipe("bob", samplePayload);
    expect(getRecipesByAuthor("alice")).toHaveLength(1);
    expect(getRecipesByAuthor("bob")).toHaveLength(1);
  });
});
