# Bucket Layer — Design Spec (Phase A2)

**Status:** Approved (2026-04-28). Ready to convert to an implementation plan.

**Author:** Brainstormed via the brainstorming/writing-plans workflow.

**Builds on:** Phase A1 (meal planner + shopping list, [`2026-04-28-meal-planner-shopping-list-design.md`](./2026-04-28-meal-planner-shopping-list-design.md)).

---

## §1 — Goal & scope

### Goal
Add a per-user **bucket** — a wishlist of recipes earmarked for upcoming planning. Desktop users drag recipes from the dashboard into a floating bucket button + drawer, then drag from the drawer onto meal-plan slots. Mobile users browse and add via a dedicated `/bucket` page with a toggle between manage and browse-and-add modes. After generating a shopping list, the user is prompted whether to empty the bucket.

### In scope (A2)
- New `bucket_items` Postgres table with `UNIQUE (user_id, recipe_id)`.
- Desktop **FAB + drawer** on `/dashboard` and `/meal-plan` — drag-and-drop via `@dnd-kit/core`.
- Mobile **header bucket icon** with count badge → links to `/bucket`.
- `/bucket` page: combined view with a **Manage / Browse-and-Add** toggle, search input in the Add mode.
- A1's `RecipePickerModal` (the meal-plan slot picker) gains a **Bucket | All recipes** tab switcher, defaulting to Bucket.
- "Empty bucket?" dismissible banner at the top of `/meal-plan/shopping` when the bucket has items.
- Adding from bucket → slot does **not** remove from bucket (wishlist behavior; explicit clear only).

### Out of scope (deferred to Phase B)
- Ingredient catalog + autocomplete in `RecipeForm`.
- AI recipe generator schema-constrained to catalog categories.

---

## §2 — User flow

### Desktop dashboard
1. User on `/dashboard` browses recipes.
2. User drags a recipe card → drops onto the FAB (bottom-right). FAB highlights as drop target.
3. `POST /api/bucket {recipeId}` adds it. Count badge increments.
4. Click FAB → drawer slides in from the right with bucket items. Each has × to remove.

### Desktop meal-plan
1. Same FAB on `/meal-plan`. Click → drawer opens.
2. Drag a bucket item from drawer → drop onto an empty slot → existing A1 endpoint creates the slot. Item **stays** in bucket.
3. Drawer auto-collapses on outside-click / Escape.
4. "+ Add meal" still works as a fallback modal — gains Bucket | All tabs (Bucket default).

### Mobile dashboard
1. Header has a bucket icon with count badge. No FAB. Recipe cards are not draggable.
2. Tap the bucket icon → navigate to `/bucket`.

### Mobile `/bucket` page
1. Top: a horizontal toggle: **[Manage]** | **[Browse & Add]** — defaults to **Browse & Add** if bucket is empty, **Manage** if it has items.
2. **Manage mode:** vertical list of bucket items with × buttons. Empty state directs the user to switch modes.
3. **Browse & Add mode:** search box at top, scrollable list of all the user's recipes. Recipes already in the bucket are visually muted with a "✓ In bucket" badge; tapping them is a no-op. Tap any other recipe → adds to bucket → flips to "✓ In bucket" inline.

### Mobile meal-plan
- Same as A1 plus the modal's Bucket | All tabs.

### "Empty bucket?" banner
- After clicking "Generate shopping list" → land on `/meal-plan/shopping`.
- If bucket has items: banner at top — *"Done planning? You have N recipes in your bucket. **[Yes, empty it]** **[Keep them]**"*
- **Yes** → `POST /api/bucket/clear` → cleared → banner dismisses.
- **Keep** → banner dismisses for the session (sessionStorage flag keyed by week).

### Error / edge UX
- Adding a recipe already in the bucket: `23505` from UNIQUE → mapped to friendly "Already in bucket." (no error UI; idempotent).
- Removing a recipe not in bucket: 404 with friendly message.
- Stale drawer state on cross-page navigation: drawer refetches on mount.

---

## §3 — Architecture

### Schema (one new migration: `supabase/migrations/2026-04-28-bucket.sql`)

