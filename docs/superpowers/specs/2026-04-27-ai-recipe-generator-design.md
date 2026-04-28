# AI Recipe Generator — Design Spec

**Status:** Approved (2026-04-27). Ready to convert to an implementation plan.

**Author:** brainstormed via the writing-plans/brainstorming workflow.

---

## §1 — Goal & scope

Add an AI recipe generator that turns either a text description ("I have chicken, rice, broccoli") or a photo of ingredients into a fully-populated, editable recipe form. The user reviews, edits, and saves the result to their personal collection.

### In scope
- Text input mode: free-form description of ingredients on hand.
- Image input mode: a photo the user takes/uploads (browser-side compressed before upload).
- AI populates all fields of the standard recipe form.
- Auto-tags the result with `ai-generated`.
- Reuses the existing `RecipeForm` component for review + edit.
- Save uses the existing `POST /api/recipes` endpoint (no save-path changes).

### Out of scope
- Uploaded photos are used **only** for AI inference. They do **not** become the recipe's hero image. `recipes.image_url` continues to be `null`.
- No streaming output — wait-and-return with a spinner.
- No rate limiting (single-user class project).
- No prompt caching, no batch API, no separate "regenerate" history.

---

## §2 — User flow

1. User signs in and reaches the dashboard.
2. User clicks **"+ Add Recipe"** → lands on `/recipes/new` (existing page).
3. `/recipes/new` shows a small banner at the top: **"✨ Generate with AI"** linking to `/recipes/generate`. Below the banner, the manual form is unchanged.
4. User clicks the link → `/recipes/generate` renders:
   - **AI input panel** at the top with two tabs:
     - **Text** — textarea, placeholder: *"What ingredients do you have? E.g., 'chicken thighs, rice, soy sauce, garlic'."*
     - **Image** — file picker. On select, the file is compressed client-side and a thumbnail + size readout is shown ("Photo: 142 KB").
   - **Generate** button.
   - The same `RecipeForm` component used by manual create, **initially empty**.
5. User fills text or selects an image → clicks Generate → button shows a spinner. After ~2-5s, the form fields below populate.
6. User edits any field they want, then clicks **Save** → `POST /api/recipes` (existing endpoint, unchanged) → redirect to `/recipes/[id]` (existing behavior).

### Error states
- AI fails or returns invalid output (after one retry): show "Couldn't generate a recipe — please try again" inline above the form. Don't wipe form state.
- API key missing on the server (mis-configured deploy): same generic error to the user; details in server logs.

---

## §3 — Architecture

### Files created

| Path | Responsibility |
|---|---|
| `Source_Code/src/app/recipes/generate/page.tsx` | Server component. Auth-gates (mirrors `/recipes/new`). Renders the client. |
| `Source_Code/src/components/recipe-generator/RecipeGeneratorClient.tsx` | Client. Holds state for AI inputs, the generated draft, and the embedded `RecipeForm`. |
| `Source_Code/src/components/recipe-generator/AIInputPanel.tsx` | Client. Tabs (Text/Image), textarea, file picker, calls `compressImage`, calls `/api/recipes/generate`. |
| `Source_Code/src/lib/image-compress.ts` | Browser-only utility. Takes a `File`, returns a `{ dataUrl, sizeBytes }` object via canvas. |
| `Source_Code/src/lib/ai-recipe.ts` | Server-only. Exports `generateRecipeFromText(text)` and `generateRecipeFromImage(base64DataUrl)`. Calls the Anthropic SDK with structured tool use, validates output against `validateCreateRecipePayload`, retries once on failure. |
| `Source_Code/src/app/api/recipes/generate/route.ts` | POST endpoint. Auth-gated. Body `{ mode: "text" \| "image", input: string }`. Returns `{ recipe: CreateRecipePayload }` on success, `{ error }` on failure. |

### Files modified

| Path | Change |
|---|---|
| `Source_Code/src/app/recipes/new/page.tsx` | Add the "✨ Generate with AI" link/banner at the top. |
| `Source_Code/src/components/recipe-form/RecipeForm.tsx` | Accept an optional `defaults: CreateRecipePayload` prop for pre-fill on create (already supports `existingRecipe` for edit; new prop covers the create-with-prefill case). Save still uses POST, not PATCH. |
| `Source_Code/.env.local.example` | Document `ANTHROPIC_API_KEY`. |
| `Source_Code/package.json` | Add `@anthropic-ai/sdk` to dependencies. |
| ` Deployment_Setup/INSTALL.md` | Add Anthropic API key setup to the env-var section. |
| `README.md` | Mention the AI generator under features. |

### Data flow

```
User
 └── /recipes/generate (page)
      └── RecipeGeneratorClient (client component, state)
            ├── AIInputPanel
            │     ├── compressImage(file)  [browser only]
            │     └── POST /api/recipes/generate { mode, input }
            │           └── (server) ai-recipe.ts → Anthropic API → validate → return draft
            │
            └── RecipeForm (defaults = generated draft)
                  └── POST /api/recipes  [existing endpoint, no change]
                        └── redirect /recipes/[id]
```

### Test seam

`lib/ai-recipe.ts` reads the Anthropic client from a small factory that lazy-reads `ANTHROPIC_API_KEY`, mirroring the `lib/db.ts` pattern. Tests inject a fake client via `__setTestClient(fake)` so we never hit the real API in tests.

---

