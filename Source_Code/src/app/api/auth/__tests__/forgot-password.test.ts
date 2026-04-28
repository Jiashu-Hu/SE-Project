import { describe, it, expect, vi, afterEach } from "vitest";
import { POST } from "@/app/api/auth/forgot-password/route";
import { registerUser } from "@/lib/auth";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/auth/forgot-password", () => {
  it("returns 200 for a known email", async () => {
    await registerUser({ name: "A", email: "a@x.com", password: "Strong1Pass" });
    const res = await POST(makeRequest({ email: "a@x.com" }));
    expect(res.status).toBe(200);
  });

  it("returns 200 even for an unknown email (no enumeration)", async () => {
    const res = await POST(makeRequest({ email: "ghost@x.com" }));
    expect(res.status).toBe(200);
  });

  it("rejects malformed body with 400", async () => {
    const res = await POST(makeRequest({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  describe("token disclosure", () => {
    it("includes a devToken in the response when NODE_ENV is not production", async () => {
      await registerUser({ name: "A", email: "a@x.com", password: "Strong1Pass" });
      vi.stubEnv("NODE_ENV", "development");

      const res = await POST(makeRequest({ email: "a@x.com" }));
      const body = await res.json();

      expect(typeof body.devToken).toBe("string");
      expect(body.devToken.length).toBeGreaterThan(0);
      // The legacy `token` field must not appear under any name.
      expect(body.token).toBeUndefined();
    });

    it("never includes the token in the response when NODE_ENV is production", async () => {
      await registerUser({ name: "A", email: "a@x.com", password: "Strong1Pass" });
      vi.stubEnv("NODE_ENV", "production");

      const res = await POST(makeRequest({ email: "a@x.com" }));
      const body = await res.json();

      expect(body.devToken).toBeUndefined();
      expect(body.token).toBeUndefined();
    });

    it("returns identical response shape for known and unknown emails in production", async () => {
      await registerUser({ name: "A", email: "a@x.com", password: "Strong1Pass" });
      vi.stubEnv("NODE_ENV", "production");

      const known = await POST(makeRequest({ email: "a@x.com" }));
      const unknown = await POST(makeRequest({ email: "ghost@x.com" }));

      expect(known.status).toBe(unknown.status);
      expect(await known.json()).toEqual(await unknown.json());
    });
  });
});
