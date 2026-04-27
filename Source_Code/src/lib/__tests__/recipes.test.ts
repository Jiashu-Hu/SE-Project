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

describe("recipes store (Postgres-backed)", () => {
  it("getAllRecipes returns [] on an empty database", async () => {
    expect(await getAllRecipes()).toEqual([]);
  });

  it("getRecipeById returns undefined for an unknown id", async () => {
    expect(
      await getRecipeById("00000000-0000-0000-0000-000000000000")
    ).toBeUndefined();
  });

  it("getRecipeById returns a created recipe", async () => {
    const created = await createRecipe("alice", samplePayload);
    const fetched = await getRecipeById(created.id);
    expect(fetched).toEqual(created);
  });

  it("getRecipesByAuthor returns only that author's recipes", async () => {
    const created = await createRecipe("alice", samplePayload);
    const aliceRecipes = await getRecipesByAuthor("alice");
    expect(aliceRecipes).toHaveLength(1);
    expect(aliceRecipes[0]).toEqual(created);
    expect(await getRecipesByAuthor("bob")).toEqual([]);
  });

  it("getRecipesByAuthor returns [] for unknown author", async () => {
    expect(await getRecipesByAuthor("nobody")).toEqual([]);
  });

  it("createRecipe assigns id, authorId, createdAt, and trims fields", async () => {
    const created = await createRecipe("bob", { ...samplePayload, title: "  Eggs  " });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.authorId).toBe("bob");
    expect(created.title).toBe("Eggs");
    expect(typeof created.createdAt).toBe("string");
    expect(await getRecipeById(created.id)).toEqual(created);
  });

  it("updateRecipe replaces fields but preserves id, authorId, createdAt", async () => {
    const created = await createRecipe("bob", samplePayload);
    const updated = await updateRecipe(created.id, {
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

  it("updateRecipe returns null for an unknown id", async () => {
    expect(
      await updateRecipe("00000000-0000-0000-0000-000000000000", samplePayload)
    ).toBeNull();
  });

  it("deleteRecipe removes the recipe and returns true", async () => {
    const created = await createRecipe("carol", samplePayload);
    expect(await deleteRecipe(created.id)).toBe(true);
    expect(await getRecipeById(created.id)).toBeUndefined();
  });

  it("deleteRecipe returns false for an unknown id", async () => {
    expect(
      await deleteRecipe("00000000-0000-0000-0000-000000000000")
    ).toBe(false);
  });

  describe("malformed-id guards", () => {
    it("getRecipeById returns undefined for a non-UUID string", async () => {
      expect(await getRecipeById("not-a-uuid")).toBeUndefined();
    });

    it("updateRecipe returns null for a non-UUID string", async () => {
      expect(await updateRecipe("not-a-uuid", samplePayload)).toBeNull();
    });

    it("deleteRecipe returns false for a non-UUID string", async () => {
      expect(await deleteRecipe("not-a-uuid")).toBe(false);
    });
  });
});
