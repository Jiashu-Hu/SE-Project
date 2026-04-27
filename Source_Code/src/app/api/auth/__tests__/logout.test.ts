import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { POST } from "@/app/api/auth/logout/route";

beforeEach(() => cookieJar.clear());

describe("POST /api/auth/logout", () => {
  it("returns 200 and clears the session cookie", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    // Either Max-Age=0 or an Expires in the past clears the cookie.
    expect(setCookie.toLowerCase()).toMatch(/max-age=0|expires=/);
  });
});
