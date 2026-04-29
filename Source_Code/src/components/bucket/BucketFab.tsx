"use client";

import { useDroppable } from "@dnd-kit/core";

interface BucketFabProps {
  readonly count: number;
  readonly isOpen: boolean;
  readonly onClick: () => void;
}

export function BucketFab({ count, isOpen, onClick }: BucketFabProps) {
  const { isOver, setNodeRef } = useDroppable({ id: "bucket" });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      aria-label={`Bucket (${count} item${count === 1 ? "" : "s"})`}
      className={`fixed bottom-6 right-6 z-40 hidden h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all md:flex ${
        isOver
          ? "scale-110 bg-orange-500 ring-4 ring-orange-200"
          : isOpen
          ? "bg-orange-700"
          : "bg-orange-600 hover:bg-orange-700"
      }`}
    >
      <span className="text-2xl text-white" aria-hidden="true">🛒</span>
      {count > 0 && (
        <span
          className="absolute -top-1 -right-1 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-white px-1 text-xs font-semibold text-orange-700 shadow"
          aria-hidden="true"
        >
          {count}
        </span>
      )}
    </button>
  );
}
