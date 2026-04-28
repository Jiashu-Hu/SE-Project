"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface HeaderProps {
  readonly searchQuery: string;
  readonly onSearchChange: (query: string) => void;
  readonly userName: string;
}

export function Header({ searchQuery, onSearchChange, userName }: HeaderProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const userInitial = userName.trim().charAt(0).toUpperCase() || "U";

  function handleLogout(): void {
    setLogoutError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/logout", {
          method: "POST",
        });

        if (!response.ok) {
          setLogoutError("Unable to log out. Please try again.");
          return;
        }

        setProfileOpen(false);
        router.push("/login");
        router.refresh();
      } catch {
        setLogoutError("Unable to log out. Please try again.");
      }
    });
  }

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        {/* Logo / Title */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-2xl" aria-hidden="true">
            🍳
          </span>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            RecipeBox
          </h1>
        </div>

        {/* Search Bar */}
        <div className="relative mx-auto w-full max-w-md">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="search"
            placeholder="Search recipes..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-zinc-50 py-2 pl-10 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </div>

        {/* Meal Plan link */}
        <Link
          href="/meal-plan"
          className="shrink-0 text-sm font-medium text-zinc-700 hover:text-orange-600 dark:text-zinc-300 dark:hover:text-orange-400"
        >
          Meal Plan
        </Link>

        {/* Add Recipe Button */}
        <Link
          href="/recipes/new"
          className="shrink-0 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
        >
          + Add Recipe
        </Link>

        {/* Profile Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((prev) => !prev)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            aria-label="Profile menu"
          >
            {userInitial}
          </button>
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-40 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              <Link
                href="/settings"
                onClick={() => setProfileOpen(false)}
                className="block w-full px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Settings
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isPending}
                className="block w-full px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {isPending ? "Logging out..." : "Logout"}
              </button>
            </div>
          )}
          {logoutError && (
            <p className="absolute right-0 mt-2 w-52 text-xs text-red-600">{logoutError}</p>
          )}
        </div>
      </div>
    </header>
  );
}
