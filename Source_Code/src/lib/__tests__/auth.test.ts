import { describe, it, expect } from "vitest";
import {
  registerUser,
  authenticateUser,
  createSession,
  getSession,
  getUserBySessionToken,
  deleteSession,
  updateUserProfile,
  changeUserPassword,
  createPasswordResetToken,
  resetPasswordWithToken,
} from "@/lib/auth";

describe("registerUser", () => {
  it("creates a new user", () => {
    const result = registerUser({
      name: "Alice",
      email: "alice@example.com",
      password: "Strong1Pass",
    });
    expect("user" in result).toBe(true);
    if ("user" in result) {
      expect(result.user.email).toBe("alice@example.com");
      expect(result.user.name).toBe("Alice");
    }
  });

  it("rejects duplicate emails (case insensitive)", () => {
    registerUser({ name: "Alice", email: "alice@example.com", password: "Strong1Pass" });
    const dup = registerUser({
      name: "Alice 2",
      email: "ALICE@example.com",
      password: "Strong1Pass",
    });
    expect("error" in dup).toBe(true);
  });
});

describe("authenticateUser", () => {
  it("returns the user for correct credentials", () => {
    registerUser({ name: "Bob", email: "bob@example.com", password: "Strong1Pass" });
    const u = authenticateUser("bob@example.com", "Strong1Pass");
    expect(u?.email).toBe("bob@example.com");
  });

  it("returns null for wrong password", () => {
    registerUser({ name: "Bob", email: "bob@example.com", password: "Strong1Pass" });
    expect(authenticateUser("bob@example.com", "wrong")).toBeNull();
  });

  it("returns null for unknown email", () => {
    expect(authenticateUser("ghost@example.com", "whatever")).toBeNull();
  });

  it("authenticates the seeded test user", () => {
    expect(authenticateUser("test@test.com", "test")?.name).toBe("Test User");
  });
});

describe("session lifecycle", () => {
  it("creates, retrieves, and deletes a session", () => {
    const reg = registerUser({ name: "Carol", email: "c@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const session = createSession(reg.user.id);
    expect(session.userId).toBe(reg.user.id);
    expect(getSession(session.token)).toEqual(session);
    expect(getUserBySessionToken(session.token)?.id).toBe(reg.user.id);

    deleteSession(session.token);
    expect(getSession(session.token)).toBeNull();
  });

  it("session expiresAt is approximately 24h from now", () => {
    const reg = registerUser({ name: "D", email: "d@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");
    const session = createSession(reg.user.id);

    const expectedMs = Date.now() + 1000 * 60 * 60 * 24;
    const actualMs = new Date(session.expiresAt).getTime();
    // Allow a 5-second slack for test execution.
    expect(Math.abs(actualMs - expectedMs)).toBeLessThan(5_000);
  });
});

describe("updateUserProfile", () => {
  it("updates name and email", () => {
    const reg = registerUser({ name: "E", email: "e@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const result = updateUserProfile({
      userId: reg.user.id,
      name: "Eve",
      email: "eve@x.com",
    });
    expect("user" in result).toBe(true);
    if ("user" in result) {
      expect(result.user.name).toBe("Eve");
      expect(result.user.email).toBe("eve@x.com");
    }
  });

  it("rejects email already in use by another user", () => {
    registerUser({ name: "F1", email: "f1@x.com", password: "Strong1Pass" });
    const reg2 = registerUser({ name: "F2", email: "f2@x.com", password: "Strong1Pass" });
    if (!("user" in reg2)) throw new Error("setup failed");

    const result = updateUserProfile({
      userId: reg2.user.id,
      name: "F2",
      email: "f1@x.com",
    });
    expect("error" in result).toBe(true);
  });
});

describe("changeUserPassword", () => {
  it("rotates password when current password is correct", () => {
    const reg = registerUser({ name: "G", email: "g@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const result = changeUserPassword({
      userId: reg.user.id,
      currentPassword: "Strong1Pass",
      newPassword: "Different1Pass",
    });
    expect("success" in result).toBe(true);
    expect(authenticateUser("g@x.com", "Strong1Pass")).toBeNull();
    expect(authenticateUser("g@x.com", "Different1Pass")?.email).toBe("g@x.com");
  });

  it("rejects when current password is wrong", () => {
    const reg = registerUser({ name: "H", email: "h@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const result = changeUserPassword({
      userId: reg.user.id,
      currentPassword: "WrongCurrent1",
      newPassword: "Different1Pass",
    });
    expect("error" in result).toBe(true);
  });

  it("rejects when new password equals current", () => {
    const reg = registerUser({ name: "I", email: "i@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const result = changeUserPassword({
      userId: reg.user.id,
      currentPassword: "Strong1Pass",
      newPassword: "Strong1Pass",
    });
    expect("error" in result).toBe(true);
  });
});

describe("password reset flow", () => {
  it("issues a token for an existing email and resets the password", () => {
    registerUser({ name: "J", email: "j@x.com", password: "Strong1Pass" });

    const issued = createPasswordResetToken("j@x.com");
    expect("token" in issued).toBe(true);
    if (!("token" in issued)) return;
    expect(issued.token).not.toBe("");

    const reset = resetPasswordWithToken(issued.token, "Different1Pass");
    expect("success" in reset).toBe(true);
    expect(authenticateUser("j@x.com", "Different1Pass")?.email).toBe("j@x.com");
  });

  it("returns an empty token for an unknown email (no enumeration)", () => {
    const issued = createPasswordResetToken("ghost@example.com");
    expect("token" in issued).toBe(true);
    if ("token" in issued) {
      expect(issued.token).toBe("");
    }
  });

  it("rejects an unknown reset token", () => {
    const reset = resetPasswordWithToken("not-a-real-token", "Different1Pass");
    expect("error" in reset).toBe(true);
  });
});
