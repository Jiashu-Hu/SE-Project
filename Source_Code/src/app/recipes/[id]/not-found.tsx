import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="text-center">
        <div className="mb-4 inline-flex items-center justify-center rounded-full bg-orange-100 p-6 dark:bg-orange-900">
          <svg
            className="h-12 w-12 text-orange-600 dark:text-orange-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h1 className="mb-2 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          Recipe Not Found
        </h1>
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          The recipe you&apos;re looking for doesn&apos;t exist or has been removed.
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-6 py-3 text-white transition-colors hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to All Recipes
        </Link>
      </div>
    </div>
  );
}
