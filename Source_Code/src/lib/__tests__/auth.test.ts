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
  it("creates a new user", async () => {
    const result = await registerUser({
      name: "Alice",
      email: "alice@example.com",
      password: "Strong1Pass",
    });
    expect("user" in result).toBe(true);
    if ("user" in result) {
      expect(result.user.email).toBe("alice@example.com");
      expect(result.user.name).toBe("Alice");
      expect(result.user.id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("rejects duplicate emails (case insensitive)", async () => {
    await registerUser({ name: "Alice", email: "alice@example.com", password: "Strong1Pass" });
    const dup = await registerUser({
      name: "Alice 2",
      email: "ALICE@example.com",
      password: "Strong1Pass",
    });
    expect("error" in dup).toBe(true);
  });
});

describe("authenticateUser", () => {
  it("returns the user for correct credentials", async () => {
    await registerUser({ name: "Bob", email: "bob@example.com", password: "Strong1Pass" });
    const u = await authenticateUser("bob@example.com", "Strong1Pass");
    expect(u?.email).toBe("bob@example.com");
  });

  it("returns null for wrong password", async () => {
    await registerUser({ name: "Bob", email: "bob@example.com", password: "Strong1Pass" });
    expect(await authenticateUser("bob@example.com", "wrong")).toBeNull();
  });

  it("returns null for unknown email", async () => {
    expect(await authenticateUser("ghost@example.com", "whatever")).toBeNull();
  });
});

describe("session lifecycle", () => {
  it("creates, retrieves, and deletes a session", async () => {
    const reg = await registerUser({ name: "Carol", email: "c@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const session = await createSession(reg.user.id);
    expect(session.userId).toBe(reg.user.id);
    expect(await getSession(session.token)).toEqual(session);
    expect((await getUserBySessionToken(session.token))?.id).toBe(reg.user.id);

    await deleteSession(session.token);
    expect(await getSession(session.token)).toBeNull();
  });

  it("session expiresAt is approximately 24h from now", async () => {
    const reg = await registerUser({ name: "D", email: "d@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");
    const session = await createSession(reg.user.id);

    const expectedMs = Date.now() + 1000 * 60 * 60 * 24;
    const actualMs = new Date(session.expiresAt).getTime();
    expect(Math.abs(actualMs - expectedMs)).toBeLessThan(5_000);
  });

  it("getSession returns null for expired sessions", async () => {
    const reg = await registerUser({ name: "E", email: "e@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");
    const session = await createSession(reg.user.id);
    // Force-expire by updating the row directly. Imported here to keep the
    // test independent of any hypothetical "advance clock" lib helper.
    const { getDb } = await import("@/lib/db");
    await getDb().query(
      "update sessions set expires_at = now() - interval '1 minute' where token = $1",
      [session.token]
    );
    expect(await getSession(session.token)).toBeNull();
  });

  it("getSession returns null for malformed tokens", async () => {
    expect(await getSession("not-a-uuid")).toBeNull();
  });
});

describe("updateUserProfile", () => {
  it("updates name and email", async () => {
    const reg = await registerUser({ name: "F", email: "f@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const result = await updateUserProfile({
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

  it("rejects email already in use by another user", async () => {
    await registerUser({ name: "G1", email: "g1@x.com", password: "Strong1Pass" });
    const reg2 = await registerUser({ name: "G2", email: "g2@x.com", password: "Strong1Pass" });
    if (!("user" in reg2)) throw new Error("setup failed");

    const result = await updateUserProfile({
      userId: reg2.user.id,
      name: "G2",
      email: "g1@x.com",
    });
    expect("error" in result).toBe(true);
  });

  it("returns error for unknown userId (malformed UUID)", async () => {
    const result = await updateUserProfile({
      userId: "not-a-uuid",
      name: "X",
      email: "x@x.com",
    });
    expect("error" in result).toBe(true);
  });
});

describe("changeUserPassword", () => {
  it("rotates password when current password is correct", async () => {
    const reg = await registerUser({ name: "H", email: "h@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const result = await changeUserPassword({
      userId: reg.user.id,
      currentPassword: "Strong1Pass",
      newPassword: "Different1Pass",
    });
    expect("success" in result).toBe(true);
    expect(await authenticateUser("h@x.com", "Strong1Pass")).toBeNull();
    expect((await authenticateUser("h@x.com", "Different1Pass"))?.email).toBe("h@x.com");
  });

  it("rejects when current password is wrong", async () => {
    const reg = await registerUser({ name: "I", email: "i@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const result = await changeUserPassword({
      userId: reg.user.id,
      currentPassword: "WrongCurrent1",
      newPassword: "Different1Pass",
    });
    expect("error" in result).toBe(true);
  });

  it("rejects when new password equals current", async () => {
    const reg = await registerUser({ name: "J", email: "j@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");

    const result = await changeUserPassword({
      userId: reg.user.id,
      currentPassword: "Strong1Pass",
      newPassword: "Strong1Pass",
    });
    expect("error" in result).toBe(true);
  });
});

describe("password reset flow", () => {
  it("issues a token for an existing email and resets the password", async () => {
    await registerUser({ name: "K", email: "k@x.com", password: "Strong1Pass" });

    const issued = await createPasswordResetToken("k@x.com");
    expect("token" in issued).toBe(true);
    if (!("token" in issued)) return;
    expect(issued.token).not.toBe("");

    const reset = await resetPasswordWithToken(issued.token, "Different1Pass");
    expect("success" in reset).toBe(true);
    expect((await authenticateUser("k@x.com", "Different1Pass"))?.email).toBe("k@x.com");
  });

  it("returns an empty token for an unknown email (no enumeration)", async () => {
    const issued = await createPasswordResetToken("ghost@example.com");
    expect("token" in issued).toBe(true);
    if ("token" in issued) {
      expect(issued.token).toBe("");
    }
  });

  it("rejects a malformed reset token", async () => {
    const reset = await resetPasswordWithToken("not-a-real-token", "Different1Pass");
    expect("error" in reset).toBe(true);
  });

  it("rejects an expired reset token", async () => {
    const reg = await registerUser({ name: "L", email: "l@x.com", password: "Strong1Pass" });
    if (!("user" in reg)) throw new Error("setup failed");
    const issued = await createPasswordResetToken("l@x.com");
    if (!("token" in issued) || issued.token === "") {
      throw new Error("setup failed");
    }
    const { getDb } = await import("@/lib/db");
    await getDb().query(
      "update password_reset_tokens set expires_at = now() - interval '1 minute' where token = $1",
      [issued.token]
    );
    const reset = await resetPasswordWithToken(issued.token, "Different1Pass");
    expect("error" in reset).toBe(true);
  });
});
