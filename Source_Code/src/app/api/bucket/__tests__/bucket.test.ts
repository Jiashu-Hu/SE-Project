import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { GET, POST, DELETE as DELETE_ALL } from "@/app/api/bucket/route";
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

async function login() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  cookieJar.set(AUTH_SESSION_COOKIE, (await createSession(reg.user.id)).token);
  return { userId: reg.user.id };
}

beforeEach(() => cookieJar.clear());

describe("GET /api/bucket", () => {
  it("returns 401 when not logged in", async () => {
    const res = await GET(new Request("http://localhost/api/bucket"));
    expect(res.status).toBe(401);
  });

  it("returns an empty list for a fresh user", async () => {
    await login();
    const res = await GET(new Request("http://localhost/api/bucket"));
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });
});

describe("POST /api/bucket", () => {
  function makeReq(body: unknown): Request {
    return new Request("http://localhost/api/bucket", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when not logged in", async () => {
    const res = await POST(makeReq({ recipeId: "00000000-0000-0000-0000-000000000000" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing recipeId", async () => {
    await login();
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("returns 201 on successful add", async () => {
    const { userId } = await login();
    const recipe = await createRecipe(userId, SAMPLE);
    const res = await POST(makeReq({ recipeId: recipe.id }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.item.recipeId).toBe(recipe.id);
  });

  it("returns 409 on duplicate add", async () => {
    const { userId } = await login();
    const recipe = await createRecipe(userId, SAMPLE);
    await POST(makeReq({ recipeId: recipe.id }));
    const dup = await POST(makeReq({ recipeId: recipe.id }));
    expect(dup.status).toBe(409);
  });
});

describe("DELETE /api/bucket (clear all)", () => {
  it("returns 401 when not logged in", async () => {
    const res = await DELETE_ALL(new Request("http://localhost/api/bucket", { method: "DELETE" }));
    expect(res.status).toBe(401);
  });

  it("clears the bucket and returns the count", async () => {
    const { userId } = await login();
    const r1 = await createRecipe(userId, SAMPLE);
    const r2 = await createRecipe(userId, SAMPLE);
    await POST(new Request("http://localhost/api/bucket", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId: r1.id }),
    }));
    await POST(new Request("http://localhost/api/bucket", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipeId: r2.id }),
    }));
    const res = await DELETE_ALL(new Request("http://localhost/api/bucket", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect((await res.json()).cleared).toBe(2);
  });
});
