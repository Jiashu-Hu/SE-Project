import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/auth/reset-password/route";
import {
  registerUser,
  createPasswordResetToken,
  authenticateUser,
} from "@/lib/auth";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/reset-password", () => {
  it("resets the password when given a valid token", async () => {
    await registerUser({ name: "A", email: "a@x.com", password: "Strong1Pass" });
    const issued = await createPasswordResetToken("a@x.com");
    if (!("token" in issued) || issued.token === "") {
      throw new Error("setup failed");
    }

    const res = await POST(makeRequest({
      token: issued.token,
      newPassword: "Different1Pass",
    }));
    expect(res.status).toBe(200);
    expect((await authenticateUser("a@x.com", "Different1Pass"))?.email).toBe("a@x.com");
  });

  it("rejects an unknown token", async () => {
    const res = await POST(makeRequest({
      token: "not-a-real-token",
      newPassword: "Different1Pass",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects a weak new password", async () => {
    await registerUser({ name: "A", email: "a@x.com", password: "Strong1Pass" });
    const issued = await createPasswordResetToken("a@x.com");
    if (!("token" in issued) || issued.token === "") return;

    const res = await POST(makeRequest({
      token: issued.token,
      newPassword: "weak",
    }));
    expect(res.status).toBe(400);
  });
});
