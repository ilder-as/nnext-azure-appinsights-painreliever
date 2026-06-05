import { useEffect, useRef, useState } from "react";
import { useDashboard } from "@/state/dashboard";
import { fmtInt, isFailure } from "@/lib/format";

/**
 * The event-types filter dropdown (".dropdown" → ".filter-btn" + ".menu"). Reads
 * menuCounts.byType + filters.events and toggles single rows via toggleEvent;
 * the head "clear" link calls clearEvents.
 *
 * Toggling a row re-renders it with/without ".sel" rather than mutating classes.
 * Only one dropdown is open at a time: opening broadcasts a "menu-open" event so
 * sibling menus close themselves.
 */
export function FilterMenu() {
  const { menuCounts, filters, derived, toggleEvent, clearEvents } =
    useDashboard();

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const entries = menuCounts.byType;
  const selected = filters.events;

  // Only one dropdown open at a time. Opening a menu broadcasts an event;
  // sibling menus close themselves.
  useEffect(() => {
    const onOpenOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== "events") setOpen(false);
    };
    document.addEventListener("menu-open", onOpenOther);
    return () => document.removeEventListener("menu-open", onOpenOther);
  }, []);

  // Close on outside-click and Esc.
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

  const count = selected.size;

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
              new CustomEvent("menu-open", { detail: "events" }),
            );
          setOpen(next);
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          style={{ width: 14, height: 14, opacity: 0.7 }}
        >
          <circle
            cx="12"
            cy="12"
            r="3"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path
            d="M4 12h5M15 12h5M12 4v5M12 15v5"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
        Event types
        <span
          className="count-badge"
          style={{ display: count ? "inline-block" : "none" }}
        >
          {count}
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
          <span>Event types · {entries.length}</span>
          <a
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              clearEvents();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                clearEvents();
              }
            }}
          >
            clear
          </a>
        </div>

        {entries.map(([name, val]) => {
          const on = selected.has(name);
          return (
            <div
              key={name}
              className={"menu-item" + (on ? " sel" : "")}
              role="menuitemcheckbox"
              aria-checked={on}
              tabIndex={0}
              onClick={() => toggleEvent(name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleEvent(name);
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
              <span
                className="swatch"
                style={{ background: derived.colorMap[name] || "#8b8b9e" }}
              />
              <span
                className="mi-label"
                style={isFailure(name) ? { color: "var(--danger)" } : undefined}
              >
                {name}
              </span>
              <span className="mi-count num">{fmtInt(val)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
