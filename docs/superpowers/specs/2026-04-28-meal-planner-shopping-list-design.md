# Meal Planner + Shopping List — Design Spec (Phase A1)

**Status:** Approved (2026-04-28). Ready to convert to an implementation plan via `superpowers:writing-plans`.

**Author:** Brainstormed via the brainstorming/writing-plans workflow.

**Scope:** Phase A1 only. Bucket / drag-and-drop / mobile dedicated page deferred to A2. Recipe-form autocomplete + AI-generator category-enum constraints deferred to Phase B.

---

## §1 — Goal & scope

### Goal
Let a logged-in user plan up to 21 meal slots per week (Mon–Sun × morning / noon / evening), then auto-generate a categorized shopping list with check-off boxes and ingredient aggregation that respects per-slot serving sizes.

### In scope (A1)
- Week grid UI on `/meal-plan`. Only filled slots render; empty ones show "+ Add meal".
- Prev/next-week navigation. Defaults to current week (Mon–Sun based on today).
- Per-slot servings input + week-level default with "Apply to all" button.
- Modal recipe picker on a slot's "+ Add meal" click. Single UX across mobile + desktop in A1.
- Shopping list page: scaled, aggregated by `(item, unit)`, grouped by aisle.
- Aisle classification: hybrid keyword map (~50 common items) + LLM cache table for misses.
- Shopping checklist state persisted in `localStorage`, keyed by week-start.

### Out of scope (deferred to A2)
- Bucket / waiting-list entity.
- Dashboard drag-and-drop to bucket.
- Mobile dedicated `/bucket` page with tap-to-add browse view.
- "Empty bucket?" post-planning prompt.

### Out of scope (deferred to Phase B)
- Autocomplete catalog inside `RecipeForm`.
- AI recipe generator's structured-output schema enforcing the same aisle enum at recipe-creation time.

---

## §2 — User flow

