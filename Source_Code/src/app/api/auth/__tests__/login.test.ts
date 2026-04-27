import { describe, it, expect, beforeEach } from "vitest";
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { POST as loginPOST } from "@/app/api/auth/login/route";

function makeRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await registerPOST(makeRequest("/api/auth/register", {
    name: "Alice",
    email: "alice@example.com",
    password: "Strong1Pass",
  }));
});

describe("POST /api/auth/login", () => {
  it("authenticates valid credentials and sets cookie", async () => {
    const res = await loginPOST(makeRequest("/api/auth/login", {
      email: "alice@example.com",
      password: "Strong1Pass",
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("alice@example.com");
    expect(res.headers.get("set-cookie")).toMatch(/session/i);
  });

  it("rejects wrong password with 401", async () => {
    const res = await loginPOST(makeRequest("/api/auth/login", {
      email: "alice@example.com",
      password: "WrongOne1Pass",
    }));
    expect(res.status).toBe(401);
  });

  it("rejects unknown email with 401", async () => {
    const res = await loginPOST(makeRequest("/api/auth/login", {
      email: "ghost@example.com",
      password: "Strong1Pass",
    }));
    expect(res.status).toBe(401);
  });

  it("rejects malformed payload with 400", async () => {
    const res = await loginPOST(makeRequest("/api/auth/login", {
      email: "not-an-email",
      password: "",
    }));
    expect(res.status).toBe(400);
  });
});
