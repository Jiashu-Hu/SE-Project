"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Aisle } from "@/lib/ingredient-aisles";

export interface IngredientSuggestion {
  readonly name: string;
  readonly defaultUnit: string;
  readonly aisle: Aisle;
}

interface IngredientComboboxProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSelect: (suggestion: IngredientSuggestion) => void;
  readonly placeholder?: string;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly ariaLabel?: string;
}

const DEBOUNCE_MS = 150;

export function IngredientCombobox({
  value,
  onChange,
  onSelect,
  placeholder,
  id,
  disabled,
  ariaLabel,
}: IngredientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<readonly IngredientSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useMemo(
    () => `${id ?? "ingredient-combobox"}-listbox`,
    [id]
  );

  const fetchSuggestions = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length === 0) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }
    try {
      const res = await fetch(
        `/api/ingredients?q=${encodeURIComponent(trimmed)}&limit=8`
      );
      if (!res.ok) {
        setSuggestions([]);
        setActiveIndex(-1);
        return;
      }
      const body = (await res.json()) as { items: IngredientSuggestion[] };
      setSuggestions(body.items ?? []);
      setActiveIndex(body.items?.length ? 0 : -1);
    } catch {
      setSuggestions([]);
      setActiveIndex(-1);
    }
  }, []);

  // Debounced fetch on value change.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(value);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, fetchSuggestions]);

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(s: IngredientSuggestion): void {
    onSelect(s);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length === 0) return;
      setOpen(true);
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length === 0) return;
      setOpen(true);
      setActiveIndex((i) =>
        i <= 0 ? suggestions.length - 1 : i - 1
      );
    } else if (e.key === "Enter") {
      if (open && activeIndex >= 0 && suggestions[activeIndex]) {
        e.preventDefault();
        pick(suggestions[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  const showList = open && suggestions.length > 0;

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-activedescendant={
          showList && activeIndex >= 0
            ? `${listboxId}-opt-${activeIndex}`
            : undefined
        }
        autoComplete="off"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />
      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.name}-${i}`}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex cursor-pointer items-center justify-between px-3 py-1.5 text-sm ${
                i === activeIndex
                  ? "bg-orange-50 text-zinc-900 dark:bg-orange-950/30 dark:text-zinc-50"
                  : "text-zinc-700 dark:text-zinc-300"
              }`}
            >
              <span className="font-medium">{s.name}</span>
              <span className="ml-2 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                {s.aisle}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
