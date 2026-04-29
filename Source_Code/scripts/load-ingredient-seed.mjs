// Loads the committed ingredient seed into the database.
// Run once after the Phase B migration is applied.
//
// Usage:
//   cd Source_Code
//   node scripts/load-ingredient-seed.mjs
//
// Reads DATABASE_URL from .env.local if not already set.
// Idempotent: ON CONFLICT DO NOTHING.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

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

loadEnvLocal();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set. Add it to Source_Code/.env.local.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, ssl: url.includes("supabase") ? { rejectUnauthorized: false } : undefined });
const seed = JSON.parse(
  fs.readFileSync(path.resolve("data/ingredient-seed.json"), "utf8")
);

let inserted = 0;
let skipped = 0;
try {
  for (const r of seed) {
    const norm = String(r.name).trim().toLowerCase();
    const result = await pool.query(
      `insert into ingredients (user_id, name, name_normalized, default_unit, aisle, source)
         values (null, $1, $2, $3, $4, 'seed')
         on conflict (user_id, name_normalized) do nothing`,
      [r.name, norm, r.defaultUnit, r.aisle]
    );
    if (result.rowCount > 0) inserted++;
    else skipped++;
  }
  console.log(`Seed load: ${inserted} inserted, ${skipped} skipped (already present).`);
} finally {
  await pool.end();
}
