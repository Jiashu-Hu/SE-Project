import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/auth/forgot-password/route";
import { registerUser } from "@/lib/auth";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/forgot-password", () => {
  it("returns 200 for a known email", async () => {
    registerUser({ name: "A", email: "a@x.com", password: "Strong1Pass" });
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
});
