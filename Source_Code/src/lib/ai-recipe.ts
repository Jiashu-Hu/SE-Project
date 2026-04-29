import OpenAI from "openai";
import { validateCreateRecipePayload } from "@/lib/recipe-validation";
import { getOrCreateIngredient, listUserCatalog } from "@/lib/ingredients";
import type { CreateRecipePayload } from "@/types/recipe";

let cachedClient: OpenAI | null = null;

const BASE_URL = "https://api.gptgod.online/v1";

function buildClient(): OpenAI {
  const key = process.env.GPTGOD_KEY;
  if (!key) {
    throw new Error(
      "GPTGOD_KEY is required. Set it in Source_Code/.env.local."
    );
  }
  return new OpenAI({ apiKey: key, baseURL: BASE_URL });
}

export function getOpenAI(): OpenAI {
  if (!cachedClient) cachedClient = buildClient();
  return cachedClient;
}

export function __setTestClient(client: OpenAI): void {
  cachedClient = client;
}

export function __resetClient(): void {
  cachedClient = null;
}

const MODEL = "gpt-4.1-mini";
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `You are a culinary assistant.

The user will give you either a list of ingredients they have on hand (text), or a photo of food/ingredients (image). Generate a complete, practical recipe that uses what is available. You may suggest minor pantry staples (salt, oil, common spices) if helpful.

Respond ONLY with structured JSON matching the provided schema. Do not write prose.`;

// JSON Schema for the recipe response.
// In strict mode, OpenAI requires:
//   - additionalProperties: false on every object
//   - all properties listed in `required`
//   - no `minimum`/`maximum`/`minItems` etc. (we run validateCreateRecipePayload
//     for those numeric/non-empty constraints).
const RECIPE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "description",
    "category",
    "prepTime",
    "cookTime",
    "servings",
    "ingredients",
    "instructions",
    "tags",
  ],
  properties: {
    title: { type: "string", description: "1 to 120 characters" },
    description: { type: "string", description: "1-2 sentence summary" },
    category: {
      type: "string",
      enum: ["Breakfast", "Lunch", "Dinner", "Dessert", "Snacks", "Other"],
    },
    prepTime: { type: "integer", description: "minutes, >= 0" },
    cookTime: { type: "integer", description: "minutes, >= 0" },
    servings: { type: "integer", description: ">= 1" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["amount", "unit", "item"],
        properties: {
          amount: { type: "string" },
          unit: { type: "string" },
          item: { type: "string" },
        },
      },
    },
    instructions: {
      type: "array",
      items: { type: "string" },
    },
    tags: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "recipe",
    strict: true,
    schema: RECIPE_SCHEMA,
  },
};

async function callOnce(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
): Promise<{ payload: CreateRecipePayload } | { error: string }> {
  const client = getOpenAI();
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages,
    response_format: RESPONSE_FORMAT,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return { error: "Empty response from model." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { error: "Model returned non-JSON content." };
  }

  if (!parsed || typeof parsed !== "object") {
    return { error: "Model output was not a JSON object." };
  }

  // Auto-tag every AI-generated recipe.
  const inputObj = parsed as Record<string, unknown>;
  const existingTags = Array.isArray(inputObj.tags)
    ? (inputObj.tags as unknown[]).filter(
        (t): t is string => typeof t === "string"
      )
    : [];
  const taggedInput = {
    ...inputObj,
    tags: Array.from(new Set([...existingTags, "ai-generated"])),
  };

  const result = validateCreateRecipePayload(taggedInput);
  if (result.valid) return { payload: result.payload };
  return { error: result.error };
}

async function generateWithRetry(
  initialMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
): Promise<CreateRecipePayload> {
  const first = await callOnce(initialMessages);
  if ("payload" in first) return first.payload;

  // Retry once with the validation error fed back as a follow-up turn.
  const followUp: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    ...initialMessages,
    {
      role: "user",
      content: `Your previous response failed validation: ${first.error}. Please return valid JSON matching the schema.`,
    },
  ];
  const second = await callOnce(followUp);
  if ("payload" in second) return second.payload;

  throw new Error(`AI generation failed: ${second.error}`);
}

async function buildSystemPromptWithHints(userId: string): Promise<string> {
  try {
    const catalog = await listUserCatalog(userId);
    if (catalog.length === 0) return SYSTEM_PROMPT;
    const names = catalog.slice(0, 80).map((c) => c.name).join(", ");
    return (
      SYSTEM_PROMPT +
      `\n\nWhen choosing ingredient names, prefer these (the user has used them before): ${names}.`
    );
  } catch {
    return SYSTEM_PROMPT;
  }
}

async function growCatalogFromAI(
  userId: string,
  ingredients: readonly { item: string; unit: string }[]
): Promise<void> {
  for (const ing of ingredients) {
    const item = ing.item.trim();
    if (item.length === 0) continue;
    try {
      await getOrCreateIngredient(userId, item, {
        unit: ing.unit.trim(),
        source: "ai",
      });
    } catch {
      // Non-fatal.
    }
  }
}

export async function generateRecipeFromText(
  userId: string,
  text: string
): Promise<CreateRecipePayload> {
  const systemPrompt = await buildSystemPromptWithHints(userId);
  const payload = await generateWithRetry([
    { role: "system", content: systemPrompt },
    { role: "user", content: text },
  ]);
  await growCatalogFromAI(userId, payload.ingredients);
  return payload;
}

const IMAGE_DATA_URL_RE = /^data:image\/(?:jpeg|png|gif|webp);base64,(.+)$/;

export async function generateRecipeFromImage(
  userId: string,
  dataUrl: string
): Promise<CreateRecipePayload> {
  if (!IMAGE_DATA_URL_RE.test(dataUrl)) {
    throw new Error("Invalid image data URL");
  }

  const systemPrompt = await buildSystemPromptWithHints(userId);
  const payload = await generateWithRetry([
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: dataUrl } },
        {
          type: "text",
          text: "Generate a recipe based on the ingredients or food shown in this image.",
        },
      ],
    },
  ]);
  await growCatalogFromAI(userId, payload.ingredients);
  return payload;
}
