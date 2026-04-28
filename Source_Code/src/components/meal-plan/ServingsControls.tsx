"use client";

import { useState, useTransition } from "react";

interface ServingsControlsProps {
  readonly weekStart: string;
  readonly onApplied: (servings: number) => void;
}

export function ServingsControls({ weekStart, onApplied }: ServingsControlsProps) {
  const [value, setValue] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleApply(): void {
    if (!Number.isInteger(value) || value < 1) {
      setError("Must be a positive integer.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/meal-plan/slots/bulk-servings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, servings: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not apply.");
        return;
      }
      onApplied(value);
    });
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="text-zinc-600 dark:text-zinc-400">Default servings</label>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => setValue(parseInt(e.target.value, 10) || 1)}
        className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <button
        type="button"
        onClick={handleApply}
        disabled={isPending}
        className="rounded-md bg-orange-600 px-3 py-1 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
      >
        Apply to all
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
