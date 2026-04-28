// Idempotent dev seed: inserts the canonical test user (test@test.com / test).
// No-op if the email already exists. Run via: `npm run db:seed`.
//
// Reads DATABASE_URL from .env.local (Next.js loads it at runtime, but this
// script doesn't go through Next.js — it loads .env.local manually).
import fs from "node:fs";
import path from "node:path";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { Pool } from "pg";

function loadEnvLocal() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2];
    }
  }
}

const HASH_ITERATIONS = 120_000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

const SEED_EMAIL = "test@test.com";
const SEED_NAME = "Test User";
const SEED_PASSWORD = "test";

async function main() {
  loadEnvLocal();

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set. Add it to Source_Code/.env.local.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const existing = await pool.query(
      "select id from users where email = $1",
      [SEED_EMAIL]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      console.log(`Seed user ${SEED_EMAIL} already exists. Nothing to do.`);
      return;
    }

    const salt = randomBytes(16).toString("hex");
    const hash = pbkdf2Sync(
      SEED_PASSWORD,
      salt,
      HASH_ITERATIONS,
      KEY_LENGTH,
      DIGEST
    ).toString("hex");

    await pool.query(
      `insert into users (email, name, password_salt, password_hash)
       values ($1, $2, $3, $4)`,
      [SEED_EMAIL, SEED_NAME, salt, hash]
    );

    console.log(`Seeded ${SEED_EMAIL} (password: "${SEED_PASSWORD}").`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
