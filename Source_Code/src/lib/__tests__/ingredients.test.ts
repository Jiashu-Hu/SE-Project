import { describe, it, expect } from "vitest";
import { searchIngredients, seedGlobal } from "@/lib/ingredients";
import { registerUser } from "@/lib/auth";
import { getOrCreateIngredient, listUserCatalog } from "@/lib/ingredients";

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

describe("getOrCreateIngredient", () => {
  it("creates a new per-user entry with keyword-classified aisle", async () => {
    const u = await newUser();
    const ing = await getOrCreateIngredient(u, "Tomato");
    expect(ing.name).toBe("Tomato");
    expect(ing.userId).toBe(u);
    expect(ing.aisle).toBe("Produce");
    expect(ing.source).toBe("user");
  });

  it("uses the unit hint when provided", async () => {
    const u = await newUser();
    const ing = await getOrCreateIngredient(u, "Olive oil", { unit: "tbsp" });
    expect(ing.defaultUnit).toBe("tbsp");
  });

  it("returns existing user-scoped entry on second call", async () => {
    const u = await newUser();
    const a = await getOrCreateIngredient(u, "Garlic");
    const b = await getOrCreateIngredient(u, "garlic"); // case-insensitive
    expect(b.id).toBe(a.id);
  });

  it("treats different users as separate scopes", async () => {
    const u1 = await newUser();
    const u2 = await newUser();
    const a = await getOrCreateIngredient(u1, "Quinoa");
    const b = await getOrCreateIngredient(u2, "Quinoa");
    expect(a.id).not.toBe(b.id);
    expect(a.userId).toBe(u1);
    expect(b.userId).toBe(u2);
  });

  it("falls back to 'Other' when keyword classifier returns null", async () => {
    const u = await newUser();
    // "xyzzy" matches no keyword and we don't want to call the LLM in tests.
    // The implementation falls back to 'Other' on classifier failure.
    const ing = await getOrCreateIngredient(u, "Xyzzy");
    expect(ing.aisle).toBe("Other");
  });

  it("syncs new entries into ingredient_aisles cache", async () => {
    const u = await newUser();
    await getOrCreateIngredient(u, "Carrot");
    const { getDb } = await import("@/lib/db");
    const r = await getDb().query<{ aisle: string }>(
      `select aisle from ingredient_aisles where item_normalized = 'carrot'`
    );
    expect(r.rows[0]?.aisle).toBe("Produce");
  });

  it("rejects malformed userId", async () => {
    await expect(
      getOrCreateIngredient("not-a-uuid", "Tomato")
    ).rejects.toThrow();
  });

  it("rejects empty name", async () => {
    const u = await newUser();
    await expect(getOrCreateIngredient(u, "   ")).rejects.toThrow();
  });

  it("accepts source override", async () => {
    const u = await newUser();
    const ing = await getOrCreateIngredient(u, "Lentils", { source: "ai" });
    expect(ing.source).toBe("ai");
  });
});

describe("listUserCatalog", () => {
  it("returns only the user's own + global entries", async () => {
    const u = await newUser();
    await seedGlobal([{ name: "Salt", defaultUnit: "tsp", aisle: "Pantry" }]);
    await getOrCreateIngredient(u, "Tomato");
    const list = await listUserCatalog(u);
    const names = list.map((i) => i.name).sort();
    expect(names).toEqual(["Salt", "Tomato"]);
  });

  it("returns [] for malformed userId", async () => {
    expect(await listUserCatalog("not-a-uuid")).toEqual([]);
  });
});

describe("cascade", () => {
  it("removes per-user ingredients when user is deleted, keeps global", async () => {
    const u = await newUser();
    await seedGlobal([{ name: "Sugar", defaultUnit: "cup", aisle: "Pantry" }]);
    await getOrCreateIngredient(u, "Bok choy");
    const { getDb } = await import("@/lib/db");
    await getDb().query("delete from users where id = $1", [u]);
    const userList = await listUserCatalog(u);
    expect(userList.map((i) => i.name)).toEqual(["Sugar"]);
  });
});
