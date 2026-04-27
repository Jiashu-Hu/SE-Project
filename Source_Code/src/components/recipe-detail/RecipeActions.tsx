"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface RecipeActionsProps {
  readonly recipeId: string;
}

export function RecipeActions({ recipeId }: RecipeActionsProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDeleteClick(): void {
    setShowConfirm(true);
    setDeleteError(null);
  }

  function handleCancel(): void {
    setShowConfirm(false);
    setDeleteError(null);
  }

  function handleConfirmDelete(): void {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/recipes/${recipeId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          setDeleteError(body.error ?? "Failed to delete recipe.");
          return;
        }

        router.push("/");
        router.refresh();
      } catch {
        setDeleteError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <Link
          href={`/recipes/${recipeId}/edit`}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
        >
          Edit
        </Link>
        <button
          type="button"
          onClick={handleDeleteClick}
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:border-red-300 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
        >
          Delete
        </button>
      </div>

      {/* Confirmation dialog */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h2
              id="delete-dialog-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Delete recipe?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              This action cannot be undone. The recipe will be permanently removed.
            </p>

            {deleteError && (
              <p className="mt-3 text-sm font-medium text-red-600" role="alert">
                {deleteError}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isPending}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