```sql
create table if not exists bucket_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  recipe_id   uuid not null references recipes(id) on delete cascade,
  added_at    timestamptz not null default now(),
  unique (user_id, recipe_id)
);
create index if not exists bucket_items_user_idx
  on bucket_items (user_id, added_at desc);
```

Same DDL appended to `supabase/schema.sql`.

### Files created

| Path | Responsibility |
|---|---|
| `Source_Code/supabase/migrations/2026-04-28-bucket.sql` | Migration |
| `Source_Code/src/lib/bucket.ts` | Async CRUD: `listBucket`, `addToBucket`, `removeFromBucket`, `clearBucket` |
| `Source_Code/src/lib/__tests__/bucket.test.ts` | Lib unit tests |
| `Source_Code/src/app/api/bucket/route.ts` | `GET` list; `POST { recipeId }` add; `DELETE` (no body) clear |
| `Source_Code/src/app/api/bucket/[recipeId]/route.ts` | `DELETE` remove specific |
| `Source_Code/src/app/api/bucket/__tests__/bucket.test.ts` | Route integration tests |
| `Source_Code/src/app/bucket/page.tsx` | Server component — auth gate, fetches bucket + all recipes |
| `Source_Code/src/components/bucket/BucketPageClient.tsx` | Toggle (Manage / Browse&Add) + list + search |
| `Source_Code/src/components/bucket/BucketFab.tsx` | Desktop FAB with count badge + droppable target |
| `Source_Code/src/components/bucket/BucketDrawer.tsx` | Desktop drawer with bucket items (each draggable) |
| `Source_Code/src/components/bucket/EmptyBucketBanner.tsx` | Banner on shopping list page |

### Files modified

| Path | Change |
|---|---|
| `Source_Code/package.json` | Add `@dnd-kit/core@^6` |
| `Source_Code/supabase/schema.sql` | Append `bucket_items` block |
| `Source_Code/src/test/setup.ts` | Truncate `bucket_items` between tests |
| `Source_Code/src/components/Header.tsx` | Add mobile bucket icon (linked to `/bucket`, with count badge) |
| `Source_Code/src/components/DashboardClient.tsx` | Wrap in `DndContext`; recipes become draggable |
| `Source_Code/src/components/RecipeCard.tsx` | Optional `useDraggable` wrapper when inside `DndContext` |
| `Source_Code/src/components/meal-plan/MealPlanClient.tsx` | Wrap in `DndContext`; `EmptySlot` becomes droppable |
| `Source_Code/src/components/meal-plan/EmptySlot.tsx` | Add droppable behavior |
| `Source_Code/src/components/meal-plan/RecipePickerModal.tsx` | Add Bucket / All-recipes tab switcher (defaults to Bucket) |
| `Source_Code/src/components/shopping-list/ShoppingListClient.tsx` | Render `EmptyBucketBanner` |

### `lib/bucket.ts` interface

```typescript
export interface BucketItem {
  readonly id: string;
  readonly userId: string;
  readonly recipeId: string;
  readonly addedAt: string;
}

export async function listBucket(userId: string): Promise<readonly BucketItem[]>;
export async function addToBucket(userId: string, recipeId: string):
  Promise<{ item: BucketItem } | { error: string }>;  // 23505 → "Already in bucket."
export async function removeFromBucket(userId: string, recipeId: string): Promise<boolean>;
export async function clearBucket(userId: string): Promise<number>;  // count cleared
```

### Drag-and-drop wiring

```
<DndContext onDragEnd={handleDragEnd}>
  /* /dashboard */
  <RecipeGrid />              (each card useDraggable id="recipe:<id>")
  <BucketFab />               (useDroppable id="bucket")

  /* /meal-plan */
  <DayColumn>
    <EmptySlot date=... mealType=... />  (useDroppable id="slot:<date>:<type>")
  </DayColumn>
  <BucketFab />
  <BucketDrawer>
    <BucketItem />            (each useDraggable id="bucket-item:<recipeId>")
  </BucketDrawer>
</DndContext>
```

`handleDragEnd(event)` reads `active.id` + `over.id`:
- `recipe:X` → `bucket` ⇒ `POST /api/bucket {recipeId: X}`
- `bucket-item:X` → `slot:DATE:TYPE` ⇒ `POST /api/meal-plan/slots {...}`

