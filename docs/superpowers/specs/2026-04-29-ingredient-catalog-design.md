# Ingredient Catalog Design (Phase B)

**Status:** approved 2026-04-29
**Builds on:** Phase A1 (meal planner + shopping list) and Phase A2 (bucket layer).

---

## 1. Goal

Add a hybrid ingredient catalog that disappears into the recipe-editing experience. The catalog drives:

- **Typeahead autocomplete** in the recipe form for the `item` field, with default-unit pre-fill.
- **Soft constraint** for the AI recipe generator so generated recipes prefer the user's existing vocabulary.
- **Cleaner data over time** — fewer typos, more consistent aisle classification on the shopping list.

The catalog must not require any explicit user action. Users never browse it, never curate it, never approve entries. It grows from three sources: a small seed shipped with the app, recipes the user manually saves, and recipes the AI generates for that user.

---

## 2. Decisions baked in (not relitigating)

1. **Hybrid catalog.** One `ingredients` table holds both global seed (`user_id = null`) and per-user entries (`user_id` set). Per-user rows shadow same-named global rows — the unique constraint `(user_id, name_normalized)` allows it.
2. **Entry shape:** `name`, `default_unit`, `aisle`. Subsumes the data shape of `ingredient_aisles` for catalog entries but does NOT replace `ingredient_aisles` — that table stays as the shopping-list classification cache (decoupled).
3. **AI integration:** soft constraint via system-prompt addendum (no JSON-schema enum). Post-process every AI response to map output items to catalog entries, auto-creating per-user entries for unmatched items.
4. **Manual recipe save:** triggers the same `getOrCreateIngredient` path. Manual edits and AI generation grow the catalog symmetrically.
5. **Seed source:** AI-generate ~200 common ingredients via the existing GPTGOD client, save to `Source_Code/data/ingredient-seed.json`, commit it, load in the migration. Production deploys never re-call the AI.
6. **Existing recipes:** one-time backfill script populates per-user catalogs from current recipes.
7. **No catalog management UI in v1.** No `/ingredients` page, no edit, no delete. The autocomplete dropdown is the only surface. (Future phase if needed.)
8. **Free text still allowed everywhere.** Autocomplete is suggestive; users can type anything; what they save creates a catalog entry.

---

## 3. Architecture

### 3.1 Data model

One new table:

```sql
create table if not exists ingredients (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references users(id) on delete cascade,  -- null = global seed
  name            text not null check (length(trim(name)) between 1 and 80),
  name_normalized text not null,                                -- lower(trim(name))
  default_unit    text not null default '',
  aisle           text not null check (aisle in (
    'Produce','Dairy & Eggs','Meat & Seafood','Bakery','Pantry','Frozen','Other'
  )),
  source          text not null check (source in ('seed','user','ai','backfill')) default 'user',
  created_at      timestamptz not null default now(),
  unique (user_id, name_normalized)
);

create index if not exists ingredients_user_idx
  on ingredients (user_id);
create index if not exists ingredients_name_norm_idx
  on ingredients (name_normalized text_pattern_ops);
```

`name_normalized` is computed by the lib (not a generated column) for PGlite portability. The `text_pattern_ops` index supports prefix queries (`like 'tomat%'`).

`ingredient_aisles` (Phase A1) is unchanged. Whenever the catalog grows, the same item is upserted into `ingredient_aisles` so the shopping-list cache stays consistent.

### 3.2 Components

**Created:**

| Path | Responsibility |
|---|---|
| `Source_Code/supabase/migrations/2026-04-29-ingredient-catalog.sql` | One-shot migration (idempotent) |
| `Source_Code/data/ingredient-seed.json` | Committed seed data (~200 rows) |
| `Source_Code/scripts/generate-ingredient-seed.mjs` | Dev-only script that produces `ingredient-seed.json` via the AI client |
| `Source_Code/scripts/backfill-ingredient-catalog.mjs` | One-time backfill from existing recipes |
| `Source_Code/src/lib/ingredients.ts` | `searchIngredients`, `getOrCreateIngredient`, `listUserCatalog`, `seedGlobal` |
| `Source_Code/src/lib/__tests__/ingredients.test.ts` | Unit tests against PGlite |
| `Source_Code/src/app/api/ingredients/route.ts` | `GET /api/ingredients?q=<prefix>` |
| `Source_Code/src/app/api/ingredients/__tests__/route.test.ts` | Route integration tests |
| `Source_Code/src/components/ingredients/IngredientCombobox.tsx` | Hand-rolled autocomplete combobox |

