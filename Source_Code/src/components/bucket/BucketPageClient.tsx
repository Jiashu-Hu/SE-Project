"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { BucketItem } from "@/lib/bucket";
import type { Recipe } from "@/types/recipe";

type Mode = "manage" | "add";

interface BucketPageClientProps {
  readonly initialItems: readonly BucketItem[];
  readonly allRecipes: readonly Recipe[];
  readonly initialBucketRecipeIds: readonly string[];
}

export function BucketPageClient({
  initialItems,
  allRecipes,
  initialBucketRecipeIds,
}: BucketPageClientProps) {
  const [items, setItems] = useState<readonly BucketItem[]>(initialItems);
  const [bucketIds, setBucketIds] = useState<Set<string>>(
    new Set(initialBucketRecipeIds)
  );
  const [mode, setMode] = useState<Mode>(items.length > 0 ? "manage" : "add");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const recipesById = useMemo(() => {
    const m = new Map<string, Recipe>();
    for (const r of allRecipes) m.set(r.id, r);
    return m;
  }, [allRecipes]);

  const filteredRecipes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRecipes;
    return allRecipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [allRecipes, search]);

  function handleAdd(recipeId: string): void {
    if (bucketIds.has(recipeId)) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/bucket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Could not add.");
        return;
      }
      const body = await res.json();
      setItems([body.item, ...items]);
      setBucketIds(new Set([...bucketIds, recipeId]));
    });
  }

  function handleRemove(recipeId: string): void {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/bucket/${recipeId}`, { method: "DELETE" });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Could not remove.");
        return;
      }
      setItems(items.filter((i) => i.recipeId !== recipeId));
      const next = new Set(bucketIds);
      next.delete(recipeId);
      setBucketIds(next);
    });
  }

  return (
    <div>
      {/* Mode toggle */}
      <div className="mb-6 inline-flex rounded-lg border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setMode("manage")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            mode === "manage"
              ? "bg-orange-600 text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          Manage ({items.length})
        </button>
        <button
          type="button"
          onClick={() => setMode("add")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            mode === "add"
              ? "bg-orange-600 text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          Browse & Add
        </button>
      </div>

      {error && (
        <p className="mb-4 text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      )}

      {mode === "manage" && (
        <div>
          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
              Your bucket is empty. Switch to <button
                type="button"
                onClick={() => setMode("add")}
                className="font-medium text-orange-600 underline"
              >
                Browse &amp; Add
              </button> to start filling it.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((it) => {
                const recipe = recipesById.get(it.recipeId);
                return (
                  <li
                    key={it.id}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <Link
                      href={`/recipes/${it.recipeId}`}
                      className="text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                    >
                      {recipe?.title ?? "(deleted recipe)"}
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleRemove(it.recipeId)}
                      disabled={isPending}
                      aria-label="Remove from bucket"
                      className="text-zinc-400 hover:text-red-600 disabled:opacity-50"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {mode === "add" && (
        <div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your recipes..."
            className="mb-4 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          {filteredRecipes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
              {allRecipes.length === 0
                ? "You don't have any recipes yet."
                : "No matches."}
            </p>
          ) : (
            <ul className="space-y-1">
              {filteredRecipes.map((r) => {
                const inBucket = bucketIds.has(r.id);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => handleAdd(r.id)}
                      disabled={inBucket || isPending}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                        inBucket
                          ? "border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/50"
                          : "border-zinc-200 bg-white hover:border-orange-300 hover:bg-orange-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-orange-900/40 dark:hover:bg-orange-950/30"
                      }`}
                    >
                      <span className="text-sm font-medium">
                        {r.title}
                      </span>
                      {inBucket ? (
                        <span className="text-xs text-zinc-500">✓ In bucket</span>
                      ) : (
                        <span className="text-xs text-orange-600">+ Add</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
