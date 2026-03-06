interface InstructionListProps {
  readonly instructions: readonly string[];
}

export function InstructionList({ instructions }: InstructionListProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Instructions
      </h2>
      <ol className="space-y-4">
        {instructions.map((instruction, index) => (
          <li key={index} className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700 dark:bg-orange-900 dark:text-orange-300">
              {index + 1}
            </span>
            <p className="flex-1 pt-1 text-zinc-700 dark:text-zinc-300">
              {instruction}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
