"use client";

import Link from "next/link";
import { addWeeks, currentWeekStart } from "@/lib/week";

interface WeekNavProps {
  readonly weekStart: string;
}

function formatRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startLabel = start.toLocaleDateString(undefined, opts);
  const endLabel = end.toLocaleDateString(undefined, opts);
  return `${startLabel} – ${endLabel}`;
}

export function WeekNav({ weekStart }: WeekNavProps) {
  const prev = addWeeks(weekStart, -1);
  const next = addWeeks(weekStart, 1);
  const today = currentWeekStart();

  return (
    <nav className="flex items-center gap-2 text-sm">
      <Link
        href={`/meal-plan?week=${prev}`}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
      >
        ‹ Prev
      </Link>
      <Link
        href={`/meal-plan?week=${today}`}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
      >
        Today
      </Link>
      <Link
        href={`/meal-plan?week=${next}`}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
      >
        Next ›
      </Link>
      <span className="ml-2 text-zinc-600 dark:text-zinc-400">
        {formatRange(weekStart)}
      </span>
    </nav>
  );
}
