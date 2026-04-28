import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { PATCH } from "@/app/api/meal-plan/slots/bulk-servings/route";
import { POST as createPOST } from "@/app/api/meal-plan/slots/route";
import { registerUser, createSession } from "@/lib/auth";
import { createRecipe } from "@/lib/recipes";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";

async function setup() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  cookieJar.set(AUTH_SESSION_COOKIE, (await createSession(reg.user.id)).token);
  const recipe = await createRecipe(reg.user.id, {
    title: "T", description: "x", category: "Dinner",
    prepTime: 1, cookTime: 1, servings: 4,
    ingredients: [{ amount: "1", unit: "u", item: "stuff" }],
    instructions: ["x"], tags: [],
  });
  return { recipeId: recipe.id };
}

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/meal-plan/slots/bulk-servings", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => cookieJar.clear());

describe("PATCH /api/meal-plan/slots/bulk-servings", () => {
  it("returns 401 when not logged in", async () => {
    const res = await PATCH(makeReq({ weekStart: "2026-04-27", servings: 4 }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on bad input", async () => {
    await setup();
    const res = await PATCH(makeReq({ weekStart: "not-a-date", servings: 4 }));
    expect(res.status).toBe(400);
  });

  it("updates all slots in the week and reports the count", async () => {
    const { recipeId } = await setup();
    const createReq = (date: string, mealType: string) =>
      new Request("http://localhost/api/meal-plan/slots", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, mealType, recipeId, servings: 1 }),
      });
    await createPOST(createReq("2026-04-27", "morning"));
    await createPOST(createReq("2026-04-29", "noon"));

    const res = await PATCH(makeReq({ weekStart: "2026-04-27", servings: 4 }));
    expect(res.status).toBe(200);
    expect((await res.json()).updated).toBe(2);
  });
});
