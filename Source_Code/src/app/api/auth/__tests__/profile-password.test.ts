import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import * as pwRoute from "@/app/api/auth/profile/password/route";
import { authenticateUser, registerUser, createSession } from "@/lib/auth";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";

const handler = pwRoute.PATCH ?? pwRoute.PUT ?? pwRoute.POST;

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/profile/password", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => cookieJar.clear());

describe("password change endpoint", () => {
  it("returns 401 when not logged in", async () => {
    const res = await handler(makeRequest({
      currentPassword: "Strong1Pass",
      newPassword: "Different1Pass",
    }));
    expect(res.status).toBe(401);
  });

  it("rotates the password when current is correct", async () => {
    const reg = registerUser({
      name: "U", email: "u@x.com", password: "Strong1Pass",
    });
    if (!("user" in reg)) throw new Error("setup failed");
    cookieJar.set(AUTH_SESSION_COOKIE, createSession(reg.user.id).token);

    const res = await handler(makeRequest({
      currentPassword: "Strong1Pass",
      newPassword: "Different1Pass",
    }));
    expect(res.status).toBe(200);
    expect(authenticateUser("u@x.com", "Different1Pass")?.email).toBe("u@x.com");
    expect(authenticateUser("u@x.com", "Strong1Pass")).toBeNull();
  });

  it("rejects wrong current password", async () => {
    const reg = registerUser({
      name: "V", email: "v@x.com", password: "Strong1Pass",
    });
    if (!("user" in reg)) throw new Error("setup failed");
    cookieJar.set(AUTH_SESSION_COOKIE, createSession(reg.user.id).token);

    const res = await handler(makeRequest({
      currentPassword: "WrongOne1Pass",
      newPassword: "Different1Pass",
    }));
    expect(res.status).toBe(400);
  });
});