**Modified:**

| Path | Change |
|---|---|
| `Source_Code/supabase/schema.sql` | Append `ingredients` block + seed insert |
| `Source_Code/src/test/setup.ts` | Truncate `ingredients` between tests |
| `Source_Code/src/lib/ai-recipe.ts` | Inject catalog hints into system prompt; post-process to grow catalog |
| `Source_Code/src/lib/recipes.ts` | `createRecipe` and `updateRecipe` call `getOrCreateIngredient` for each saved ingredient |
| `Source_Code/src/components/RecipeForm.tsx` (or whichever file holds the editable ingredient row) | Replace the `item`-field `<input>` with `<IngredientCombobox>`; pre-fill `unit` when a suggestion is picked and the unit field is empty |
| `README.md`, `Deployment_Setup/INSTALL.md` | Migration callout + backfill command |

### 3.3 `lib/ingredients.ts` — module shape

```typescript
export interface Ingredient {
  readonly id: string;
  readonly userId: string | null;       // null = global
  readonly name: string;                 // canonical display
  readonly defaultUnit: string;
  readonly aisle: Aisle;
  readonly source: 'seed' | 'user' | 'ai' | 'backfill';
}

export interface IngredientSuggestion {
  readonly name: string;
  readonly defaultUnit: string;
  readonly aisle: Aisle;
}

export async function searchIngredients(
  userId: string,
  q: string,
  limit?: number,
): Promise<readonly IngredientSuggestion[]>;

export async function getOrCreateIngredient(
  userId: string,
  rawName: string,
  hints?: { unit?: string; source?: 'user' | 'ai' | 'backfill' },
): Promise<Ingredient>;

export async function listUserCatalog(
  userId: string,
): Promise<readonly Ingredient[]>;

export async function seedGlobal(rows: readonly SeedRow[]): Promise<number>;
```

`searchIngredients` SQL:

```sql
select id, user_id, name, default_unit, aisle, source
  from ingredients
 where (user_id is null or user_id = $1)
   and name_normalized like $2
 order by user_id desc nulls last, name_normalized
 limit $3
```

The `user_id desc nulls last` ordering prefers user-specific rows over global rows when a user has overridden a global entry.

`getOrCreateIngredient` is the single point that grows the catalog. It:

1. Normalizes the name (`lower(trim(rawName))`).
2. Looks up an existing row scoped to `(userId, name_normalized)` — first the user's row, then the global row.
3. If neither exists: classifies the aisle via the existing keyword classifier from A1's `lib/ingredient-aisles.ts` (`keywordClassify`); if no keyword match, calls the same LLM batch-classifier already used by the shopping list. Inserts a new row with `user_id = userId`, `source = hints.source ?? 'user'`, `default_unit = hints.unit ?? ''`.
4. Side-effect: upserts `ingredient_aisles (item_normalized, aisle, source='llm'|'seed')` so the shopping list cache stays in sync.

### 3.4 `/api/ingredients` route

```
GET /api/ingredients?q=<prefix>&limit=<n>
  → 200 { items: IngredientSuggestion[] }
  → 401 if not authenticated
```

Behavior:
- `q` trimmed and lowercased server-side. Empty or absent `q` → `{ items: [] }` (no full-catalog dump).
- `limit` defaults to 8, capped at 20.
- No POST/DELETE — the catalog is grown only as a side-effect of recipe saves and AI runs.

### 3.5 AI integration

In `lib/ai-recipe.ts` `generateRecipeFromText` and `generateRecipeFromImage`:

