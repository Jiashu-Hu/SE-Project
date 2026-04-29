// Dev-only: regenerates Source_Code/data/ingredient-seed.json via GPTGOD.
// Commit the JSON output. Production deploys never run this script.
//
// Usage:
//   cd Source_Code
//   GPTGOD_KEY=... node scripts/generate-ingredient-seed.mjs
//
// Idempotent — overwrites the file. Reviewers should eyeball the result.

import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";

const KEY = process.env.GPTGOD_KEY;
if (!KEY) {
  console.error("GPTGOD_KEY is required.");
  process.exit(1);
}

const client = new OpenAI({ apiKey: KEY, baseURL: "https://api.gptgod.online/v1" });

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ingredients"],
  properties: {
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "defaultUnit", "aisle"],
        properties: {
          name: { type: "string" },
          defaultUnit: { type: "string" },
          aisle: {
            type: "string",
            enum: [
              "Produce",
              "Dairy & Eggs",
              "Meat & Seafood",
              "Bakery",
              "Pantry",
              "Frozen",
              "Other",
            ],
          },
        },
      },
    },
  },
};

const SYSTEM = `You produce structured JSON of common cooking ingredients.

Each ingredient has:
- name: canonical English name, capitalized first letter (e.g. "Olive oil", "Tomato")
- defaultUnit: a typical measure unit; one of: tbsp, tsp, cup, g, kg, ml, l, whole, oz, lb, slice, clove, can, bunch, pinch, "" (empty if none typical)
- aisle: the supermarket aisle from the listed enum`;

const USER = `Give me about 200 of the most commonly used cooking ingredients in home cooking, spanning Produce, Dairy & Eggs, Meat & Seafood, Bakery, Pantry, and Frozen. Include staples (salt, sugar, flour, butter, eggs), common produce, common proteins, common condiments and spices, common baking goods. No duplicates by lowercased name. Return strictly the JSON object.`;

const response = await client.chat.completions.create({
  model: "gpt-4.1-mini",
  max_tokens: 4096,
  messages: [
    { role: "system", content: SYSTEM },
    { role: "user", content: USER },
  ],
  response_format: {
    type: "json_schema",
    json_schema: { name: "ingredient_seed", strict: true, schema: SCHEMA },
  },
});

const content = response.choices[0]?.message?.content;
if (!content) {
  console.error("No content from model.");
  process.exit(1);
}

const parsed = JSON.parse(content);
const seen = new Set();
const dedup = [];
for (const r of parsed.ingredients) {
  const key = String(r.name).trim().toLowerCase();
  if (!key || seen.has(key)) continue;
  seen.add(key);
  dedup.push({
    name: String(r.name).trim(),
    defaultUnit: String(r.defaultUnit ?? "").trim(),
    aisle: r.aisle,
  });
}

const outPath = path.resolve("data/ingredient-seed.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(dedup, null, 2));
console.log(`Wrote ${dedup.length} entries to ${outPath}`);
