# AI Recipe Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-powered recipe generator that converts a text description ("I have chicken, rice, broccoli") OR a photo of ingredients into a fully-populated, editable recipe form on a new `/recipes/generate` page. The user reviews + saves through the existing `POST /api/recipes` endpoint — no save-path changes.

**Architecture:** A new server-only `lib/ai-recipe.ts` module wraps the OpenAI SDK pointed at the GPTGOD gateway (`https://api.gptgod.online/v1`) using `gpt-4.1-mini`. It calls `chat.completions.create` with `response_format: { type: "json_schema", strict: true }` to force a `CreateRecipePayload`-shaped response, validates the result against the existing `validateCreateRecipePayload` (DRY with the human form), retries once on validation failure, and auto-tags every result with `ai-generated`. A new `POST /api/recipes/generate` route handler exposes this to the client. The frontend is a server-component page that hosts a client component composed of an `AIInputPanel` (text/image tabs, browser-side image compression) and the existing `RecipeForm` (with a new `defaults` prop for prefill while staying in POST mode).

**Tech Stack:**
- `openai` 6.35.0 (works against any OpenAI-compatible base URL)
- GPTGOD gateway at `https://api.gptgod.online/v1`
- Model: `gpt-4.1-mini`
- API key env var: `GPDGOD_KEY` (matches the name the user supplied)
- Browser `<canvas>` API for client-side image compression (no extra deps)
- Reuses: `lib/recipe-validation.ts`, `lib/auth-server.ts`, `lib/db.ts` test seam pattern, `RecipeForm`

**Spec:** [`docs/superpowers/specs/2026-04-27-ai-recipe-generator-design.md`](../specs/2026-04-27-ai-recipe-generator-design.md)

**Working directory:** Worktree at `../class-project-ai/` on branch `feat/ai-recipe-generator`.

---

## Decisions baked in (don't relitigate)

1. **Single model: `gpt-4.1-mini`.** Hardcoded as a `MODEL` constant in `lib/ai-recipe.ts`.
2. **Structured output via JSON Schema, strict mode.** OpenAI's `response_format: { type: "json_schema", json_schema: { strict: true, schema } }` is the equivalent of "always return this shape." Strict mode forbids `minimum`/`maximum`/`minItems` keywords; we rely on `validateCreateRecipePayload` for those numeric constraints (already in the design as belt-and-suspenders).
3. **Base URL hardcoded** to `https://api.gptgod.online/v1` as a constant. If you ever need to swap providers, change the constant.
4. **Frontend image compression target: longest edge ≤ 1568 px, JPEG quality 0.8.** Same target as the original Anthropic plan — most vision models tolerate this resolution well, and it cuts upload + token costs ~50%.
5. **No streaming.** Wait-and-return with a single spinner. Recipe responses are ~600-1000 tokens; ~3-5s round-trip is fine.
6. **Auto-tag `ai-generated`.** Inserted in `lib/ai-recipe.ts` after parse + before validation, so the client can't bypass it.
7. **Test seam mirrors `lib/db.ts`.** Lazy factory `getOpenAI()`, exported `__setTestClient(fake)` and `__resetClient()`. No real network in the test suite.
8. **Per-request input caps in the API route.** Text ≤ 2000 chars; image data URL ≤ 5 MB. Keeps a single bad payload from burning tokens.
9. **The image-compress utility has no unit test.** Browser canvas APIs don't run under our node-only Vitest setup. Manual smoke + inspection cover it. The function is < 40 lines.
10. **Save endpoint is unchanged.** The new page calls existing `POST /api/recipes`. Generator only produces a draft.
11. **`RecipeForm` gets a `defaults` prop.** Distinct from `existingRecipe` (which still triggers PATCH). With `defaults` set, it prefills initial state but stays in POST mode.

---

## File structure

### Created
| Path | Responsibility |
|---|---|
| `Source_Code/src/lib/ai-recipe.ts` | Server-only. OpenAI factory + `generateRecipeFromText` + `generateRecipeFromImage`. |
| `Source_Code/src/lib/__tests__/ai-recipe.test.ts` | Unit tests with a fake OpenAI client. |
| `Source_Code/src/lib/image-compress.ts` | Browser-only canvas-based compression utility. |
| `Source_Code/src/app/api/recipes/generate/route.ts` | `POST` route. Auth + body shape + dispatch to lib. |
| `Source_Code/src/app/api/recipes/__tests__/generate.test.ts` | Integration tests for the route. |
| `Source_Code/src/app/recipes/generate/page.tsx` | Server component. Auth gate + render client. |
| `Source_Code/src/components/recipe-generator/RecipeGeneratorClient.tsx` | Client. Holds AI input + draft state + the embedded `RecipeForm`. |
| `Source_Code/src/components/recipe-generator/AIInputPanel.tsx` | Client. Text/Image tabs, file → compress → POST `/api/recipes/generate`. |

### Modified
| Path | Change |
|---|---|
| `Source_Code/package.json` | Add `openai@^6.35.0`. |
| `Source_Code/.env.local.example` | Document `GPDGOD_KEY`. |
| `Source_Code/src/components/recipe-form/RecipeForm.tsx` | Accept new optional `defaults: CreateRecipePayload` prop (POST mode with prefill). |
| `Source_Code/src/app/recipes/new/page.tsx` | Add a "✨ Generate with AI" link banner at the top. |
| ` Deployment_Setup/INSTALL.md` | Add GPTGOD API key setup. |
| `README.md` | Mention the AI generator under features. |

