import { describe, it, expect } from "vitest";
import {
  validateName,
  validateEmail,
  validatePassword,
} from "@/lib/auth-validation";

describe("validateName", () => {
  it("rejects names shorter than 2 characters", () => {
    expect(validateName("a").valid).toBe(false);
    expect(validateName(" ").valid).toBe(false);
  });

  it("rejects names longer than 80 characters", () => {
    expect(validateName("x".repeat(81)).valid).toBe(false);
  });

  it("accepts a normal name", () => {
    expect(validateName("Jiashu Hu").valid).toBe(true);
  });
});

describe("validateEmail", () => {
  it("rejects malformed addresses", () => {
    expect(validateEmail("not-an-email").valid).toBe(false);
    expect(validateEmail("missing@tld").valid).toBe(false);
    expect(validateEmail("@no-local.com").valid).toBe(false);
  });

  it("accepts a well-formed address", () => {
    expect(validateEmail("a@b.co").valid).toBe(true);
  });
});

describe("validatePassword", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(validatePassword("Aa1").valid).toBe(false);
  });

  it("requires upper, lower, and digit", () => {
    expect(validatePassword("alllowercase1").valid).toBe(false);
    expect(validatePassword("ALLUPPERCASE1").valid).toBe(false);
    expect(validatePassword("NoDigitsHere").valid).toBe(false);
  });

  it("accepts a strong password", () => {
    expect(validatePassword("Strong1Pass").valid).toBe(true);
  });
});
