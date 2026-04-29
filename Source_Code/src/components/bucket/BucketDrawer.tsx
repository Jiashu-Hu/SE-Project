"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import type { BucketItem } from "@/lib/bucket";
import type { Recipe } from "@/types/recipe";

interface BucketDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly items: readonly BucketItem[];
  readonly recipesById: ReadonlyMap<string, Recipe>;
  readonly draggable: boolean; // true on /meal-plan, false on /dashboard
  readonly onRemove: (recipeId: string) => void;
}

function DraggableBucketItem({
  item,
  recipe,
  onRemove,
}: {
  readonly item: BucketItem;
  readonly recipe: Recipe | undefined;
  readonly onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `bucket-item:${item.recipeId}`,
      data: { recipeId: item.recipeId },
    });
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined;
  return (
    <li
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`flex cursor-grab items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900 ${
        isDragging ? "opacity-60 shadow-lg" : ""
      }`}
    >
      <span className="font-medium text-zinc-900 dark:text-zinc-50">
        {recipe?.title ?? "(deleted recipe)"}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label="Remove from bucket"
        className="text-zinc-400 hover:text-red-600"
      >
        ×
      </button>
    </li>
  );
}

function StaticBucketItem({
  item,
  recipe,
  onRemove,
}: {
  readonly item: BucketItem;
  readonly recipe: Recipe | undefined;
  readonly onRemove: () => void;
}) {
  return (
    <li className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <Link
        href={`/recipes/${item.recipeId}`}
        className="font-medium text-zinc-900 hover:underline dark:text-zinc-50"
      >
        {recipe?.title ?? "(deleted recipe)"}
      </Link>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove from bucket"
        className="text-zinc-400 hover:text-red-600"
      >
        ×
      </button>
    </li>
  );
}

export function BucketDrawer({
  open,
  onClose,
  items,
  recipesById,
  draggable,
  onRemove,
}: BucketDrawerProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-30 hidden md:block"
      onClick={onClose}
      role="presentation"
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="fixed right-0 top-0 h-full w-80 overflow-y-auto bg-white p-6 shadow-2xl dark:bg-zinc-900"
        aria-label="Bucket"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            🛒 Bucket
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ×
          </button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Drag a recipe card here, or browse on the dashboard.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((it) =>
              draggable ? (
                <DraggableBucketItem
                  key={it.id}
                  item={it}
                  recipe={recipesById.get(it.recipeId)}
                  onRemove={() => onRemove(it.recipeId)}
                />
              ) : (
                <StaticBucketItem
                  key={it.id}
                  item={it}
                  recipe={recipesById.get(it.recipeId)}
                  onRemove={() => onRemove(it.recipeId)}
                />
              )
            )}
          </ul>
        )}
      </aside>
    </div>
  );
}
