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

const HASH_ITERATIONS = 120_000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
const MOCK_USER_EMAIL = "test@test.com";
const MOCK_USER_PASSWORD = "test";
const MOCK_USER_NAME = "Test User";

const globalForAuth = globalThis as typeof globalThis & {
  authStore?: AuthStore;
};

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

  for (const user of getAuthStore().usersByEmail.values()) {
    if (user.id === session.userId) {
      return toPublicUser(user);
    }
  }

  return null;
}

export function deleteSession(token: string): void {
  getAuthStore().sessionsByToken.delete(token);
}
