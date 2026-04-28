import { getDb } from "@/lib/db";
import type { QueryRow } from "@/lib/db";
import { getOpenAI } from "@/lib/ai-recipe";

export type Aisle =
  | "Produce"
  | "Dairy & Eggs"
  | "Meat & Seafood"
  | "Bakery"
  | "Pantry"
  | "Frozen"
  | "Other";

export const AISLES: readonly Aisle[] = [
  "Produce",
  "Dairy & Eggs",
  "Meat & Seafood",
  "Bakery",
  "Pantry",
  "Frozen",
  "Other",
];

const KEYWORDS: Record<Exclude<Aisle, "Other">, readonly string[]> = {
  "Produce": [
    "tomato","onion","garlic","lettuce","carrot","spinach","kale",
    "apple","banana","orange","lemon","lime","grape","berry","strawberry",
    "potato","cucumber","celery","pepper","mushroom","zucchini","broccoli",
    "cauliflower","ginger","cilantro","parsley","basil","mint","avocado","cabbage",
  ],
  "Dairy & Eggs": [
    "milk","cheese","yogurt","butter","cream","sour cream","egg","eggs",
    "mozzarella","cheddar","parmesan","ricotta","feta",
  ],
  "Meat & Seafood": [
    "chicken","beef","pork","lamb","turkey","bacon","sausage","ham",
    "fish","salmon","tuna","cod","shrimp","scallop","prawn",
  ],
  "Bakery": [
    "bread","baguette","croissant","bun","tortilla","pita","naan","bagel",
  ],
  "Pantry": [
    "pasta","spaghetti","rice","flour","sugar","salt","pepper","oil","olive oil",
    "vinegar","soy sauce","honey","cumin","paprika","cinnamon",
    "tomato sauce","stock","broth","baking powder","yeast","oat","cereal",
    "bean","lentil","chickpea","nut","almond","walnut","pecan","peanut",
  ],
  "Frozen": ["frozen", "ice cream"],
};

function normalize(item: string): string {
  return item.trim().toLowerCase();
}

export function keywordClassify(item: string): Aisle | null {
  const norm = normalize(item);
  if (!norm) return null;
  for (const aisle of Object.keys(KEYWORDS) as Array<keyof typeof KEYWORDS>) {
    for (const kw of KEYWORDS[aisle]) {
      if (norm.includes(kw)) return aisle as Aisle;
    }
  }
  return null;
}

interface AisleRow extends QueryRow {
  item_normalized: string;
  aisle: Aisle;
}

async function lookupCache(
  items: readonly string[]
): Promise<Map<string, Aisle>> {
  if (items.length === 0) return new Map();
  const db = getDb();
  const result = await db.query<AisleRow>(
    `select item_normalized, aisle
       from ingredient_aisles
      where item_normalized = any($1::text[])`,
    [items as unknown[]]
  );
  const map = new Map<string, Aisle>();
  for (const row of result.rows) map.set(row.item_normalized, row.aisle);
  return map;
}

const LLM_SYSTEM = `You categorize grocery ingredients into one of these aisles:
Produce, Dairy & Eggs, Meat & Seafood, Bakery, Pantry, Frozen, Other.
Always return the result via the JSON schema. Use Other for items that don't fit.`;

const LLM_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "classifications",
    strict: true,
    schema: {
      type: "object" as const,
      additionalProperties: false,
      required: ["classifications"],
      properties: {
        classifications: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["item", "aisle"],
            properties: {
              item: { type: "string" },
              aisle: {
                type: "string",
                enum: [...AISLES],
              },
            },
          },
        },
      },
    },
  },
};

async function llmBatchClassify(
  items: readonly string[]
): Promise<Record<string, Aisle>> {
  if (items.length === 0) return {};
  const fallback = (): Record<string, Aisle> =>
    Object.fromEntries(items.map((i) => [i, "Other" as Aisle]));
  try {
    const client = getOpenAI();
    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      max_tokens: 1024,
      messages: [
        { role: "system", content: LLM_SYSTEM },
        {
          role: "user",
          content: `Categorize each item:\n${items.map((i) => `- ${i}`).join("\n")}`,
        },
      ],
      response_format: LLM_RESPONSE_FORMAT,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) return fallback();
    const parsed = JSON.parse(content) as {
      classifications: { item: string; aisle: Aisle }[];
    };
    const out: Record<string, Aisle> = {};
    for (const c of parsed.classifications) {
      out[normalize(c.item)] = c.aisle;
    }
    for (const item of items) {
      if (!(item in out)) out[item] = "Other";
    }
    return out;
  } catch {
    return fallback();
  }
}

async function writeCache(map: Record<string, Aisle>): Promise<void> {
  const entries = Object.entries(map);
  if (entries.length === 0) return;
  const db = getDb();
  for (const [item, aisle] of entries) {
    await db.query(
      `insert into ingredient_aisles (item_normalized, aisle, source)
         values ($1, $2, 'llm')
         on conflict (item_normalized) do nothing`,
      [item, aisle]
    );
  }
}

export async function classifyIngredients(
  items: readonly string[]
): Promise<Record<string, Aisle>> {
  const result: Record<string, Aisle> = {};
  const unique = [...new Set(items.map(normalize))].filter((s) => s.length > 0);
  if (unique.length === 0) return result;

  // 1. Cache.
  const cached = await lookupCache(unique);
  for (const [item, aisle] of cached) result[item] = aisle;

  // 2. Keyword map.
  const stillMissing: string[] = [];
  for (const item of unique) {
    if (item in result) continue;
    const fromKw = keywordClassify(item);
    if (fromKw) {
      result[item] = fromKw;
    } else {
      stillMissing.push(item);
    }
  }

  // 3. LLM + cache write-back.
  if (stillMissing.length > 0) {
    const fromLlm = await llmBatchClassify(stillMissing);
    for (const [item, aisle] of Object.entries(fromLlm)) result[item] = aisle;
    await writeCache(fromLlm);
  }

  return result;
}