---

## §4 — Decisions baked in

| Choice | Pick | Why |
|---|---|---|
| Drag-and-drop lib | `@dnd-kit/core` (latest 6.x) | Modern, accessible, ~30 KB. Same lib for dashboard + meal-plan. |
| Bucket UNIQUE | `(user_id, recipe_id)` | No dupes; simpler "in bucket" check. |
| Reorder | None in A2 | Items render newest-first via `added_at desc`. YAGNI. |
| Bucket → slot behavior | Item stays in bucket | Wishlist behavior; explicit clear only. |
| Clear bucket | Manual via UI | Banner button on shopping list page or "Clear all" in `/bucket` Manage mode. |
| `/bucket` default mode | Manage if bucket has items, else Browse & Add | Less surprise. |
| FAB + drawer | Desktop only (≥ `md` breakpoint) | Mobile uses header icon → `/bucket`. |
| Mobile drag | Disabled | Cards aren't wrapped in `DndContext` on mobile breakpoints. |
| Banner dismissal | sessionStorage keyed by `weekStart` | Reappears next session / next week. |
| Bucket count in header | SSR initial count, optimistically updated client-side | No flash of "0". |
| @dnd-kit scope | Loaded only on dashboard + meal-plan pages | `/bucket` page doesn't use drag. |

---

## §5 — Test strategy (TDD)

### Unit tests (new)
- **`lib/__tests__/bucket.test.ts`** — DB-backed via PGlite:
  - add → list returns it
  - add same recipe twice → 23505 → "Already in bucket."
  - removeFromBucket happy + not-in-bucket
  - clearBucket returns the count
  - cascade — deleting user removes their bucket items; deleting recipe removes references

### Integration tests (new)
- **`app/api/bucket/__tests__/bucket.test.ts`** — auth gate; GET list; POST happy + 409 on duplicate; DELETE clear-all; DELETE [recipeId] happy + 404.

### No new component tests
Consistent with existing pattern (excludes `src/components/**` from coverage scope).

### Coverage gate
Stays at 80%. New lib + routes both clear it on their own.

### Manual smoke (post-deploy)
1. Desktop: drag from dashboard → FAB; verify badge count.
2. Desktop: open drawer; drag from drawer → meal-plan slot; verify item stays in bucket.
3. Mobile: header icon → `/bucket`; toggle modes; tap-to-add and tap-to-remove.
4. Mobile: meal-plan slot picker has Bucket tab default.
5. Generate shopping list → "Empty bucket?" banner appears → click Yes → bucket cleared, banner gone.

---

## §6 — Prerequisites

None new. `@dnd-kit/core` arrives via `npm install` in the first plan task. Migration is additive, runs against existing Supabase. No env vars added.

---

## §7 — Risks

1. **Bundle size (~30 KB) from `@dnd-kit/core`.** Acceptable; only loads on dashboard + meal-plan.
2. **Accessibility** — `@dnd-kit` provides keyboard support but tab-order / focus must be tested. Mitigation: `aria-label`s on drag handles + drop targets; keyboard manual smoke.
3. **Race condition** — double-click "+ Add to bucket" → 23505 → caught and returned as benign "Already in bucket." (no error UI).
4. **Header layout overflow on mobile** — adding a bucket icon to a tight header may overflow. Mitigation: only show on `< md` breakpoint; desktop has the FAB.
5. **Stale drawer state** — adding on `/dashboard` then navigating to `/meal-plan` requires fresh count. Mitigation: drawer refetches on mount.
6. **SSR/CSR consistency for badge count** — server-rendered initial count + client revalidation = consistent.

---

## §8 — Phase B preview (deferred — separate spec)

When A2 is shipped and stable, Phase B will add the ingredient catalog + autocomplete UX:

- Repurpose `ingredient_aisles` (from A1) as the catalog.
- Seed with curated 100–200 common ingredients.
- New `GET /api/ingredients/search?q=...` autocomplete endpoint.
- Replace the free-text `item` input in `RecipeForm` with a typeahead component.
- Update the AI recipe generator's tool/JSON schema to constrain ingredient categories to the same enum.

Phase B is purely additive on Phase A1's data layer. No A2 dependency.
