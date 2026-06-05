import { useDashboard } from "@/state/dashboard";
import { labelForKey } from "@/lib/dimensions";

interface Chip {
  key: string;
  label: string;
  remove: () => void;
}

/**
 * The ".active-chips" row: one removable chip per active filter — each selected
 * event, each selected dimension value, and the search term. Clicking a chip's
 * button removes that single filter.
 */
export function FilterChips() {
  const { filters, dimensions, toggleEvent, toggleDim, setSearch } =
    useDashboard();

  const dimLabel = (key: string): string =>
    dimensions.find((d) => d.key === key)?.label ?? labelForKey(key);

  const chips: Chip[] = [];

  filters.events.forEach((name) =>
    chips.push({
      key: "event",
      label: name,
      remove: () => toggleEvent(name),
    }),
  );

  for (const key in filters.dims) {
    const label = dimLabel(key);
    filters.dims[key].forEach((value) =>
      chips.push({
        key: label,
        label: value,
        remove: () => toggleDim(key, value),
      }),
    );
  }

  if (filters.search)
    chips.push({
      key: "search",
      label: `“${filters.search}”`,
      remove: () => setSearch(""),
    });

  return (
    <div className="active-chips">
      {chips.map((c) => (
        <span className="chip" key={c.key + ":" + c.label}>
          <span className="chip-key">{c.key}</span> {c.label}{" "}
          <button aria-label={`Remove ${c.key} filter`} onClick={c.remove}>
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </span>
      ))}
    </div>
  );
}
