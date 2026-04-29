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
    // "Cherry tomato" is not in the global seed (so we exercise the
    // create-new-user-entry path) and contains the keyword "tomato" (so the
    // classifier returns Produce).
    const ing = await getOrCreateIngredient(u, "Cherry tomato");
    expect(ing.name).toBe("Cherry tomato");
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
    // Use a name not present in the global seed so each user creates a
    // distinct per-user row instead of sharing the global row.
    const a = await getOrCreateIngredient(u1, "Salsify");
    const b = await getOrCreateIngredient(u2, "Salsify");
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
    // "Baby spinach" is not in the global seed (so getOrCreateIngredient
    // creates a fresh row and writes the aisle cache) and contains the
    // keyword "spinach" so the classifier returns Produce.
    await getOrCreateIngredient(u, "Baby spinach");
    const { getDb } = await import("@/lib/db");
    const r = await getDb().query<{ aisle: string }>(
      `select aisle from ingredient_aisles where item_normalized = 'baby spinach'`
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
    // Use a name not present in the global seed so the source override is
    // applied to the fresh per-user row instead of the existing seed row.
    const ing = await getOrCreateIngredient(u, "Fenugreek", { source: "ai" });
    expect(ing.source).toBe("ai");
  });
});

describe("listUserCatalog", () => {
  it("returns only the user's own + global entries", async () => {
    const u = await newUser();
    // Salt is already in the global seed; reseeding is a no-op (ON CONFLICT
    // DO NOTHING). "Bok choy" is not in the seed and is created as a per-user
    // entry. Filter the result to source === "user" so the assertion is
    // deterministic even though ~200 globals are present from the bootstrap.
    await seedGlobal([{ name: "Salt", defaultUnit: "tsp", aisle: "Pantry" }]);
    await getOrCreateIngredient(u, "Bok choy");
    const list = await listUserCatalog(u);
    const userNames = list
      .filter((i) => i.source === "user")
      .map((i) => i.name)
      .sort();
    expect(userNames).toEqual(["Bok choy"]);
    // Sanity: globals from the bootstrap are visible alongside the user row.
    expect(list.some((i) => i.source === "seed" && i.name === "Salt")).toBe(true);
  });

  it("returns [] for malformed userId", async () => {
    expect(await listUserCatalog("not-a-uuid")).toEqual([]);
  });
});

describe("cascade", () => {
  it("removes per-user ingredients when user is deleted, keeps global", async () => {
    const u = await newUser();
    // Sugar is already in the global seed; reseeding is a no-op. "Sorrel" is
    // not in the seed and is created as a per-user row. After the user is
    // deleted, the per-user row should cascade away while the globals stay.
    await seedGlobal([{ name: "Sugar", defaultUnit: "cup", aisle: "Pantry" }]);
    await getOrCreateIngredient(u, "Sorrel");
    const { getDb } = await import("@/lib/db");
    await getDb().query("delete from users where id = $1", [u]);
    const list = await listUserCatalog(u);
    // No per-user entries remain for the deleted user.
    expect(list.filter((i) => i.source === "user")).toEqual([]);
    // Globals (including Sugar from the seed bootstrap) remain.
    expect(list.some((i) => i.source === "seed" && i.name === "Sugar")).toBe(true);
  });
});
