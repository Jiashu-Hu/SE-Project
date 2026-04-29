"use client";

import { useEffect, useState, useTransition } from "react";

interface EmptyBucketBannerProps {
  readonly weekStart: string;
  readonly initialCount: number;
}

function dismissKey(weekStart: string): string {
  return `bucket-banner-dismissed-${weekStart}`;
}

export function EmptyBucketBanner({
  weekStart,
  initialCount,
}: EmptyBucketBannerProps) {
  const [count, setCount] = useState(initialCount);
  const [dismissed, setDismissed] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    try {
      const flag = sessionStorage.getItem(dismissKey(weekStart));
      if (flag === "1") setDismissed(true);
    } catch {
      // ignore
    }
  }, [weekStart]);

  function dismiss(): void {
    setDismissed(true);
    try {
      sessionStorage.setItem(dismissKey(weekStart), "1");
    } catch {
      // ignore
    }
  }

  function handleClear(): void {
    startTransition(async () => {
      const res = await fetch("/api/bucket", { method: "DELETE" });
      if (res.ok) setCount(0);
      dismiss();
    });
  }

  if (dismissed || count === 0) return null;

  return (
    <div className="mb-6 flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-900/40 dark:bg-orange-950/30">
      <p className="text-sm text-zinc-800 dark:text-zinc-200">
        Done planning? You have <strong>{count}</strong> recipe{count === 1 ? "" : "s"} in your bucket.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleClear}
          disabled={isPending}
          className="rounded-md bg-orange-600 px-3 py-1 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
        >
          Yes, empty it
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm font-medium text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          Keep them
        </button>
      </div>
    </div>
  );
}
