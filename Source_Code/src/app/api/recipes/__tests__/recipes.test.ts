import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { POST } from "@/app/api/recipes/route";
import { registerUser, createSession } from "@/lib/auth";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";

const validBody = {
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

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function logIn(): string {
  const reg = registerUser({
    name: "Chef", email: "chef@x.com", password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  const session = createSession(reg.user.id);
  cookieJar.set(AUTH_SESSION_COOKIE, session.token);
  return reg.user.id;
}

beforeEach(() => cookieJar.clear());

describe("POST /api/recipes", () => {
  it("returns 401 when not logged in", async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("creates a recipe owned by the logged-in user", async () => {
    const userId = logIn();
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.recipe.title).toBe("Pasta");
    expect(body.recipe.authorId).toBe(userId);
  });

  it("rejects an invalid payload with 400", async () => {
    logIn();
    const res = await POST(makeRequest({ ...validBody, title: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON with 400", async () => {
    logIn();
    const req = new Request("http://localhost/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