1. From dashboard, user clicks the new **Meal Plan** link in the header → lands on `/meal-plan` showing the current week (Mon–Sun based on today's date).
2. The week grid shows 7 day columns. Each column shows only the slots that are filled (rows in `meal_plan_slots` for `(user, date, meal_type)`), plus a `+ Add meal` affordance for each unfilled slot type.
3. User clicks `+ Add meal` on, e.g., Monday-evening → modal opens with their recipe list + search box → click a recipe → modal closes, the slot is created with `servings = week_default ?? recipe.servings ?? 4`.
4. Each filled slot card shows: recipe title, recipe thumbnail (or fallback icon if `imageUrl` is null), a number input for servings, and a delete (×) button.
5. The page header shows: week range, prev / today / next navigation, and the global controls "Default servings: [4]   [Apply to all]".
6. Bottom of page: a primary "Generate shopping list" button → navigates to `/meal-plan/shopping?week=YYYY-MM-DD`.
7. The shopping list page renders aisle-grouped sections (Produce, Dairy & Eggs, Meat & Seafood, Bakery, Pantry, Frozen, Other). Empty aisles are not rendered.
8. Each row inside an aisle is `[checkbox] amount unit item`. Checking a box updates `localStorage` keyed by `mealplan-checks-${weekStart}`. The server returns the same list each load; only check-state lives client-side.
9. A "Back to meal plan" link is shown at the top of the shopping list page.

### Error / edge UX
- If a recipe referenced by a slot has been deleted, the slot row is gone too (CASCADE — see §4). User sees no broken card.
- If LLM classification fails (network / 502 / parse), unknown items fall to "Other" and the list still renders.
- If user clicks `+ Add meal` twice quickly, the API's UNIQUE-violation handler returns a friendly "already added" — the second click is a no-op.

---

## §3 — Architecture

### Schema (single new migration)

`Source_Code/supabase/migrations/2026-04-28-meal-plan.sql`:

```sql
create table meal_plan_slots (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  date         date not null,
  meal_type    text not null check (meal_type in ('morning','noon','evening')),
  recipe_id    uuid not null references recipes(id) on delete cascade,
  servings     integer not null check (servings >= 1) default 4,
  created_at   timestamptz not null default now(),
  unique (user_id, date, meal_type)
);
create index meal_plan_slots_user_date_idx on meal_plan_slots (user_id, date);

create table ingredient_aisles (
  id              uuid primary key default gen_random_uuid(),
  item_normalized text not null unique,
  aisle           text not null check (aisle in (
    'Produce','Dairy & Eggs','Meat & Seafood','Bakery','Pantry','Frozen','Other'
  )),
  source          text not null check (source in ('seed','llm')) default 'llm',
  created_at      timestamptz not null default now()
);
```

The same DDL goes into `supabase/schema.sql` for fresh installs. The migration file is what gets applied to existing Supabase projects.

### Files created

**Lib (server-only):**
- `Source_Code/src/lib/meal-plan.ts` — async CRUD: `listSlotsForWeek`, `createSlot`, `updateSlot`, `deleteSlot`, `bulkUpdateServings`.
- `Source_Code/src/lib/shopping-list.ts` — pure functions: `aggregateIngredients(slots, recipes)`, `parseAmount(str)`, `groupByAisle(items, classify)`. No I/O.
- `Source_Code/src/lib/ingredient-aisles.ts` — keyword map seed + `classifyIngredients(items): Promise<Record<string, Aisle>>`. Tries cache table first, batches misses into a single LLM call, writes results back to the cache.

**Lib unit tests:**
- `Source_Code/src/lib/__tests__/meal-plan.test.ts`
- `Source_Code/src/lib/__tests__/shopping-list.test.ts`
- `Source_Code/src/lib/__tests__/ingredient-aisles.test.ts`

**API routes:**
- `Source_Code/src/app/api/meal-plan/slots/route.ts` — `POST` (create one slot)
- `Source_Code/src/app/api/meal-plan/slots/[id]/route.ts` — `PATCH` (update servings or recipe), `DELETE`
- `Source_Code/src/app/api/meal-plan/slots/bulk-servings/route.ts` — `PATCH { weekStart, servings }` → applies servings to every slot in that week
- `Source_Code/src/app/api/meal-plan/shopping/route.ts` — `POST { weekStart }` → returns aisle-grouped items

**API integration tests:**
- `Source_Code/src/app/api/meal-plan/__tests__/slots.test.ts`
- `Source_Code/src/app/api/meal-plan/__tests__/shopping.test.ts`

**Server pages:**
- `Source_Code/src/app/meal-plan/page.tsx` — auth-gated server component, reads `?week=YYYY-MM-DD`, defaults to current week's Monday.
- `Source_Code/src/app/meal-plan/shopping/page.tsx` — auth-gated server component, reads `?week=YYYY-MM-DD`.

**Client components:**
- `Source_Code/src/components/meal-plan/MealPlanClient.tsx` — week grid container; holds slot state.
- `Source_Code/src/components/meal-plan/WeekNav.tsx` — prev / today / next.
- `Source_Code/src/components/meal-plan/ServingsControls.tsx` — week default + "Apply to all" button.
- `Source_Code/src/components/meal-plan/DayColumn.tsx` — renders the 3 slot positions (filled or empty).
- `Source_Code/src/components/meal-plan/MealSlotCard.tsx` — filled slot (recipe info + servings input + delete).
- `Source_Code/src/components/meal-plan/EmptySlot.tsx` — `+ Add meal` button.
- `Source_Code/src/components/meal-plan/RecipePickerModal.tsx` — searchable recipe list inside a modal dialog.
- `Source_Code/src/components/shopping-list/ShoppingListClient.tsx` — aisle-grouped checklist with localStorage state.

### Files modified

- `Source_Code/src/components/Header.tsx` — add a "Meal Plan" link to navigate to `/meal-plan`.
- `Source_Code/supabase/schema.sql` — append the two new `create table` statements (matches the migration).
- `Source_Code/src/test/setup.ts` — extend the per-test truncate to include `meal_plan_slots, ingredient_aisles` (cascade still handles users → meal_plan_slots).

### Data flow (shopping list generation)

```
User clicks "Generate shopping list"
  → /meal-plan/shopping?week=2026-04-28 (server component)
  → POST /api/meal-plan/shopping { weekStart: "2026-04-28" }
       │
       ▼
  lib/shopping-list.ts
    1. lib/meal-plan.ts: fetch slots for week + JOIN recipes
    2. For each slot: multiplier = slot.servings / recipe.servings
       For each ingredient: scaled_amount = parseFloat(amount) * multiplier
                                              (or pass-through if non-numeric)
    3. aggregate: group by (lower(item), lower(unit))
                  if all amounts in group are numbers → sum
                  else → list each occurrence
    4. unique items → lib/ingredient-aisles.ts classify
       a. SELECT from ingredient_aisles WHERE item_normalized IN (...)
       b. Items still missing → keyword map
       c. Items still missing → batch LLM call → INSERT into ingredient_aisles
    5. Group aggregated items by aisle → return JSON

  → Client renders aisle sections; hydrates check-state from
    localStorage[`mealplan-checks-${weekStart}`].
```

---

## §4 — Decisions baked in

These are settled. Don't re-litigate during plan-writing or implementation.

| Choice | Pick | Why |
|---|---|---|
| Slot uniqueness | `UNIQUE (user_id, date, meal_type)` | Prevents double-booking. |
| Date type | Postgres `date` (not `timestamp`) | No timezone drama for "Monday's lunch". |
| Recipe delete cascade | `ON DELETE CASCADE` from `meal_plan_slots.recipe_id` | If user deletes a recipe, scheduled slots disappear with it. Acceptable for v1; user can re-pick. |
| Servings default for new slot | `week_default ?? recipe.servings ?? 4` | Falls back gracefully. |
| Servings scaling | `multiplier = slot.servings / recipe.servings`, applied to numeric amounts only | Non-numeric ("a pinch", "to taste") pass through unchanged. |
| Aggregation key | `lower(item.trim()) + "|" + lower(unit.trim())` | "2 g salt" + "1 g salt" → "3 g salt". Different units → separate lines. |
| Aisle list | Fixed 7-element enum | `Produce / Dairy & Eggs / Meat & Seafood / Bakery / Pantry / Frozen / Other`. Same enum used in DB `CHECK`, LLM JSON schema, and TypeScript union. |
| Classification | Hybrid: cache table → keyword map → LLM batch → write back to cache | Reuses Phase 4's GPTGOD client (`gpt-4.1-mini`). One LLM call per shopping list with new items; free after the cache warms. |
| LLM image vs text | Text only — classification is just a list of strings | No vision needed. |
| Shopping list checkbox state | `localStorage` keyed by `mealplan-checks-${weekStart}` | Mid-shop continuity on a single device. No DB churn. Acceptable for class scope. |
| Week start | Monday | ISO 8601 / European default. Hardcoded constant; configurable later if needed. |
| Recipe picker UX in A1 | Single modal across mobile + desktop | Simpler than breakpoint logic; A2 replaces it with bucket flow. |
| Reordering slots | Not supported in A1 | `meal_type` is fixed enum — there are exactly 3 positions per day. |
| Empty slot rendering | Show "+ Add meal" only for the meal types not yet filled on that day | Matches the "noon hide if user did not add dish" UX request. |
| Validation | Lib + DB + API: same constraints (servings ≥ 1, aisle enum, etc.) | Defense in depth. |

### Frontend image compression note (carryover)

Phase 4 set `image-compress.ts` to 768 px / quality 0.7 for the GPTGOD vision endpoint. This spec doesn't change that — meal plan + shopping list are text-only.

---

## §5 — Test strategy (TDD)

### Unit tests
- **`shopping-list.test.ts`** — pure functions, fastest:
  - `parseAmount("1 1/2") → 1.5`, `parseAmount("a pinch") → null`
  - `aggregateIngredients` — same item+unit sums; different units stay separate; non-numeric items pass through
  - Servings scaling — `multiplier = 0.5` halves numeric amounts
- **`ingredient-aisles.test.ts`** — fake LLM client + injected DB:
  - keyword map matches lowercase substring (`"yellow onion"` → Produce)
  - cache hit returns immediately, no LLM call
  - cache miss + keyword miss → calls LLM with batched items, writes results to `ingredient_aisles`
  - LLM failure → all unknowns default to "Other", list still renders
- **`meal-plan.test.ts`** — DB-backed via PGlite:
  - create slot, list-by-week range, update servings, delete
  - bulk-update servings respects week boundaries
  - UNIQUE violation on duplicate `(user_id, date, meal_type)`
  - cascade — deleting a user removes their slots; deleting a recipe removes slots referencing it

### Integration tests
- **`api/meal-plan/__tests__/slots.test.ts`** — auth gate (401), invalid body (400), happy paths for POST / PATCH / DELETE / bulk-servings.
- **`api/meal-plan/__tests__/shopping.test.ts`** — empty week → empty list; week with overlapping ingredients → aggregated correctly; LLM-mocked classification → grouped output.

### Component tests
Out of scope (consistent with existing pattern excluding `src/components/**` from coverage).

### Coverage gate
Stays at 80% for all four metrics. New lib modules + routes should land well above 80%.

### Manual smoke
1. Plan a week with 2–3 recipes spanning multiple aisles.
2. Click "Generate shopping list" → verify aisle grouping + amounts.
3. Check off some items → reload page → verify check-state persists (localStorage).
4. Navigate prev/next week → verify clean state.

---

## §6 — Prerequisites

None new. Phase 4's `GPTGOD_KEY` is already configured locally and in Vercel. The migration is additive; no destructive operations on existing tables.

---

## §7 — Risks & known limitations

1. **LLM classification can hallucinate categories.** Mitigated by JSON-schema-strict response constraining output to the 7-aisle enum. On parse failure, unknowns fall to "Other" so the list still renders.
2. **Servings scaling can produce odd numbers** (e.g., `0.75 eggs`). Acceptable for v1. A future iteration could round to integer for typically-integer units.
3. **UNIQUE-constraint race condition** if user double-clicks "Add meal" within the same RTT. The DB throws `23505`; route catches and returns `200` with the existing slot. No real harm.
4. **localStorage check-state can desync** if the user's meal plan changes after generating the shopping list. Mitigation: include a content hash of the item list in the localStorage key; mismatch → start with a fresh checklist.
5. **Keyword map is English-only.** Non-English ingredients fall through to LLM, which generally handles them. Acceptable for class scope.
6. **No undo** for slot delete or recipe delete. v1 lives with it; Phase B could add toast-with-undo.
7. **Vercel cold start adds ~1s to first shopping list generation** that requires a cache miss + LLM call. Total user-perceived: 2-4 s. The Generate button shows a spinner.

---

## §8 — Phase A2 preview (deferred — separate spec)

When A1 is shipped and stable, Phase A2 will add the bucket layer:

- New `bucket_items` table: `(user_id, recipe_id, position, created_at)`.
- Dashboard gains a desktop drag-and-drop affordance (and a mobile "+" button on each recipe card) that adds the recipe to the user's bucket.
- New `/bucket` page (mobile-first) listing bucket items + a search field.
- Meal plan page gains a sidebar (desktop) / collapsible drawer (mobile) showing bucket contents — items are draggable / tappable into a slot. Adding from bucket → slot does NOT remove from bucket (per user direction; bucket is wishlist-style with explicit removal).
- After "Generate shopping list", the post-generation page asks "Empty bucket?" with a yes/no prompt. "Yes" wipes; "No" preserves.

A2 is purely additive — it consumes A1's data layer and adds a sibling entity + UI. No schema changes to A1's tables.

---

## §9 — Phase B preview (deferred further)

After A2: ingredient catalog + autocomplete UX.

- Repurpose `ingredient_aisles` as the catalog (rename / extend if needed).
- Seed with curated 100–200 common ingredients.
- New `GET /api/ingredients/search?q=...` autocomplete endpoint.
- Replace the free-text `item` input in `RecipeForm` with a typeahead component.
- Update the AI recipe generator's tool/JSON schema to constrain ingredient categories to the same enum, with post-process catalog lookup.

Phase B is also purely additive on Phase A1's data layer.
