import { describe, it, expect } from "vitest";
import {
  addToBucket,
  listBucket,
  removeFromBucket,
  clearBucket,
} from "@/lib/bucket";
import { registerUser } from "@/lib/auth";
import { createRecipe } from "@/lib/recipes";
import type { CreateRecipePayload } from "@/types/recipe";

const SAMPLE: CreateRecipePayload = {
  title: "T", description: "x", category: "Dinner",
  prepTime: 1, cookTime: 1, servings: 4,
  ingredients: [{ amount: "1", unit: "u", item: "stuff" }],
  instructions: ["x"], tags: [],
};

async function makeUserAndRecipe() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  const recipe = await createRecipe(reg.user.id, SAMPLE);
  return { userId: reg.user.id, recipeId: recipe.id };
}

describe("addToBucket + listBucket", () => {
  it("adds an item and lists it", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    const result = await addToBucket(userId, recipeId);
    expect("item" in result).toBe(true);
    const list = await listBucket(userId);
    expect(list).toHaveLength(1);
    expect(list[0].recipeId).toBe(recipeId);
  });

  it("rejects duplicates with a friendly error", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    await addToBucket(userId, recipeId);
    const dup = await addToBucket(userId, recipeId);
    expect("error" in dup).toBe(true);
    if ("error" in dup) {
      expect(dup.error).toMatch(/already in bucket/i);
    }
  });

  it("returns [] for a user with no items", async () => {
    const reg = await registerUser({
      name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
    });
    if (!("user" in reg)) throw new Error("setup failed");
    expect(await listBucket(reg.user.id)).toEqual([]);
  });

  it("orders newest first", async () => {
    const reg = await registerUser({
      name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
    });
    if (!("user" in reg)) throw new Error("setup failed");
    const r1 = await createRecipe(reg.user.id, SAMPLE);
    const r2 = await createRecipe(reg.user.id, SAMPLE);
    await addToBucket(reg.user.id, r1.id);
    await new Promise((r) => setTimeout(r, 10));
    await addToBucket(reg.user.id, r2.id);
    const list = await listBucket(reg.user.id);
    expect(list[0].recipeId).toBe(r2.id);
    expect(list[1].recipeId).toBe(r1.id);
  });

  it("returns [] for malformed userId", async () => {
    expect(await listBucket("not-a-uuid")).toEqual([]);
  });

  it("returns error for malformed userId in addToBucket", async () => {
    const result = await addToBucket("not-a-uuid", "00000000-0000-0000-0000-000000000000");
    expect("error" in result).toBe(true);
  });
});

describe("removeFromBucket", () => {
  it("removes an item and returns true", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    await addToBucket(userId, recipeId);
    expect(await removeFromBucket(userId, recipeId)).toBe(true);
    expect(await listBucket(userId)).toEqual([]);
  });

  it("returns false when the item isn't in the bucket", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    expect(await removeFromBucket(userId, recipeId)).toBe(false);
  });

  it("returns false for malformed userId", async () => {
    expect(
      await removeFromBucket("not-a-uuid", "00000000-0000-0000-0000-000000000000")
    ).toBe(false);
  });
});

describe("clearBucket", () => {
  it("removes all items for a user and returns the count", async () => {
    const reg = await registerUser({
      name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
    });
    if (!("user" in reg)) throw new Error("setup failed");
    const r1 = await createRecipe(reg.user.id, SAMPLE);
    const r2 = await createRecipe(reg.user.id, SAMPLE);
    await addToBucket(reg.user.id, r1.id);
    await addToBucket(reg.user.id, r2.id);

    expect(await clearBucket(reg.user.id)).toBe(2);
    expect(await listBucket(reg.user.id)).toEqual([]);
  });

  it("returns 0 when bucket is empty", async () => {
    const reg = await registerUser({
      name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
    });
    if (!("user" in reg)) throw new Error("setup failed");
    expect(await clearBucket(reg.user.id)).toBe(0);
  });

  it("returns 0 for malformed userId", async () => {
    expect(await clearBucket("not-a-uuid")).toBe(0);
  });
});

describe("cascade behavior", () => {
  it("removes bucket items when the user is deleted", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    await addToBucket(userId, recipeId);
    // Delete user via raw SQL
    const { getDb } = await import("@/lib/db");
    await getDb().query("delete from users where id = $1", [userId]);
    expect(await listBucket(userId)).toEqual([]);
  });

  it("removes bucket items when the recipe is deleted", async () => {
    const { userId, recipeId } = await makeUserAndRecipe();
    await addToBucket(userId, recipeId);
    const { getDb } = await import("@/lib/db");
    await getDb().query("delete from recipes where id = $1", [recipeId]);
    expect(await listBucket(userId)).toEqual([]);
  });
});