**Before the OpenAI call:**

```typescript
const hints = await getCatalogHints(userId);  // up to 80 names
const systemPromptWithHints =
  SYSTEM_PROMPT +
  '\n\nWhen choosing ingredient names, prefer these (the user has used them before): ' +
  hints.join(', ') + '.';
```

`getCatalogHints` selects up to 80 names from `(user_id is null or user_id = $1) order by user_id desc nulls last, created_at desc`. The cap keeps the prompt under a few hundred tokens.

**After the response validates:**

```typescript
for (const ing of result.ingredients) {
  await getOrCreateIngredient(userId, ing.item, {
    unit: ing.unit,
    source: 'ai',
  });
}
```

This grows the per-user catalog from the AI output; the recipe ingredient list itself is unchanged from the user's perspective.

The JSON-schema sent to OpenAI does NOT include an enum for `item` — soft constraint only.

### 3.6 Recipe form integration

`IngredientCombobox` props:

```typescript
interface IngredientComboboxProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSelect: (suggestion: IngredientSuggestion) => void;
  readonly placeholder?: string;
  readonly id?: string;
  readonly disabled?: boolean;
}
```

Behavior:
- Internal state: `query` (mirrors `value`), `suggestions: IngredientSuggestion[]`, `activeIndex: number`, `open: boolean`.
- Debounce: 150ms after the last keystroke before fetching.
- Fetch path: `/api/ingredients?q=<query>&limit=8`.
- Keyboard: ArrowDown / ArrowUp move `activeIndex`; Enter selects active; Escape closes; Tab closes without selecting.
- Mouse: click selects.
- A11y: input has `role="combobox"` `aria-expanded` `aria-controls`. Listbox has `role="listbox"`. Items have `role="option"`. `aria-activedescendant` on input points at active item.

In the recipe form (the existing `RecipeForm.tsx` or the inline ingredients section of the recipe page), wrap the existing `item` input:

```tsx
<IngredientCombobox
  id={`ing-item-${idx}`}
  value={ing.item}
  onChange={(v) => updateIngredient(idx, { item: v })}
  onSelect={(sug) => updateIngredient(idx, {
    item: sug.name,
    unit: ing.unit.trim() === '' ? sug.defaultUnit : ing.unit,
  })}
  placeholder="all-purpose flour"
/>
```

### 3.7 Backfill script

`scripts/backfill-ingredient-catalog.mjs`:

1. Connect via `DATABASE_URL`.
2. `select id, author_id, ingredients from recipes`.
3. For each row, parse `ingredients` JSON. For each `{item}`, normalize, dedupe within the row.
4. Group by `author_id`. For each `(author_id, item)`, call the same `getOrCreateIngredient` logic via direct SQL (or import from the lib if running under tsx). Use `source = 'backfill'`.
5. Print summary: `users: N, recipes: M, unique items added: K`.
6. Idempotent — re-runs are safe.

The script is run manually after the migration is applied. INSTALL.md and README document the command.

### 3.8 Seed generation script (dev-only)

`scripts/generate-ingredient-seed.mjs`:

1. Calls the existing GPTGOD client with a structured-output JSON schema asking for ~200 common cooking ingredients with `name`, `default_unit`, `aisle`.
2. Validates the response against the same JSON schema.
3. Writes to `Source_Code/data/ingredient-seed.json`.
4. The output is committed to the repo. Production deploys never run this script — they read the JSON.

The migration's seed step reads the JSON and inserts via `INSERT ... ON CONFLICT (user_id, name_normalized) DO NOTHING`.

---

## 4. Data flow

**Manual recipe save:**

```
user types "tomat" → IngredientCombobox debounces 150ms
                  → GET /api/ingredients?q=tomat
                  → server: searchIngredients(userId, 'tomat', 8)
                  → returns [{name:'tomato',unit:'whole',aisle:'Produce'}, ...]
                  → user picks "tomato" → onSelect fills item="tomato", unit="whole"
... user adds more ingredients, hits save
POST /api/recipes  → createRecipe(...)
                  → for each ingredient: getOrCreateIngredient(userId, item, {unit})
                  → for unmatched items: classify aisle, insert ingredients row + sync ingredient_aisles
```