### Untouched
- `lib/recipe-validation.ts` — reused as-is.
- `lib/auth-server.ts` — reused as-is.
- `app/api/recipes/route.ts` — save path unchanged.
- All other tests pass without modification.

---

## Phase 1: Foundation

### Task 1: Install OpenAI SDK + document env var

**Files:**
- Modify: `Source_Code/package.json`, `Source_Code/package-lock.json`
- Modify: `Source_Code/.env.local.example`

- [ ] **Step 1: Install the SDK**

From `Source_Code/`:

```bash
npm install openai@^6.35.0
```

Expected: `openai` lands in `dependencies` (NOT devDependencies — runs in Vercel functions at request time).

- [ ] **Step 2: Smoke-check the import**

```bash
node -e "const OpenAI = require('openai').default; console.log(typeof OpenAI);"
```

Expected output: `function`

- [ ] **Step 3: Update `.env.local.example`**

Edit `Source_Code/.env.local.example` and append:

```bash

# GPTGOD API key (https://api.gptgod.online).
# Required for the AI recipe generator at /recipes/generate.
# In Vercel, set this in Project Settings → Environment Variables for
# Production, Preview, and Development.
GPDGOD_KEY=
```

- [ ] **Step 4: Commit**

From the repo root (worktree at `/Users/teddy/code/class-project-ai`):

```bash
git add Source_Code/package.json Source_Code/package-lock.json Source_Code/.env.local.example
git commit -m "chore: add openai SDK for the AI recipe generator (GPTGOD gateway)"
```

---

## Phase 2: AI lib (TDD)

### Task 2: Test seam + happy-path text generation

**Files:**
- Create: `Source_Code/src/lib/ai-recipe.ts`
- Create: `Source_Code/src/lib/__tests__/ai-recipe.test.ts`

- [ ] **Step 1: Write the failing test**

Create `Source_Code/src/lib/__tests__/ai-recipe.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import {
  generateRecipeFromText,
  __setTestClient,
  __resetClient,
} from "@/lib/ai-recipe";

// Minimal fake of the OpenAI SDK's `chat.completions.create` surface.
function makeFakeClient(responses: unknown[]) {
  let i = 0;
  return {
    chat: {
      completions: {
        create: async () => {
          const next = responses[i++];
          if (!next) throw new Error("fake client ran out of responses");
          return next;
        },
      },
    },
  } as unknown as Parameters<typeof __setTestClient>[0];
}

function makeChatResponse(payload: unknown) {
  return {
    id: "chatcmpl_test",
    object: "chat.completion",
    created: 0,
    model: "gpt-4.1-mini",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: JSON.stringify(payload),
          refusal: null,
        },
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

const VALID_RECIPE = {
  title: "Pasta Aglio e Olio",
  description: "Garlicky weeknight pasta.",
  category: "Dinner",
  prepTime: 5,
  cookTime: 15,
  servings: 2,
  ingredients: [
    { amount: "200", unit: "g", item: "spaghetti" },
    { amount: "4", unit: "cloves", item: "garlic" },
  ],
  instructions: ["Boil water", "Cook pasta", "Toss with garlic"],
  tags: ["italian", "quick"],
};

afterEach(() => __resetClient());

describe("generateRecipeFromText", () => {
  it("returns a validated payload from a successful structured-output response", async () => {
    __setTestClient(makeFakeClient([makeChatResponse(VALID_RECIPE)]));

    const recipe = await generateRecipeFromText("chicken and rice");

    expect(recipe.title).toBe("Pasta Aglio e Olio");
    expect(recipe.servings).toBe(2);
    expect(recipe.ingredients).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run — verify RED**

From `Source_Code/`:

```bash
npm test -- --run src/lib/__tests__/ai-recipe.test.ts 2>&1 | tail -10
```

Expected: import fails — `Cannot find module '@/lib/ai-recipe'` or similar.

- [ ] **Step 3: Implement minimal lib**

Create `Source_Code/src/lib/ai-recipe.ts`:

```typescript
import OpenAI from "openai";
import { validateCreateRecipePayload } from "@/lib/recipe-validation";
import type { CreateRecipePayload } from "@/types/recipe";

let cachedClient: OpenAI | null = null;

const BASE_URL = "https://api.gptgod.online/v1";

