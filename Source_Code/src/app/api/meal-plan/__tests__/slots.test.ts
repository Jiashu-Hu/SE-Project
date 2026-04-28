import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { POST } from "@/app/api/meal-plan/slots/route";
import { registerUser, createSession } from "@/lib/auth";
import { createRecipe } from "@/lib/recipes";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";
import type { CreateRecipePayload } from "@/types/recipe";

const SAMPLE: CreateRecipePayload = {
  title: "T", description: "x", category: "Dinner",
  prepTime: 1, cookTime: 1, servings: 4,
  ingredients: [{ amount: "1", unit: "u", item: "stuff" }],
  instructions: ["x"], tags: [],
};

async function loginAndRecipe() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  cookieJar.set(AUTH_SESSION_COOKIE, (await createSession(reg.user.id)).token);
  const recipe = await createRecipe(reg.user.id, SAMPLE);
  return { userId: reg.user.id, recipeId: recipe.id };
}

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/meal-plan/slots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => cookieJar.clear());

describe("POST /api/meal-plan/slots", () => {
  it("returns 401 when not logged in", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing fields", async () => {
    await loginAndRecipe();
    const res = await POST(makeReq({ date: "2026-04-27" })); // missing other fields
    expect(res.status).toBe(400);
  });

  it("returns 400 on an invalid meal_type", async () => {
    const { recipeId } = await loginAndRecipe();
    const res = await POST(makeReq({
      date: "2026-04-27", mealType: "midnight", recipeId, servings: 2,
    }));
    expect(res.status).toBe(400);
  });

  it("creates a slot on valid input", async () => {
    const { recipeId } = await loginAndRecipe();
    const res = await POST(makeReq({
      date: "2026-04-27", mealType: "evening", recipeId, servings: 2,
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slot.mealType).toBe("evening");
    expect(body.slot.servings).toBe(2);
  });

  it("returns 409 on duplicate slot", async () => {
    const { recipeId } = await loginAndRecipe();
    const payload = { date: "2026-04-27", mealType: "evening", recipeId, servings: 2 };
    await POST(makeReq(payload));
    const dup = await POST(makeReq(payload));
    expect(dup.status).toBe(409);
  });
});

import { PATCH, DELETE } from "@/app/api/meal-plan/slots/[id]/route";

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/meal-plan/slots/[id]", () => {
  it("returns 401 when not logged in", async () => {
    const req = new Request("http://localhost/api/meal-plan/slots/x", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servings: 4 }),
    });
    const res = await PATCH(req, paramsFor("00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(401);
  });

  it("updates servings and returns the new slot", async () => {
    const { recipeId } = await loginAndRecipe();
    const create = await POST(makeReq({
      date: "2026-04-27", mealType: "morning", recipeId, servings: 1,
    }));
    const created = (await create.json()).slot;

    const patchReq = new Request("http://localhost/api/meal-plan/slots/x", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servings: 5 }),
    });
    const res = await PATCH(patchReq, paramsFor(created.id));
    expect(res.status).toBe(200);
    expect((await res.json()).slot.servings).toBe(5);
  });

  it("returns 404 for an unknown slot id", async () => {
    await loginAndRecipe();
    const req = new Request("http://localhost/api/meal-plan/slots/x", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servings: 5 }),
    });
    const res = await PATCH(req, paramsFor("00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/meal-plan/slots/[id]", () => {
  it("returns 204 on successful delete", async () => {
    const { recipeId } = await loginAndRecipe();
    const create = await POST(makeReq({
      date: "2026-04-27", mealType: "morning", recipeId, servings: 1,
    }));
    const created = (await create.json()).slot;

    const req = new Request(`http://localhost/api/meal-plan/slots/${created.id}`, {
      method: "DELETE",
    });
    const res = await DELETE(req, paramsFor(created.id));
    expect(res.status).toBe(204);
  });

  it("returns 404 for an unknown slot", async () => {
    await loginAndRecipe();
    const req = new Request("http://localhost/api/meal-plan/slots/x", { method: "DELETE" });
    const res = await DELETE(req, paramsFor("00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(404);
  });
});