**AI recipe generation:**

```
user uploads image / text → /api/recipes/generate
                          → getCatalogHints(userId) → 80 name list
                          → call OpenAI with system prompt augmented by hints
                          → response: {ingredients:[{item,unit,amount},...]}
                          → for each: getOrCreateIngredient(userId, item, {unit, source:'ai'})
                          → return recipe to client; user reviews, saves via the normal path
```

**Shopping list (unchanged behavior, still consistent):**

The shopping list reads `ingredient_aisles` directly. Because `getOrCreateIngredient` syncs new entries into `ingredient_aisles`, the shopping list keeps classifying every recipe ingredient correctly without any change to its code.

---

## 5. Error handling

- **Empty / non-string `q`** → `{ items: [] }` (200).
- **`q` longer than 80 chars** → truncate before lookup.
- **Unauthenticated `GET /api/ingredients`** → 401.
- **`getOrCreateIngredient` aisle classification failure** (LLM unreachable, network error) → fall back to `aisle = 'Other'`. Don't fail the recipe save.
- **Backfill script LLM failures** → log and skip the item (it'll get classified next time the user touches a recipe with that item).
- **Seed migration with malformed JSON** → fail the migration loudly. Better to halt than to ship a broken catalog.
- **Database connection errors in the autocomplete fetch** → component renders empty dropdown silently (no error toast — the user can still type free text).

---

## 6. Testing strategy

**Unit (PGlite):**

- `searchIngredients`: prefix match, user override beats global, limit caps results, empty `q` returns empty, malformed userId returns empty.
- `getOrCreateIngredient`: creates new with keyword aisle, finds existing user-scoped, finds existing global, returns the per-user shadow when one exists, syncs to `ingredient_aisles`, falls back to `'Other'` when classifier returns null.
- Cascade-on-user-delete: per-user ingredients vanish; global ones stay.

**API (PGlite + cookie mock):**

- 401 unauthenticated.
- Empty `q` returns empty array.
- Prefix match works end-to-end.
- Limit enforcement.

**Integration:**

- `createRecipe` triggers `getOrCreateIngredient` for each new item.
- `generateRecipeFromText` post-processes correctly (use the existing test client mock).

**Migration test:**

- Apply migration against fresh PGlite, count rows in `ingredients` where `source='seed'` matches the JSON's row count.

**Coverage gate:** ≥80% across the four metrics, same as Phases A1 and A2.

---

## 7. Prerequisites

- `@dnd-kit/core` already installed (Phase A2). No new dependencies for Phase B.
- `GPTGOD_KEY` already configured for AI generator. The seed-generation script reuses it. Production deploys do not need it for catalog operations (only the AI recipe generator already needed it).

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Autocomplete latency on slow networks degrades typing experience | 150ms debounce, 8-item cap, prefix-indexed query keeps responses ≤50ms typical |
| Seed JSON drift between regenerations | Commit the JSON; regenerate only when seed quality matters |
| AI catalog hints prompt grows too large | Cap at 80 names, ~600 chars; well under any token budget |
| Backfill takes too long for large users | Class-project scale (<1000 recipes per user) — trivial. Document re-run safety. |
| Manual entry of "tomayto" pollutes the user catalog | Acceptable — autocomplete will surface it, future phase can add cleanup UI |
| Unit pre-fill clobbers user's chosen unit | Only pre-fill when `unit.trim() === ''` |

---

## 9. Out of scope (future phases)

- Catalog management UI (CRUD on per-user entries).
- Synonym handling (e.g., "scallion" ↔ "green onion") — currently they'd be two separate entries in the catalog but both correctly classified into Produce, so the shopping list still works.
- Unit normalization (closed enum of cup/tbsp/g/etc.) — the unit field stays free-text.
- Public sharing of catalog entries between users.
- Fuzzy matching (Levenshtein) in autocomplete — prefix only for v1.
