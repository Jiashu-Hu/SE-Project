import { describe, it, expect } from "vitest";
import { registerUser, createSession } from "@/lib/auth";

describe("session lifetime", () => {
  it("createSession sets expiresAt approximately 24 hours from now", () => {
    const reg = registerUser({
      name: "Test",
      email: "session-lifetime@example.com",
      password: "Strong1Pass",
    });
    if (!("user" in reg)) throw new Error("setup failed: registration returned an error");

    const before = Date.now();
    const session = createSession(reg.user.id);
    const after = Date.now();

    const expiresAtMs = new Date(session.expiresAt).getTime();
    const expectedMin = before + 1000 * 60 * 60 * 24;
    const expectedMax = after + 1000 * 60 * 60 * 24;

    // Tight window: must be 24h ± a few ms of test execution.
    expect(expiresAtMs).toBeGreaterThanOrEqual(expectedMin);
    expect(expiresAtMs).toBeLessThanOrEqual(expectedMax);
  });
});
