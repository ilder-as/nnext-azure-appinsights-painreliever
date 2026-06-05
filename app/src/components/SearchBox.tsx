import { useEffect, useRef, useState } from "react";
import { useDashboard } from "@/state/dashboard";

/**
 * The ".filter-search" input. Keeps LOCAL input state for instant feedback and
 * calls setSearch() (debounced inside the hook) on every change. Pressing "/"
 * anywhere outside the input focuses it (original wire(): keydown handler).
 */
export function SearchBox() {
  const { setSearch, filters } = useDashboard();
  const [value, setValue] = useState(filters.search);
  const inputRef = useRef<HTMLInputElement>(null);
  // Track the last value WE pushed, to tell our own (debounced) updates apart
  // from external ones (Top-Users row click, chips, clear-filters).
  const pushed = useRef(filters.search);

  // Reflect EXTERNAL changes to filters.search in the input (clicking a Top-Users
  // row sets it to that email; chips/clear reset to ""). Echoes of our own
  // keystrokes are skipped so fast typing is never clobbered.
  useEffect(() => {
    if (filters.search !== pushed.current) {
      pushed.current = filters.search;
      setValue(filters.search);
    }
  }, [filters.search]);

  // Global "/" focuses the search, matching the original keyboard shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <label className="filter-search" htmlFor="searchInput">
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M20 20l-3.5-3.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <input
        ref={inputRef}
        id="searchInput"
        type="text"
        placeholder="Search user, operation, or any prop value…"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          pushed.current = v.trim();
          setSearch(v.trim());
        }}
      />
      <kbd>/</kbd>
    </label>
  );
}
