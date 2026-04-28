import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { PATCH, DELETE } from "@/app/api/recipes/[id]/route";
import {
  registerUser,
  createSession,
} from "@/lib/auth";
import { createRecipe } from "@/lib/recipes";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";
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

async function logInAs(email: string): Promise<string> {
  const reg = await registerUser({ name: "U", email, password: "Strong1Pass" });
  if (!("user" in reg)) throw new Error("setup failed");
  cookieJar.set(AUTH_SESSION_COOKIE, (await createSession(reg.user.id)).token);
  return reg.user.id;
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/recipes/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => cookieJar.clear());

describe("PATCH /api/recipes/[id]", () => {
  it("returns 401 when not logged in", async () => {
    const res = await PATCH(patchRequest(samplePayload), paramsFor("any"));
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown recipe id", async () => {
    await logInAs("a@x.com");
    const res = await PATCH(patchRequest(samplePayload), paramsFor("00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when editing another user's recipe", async () => {
    const aliceId = await logInAs("alice@x.com");
    const recipe = await createRecipe(aliceId, samplePayload);
    cookieJar.clear();
    await logInAs("bob@x.com");

    const res = await PATCH(patchRequest({ ...samplePayload, title: "Hacked" }), paramsFor(recipe.id));
    expect(res.status).toBe(403);
  });

  it("updates a recipe owned by the logged-in user", async () => {
    const userId = await logInAs("a@x.com");
    const recipe = await createRecipe(userId, samplePayload);

    const res = await PATCH(
      patchRequest({ ...samplePayload, title: "Better Toast" }),
      paramsFor(recipe.id)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recipe.title).toBe("Better Toast");
    expect(body.recipe.id).toBe(recipe.id);
  });

  it("rejects an invalid payload with 400", async () => {
    const userId = await logInAs("a@x.com");
    const recipe = await createRecipe(userId, samplePayload);
    const res = await PATCH(patchRequest({ ...samplePayload, title: "" }), paramsFor(recipe.id));
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/recipes/[id]", () => {
  function deleteRequest(): Request {
    return new Request("http://localhost/api/recipes/x", { method: "DELETE" });
  }

  it("returns 401 when not logged in", async () => {
    const res = await DELETE(deleteRequest(), paramsFor("any"));
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown id", async () => {
    await logInAs("a@x.com");
    const res = await DELETE(deleteRequest(), paramsFor("00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when deleting another user's recipe", async () => {
    const aliceId = await logInAs("alice@x.com");
    const recipe = await createRecipe(aliceId, samplePayload);
    cookieJar.clear();
    await logInAs("bob@x.com");

    const res = await DELETE(deleteRequest(), paramsFor(recipe.id));
    expect(res.status).toBe(403);
  });

  it("returns 204 and removes the recipe when the owner deletes it", async () => {
    const userId = await logInAs("a@x.com");
    const recipe = await createRecipe(userId, samplePayload);

    const res = await DELETE(deleteRequest(), paramsFor(recipe.id));
    expect(res.status).toBe(204);
  });
});
