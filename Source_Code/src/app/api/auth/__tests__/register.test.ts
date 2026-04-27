import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/auth/register/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  it("creates a new user and sets a session cookie", async () => {
    const res = await POST(makeRequest({
      name: "Alice",
      email: "alice@example.com",
      password: "Strong1Pass",
    }));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.user.email).toBe("alice@example.com");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/session/i);
  });

  it("rejects an invalid email", async () => {
    const res = await POST(makeRequest({
      name: "Alice",
      email: "not-an-email",
      password: "Strong1Pass",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects a weak password", async () => {
    const res = await POST(makeRequest({
      name: "Alice",
      email: "alice@example.com",
      password: "short",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects duplicate registrations", async () => {
    const payload = {
      name: "Alice",
      email: "alice@example.com",
      password: "Strong1Pass",
    };
    await POST(makeRequest(payload));
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(409);
  });

  it("rejects malformed JSON body", async () => {
    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
