import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboard } from "@/state/dashboard";
import { fmtInt } from "@/lib/format";

/**
 * Dimension filter dropdown for the filter bar: pick a discovered dimension
 * (Project, Status, …) via the tabs, then multi-select its values. Values within
 * a dimension are OR'd; different dimensions are AND'd (the filters.dims model).
 * Mirrors FilterMenu's dropdown shell + single-open coordination.
 */
export function DimensionFilter() {
  const { dimensions, menuCounts, filters, toggleDim, clearDim } =
    useDashboard();

  const [open, setOpen] = useState(false);
  const [activeState, setActiveState] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Active dimension derived during render so it's always valid for the data.
  const activeKey =
    activeState && dimensions.some((d) => d.key === activeState)
      ? activeState
      : (dimensions[0]?.key ?? "");
  const activeDim = dimensions.find((d) => d.key === activeKey) ?? null;
  const activeSel = filters.dims[activeKey];

  const allValues = menuCounts.byDim[activeKey] ?? [];
  const values = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allValues;
    return allValues.filter(([v]) => v.toLowerCase().includes(q));
  }, [allValues, query]);

  const totalSelected = Object.values(filters.dims).reduce(
    (n, s) => n + s.size,
    0,
  );

  // Only one dropdown open at a time (shared with FilterMenu via "menu-open").
  useEffect(() => {
    const onOpenOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== "dims") setOpen(false);
    };
    document.addEventListener("menu-open", onOpenOther);
    return () => document.removeEventListener("menu-open", onOpenOther);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (dimensions.length === 0) return null;

  return (
    <div className="dropdown" ref={rootRef}>
      <button
        className="filter-btn"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          const next = !open;
          if (next)
            document.dispatchEvent(
              new CustomEvent("menu-open", { detail: "dims" }),
            );
          setOpen(next);
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          style={{ width: 14, height: 14, opacity: 0.7 }}
        >
          <path
            d="M3 5h18l-7 8v6l-4-2v-4L3 5z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
        Dimensions
        <span
          className="count-badge"
          style={{ display: totalSelected ? "inline-block" : "none" }}
        >
          {totalSelected}
        </span>
        <svg className="chev" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div
        className={"menu" + (open ? " open" : "")}
        role="menu"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="menu-head">
          <span>Slice by dimension</span>
          {activeSel && activeSel.size ? (
            <a
              role="button"
              tabIndex={0}
              onClick={() => clearDim(activeKey)}
              onKeyDown={(e) => {
                if (e.key === "Enter") clearDim(activeKey);
              }}
            >
              clear {activeDim?.label}
            </a>
          ) : null}
        </div>

        <div className="dim-tabs">
          {dimensions.map((d) => {
            const sel = filters.dims[d.key]?.size ?? 0;
            return (
              <button
                key={d.key}
                className={"dim-tab" + (d.key === activeKey ? " on" : "")}
                onClick={() => {
                  setActiveState(d.key);
                  setQuery("");
                }}
              >
                {d.label}
                {sel ? <i /> : null}
              </button>
            );
          })}
        </div>

        {allValues.length > 12 ? (
          <input
            className="dim-search"
            type="text"
            placeholder={`Filter ${activeDim?.label ?? ""} values…`}
            value={query}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
          />
        ) : null}

        <div className="dim-values">
          {values.length === 0 ? (
            <div className="menu-empty">No matching values</div>
          ) : (
            values.map(([value, count], i) => {
              const on = activeSel?.has(value) ?? false;
              const isNull = value === "null";
              return (
                <div
                  key={value + "#" + i}
                  className={"menu-item" + (on ? " sel" : "")}
                  role="menuitemcheckbox"
                  aria-checked={on}
                  tabIndex={0}
                  onClick={() => toggleDim(activeKey, value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleDim(activeKey, value);
                    }
                  }}
                >
                  <span className="check">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path
                        d="M5 12l4 4 10-10"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className={"mi-label" + (isNull ? " muted" : "")}>
                    {isNull ? "no value" : value}
                  </span>
                  <span className="mi-count num">{fmtInt(count)}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
