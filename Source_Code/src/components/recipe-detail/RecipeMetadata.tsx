interface RecipeMetadataProps {
  readonly tags: readonly string[];
  readonly createdAt: string;
}

export function RecipeMetadata({ tags, createdAt }: RecipeMetadataProps) {
  const formattedDate = new Date(createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Additional Info
      </h2>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Tags
          </h3>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Created Date */}
      <div className="text-sm text-zinc-600 dark:text-zinc-400">
        <span className="font-medium">Added: </span>
        {formattedDate}
      </div>
    </div>
  );
}
