import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { GET } from "@/app/api/ingredients/route";
import { registerUser, createSession } from "@/lib/auth";
import { seedGlobal } from "@/lib/ingredients";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";

async function login() {
  const reg = await registerUser({
    name: "U", email: `u-${Math.random()}@x.com`, password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  cookieJar.set(AUTH_SESSION_COOKIE, (await createSession(reg.user.id)).token);
  return { userId: reg.user.id };
}

beforeEach(() => cookieJar.clear());

describe("GET /api/ingredients", () => {
  it("returns 401 when not logged in", async () => {
    const res = await GET(new Request("http://localhost/api/ingredients?q=tom"));
    expect(res.status).toBe(401);
  });

  it("returns empty items when q is missing", async () => {
    await login();
    const res = await GET(new Request("http://localhost/api/ingredients"));
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });

  it("returns empty items when q is empty", async () => {
    await login();
    const res = await GET(new Request("http://localhost/api/ingredients?q="));
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });

  it("returns matching catalog entries by prefix", async () => {
    await login();
    await seedGlobal([
      { name: "Tomato", defaultUnit: "whole", aisle: "Produce" },
      { name: "Tomato sauce", defaultUnit: "cup", aisle: "Pantry" },
      { name: "Salt", defaultUnit: "tsp", aisle: "Pantry" },
    ]);
    const res = await GET(new Request("http://localhost/api/ingredients?q=tom"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.map((i: { name: string }) => i.name)).toEqual([
      "Tomato",
      "Tomato sauce",
    ]);
  });

  it("respects explicit limit param (capped at 20)", async () => {
    await login();
    const rows = Array.from({ length: 25 }, (_, i) => ({
      name: `Apple ${i.toString().padStart(2, "0")}`,
      defaultUnit: "whole",
      aisle: "Produce" as const,
    }));
    await seedGlobal(rows);
    const res = await GET(
      new Request("http://localhost/api/ingredients?q=apple&limit=999")
    );
    expect((await res.json()).items).toHaveLength(20);
  });
});
