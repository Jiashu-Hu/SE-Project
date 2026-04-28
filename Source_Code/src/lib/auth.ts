import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db";
import type { QueryRow } from "@/lib/db";
import type { AuthSession, AuthUser } from "@/types/auth";

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
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24;
const RESET_TOKEN_DURATION_MS = 1000 * 60 * 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, HASH_ITERATIONS, KEY_LENGTH, DIGEST).toString(
    "hex"
  );
}

function isPasswordMatch(
  password: string,
  salt: string,
  expectedHash: string
): boolean {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

interface UserRow extends QueryRow {
  id: string;
  email: string;
  name: string;
  password_salt: string;
  password_hash: string;
  created_at: string | Date;
}

interface SessionRow extends QueryRow {
  token: string;
  user_id: string;
  created_at: string | Date;
  expires_at: string | Date;
}

function rowToPublicUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : row.created_at.toISOString(),
  };
}

function rowToSession(row: SessionRow): AuthSession {
  return {
    token: row.token,
    userId: row.user_id,
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : row.created_at.toISOString(),
    expiresAt:
      typeof row.expires_at === "string"
        ? row.expires_at
        : row.expires_at.toISOString(),
  };
}

export async function registerUser(input: RegisterInput): Promise<
  { readonly user: AuthUser } | { readonly error: string }
> {
  const db = getDb();
  const email = normalizeEmail(input.email);
  const salt = randomBytes(16).toString("hex");
  const hash = hashPassword(input.password, salt);
  const name = input.name.trim();

  try {
    const result = await db.query<UserRow>(
      `insert into users (email, name, password_salt, password_hash)
       values ($1, $2, $3, $4)
       returning id, email, name, password_salt, password_hash, created_at`,
      [email, name, salt, hash]
    );
    return { user: rowToPublicUser(result.rows[0]) };
  } catch (err: unknown) {
    // unique violation on email
    if ((err as { code?: string }).code === "23505") {
      return { error: "An account with this email already exists." };
    }
    throw err;
  }
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<AuthUser | null> {
  const db = getDb();
  const result = await db.query<UserRow>(
    `select id, email, name, password_salt, password_hash, created_at
       from users where email = $1 limit 1`,
    [normalizeEmail(email)]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (!isPasswordMatch(password, row.password_salt, row.password_hash)) {
    return null;
  }
  return rowToPublicUser(row);
}

export async function createSession(userId: string): Promise<AuthSession> {
  const db = getDb();
  const token = randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DURATION_MS);
  const result = await db.query<SessionRow>(
    `insert into sessions (token, user_id, expires_at)
     values ($1, $2, $3)
     returning token, user_id, created_at, expires_at`,
    [token, userId, expires.toISOString()]
  );
  return rowToSession(result.rows[0]);
}

export async function getSession(token: string): Promise<AuthSession | null> {
  if (!isUuid(token)) return null;
  const db = getDb();
  const result = await db.query<SessionRow>(
    `select token, user_id, created_at, expires_at
       from sessions
      where token = $1 and expires_at > now()
      limit 1`,
    [token]
  );
  const row = result.rows[0];
  return row ? rowToSession(row) : null;
}

export async function getUserBySessionToken(
  token: string
): Promise<AuthUser | null> {
  if (!isUuid(token)) return null;
  const db = getDb();
  const result = await db.query<UserRow>(
    `select u.id, u.email, u.name, u.password_salt, u.password_hash, u.created_at
       from users u
       inner join sessions s on s.user_id = u.id
      where s.token = $1 and s.expires_at > now()
      limit 1`,
    [token]
  );
  const row = result.rows[0];
  return row ? rowToPublicUser(row) : null;
}

export async function deleteSession(token: string): Promise<void> {
  if (!isUuid(token)) return;
  const db = getDb();
  await db.query(`delete from sessions where token = $1`, [token]);
}

export async function updateUserProfile(input: UpdateProfileInput): Promise<
  { readonly user: AuthUser } | { readonly error: string }
> {
  if (!isUuid(input.userId)) return { error: "User not found." };
  const db = getDb();
  const newEmail = normalizeEmail(input.email);
  const newName = input.name.trim();

  try {
    const result = await db.query<UserRow>(
      `update users set name = $1, email = $2
        where id = $3
        returning id, email, name, password_salt, password_hash, created_at`,
      [newName, newEmail, input.userId]
    );
    if (result.rowCount === 0) return { error: "User not found." };
    return { user: rowToPublicUser(result.rows[0]) };
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505") {
      return { error: "An account with this email already exists." };
    }
    throw err;
  }
}

export async function changeUserPassword(
  input: ChangePasswordInput
): Promise<{ readonly success: true } | { readonly error: string }> {
  if (!isUuid(input.userId)) return { error: "User not found." };

  const db = getDb();
  const userResult = await db.query<UserRow>(
    `select id, email, name, password_salt, password_hash, created_at
       from users where id = $1 limit 1`,
    [input.userId]
  );
  const user = userResult.rows[0];
  if (!user) return { error: "User not found." };

  if (
    !isPasswordMatch(
      input.currentPassword,
      user.password_salt,
      user.password_hash
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
  const newHash = hashPassword(input.newPassword, newSalt);
  await db.query(
    `update users set password_salt = $1, password_hash = $2 where id = $3`,
    [newSalt, newHash, input.userId]
  );
  return { success: true };
}

export async function createPasswordResetToken(
  email: string
): Promise<{ readonly token: string } | { readonly error: string }> {
  const db = getDb();
  const userResult = await db.query<UserRow>(
    `select id from users where email = $1 limit 1`,
    [normalizeEmail(email)]
  );
  const user = userResult.rows[0];
  if (!user) {
    // Generic empty-token response to avoid leaking enumeration.
    return { token: "" };
  }

  const token = randomUUID();
  const expires = new Date(Date.now() + RESET_TOKEN_DURATION_MS);
  await db.query(
    `insert into password_reset_tokens (token, user_id, expires_at)
     values ($1, $2, $3)`,
    [token, user.id, expires.toISOString()]
  );
  return { token };
}

export async function resetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<{ readonly success: true } | { readonly error: string }> {
  if (!isUuid(token)) return { error: "Invalid or expired reset token." };

  const db = getDb();
  // Atomic: select + delete the token in one round trip via CTE.
  const tokenResult = await db.query<{ user_id: string } & QueryRow>(
    `with deleted as (
       delete from password_reset_tokens
        where token = $1 and expires_at > now()
        returning user_id
     )
     select user_id from deleted`,
    [token]
  );
  const tokenRow = tokenResult.rows[0];
  if (!tokenRow) return { error: "Invalid or expired reset token." };

  const newSalt = randomBytes(16).toString("hex");
  const newHash = hashPassword(newPassword, newSalt);
  await db.query(
    `update users set password_salt = $1, password_hash = $2 where id = $3`,
    [newSalt, newHash, tokenRow.user_id]
  );
  return { success: true };
}
