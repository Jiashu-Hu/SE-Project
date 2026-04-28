import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

// Import the route AFTER vi.mock is registered. The profile route exports PATCH.
import { PATCH as handler } from "@/app/api/auth/profile/route";
import { registerUser, createSession } from "@/lib/auth";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function logIn(email: string): Promise<void> {
  const reg = await registerUser({ name: "User", email, password: "Strong1Pass" });
  if (!("user" in reg)) throw new Error("setup failed");
  const session = await createSession(reg.user.id);
  cookieJar.set(AUTH_SESSION_COOKIE, session.token);
}

beforeEach(() => cookieJar.clear());

describe("profile update endpoint", () => {
  it("returns 401 when not logged in", async () => {
    const res = await handler(makeRequest({ name: "X", email: "x@x.com" }));
    expect(res.status).toBe(401);
  });

  it("updates name and email when logged in", async () => {
    await logIn("a@x.com");
    const res = await handler(makeRequest({ name: "New Name", email: "new@x.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("new@x.com");
    expect(body.user.name).toBe("New Name");
  });

  it("rejects taking another user's email", async () => {
    await registerUser({ name: "Other", email: "taken@x.com", password: "Strong1Pass" });
    await logIn("me@x.com");
    const res = await handler(makeRequest({ name: "Me", email: "taken@x.com" }));
    expect([400, 409]).toContain(res.status);
  });
});
