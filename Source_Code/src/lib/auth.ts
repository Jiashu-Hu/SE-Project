import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { AuthSession, AuthUser } from "@/types/auth";

interface StoredUser extends AuthUser {
  readonly passwordSalt: string;
  readonly passwordHash: string;
}

interface AuthStore {
  readonly usersByEmail: Map<string, StoredUser>;
  readonly sessionsByToken: Map<string, AuthSession>;
}

interface RegisterInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

interface UpdateProfileInput {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
}

interface ChangePasswordInput {
  readonly userId: string;
  readonly currentPassword: string;
  readonly newPassword: string;
}

const HASH_ITERATIONS = 120_000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
const RESET_TOKEN_DURATION_MS = 1000 * 60 * 60; // 1 hour
const MOCK_USER_EMAIL = "test@test.com";
const MOCK_USER_PASSWORD = "test";
const MOCK_USER_NAME = "Test User";

interface PasswordResetToken {
  readonly token: string;
  readonly userId: string;
  readonly expiresAt: string;
}

interface PasswordResetStore {
  readonly tokensByValue: Map<string, PasswordResetToken>;
}

const globalForAuth = globalThis as typeof globalThis & {
  authStore?: AuthStore;
  passwordResetStore?: PasswordResetStore;
};

function getPasswordResetStore(): PasswordResetStore {
  if (!globalForAuth.passwordResetStore) {
    globalForAuth.passwordResetStore = { tokensByValue: new Map() };
  }
  return globalForAuth.passwordResetStore;
}

function cleanupExpiredResetTokens(): void {
  const now = Date.now();
  const store = getPasswordResetStore();
  for (const [token, entry] of store.tokensByValue.entries()) {
    if (new Date(entry.expiresAt).getTime() <= now) {
      store.tokensByValue.delete(token);
    }
  }
}

function getAuthStore(): AuthStore {
  if (!globalForAuth.authStore) {
    const seededAt = new Date().toISOString();
    const seedSalt = randomBytes(16).toString("hex");
    const mockUser: StoredUser = {
      id: "seed-test-user",
      name: MOCK_USER_NAME,
      email: MOCK_USER_EMAIL,
      createdAt: seededAt,
      passwordSalt: seedSalt,
      passwordHash: hashPassword(MOCK_USER_PASSWORD, seedSalt),
    };

    const usersByEmail = new Map<string, StoredUser>();
    usersByEmail.set(MOCK_USER_EMAIL, mockUser);

    globalForAuth.authStore = {
      usersByEmail,
      sessionsByToken: new Map<string, AuthSession>(),
    };
  }

  return globalForAuth.authStore;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, HASH_ITERATIONS, KEY_LENGTH, DIGEST).toString(
    "hex"
  );
}

function isPasswordMatch(password: string, salt: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}

function toPublicUser(user: StoredUser): AuthUser {
  const { id, name, email, createdAt } = user;
  return { id, name, email, createdAt };
}

function getStoredUserById(userId: string): StoredUser | null {
  for (const user of getAuthStore().usersByEmail.values()) {
    if (user.id === userId) {
      return user;
    }
  }

  return null;
}

function cleanupExpiredSessions(): void {
  const now = Date.now();
  const store = getAuthStore();

  for (const [token, session] of store.sessionsByToken.entries()) {
    if (new Date(session.expiresAt).getTime() <= now) {
      store.sessionsByToken.delete(token);
    }
  }
}

export function registerUser(input: RegisterInput):
  | { readonly user: AuthUser }
  | { readonly error: string } {
  const store = getAuthStore();
  const normalizedEmail = normalizeEmail(input.email);

  if (store.usersByEmail.has(normalizedEmail)) {
    return { error: "An account with this email already exists." };
  }

  const now = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const user: StoredUser = {
    id: randomUUID(),
    name: input.name.trim(),
    email: normalizedEmail,
    createdAt: now,
    passwordSalt: salt,
    passwordHash: hashPassword(input.password, salt),
  };

  store.usersByEmail.set(normalizedEmail, user);

  return { user: toPublicUser(user) };
}

