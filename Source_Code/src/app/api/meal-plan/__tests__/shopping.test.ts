import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { POST } from "@/app/api/meal-plan/shopping/route";
import { POST as slotsPOST } from "@/app/api/meal-plan/slots/route";
import { __setTestClient, __resetClient } from "@/lib/ai-recipe";
import { registerUser, createSession } from "@/lib/auth";
import { createRecipe } from "@/lib/recipes";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";

function makeFakeClient(responses: unknown[]) {
  let i = 0;
  return {
    chat: { completions: { create: async () => responses[i++] } },
  } as unknown as Parameters<typeof __setTestClient>[0];
}

function makeChatResponse(payload: unknown) {
  return {
    id: "x", object: "chat.completion", created: 0, model: "gpt-4.1-mini",
    choices: [{
      index: 0, finish_reason: "stop",
      message: { role: "assistant", content: JSON.stringify(payload), refusal: null },
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

async function setup() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  cookieJar.set(AUTH_SESSION_COOKIE, (await createSession(reg.user.id)).token);
  return { userId: reg.user.id };
}

function shoppingReq(body: unknown): Request {
  return new Request("http://localhost/api/meal-plan/shopping", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => cookieJar.clear());
afterEach(() => __resetClient());

describe("POST /api/meal-plan/shopping", () => {
  it("returns 401 when not logged in", async () => {
    const res = await POST(shoppingReq({ weekStart: "2026-04-27" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on a malformed weekStart", async () => {
    await setup();
    const res = await POST(shoppingReq({ weekStart: "not-a-date" }));
    expect(res.status).toBe(400);
  });

  it("returns an empty list when the week has no slots", async () => {
    await setup();
    __setTestClient(makeFakeClient([])); // no LLM should be called
    const res = await POST(shoppingReq({ weekStart: "2026-04-27" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.aisles).toEqual({});
  });

  it("aggregates and groups ingredients across slots in the week", async () => {
    const { userId } = await setup();
    __setTestClient(makeFakeClient([])); // all items resolved by keyword map

    const recipe = await createRecipe(userId, {
      title: "Pasta", description: "x", category: "Dinner",
      prepTime: 1, cookTime: 1, servings: 4,
      ingredients: [
        { amount: "200", unit: "g", item: "spaghetti" },
        { amount: "4", unit: "cloves", item: "garlic" },
      ],
      instructions: ["cook"], tags: [],
    });

    const slotReq = (date: string, mealType: string) =>
      new Request("http://localhost/api/meal-plan/slots", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, mealType, recipeId: recipe.id, servings: 4 }),
      });
    await slotsPOST(slotReq("2026-04-27", "evening"));
    await slotsPOST(slotReq("2026-04-29", "evening"));

    const res = await POST(shoppingReq({ weekStart: "2026-04-27" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // spaghetti and garlic both fall under Pantry / Produce respectively per the keyword map
    expect(body.aisles).toBeDefined();
    const flatItems = Object.values(body.aisles).flat() as Array<{ item: string; amount: string }>;
    const spag = flatItems.find((i) => i.item.toLowerCase() === "spaghetti");
    const garlic = flatItems.find((i) => i.item.toLowerCase() === "garlic");
    expect(spag?.amount).toBe("400"); // 200 + 200
    expect(garlic?.amount).toBe("8");  // 4 + 4
  });
});
