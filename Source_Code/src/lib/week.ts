// Week-start helpers. Weeks are Monday-to-Sunday. All inputs/outputs are
// UTC dates as YYYY-MM-DD strings. Postgres `date` columns are timezone-free
// so we treat all date math as UTC to avoid drift.

export function mondayOf(date: Date): string {
  const d = new Date(date.getTime());
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function addWeeks(weekStart: string, n: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

export function currentWeekStart(): string {
  return mondayOf(new Date());
}

// Inclusive end-of-week (Sunday) for a given Monday-start.
export function sundayOf(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}
