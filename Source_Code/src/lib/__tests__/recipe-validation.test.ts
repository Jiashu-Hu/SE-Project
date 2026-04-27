import { describe, it, expect } from "vitest";
import { validateCreateRecipePayload } from "@/lib/recipe-validation";

const validPayload = {
  title: "Pasta",
  description: "A simple weeknight dinner.",
  category: "Dinner",
  prepTime: 10,
  cookTime: 20,
  servings: 2,
  ingredients: [{ amount: "200", unit: "g", item: "spaghetti" }],
  instructions: ["Boil water", "Cook pasta"],
  tags: ["italian"],
};

describe("validateCreateRecipePayload", () => {
  it("accepts a complete valid payload", () => {
    const result = validateCreateRecipePayload(validPayload);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.title).toBe("Pasta");
      expect(result.payload.tags).toEqual(["italian"]);
    }
  });

  it("rejects non-object input", () => {
    expect(validateCreateRecipePayload(null).valid).toBe(false);
    expect(validateCreateRecipePayload("nope").valid).toBe(false);
  });

  it("rejects missing or oversized title", () => {
    expect(validateCreateRecipePayload({ ...validPayload, title: "" }).valid).toBe(false);
    expect(
      validateCreateRecipePayload({ ...validPayload, title: "x".repeat(121) }).valid
    ).toBe(false);
  });

  it("rejects missing description", () => {
    expect(validateCreateRecipePayload({ ...validPayload, description: "" }).valid).toBe(false);
  });

  it("rejects unknown category", () => {
    expect(
      validateCreateRecipePayload({ ...validPayload, category: "Brunch" }).valid
    ).toBe(false);
  });

  it("rejects negative or non-integer prep/cook times", () => {
    expect(validateCreateRecipePayload({ ...validPayload, prepTime: -1 }).valid).toBe(false);
    expect(validateCreateRecipePayload({ ...validPayload, prepTime: 1.5 }).valid).toBe(false);
    expect(validateCreateRecipePayload({ ...validPayload, cookTime: -5 }).valid).toBe(false);
  });

  it("requires servings >= 1", () => {
    expect(validateCreateRecipePayload({ ...validPayload, servings: 0 }).valid).toBe(false);
  });

  it("requires at least one ingredient with all fields", () => {
    expect(validateCreateRecipePayload({ ...validPayload, ingredients: [] }).valid).toBe(false);
    expect(
      validateCreateRecipePayload({
        ...validPayload,
        ingredients: [{ amount: "1", unit: "cup", item: "" }],
      }).valid
    ).toBe(false);
  });

  it("requires at least one non-empty instruction", () => {
    expect(validateCreateRecipePayload({ ...validPayload, instructions: [] }).valid).toBe(false);
    expect(
      validateCreateRecipePayload({ ...validPayload, instructions: ["  "] }).valid
    ).toBe(false);
  });

  it("filters non-string tags silently", () => {
    const result = validateCreateRecipePayload({
      ...validPayload,
      tags: ["good", 42, "", "  "],
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.tags).toEqual(["good"]);
    }
  });
});