## §4 — Design decisions

| Choice | Pick | Why |
|---|---|---|
| **Model** | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) | ~$0.005/call, ~2s latency, plenty good for structured recipe output. At a $12 semester budget that's >2,000 generations. |
| **Output format** | Anthropic tool use with explicit JSON schema | Tool-use enforces output shape better than "please return JSON". The tool's input schema mirrors `CreateRecipePayload`. |
| **Validation** | Reuse `validateCreateRecipePayload` from `lib/recipe-validation.ts` | DRY — same rules the human form enforces. |
| **Retry on bad output** | One retry with the validation error included in a follow-up user message | If first call returns invalid output, send it back to Claude with the error and ask for a corrected response. Hard fail after the second attempt. |
| **Streaming** | No, wait-and-return | Recipe responses are ~800 tokens, returns in 2-5s. A single spinner is simpler than progressive form-field population. |
| **Image handling** | base64 data URL sent directly to Claude | No Supabase Storage step. Image is ephemeral — used for inference only, not saved. |
| **Image compression (frontend)** | JPEG quality 0.8, longest edge 1568 px, `<canvas>` API | Matches Claude's internal resize, reduces input-token cost ~50%+, stays under the 5 MB API limit on any phone photo. |
| **Auto-tagging** | The generated draft includes `ai-generated` in `tags` | User can remove before saving. Keeps AI-generated recipes searchable later. |
| **Rate limiting** | None | Single-user class project; auth gate is enough. |
| **API key env var** | `ANTHROPIC_API_KEY` | Set in `.env.local` (local) and Vercel project settings (prod). |
| **Save flow** | Uses existing `POST /api/recipes` (no new save endpoint) | The generator only produces a *draft*; saving is the same code path as manual create. |

---

## §5 — Test strategy (TDD)

### Unit tests (new)
- **`lib/__tests__/ai-recipe.test.ts`** — feeds the lib a fake Anthropic client. Cases:
  - happy path text → returns valid `CreateRecipePayload`.
  - happy path image → returns valid `CreateRecipePayload`.
  - first response invalid → retries with error; second response valid → returns it.
  - both responses invalid → throws.
  - response includes `ai-generated` in tags.
- **`lib/__tests__/image-compress.test.ts`** — *deferred*. The browser canvas API isn't easy to test in vitest+node; the function is small enough to be obviously correct from inspection, and is exercised end-to-end by manual smoke. If we add jsdom back later for component tests, revisit then.

### Integration tests (new)
- **`app/api/recipes/__tests__/generate.test.ts`** — exercises the route handler with the fake Anthropic client injected:
  - 401 when not logged in.
  - 400 when body is missing `mode` or `input`.
  - 400 when `mode` is invalid.
  - 200 with a valid `CreateRecipePayload` shape on text input.
  - 200 with a valid `CreateRecipePayload` shape on image input.
  - 502 (or 500) when Claude consistently returns invalid output.

### Coverage gate
Stays at 80% for all four metrics. New `lib/ai-recipe.ts` and the new route should both land well above 80%.

### Manual smoke (post-deploy)
- Set `ANTHROPIC_API_KEY` in Vercel.
- Visit `/recipes/generate` on the deployed app.
- Generate from text. Save. Verify it lands in Postgres and shows on dashboard.
- Generate from image (use a real photo of pantry items). Save. Verify the same.
- Take screenshots into `docs/screenshots/ai-generator-*.png`.

---

## §6 — Prerequisites

Before this can deploy, the user needs:
- An Anthropic API account at https://console.anthropic.com (free tier available).
- An API key.
- The key set as `ANTHROPIC_API_KEY` in:
  - `Source_Code/.env.local` (local dev), and
  - the Vercel project's Environment Variables (Production + Preview + Development).

---

## §7 — Risks & known limitations

1. **Cold-start latency** — on a Vercel cold start, Claude API call adds ~2-5s on top of ~1s function init. User-perceived "Generate" delay: 3-6s. The spinner is essential. Acceptable.
2. **AI output occasionally off-spec** — even with tool use, Claude might emit a category not in the enum or an empty ingredients array. The retry-once-on-validation-failure path handles most; a hard failure shows the user a "Try again" message.
3. **Image input cost** — Claude charges per image at ~1500-2000 input tokens. Still under a cent per call.
4. **No streaming** — if the user hits Generate and walks away, they have no visual feedback beyond the spinner. Acceptable for class scope.
5. **Anthropic API key handling** — same caveat as the Supabase password. Keep in `.env.local` (gitignored). Don't paste into chat or commit logs.
6. **Hallucinated ingredients** — Claude may invent ingredients the user didn't list (e.g. for "chicken and rice" it might add salt, pepper, oil — usually fine, but the user should review).
7. **Multilingual input not explicitly handled** — Claude handles non-English input transparently, but the recipe-validation regexes (e.g. category enum) are English-only. Out of scope.

---

## §8 — Open questions / deferred to plan

These don't block design approval; they get resolved during plan-writing or execution.

- **Exact prompt text** for the generator — drafted in the plan. Will land in `lib/ai-recipe.ts` as a constant.
- **Tool-use schema** — mirrors `CreateRecipePayload`; finalized in the plan.
- **UI styling** — match existing app design tokens (orange primary, zinc neutrals). Plan will reference existing components for consistency.
- **`@anthropic-ai/sdk` version** — pin to latest at plan-write time.