export function authenticateUser(email: string, password: string): AuthUser | null {
  const normalizedEmail = normalizeEmail(email);
  const user = getAuthStore().usersByEmail.get(normalizedEmail);

  if (!user) {
    return null;
  }

  if (!isPasswordMatch(password, user.passwordSalt, user.passwordHash)) {
    return null;
  }

  return toPublicUser(user);
}

export function createSession(userId: string): AuthSession {
  cleanupExpiredSessions();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  const session: AuthSession = {
    token: randomUUID(),
    userId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  getAuthStore().sessionsByToken.set(session.token, session);
  return session;
}

export function getSession(token: string): AuthSession | null {
  cleanupExpiredSessions();

  const session = getAuthStore().sessionsByToken.get(token);
  if (!session) {
    return null;
  }

  return session;
}

export function getUserBySessionToken(token: string): AuthUser | null {
  const session = getSession(token);

  if (!session) {
    return null;
  }

  const user = getStoredUserById(session.userId);
  if (user) {
    return toPublicUser(user);
  }

  return null;
}

export function deleteSession(token: string): void {
  getAuthStore().sessionsByToken.delete(token);
}

export function updateUserProfile(input: UpdateProfileInput):
  | { readonly user: AuthUser }
  | { readonly error: string } {
  const store = getAuthStore();
  const existingUser = getStoredUserById(input.userId);

  if (!existingUser) {
    return { error: "User not found." };
  }

  const normalizedEmail = normalizeEmail(input.email);
  const emailOwner = store.usersByEmail.get(normalizedEmail);
  if (emailOwner && emailOwner.id !== existingUser.id) {
    return { error: "An account with this email already exists." };
  }

  const updatedUser: StoredUser = {
    ...existingUser,
    name: input.name.trim(),
    email: normalizedEmail,
  };

  if (normalizedEmail !== existingUser.email) {
    store.usersByEmail.delete(existingUser.email);
  }

  store.usersByEmail.set(normalizedEmail, updatedUser);
  return { user: toPublicUser(updatedUser) };
}

export function changeUserPassword(input: ChangePasswordInput):
  | { readonly success: true }
  | { readonly error: string } {
  const store = getAuthStore();
  const existingUser = getStoredUserById(input.userId);

  if (!existingUser) {
    return { error: "User not found." };
  }

  if (
    !isPasswordMatch(
      input.currentPassword,
      existingUser.passwordSalt,
      existingUser.passwordHash
    )
  ) {
    return { error: "Current password is incorrect." };
  }

  if (input.currentPassword === input.newPassword) {
    return {
      error: "New password must be different from your current password.",
    };
  }

  const newSalt = randomBytes(16).toString("hex");
  const updatedUser: StoredUser = {
    ...existingUser,
    passwordSalt: newSalt,
    passwordHash: hashPassword(input.newPassword, newSalt),
  };

  store.usersByEmail.set(existingUser.email, updatedUser);
  return { success: true };
}

export function createPasswordResetToken(
  email: string
): { readonly token: string } | { readonly error: string } {
  cleanupExpiredResetTokens();

  const normalizedEmail = normalizeEmail(email);
  const user = getAuthStore().usersByEmail.get(normalizedEmail);

  if (!user) {
    // Return a generic message to avoid leaking whether an email exists.
    return { token: "" };
  }

  const expiresAt = new Date(Date.now() + RESET_TOKEN_DURATION_MS).toISOString();
  const token = randomUUID();

  getPasswordResetStore().tokensByValue.set(token, {
    token,
    userId: user.id,
    expiresAt,
  });

  return { token };
}

export function resetPasswordWithToken(
  token: string,
  newPassword: string
): { readonly success: true } | { readonly error: string } {
  cleanupExpiredResetTokens();

  const store = getPasswordResetStore();
  const entry = store.tokensByValue.get(token);

  if (!entry) {
    return { error: "Invalid or expired reset token." };
  }

  const user = getStoredUserById(entry.userId);
  if (!user) {
    return { error: "User not found." };
  }

  const newSalt = randomBytes(16).toString("hex");
  const updatedUser: StoredUser = {
    ...user,
    passwordSalt: newSalt,
    passwordHash: hashPassword(newPassword, newSalt),
  };

  getAuthStore().usersByEmail.set(user.email, updatedUser);
  store.tokensByValue.delete(token);

  return { success: true };
}
