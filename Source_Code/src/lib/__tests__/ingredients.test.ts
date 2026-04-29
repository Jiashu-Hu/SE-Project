import { describe, it, expect } from "vitest";
import { searchIngredients, seedGlobal } from "@/lib/ingredients";
import { registerUser } from "@/lib/auth";

async function newUser() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  return reg.user.id;
}

describe("searchIngredients", () => {
  it("returns [] for empty q", async () => {
    const u = await newUser();
    expect(await searchIngredients(u, "")).toEqual([]);
  });

  it("returns [] for whitespace-only q", async () => {
    const u = await newUser();
    expect(await searchIngredients(u, "   ")).toEqual([]);
  });

  it("returns [] for malformed userId", async () => {
    expect(await searchIngredients("not-a-uuid", "tomato")).toEqual([]);
  });

  it("matches global seed entries by prefix", async () => {
    const u = await newUser();
    await seedGlobal([
      { name: "Tomato", defaultUnit: "whole", aisle: "Produce" },
      { name: "Tomato sauce", defaultUnit: "cup", aisle: "Pantry" },
      { name: "Salt", defaultUnit: "tsp", aisle: "Pantry" },
    ]);
    const results = await searchIngredients(u, "tomat");
    expect(results.map((r) => r.name)).toEqual(["Tomato", "Tomato sauce"]);
  });

  it("user override beats global with same normalized name", async () => {
    const u = await newUser();
    await seedGlobal([{ name: "Olive oil", defaultUnit: "tbsp", aisle: "Pantry" }]);
    // Insert a user-scoped row with a different default unit.
    const { getDb } = await import("@/lib/db");
    await getDb().query(
      `insert into ingredients (user_id, name, name_normalized, default_unit, aisle, source)
         values ($1, 'Olive oil', 'olive oil', 'cup', 'Pantry', 'user')`,
      [u]
    );
    const results = await searchIngredients(u, "olive");
    expect(results).toHaveLength(1);
    expect(results[0].defaultUnit).toBe("cup"); // user override
  });

  it("respects limit (default 8)", async () => {
    const u = await newUser();
    const rows = Array.from({ length: 12 }, (_, i) => ({
      name: `Apple ${i}`,
      defaultUnit: "whole",
      aisle: "Produce" as const,
    }));
    await seedGlobal(rows);
    const results = await searchIngredients(u, "apple");
    expect(results).toHaveLength(8);
  });

  it("respects explicit limit", async () => {
    const u = await newUser();
    await seedGlobal([
      { name: "Apple", defaultUnit: "whole", aisle: "Produce" },
      { name: "Apricot", defaultUnit: "whole", aisle: "Produce" },
    ]);
    const results = await searchIngredients(u, "ap", 1);
    expect(results).toHaveLength(1);
  });
});
