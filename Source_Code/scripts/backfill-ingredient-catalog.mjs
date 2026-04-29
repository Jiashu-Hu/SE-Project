// One-time backfill: walks every recipe in the database and seeds each author's
// per-user catalog from that recipe's ingredient items. Idempotent — relies on
// the (user_id, name_normalized) unique constraint.
//
// Usage:
//   cd Source_Code
//   DATABASE_URL=... node scripts/backfill-ingredient-catalog.mjs
//
// Notes:
//   - Aisle is classified by the same keyword map used in lib/ingredient-aisles.ts.
//     Items the keyword map can't classify get 'Other'. Users can fix by re-saving.
//   - Source is recorded as 'backfill' so future audits can distinguish them.

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
  console.error("DATABASE_URL is required.");
  process.exit(1);
}
const pool = new pg.Pool({
  connectionString: url,
  ssl: url.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

// Inline copy of the keyword classifier (avoids importing TS into a plain mjs).
const KEYWORDS = {
  Produce: ["tomato","onion","garlic","lettuce","carrot","spinach","kale",
    "apple","banana","orange","lemon","lime","grape","berry","strawberry",
    "potato","cucumber","celery","pepper","mushroom","zucchini","broccoli",
    "cauliflower","ginger","cilantro","parsley","basil","mint","avocado","cabbage"],
  "Dairy & Eggs": ["milk","cheese","yogurt","butter","cream","sour cream","egg","eggs",
    "mozzarella","cheddar","parmesan","ricotta","feta"],
  "Meat & Seafood": ["chicken","beef","pork","lamb","turkey","bacon","sausage","ham",
    "fish","salmon","tuna","cod","shrimp","scallop","prawn"],
  Bakery: ["bread","baguette","croissant","bun","tortilla","pita","naan","bagel"],
  Pantry: ["pasta","spaghetti","rice","flour","sugar","salt","pepper","oil","olive oil",
    "vinegar","soy sauce","honey","cumin","paprika","cinnamon",
    "tomato sauce","stock","broth","baking powder","yeast","oat","cereal",
    "bean","lentil","chickpea","nut","almond","walnut","pecan","peanut"],
  Frozen: ["frozen", "ice cream"],
};

function classify(item) {
  const norm = item.trim().toLowerCase();
  if (!norm) return null;
  for (const [aisle, words] of Object.entries(KEYWORDS)) {
    for (const w of words) if (norm.includes(w)) return aisle;
  }
  return "Other";
}

let recipesSeen = 0;
let pairsConsidered = 0;
let inserted = 0;

try {
  const r = await pool.query(
    "select id, author_id, ingredients from recipes order by created_at"
  );
  for (const row of r.rows) {
    recipesSeen++;
    const ingArr = Array.isArray(row.ingredients) ? row.ingredients : [];
    const seen = new Set();
    for (const ing of ingArr) {
      const item = String(ing?.item ?? "").trim();
      if (!item) continue;
      const norm = item.toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      pairsConsidered++;
      const aisle = classify(item);
      const result = await pool.query(
        `insert into ingredients
           (user_id, name, name_normalized, default_unit, aisle, source)
         values ($1, $2, $3, $4, $5, 'backfill')
         on conflict (user_id, name_normalized) do nothing`,
        [row.author_id, item, norm, String(ing?.unit ?? ""), aisle]
      );
      if (result.rowCount > 0) {
        inserted++;
        // Also sync ingredient_aisles cache.
        await pool.query(
          `insert into ingredient_aisles (item_normalized, aisle, source)
             values ($1, $2, 'llm')
             on conflict (item_normalized) do nothing`,
          [norm, aisle]
        );
      }
    }
  }
  console.log(
    `Backfill done: recipes=${recipesSeen} pairs=${pairsConsidered} inserted=${inserted}`
  );
} finally {
  await pool.end();
}
