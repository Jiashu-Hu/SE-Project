import { CATEGORIES, type Category } from "@/types/recipe";

interface CategoryFilterProps {
  readonly selected: Category;
  readonly onSelect: (category: Category) => void;
}

export function CategoryFilter({ selected, onSelect }: CategoryFilterProps) {
  return (
    <div className="flex items-center gap-3">
      <label
        htmlFor="category-filter"
        className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        Category
      </label>
      <select
        id="category-filter"
        value={selected}
        onChange={(e) => onSelect(e.target.value as Category)}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {CATEGORIES.map((cat) => (
          <option key={cat} value={cat}>
            {cat}
          </option>
        ))}
      </select>

      {selected !== "All" && (
        <button
          type="button"
          onClick={() => onSelect("All")}
          className="text-sm text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
        >
          Clear filter
        </button>
      )}
    </div>
  );
}