function buildClient(): OpenAI {
  const key = process.env.GPDGOD_KEY;
  if (!key) {
    throw new Error(
      "GPDGOD_KEY is required. Set it in Source_Code/.env.local."
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

export async function generateRecipeFromText(
  text: string
): Promise<CreateRecipePayload> {
  const result = await callOnce([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: text },
  ]);
  if ("payload" in result) return result.payload;
  throw new Error(`AI generation failed: ${result.error}`);
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/lib/__tests__/ai-recipe.test.ts 2>&1 | tail -10
```

Expected: 1 test PASS.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

From repo root:

```bash
git add Source_Code/src/lib/ai-recipe.ts Source_Code/src/lib/__tests__/ai-recipe.test.ts
git commit -m "feat: add ai-recipe lib with text generation + test seam

Wraps OpenAI SDK pointed at the GPTGOD gateway, calling gpt-4.1-mini
with response_format: json_schema (strict) to emit a CreateRecipePayload-
shaped object. Output is validated against the same recipe-validation
rules the human form uses, then returned to callers. The OpenAI
client lives behind a lazy factory with a __setTestClient hook so
tests never hit the real API."
```

---

### Task 3: Retry on validation failure

**Files:**
- Modify: `Source_Code/src/lib/__tests__/ai-recipe.test.ts`
- Modify: `Source_Code/src/lib/ai-recipe.ts`

- [ ] **Step 1: Write the failing test**

Append to `Source_Code/src/lib/__tests__/ai-recipe.test.ts` inside the existing `describe("generateRecipeFromText", ...)` block:

```typescript
  it("retries once when the first response fails validation", async () => {
    const invalid = { ...VALID_RECIPE, title: "" }; // empty title fails validation
    __setTestClient(
      makeFakeClient([
        makeChatResponse(invalid),
        makeChatResponse(VALID_RECIPE),
      ])
    );

    const recipe = await generateRecipeFromText("chicken");
    expect(recipe.title).toBe("Pasta Aglio e Olio");
  });
```

- [ ] **Step 2: Run — verify RED**

```bash
npm test -- --run src/lib/__tests__/ai-recipe.test.ts 2>&1 | tail -15
```

Expected: the new test fails because `generateRecipeFromText` currently throws on the first failed validation instead of retrying.

- [ ] **Step 3: Add the retry**

Open `Source_Code/src/lib/ai-recipe.ts`. Replace the existing `generateRecipeFromText` export with this and add the `generateWithRetry` helper above it:

```typescript
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

export async function generateRecipeFromText(
  text: string
): Promise<CreateRecipePayload> {
  return generateWithRetry([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: text },
  ]);
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/lib/__tests__/ai-recipe.test.ts 2>&1 | tail -10
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add Source_Code/src/lib/ai-recipe.ts Source_Code/src/lib/__tests__/ai-recipe.test.ts
git commit -m "feat: retry once on AI validation failure

Feeds the validation error back to the model as a follow-up user
turn and asks for a corrected response. If the second attempt still
fails, throws."
```

---

### Task 4: Hard fail after second attempt

**Files:**
- Modify: `Source_Code/src/lib/__tests__/ai-recipe.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the existing `describe("generateRecipeFromText", ...)` block:

```typescript
  it("throws when both attempts fail validation", async () => {
    const invalid = { ...VALID_RECIPE, servings: 0 }; // servings must be >= 1
    __setTestClient(
      makeFakeClient([
        makeChatResponse(invalid),
        makeChatResponse(invalid),
      ])
    );

    await expect(generateRecipeFromText("chicken")).rejects.toThrow(
      /AI generation failed/
    );
  });
```

- [ ] **Step 2: Run — verify GREEN**

The retry logic from Task 3 already handles this case correctly. Run:

```bash
npm test -- --run src/lib/__tests__/ai-recipe.test.ts 2>&1 | tail -10
```

Expected: 3 tests PASS (the new one passes immediately because the existing code already throws after a failed retry).

This is a "test-after-the-fact" coverage check — locks the throw-on-second-failure behavior into the suite so a future refactor can't silently change it.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/lib/__tests__/ai-recipe.test.ts
git commit -m "test: cover the both-attempts-fail path of ai-recipe

Locks the throw-on-second-failure behavior into the test suite so a
future refactor can't silently change it to e.g. return a partial
result."
```

---

### Task 5: Auto-tag with `ai-generated`

**Files:**
- Modify: `Source_Code/src/lib/__tests__/ai-recipe.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the existing `describe("generateRecipeFromText", ...)` block:

```typescript
  it("ensures every result has the ai-generated tag", async () => {
    const noTag = { ...VALID_RECIPE, tags: ["italian"] };
    __setTestClient(makeFakeClient([makeChatResponse(noTag)]));

    const recipe = await generateRecipeFromText("chicken");
    expect(recipe.tags).toContain("ai-generated");
    expect(recipe.tags).toContain("italian");
  });

  it("does not duplicate ai-generated when the model already includes it", async () => {
    const dup = { ...VALID_RECIPE, tags: ["ai-generated", "italian"] };
    __setTestClient(makeFakeClient([makeChatResponse(dup)]));

    const recipe = await generateRecipeFromText("chicken");
    const aiTagCount = recipe.tags.filter((t) => t === "ai-generated").length;
    expect(aiTagCount).toBe(1);
  });
```

- [ ] **Step 2: Run — verify GREEN**

The `Set`-based dedupe in `callOnce` already handles both cases. Run:

```bash
npm test -- --run src/lib/__tests__/ai-recipe.test.ts 2>&1 | tail -10
```

Expected: 5 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/lib/__tests__/ai-recipe.test.ts
git commit -m "test: cover the ai-generated auto-tag and dedup

Locks both 'add the tag when missing' and 'don't duplicate when
present' into the test suite."
```

---

### Task 6: Image input mode

**Files:**
- Modify: `Source_Code/src/lib/__tests__/ai-recipe.test.ts`
- Modify: `Source_Code/src/lib/ai-recipe.ts`

- [ ] **Step 1: Write the failing test**

In `Source_Code/src/lib/__tests__/ai-recipe.test.ts`, expand the import statement to include `generateRecipeFromImage`:

```typescript
import {
  generateRecipeFromText,
  generateRecipeFromImage,
  __setTestClient,
  __resetClient,
} from "@/lib/ai-recipe";
```

Then append a new `describe` block at the bottom of the file:

```typescript
describe("generateRecipeFromImage", () => {
  it("returns a validated payload for a JPEG data URL", async () => {
    __setTestClient(makeFakeClient([makeChatResponse(VALID_RECIPE)]));

    const recipe = await generateRecipeFromImage(
      "data:image/jpeg;base64,/9j/4AAQSkZJRg=="
    );

    expect(recipe.title).toBe("Pasta Aglio e Olio");
    expect(recipe.tags).toContain("ai-generated");
  });

  it("rejects a non-data-URL string", async () => {
    __setTestClient(makeFakeClient([])); // shouldn't reach the client

    await expect(
      generateRecipeFromImage("just-a-plain-string")
    ).rejects.toThrow(/Invalid image data URL/);
  });

  it("rejects a data URL with an unsupported media type", async () => {
    __setTestClient(makeFakeClient([]));

    await expect(
      generateRecipeFromImage("data:application/pdf;base64,abc")
    ).rejects.toThrow(/Invalid image data URL/);
  });
});
```

- [ ] **Step 2: Run — verify RED**

```bash
npm test -- --run src/lib/__tests__/ai-recipe.test.ts 2>&1 | tail -15
```

Expected: import error or `generateRecipeFromImage is not a function`.

- [ ] **Step 3: Implement `generateRecipeFromImage`**

In `Source_Code/src/lib/ai-recipe.ts`, append after the existing `generateRecipeFromText` export:

```typescript
const IMAGE_DATA_URL_RE = /^data:image\/(?:jpeg|png|gif|webp);base64,(.+)$/;

export async function generateRecipeFromImage(
  dataUrl: string
): Promise<CreateRecipePayload> {
  if (!IMAGE_DATA_URL_RE.test(dataUrl)) {
    throw new Error("Invalid image data URL");
  }

  return generateWithRetry([
    { role: "system", content: SYSTEM_PROMPT },
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
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/lib/__tests__/ai-recipe.test.ts 2>&1 | tail -10
```

Expected: 8 tests PASS.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add Source_Code/src/lib/ai-recipe.ts Source_Code/src/lib/__tests__/ai-recipe.test.ts
git commit -m "feat: ai-recipe accepts image input via base64 data URL

Sends the image as a content block alongside a text instruction,
runs through the same validation + retry path as text input.
Rejects non-data URLs and unsupported media types up front."
```

---

## Phase 3: API route (TDD)

### Task 7: `POST /api/recipes/generate`

**Files:**
- Create: `Source_Code/src/app/api/recipes/generate/route.ts`
- Create: `Source_Code/src/app/api/recipes/__tests__/generate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `Source_Code/src/app/api/recipes/__tests__/generate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const cookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
  }),
}));

import { POST } from "@/app/api/recipes/generate/route";
import { registerUser, createSession } from "@/lib/auth";
import { __setTestClient, __resetClient } from "@/lib/ai-recipe";
import { AUTH_SESSION_COOKIE } from "@/lib/auth-constants";

function makeFakeClient(responses: unknown[]) {
  let i = 0;
  return {
    chat: {
      completions: {
        create: async () => {
          const next = responses[i++];
          if (!next) throw new Error("fake client ran out of responses");
          return next;
        },
      },
    },
  } as unknown as Parameters<typeof __setTestClient>[0];
}

function makeChatResponse(payload: unknown) {
  return {
    id: "chatcmpl_test",
    object: "chat.completion",
    created: 0,
    model: "gpt-4.1-mini",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content: JSON.stringify(payload), refusal: null },
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

const VALID_RECIPE = {
  title: "Smoke Eggs",
  description: "Eggs but smoky.",
  category: "Breakfast",
  prepTime: 2,
  cookTime: 5,
  servings: 1,
  ingredients: [{ amount: "2", unit: "", item: "eggs" }],
  instructions: ["Crack eggs", "Cook"],
  tags: [],
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/recipes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function logIn(email: string): Promise<void> {
  const reg = await registerUser({
    name: "U",
    email,
    password: "Strong1Pass",
  });
  if (!("user" in reg)) throw new Error("setup failed");
  cookieJar.set(AUTH_SESSION_COOKIE, (await createSession(reg.user.id)).token);
}

beforeEach(() => cookieJar.clear());
afterEach(() => __resetClient());

describe("POST /api/recipes/generate", () => {
  it("returns 401 when not logged in", async () => {
    __setTestClient(makeFakeClient([])); // shouldn't reach lib
    const res = await POST(makeRequest({ mode: "text", input: "chicken" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is missing mode or input", async () => {
    await logIn("a@x.com");
    const res = await POST(makeRequest({ mode: "text" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid mode value", async () => {
    await logIn("b@x.com");
    const res = await POST(makeRequest({ mode: "audio", input: "x" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for text input over 2000 characters", async () => {
    await logIn("c@x.com");
    const res = await POST(
      makeRequest({ mode: "text", input: "x".repeat(2001) })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for an image data URL larger than 5 MB", async () => {
    await logIn("d@x.com");
    const giant = `data:image/jpeg;base64,${"A".repeat(7 * 1024 * 1024)}`;
    const res = await POST(makeRequest({ mode: "image", input: giant }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with a valid CreateRecipePayload for text input", async () => {
    await logIn("e@x.com");
    __setTestClient(makeFakeClient([makeChatResponse(VALID_RECIPE)]));

    const res = await POST(makeRequest({ mode: "text", input: "eggs" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recipe.title).toBe("Smoke Eggs");
    expect(body.recipe.tags).toContain("ai-generated");
  });

  it("returns 200 for image input", async () => {
    await logIn("f@x.com");
    __setTestClient(makeFakeClient([makeChatResponse(VALID_RECIPE)]));

    const res = await POST(
      makeRequest({
        mode: "image",
        input: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recipe.title).toBe("Smoke Eggs");
  });

  it("returns 502 when the AI lib hard-fails", async () => {
    await logIn("g@x.com");
    const invalid = { ...VALID_RECIPE, title: "" };
    __setTestClient(
      makeFakeClient([makeChatResponse(invalid), makeChatResponse(invalid)])
    );

    const res = await POST(makeRequest({ mode: "text", input: "eggs" }));
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run — verify RED**

```bash
npm test -- --run src/app/api/recipes/__tests__/generate.test.ts 2>&1 | tail -10
```

Expected: import error — the route file doesn't exist yet.

- [ ] **Step 3: Implement the route**

Create `Source_Code/src/app/api/recipes/generate/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import {
  generateRecipeFromText,
  generateRecipeFromImage,
} from "@/lib/ai-recipe";

const MAX_TEXT_LEN = 2000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB after compression upper bound

interface GenerateRequest {
  readonly mode: "text" | "image";
  readonly input: string;
}

function isGenerateRequest(value: unknown): value is GenerateRequest {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.mode === "text" || v.mode === "image") && typeof v.input === "string"
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  if (!isGenerateRequest(body)) {
    return NextResponse.json(
      { error: "Body must be { mode: 'text' | 'image', input: string }." },
      { status: 400 }
    );
  }

  if (body.mode === "text") {
    if (body.input.trim().length === 0) {
      return NextResponse.json(
        { error: "Text input is required." },
        { status: 400 }
      );
    }
    if (body.input.length > MAX_TEXT_LEN) {
      return NextResponse.json(
        { error: `Text input must be ${MAX_TEXT_LEN} characters or fewer.` },
        { status: 400 }
      );
    }
  } else {
    if (body.input.length > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Image too large; please use a smaller photo." },
        { status: 400 }
      );
    }
  }

  try {
    const recipe =
      body.mode === "text"
        ? await generateRecipeFromText(body.input)
        : await generateRecipeFromImage(body.input);
    return NextResponse.json({ recipe });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run — verify GREEN**

```bash
npm test -- --run src/app/api/recipes/__tests__/generate.test.ts 2>&1 | tail -10
```

Expected: 8 tests PASS.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add Source_Code/src/app/api/recipes/generate/route.ts \
        Source_Code/src/app/api/recipes/__tests__/generate.test.ts
git commit -m "feat: POST /api/recipes/generate for AI recipe drafts

Auth-gated route that dispatches to lib/ai-recipe based on the
'mode' field in the body. Per-request input caps: text <= 2000 chars,
image data URL <= 5 MB. Returns 502 when the lib hard-fails so the
client can show a 'try again' message."
```

---

## Phase 4: Frontend

### Task 8: `lib/image-compress.ts` (browser utility)

**Files:**
- Create: `Source_Code/src/lib/image-compress.ts`

- [ ] **Step 1: Write the file**

Create `Source_Code/src/lib/image-compress.ts`:

```typescript
// Browser-only. Resizes an image File to longest-edge <= 1568 px and
// re-encodes as JPEG quality 0.8. Returns a base64 data URL plus the
// resulting byte size for UI display.

const MAX_EDGE = 1568;
const JPEG_QUALITY = 0.8;

export interface CompressedImage {
  readonly dataUrl: string;
  readonly sizeBytes: number;
}

export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context not available.");
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
        "image/jpeg",
        JPEG_QUALITY
      );
    });

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

    return { dataUrl, sizeBytes: blob.size };
  } finally {
    bitmap.close();
  }
}
```

- [ ] **Step 2: Type-check**

From `Source_Code/`:

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/lib/image-compress.ts
git commit -m "feat: client-side image compression utility

Resizes longest edge to 1568 px and re-encodes as JPEG quality 0.8.
Typical iPhone photo shrinks ~3 MB -> ~150 KB before being
base64-uploaded for AI input."
```

---

### Task 9: Add `defaults` prop to `RecipeForm`

**Files:**
- Modify: `Source_Code/src/components/recipe-form/RecipeForm.tsx`

- [ ] **Step 1: Read the current props**

Open `Source_Code/src/components/recipe-form/RecipeForm.tsx`. The current props are:

```typescript
export interface RecipeFormProps {
  readonly existingRecipe?: Recipe;
}
```

- [ ] **Step 2: Add the new prop**

Replace the `RecipeFormProps` interface with:

```typescript
export interface RecipeFormProps {
  /** When provided the form PATCHes the existing recipe instead of POSTing a new one. */
  readonly existingRecipe?: Recipe;
  /** Initial values for the create flow. Ignored when existingRecipe is set. */
  readonly defaults?: CreateRecipePayload;
}
```

- [ ] **Step 3: Use the defaults in initial state**

Find the destructuring `export function RecipeForm({ existingRecipe }: RecipeFormProps) {` and change to:

```typescript
export function RecipeForm({ existingRecipe, defaults }: RecipeFormProps) {
```

Then immediately after `const isEditing = existingRecipe !== undefined;`, add:

```typescript
  const initial = existingRecipe ?? defaults;
```

Now replace each `useState` line that reads from `existingRecipe` so it falls back to `defaults`:

```typescript
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState<RecipeCategory>(
    initial?.category ?? "Dinner"
  );
  const [prepTime, setPrepTime] = useState(
    initial ? String(initial.prepTime) : ""
  );
  const [cookTime, setCookTime] = useState(
    initial ? String(initial.cookTime) : ""
  );
  const [servings, setServings] = useState(
    initial ? String(initial.servings) : ""
  );
  const [ingredients, setIngredients] = useState<readonly IngredientRow[]>(
    initial ? toRows(initial.ingredients) : [EMPTY_INGREDIENT]
  );
  const [instructions, setInstructions] = useState<readonly string[]>(
    initial?.instructions.length ? initial.instructions : [""]
  );
  const [tagsRaw, setTagsRaw] = useState(
    initial?.tags.length ? initial.tags.join(", ") : ""
  );
```

The `isEditing` flag (and therefore POST-vs-PATCH) still derives from `existingRecipe`, so `defaults` keeps the form in POST mode.

- [ ] **Step 4: Type-check + run the existing test suite**

```bash
npx tsc --noEmit
npm test 2>&1 | tail -5
```

Expected: tsc clean. All existing tests pass — non-breaking widening of the prop set.

- [ ] **Step 5: Commit**

```bash
git add Source_Code/src/components/recipe-form/RecipeForm.tsx
git commit -m "feat: RecipeForm accepts defaults for create-with-prefill

When defaults is set (and existingRecipe is not), the form prefills
its initial state but stays in POST mode. Used by the new AI
generator page; manual /recipes/new is unchanged."
```

---

### Task 10: `AIInputPanel` client component

**Files:**
- Create: `Source_Code/src/components/recipe-generator/AIInputPanel.tsx`

- [ ] **Step 1: Write the component**

Create `Source_Code/src/components/recipe-generator/AIInputPanel.tsx`:

```typescript
"use client";

import { useState, type ChangeEvent } from "react";
import { compressImage } from "@/lib/image-compress";
import type { CreateRecipePayload } from "@/types/recipe";

interface AIInputPanelProps {
  readonly onGenerated: (recipe: CreateRecipePayload) => void;
}

type Tab = "text" | "image";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AIInputPanel({ onGenerated }: AIInputPanelProps) {
  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const { dataUrl, sizeBytes } = await compressImage(file);
      setImageDataUrl(dataUrl);
      setImageSize(sizeBytes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read image.");
      setImageDataUrl(null);
      setImageSize(null);
    }
  }

  async function handleGenerate(): Promise<void> {
    setError(null);
    setIsGenerating(true);
    try {
      const body =
        tab === "text"
          ? { mode: "text", input: text }
          : { mode: "image", input: imageDataUrl ?? "" };

      const response = await fetch("/api/recipes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? "Generation failed.");
        return;
      }
      onGenerated(json.recipe as CreateRecipePayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setIsGenerating(false);
    }
  }

  const canGenerate =
    !isGenerating &&
    (tab === "text" ? text.trim().length > 0 : imageDataUrl !== null);

  return (
    <section className="rounded-2xl border border-orange-200 bg-orange-50/50 p-6 dark:border-orange-900/40 dark:bg-orange-950/20">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        ✨ Generate with AI
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Describe the ingredients you have, or upload a photo of them.
      </p>

      <div className="mt-4 inline-flex rounded-lg border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setTab("text")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "text"
              ? "bg-orange-600 text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          Text
        </button>
        <button
          type="button"
          onClick={() => setTab("image")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "image"
              ? "bg-orange-600 text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          Image
        </button>
      </div>

      <div className="mt-4">
        {tab === "text" ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="What ingredients do you have? E.g., 'chicken thighs, rice, soy sauce, garlic'."
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-orange-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        ) : (
          <div className="space-y-3">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded-md file:border-0 file:bg-orange-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-orange-700 dark:text-zinc-400"
            />
            {imageDataUrl && imageSize !== null && (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageDataUrl}
                  alt="Selected ingredient photo"
                  className="h-24 w-24 rounded-lg object-cover"
                />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Photo: {formatBytes(imageSize)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={!canGenerate}
        className="mt-4 rounded-lg bg-orange-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isGenerating ? "Generating..." : "Generate"}
      </button>
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

From `Source_Code/`:

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/components/recipe-generator/AIInputPanel.tsx
git commit -m "feat: AIInputPanel client component (text/image tabs)

Tabbed input for the AI generator. Image tab compresses files
client-side before sending. Generate button disabled until input
is non-empty. Calls POST /api/recipes/generate and lifts the
result to the parent via onGenerated."
```

---

### Task 11: `RecipeGeneratorClient` (composes panel + form)

**Files:**
- Create: `Source_Code/src/components/recipe-generator/RecipeGeneratorClient.tsx`

- [ ] **Step 1: Write the component**

Create `Source_Code/src/components/recipe-generator/RecipeGeneratorClient.tsx`:

```typescript
"use client";

import { useState } from "react";
import { AIInputPanel } from "@/components/recipe-generator/AIInputPanel";
import { RecipeForm } from "@/components/recipe-form/RecipeForm";
import type { CreateRecipePayload } from "@/types/recipe";

export function RecipeGeneratorClient() {
  const [defaults, setDefaults] = useState<CreateRecipePayload | undefined>(
    undefined
  );
  // The RecipeForm reads its initial state once, so we remount it via key
  // when a new draft arrives — otherwise the form would keep stale state
  // from a previous "Generate" run.
  const [formKey, setFormKey] = useState(0);

  function handleGenerated(recipe: CreateRecipePayload): void {
    setDefaults(recipe);
    setFormKey((k) => k + 1);
  }

  return (
    <div className="space-y-8">
      <AIInputPanel onGenerated={handleGenerated} />

      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Review & save
        </h2>
        <p className="mt-1 mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Edit any field before saving. Saving uses the same flow as a
          manually-created recipe.
        </p>
        <RecipeForm key={formKey} defaults={defaults} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/components/recipe-generator/RecipeGeneratorClient.tsx
git commit -m "feat: RecipeGeneratorClient composes AI input + RecipeForm

Holds the generated draft as parent state and feeds it to RecipeForm
via the new defaults prop. Uses a key bump to force RecipeForm to
re-mount with fresh initial state on each generation."
```

---

### Task 12: `/recipes/generate` server page

**Files:**
- Create: `Source_Code/src/app/recipes/generate/page.tsx`

- [ ] **Step 1: Write the page**

Create `Source_Code/src/app/recipes/generate/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { RecipeGeneratorClient } from "@/components/recipe-generator/RecipeGeneratorClient";

export const metadata: Metadata = {
  title: "Generate Recipe | RecipeBox",
};

export default async function GenerateRecipePage() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-orange-600">
              Recipes
            </p>
            <h1 className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
              Generate with AI
            </h1>
          </div>
          <Link
            href="/recipes/new"
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
          >
            Manual instead
          </Link>
        </div>

        <RecipeGeneratorClient />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add Source_Code/src/app/recipes/generate/page.tsx
git commit -m "feat: /recipes/generate server page

Auth-gated page that renders the AI generator client. Mirrors the
header/layout of /recipes/new, includes a 'Manual instead' link."
```

---

### Task 13: Add the AI banner on `/recipes/new`

**Files:**
- Modify: `Source_Code/src/app/recipes/new/page.tsx`

- [ ] **Step 1: Read the current page**

Open `Source_Code/src/app/recipes/new/page.tsx`.

- [ ] **Step 2: Add a Link import + banner**

Ensure `Link` from `next/link` is imported:

```typescript
import Link from "next/link";
```

Find the spot just above where `<RecipeForm />` is rendered. Insert this banner:

```tsx
        <Link
          href="/recipes/generate"
          className="mb-6 flex items-center justify-between rounded-2xl border border-orange-200 bg-orange-50/60 px-5 py-4 transition-colors hover:bg-orange-100/60 dark:border-orange-900/40 dark:bg-orange-950/30 dark:hover:bg-orange-950/50"
        >
          <div>
            <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">
              ✨ Generate with AI
            </p>
            <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
              Describe what you have or upload a photo — AI will fill the form for you.
            </p>
          </div>
          <span className="text-orange-600 dark:text-orange-400">→</span>
        </Link>
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add Source_Code/src/app/recipes/new/page.tsx
git commit -m "feat: link to /recipes/generate from /recipes/new

Adds an entry-point banner so users can choose AI mode from the
manual create page."
```

---

## Phase 5: Verify + docs

### Task 14: Full suite + coverage gate

- [ ] **Step 1: Full suite**

From `Source_Code/`:

```bash
npm test
```

Expected: every existing test still passes, plus 8 new in `ai-recipe.test.ts` and 8 in `generate.test.ts` = 16 new. Total ≥ 106 tests.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Coverage**

```bash
npm run test:cov
```

Expected: ≥80% across all four metrics. If `image-compress.ts` tanks the average, add it to the `exclude` list in `vitest.config.ts` with a comment ("browser-only canvas utility, exercised via manual smoke").

- [ ] **Step 4: Commit (only if vitest.config.ts changed)**

```bash
git add Source_Code/vitest.config.ts
git commit -m "chore: exclude image-compress from coverage scope

Browser-only canvas utility; can't run under vitest's node
environment. Manual smoke at /recipes/generate covers it."
```

(Skip if no edit was needed.)

---

### Task 15: Update INSTALL.md + README

**Files:**
- Modify: ` Deployment_Setup/INSTALL.md`
- Modify: `README.md`

- [ ] **Step 1: INSTALL.md — add GPTGOD key section**

Open ` Deployment_Setup/INSTALL.md`. After the "Database setup (Supabase)" section, add:

```markdown
### AI generator setup (GPTGOD)

The AI recipe generator at `/recipes/generate` requires an API key from the
GPTGOD gateway (an OpenAI-compatible service).

1. Sign up at https://gptgod.online and create an API key.
2. Add it to `Source_Code/.env.local`:
   ```bash
   GPDGOD_KEY=sk-...
   ```
3. For the Vercel deployment, add it under **Project Settings → Environment
   Variables** for Production, Preview, and Development.

The base URL (`https://api.gptgod.online/v1`) and model (`gpt-4.1-mini`) are
hardcoded in `lib/ai-recipe.ts` — change them there if you want to swap
providers.
```

- [ ] **Step 2: README — mention the AI generator**

Open `README.md`. Replace:

```markdown
A web application for personal recipe organization. Users register, log in,
and manage their own recipes — create, edit, search, filter by category, and
delete.
```

with:

```markdown
A web application for personal recipe organization. Users register, log in,
and manage their own recipes — create (manually or via AI from a description
or photo), edit, search, filter by category, and delete.
```

- [ ] **Step 3: Commit**

```bash
git add " Deployment_Setup/INSTALL.md" README.md
git commit -m "docs: cover AI generator setup + feature list

INSTALL.md gets a new section for the GPDGOD_KEY setup
(local + Vercel). README mentions AI-from-text and AI-from-photo
under features."
```

---

## Phase 6: Push + smoke

### Task 16: Push the branch + merge

- [ ] **Step 1: Verify clean working tree**

From the worktree root:

```bash
git status --short
```

Expected: empty.

- [ ] **Step 2: Push**

```bash
git push -u upstream feat/ai-recipe-generator
```

- [ ] **Step 3: FF-merge to main and push main**

From the main checkout (`/Users/teddy/code/class-project`):

```bash
git fetch upstream feat/ai-recipe-generator main
git merge --ff-only upstream/feat/ai-recipe-generator
git push upstream main
```

- [ ] **Step 4: Watch Vercel auto-deploy**

Open the Vercel dashboard. Within ~30s, a new deploy should kick off. **It will fail at runtime** until you add `GPDGOD_KEY` to the project's environment variables — but the build itself should succeed (the lib reads the env lazily).

---

### Task 17: Set `GPDGOD_KEY` in Vercel + smoke

This is a manual task.

- [ ] **Step 1: Add the env var in Vercel**

Vercel dashboard → your project → **Settings → Environment Variables**:
- **Key:** `GPDGOD_KEY`
- **Value:** your real key from the GPTGOD dashboard
- **Environments:** Production + Preview + Development

- [ ] **Step 2: Redeploy**

Vercel dashboard → Deployments → most recent → **⋯ menu → Redeploy**. The redeploy picks up the new env var.

- [ ] **Step 3: Smoke test on the deployed URL**

Visit `https://se-project-jade-eight.vercel.app/recipes/generate`. Log in with the seeded test user. Generate a recipe from text:

> "I have chicken thighs, rice, soy sauce, ginger, and garlic"

Expected: spinner shows for ~3-5s, then form fields populate. Title should be coherent (e.g., "Ginger-Soy Chicken with Rice"), 2-6 ingredients, 3-8 instructions, `ai-generated` is in the tags.

Edit one field. Click Save. Confirm the recipe lands on the dashboard.

- [ ] **Step 4: Smoke test image input**

Take a quick photo of any food / produce on your phone. Switch to the Image tab, pick the photo. Confirm the size readout shows the compressed size (likely 50-200 KB). Click Generate.

Expected: ~3-5s spinner, then the form fills with a recipe based on what's visible. Save and verify on the dashboard.

- [ ] **Step 5: Take screenshots (optional)**

Save to `docs/screenshots/ai-generator-*.png` if desired.

- [ ] **Step 6: Cleanup**

Delete the smoke recipes from your dashboard.

---

## What's NOT in this plan (deferred)

- **Streaming output** — Generate would feel snappier with progressive form-field population. Out of scope.
- **Image as recipe hero image** — uploaded photos are inference-only.
- **Rate limiting** — not needed for a single-user class project.
- **Component tests** — out of existing coverage scope.
- **Switching AI providers** — `BASE_URL` and `MODEL` are constants in one file; trivial to swap.

---

## Self-review

**Spec coverage** (against `docs/superpowers/specs/2026-04-27-ai-recipe-generator-design.md`):
- §1 In scope: text + image input (T2-T6, T7), AI populates all fields (T2-T6), auto-tag (T5), reuses RecipeForm (T9, T11), save unchanged (T12 uses POST endpoint via T9 form). ✅
- §1 Out of scope honored: no image storage, no streaming, no rate limiting. ✅
- §2 User flow steps mapped 1:1 to T13/T12/T10/T7/T11/T9. ✅
- §3 Architecture file list — every Created/Modified file in spec maps to a task. ✅ (Note: spec said Anthropic; this plan uses GPTGOD/OpenAI per user direction. Functionally equivalent — same lib boundaries, same test seam, same auto-tag, same save flow.)
- §4 Decisions all surface as task-level constants. ✅
- §5 Test strategy: 8 lib unit tests + 8 route integration tests. ✅
- §6 Prerequisites: GPDGOD_KEY documented in T1, T15, T17. ✅
- §7 Risks all addressed via baked-in decisions or task notes. ✅

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / "similar to Task N". All step bodies show concrete code or commands.

**Type/name consistency:**
- `getOpenAI` / `__setTestClient` / `__resetClient` — same names across T2, T6, T7.
- `generateRecipeFromText` / `generateRecipeFromImage` — same signatures across T2, T6, T7, T10.
- `CreateRecipePayload` — same type imported from `@/types/recipe` everywhere.
- `defaults` prop on `RecipeForm` — defined T9, used T11.
- `onGenerated` callback `(recipe: CreateRecipePayload) => void` — same in T10 and T11.
- Tool/schema name `recipe` — consistent across T2 (definition).
- Env var `GPDGOD_KEY` — consistent across T1, T2, T15, T17.
- Constants `MODEL = "gpt-4.1-mini"`, `BASE_URL = "https://api.gptgod.online/v1"` — declared once in T2.

**Open assumptions to verify during execution:**
- GPTGOD's gateway exposes an exact `POST /v1/chat/completions` shape compatible with the OpenAI Node SDK 6.x. Their docs say it does. If GPTGOD has any quirks (e.g., doesn't support `response_format: json_schema` in strict mode), the lib's validation + retry path catches malformed responses and the error surfaces to the user as a 502. We may need to fall back to plain JSON-mode (`response_format: { type: "json_object" }`) — easy one-line change in T2's `RESPONSE_FORMAT` constant.
- `gpt-4.1-mini` supports vision input through GPTGOD. If not, T6's image path will return an error and the user sees a 502.
- OpenAI SDK's TypeScript types for vision content blocks (`{ type: "image_url", image_url: { url } }`) are available in v6.x. If the type signature has changed, narrow with `as const` or an explicit type cast.
