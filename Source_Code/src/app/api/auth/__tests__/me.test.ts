import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { GET } from "@/app/api/auth/me/route";
import { registerUser, createSession } from "@/lib/auth";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";

beforeEach(() => cookieJar.clear());

describe("GET /api/auth/me", () => {
  it("returns 401 when no session cookie is present", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the current user when the cookie is valid", async () => {
    const reg = await registerUser({
      name: "Alice",
      email: "alice@example.com",
      password: "Strong1Pass",
    });
    if (!("user" in reg)) throw new Error("setup failed");
    const session = await createSession(reg.user.id);
    cookieJar.set(AUTH_SESSION_COOKIE, session.token);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("alice@example.com");
  });
});
