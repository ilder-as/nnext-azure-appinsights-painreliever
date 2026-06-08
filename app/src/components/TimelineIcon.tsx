import type { TimelineItem } from "@/lib/types";

/**
 * Bare inline glyph for a timeline row. Returns just the <svg> (the .tl-icon
 * wrapper supplies sizing/colour; every stroke is currentColor so the row class
 * tints it). Shape is chosen from the item kind/status:
 *  - route            → navigation arrow
 *  - error / fail     → warning triangle with exclamation (matches NavRail's
 *                       FAILURES_ICON for visual consistency)
 *  - action (default) → lightning-bolt activity glyph
 */
export function TimelineIcon({ item }: { item: TimelineItem }) {
  if (item.kind === "route") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M5 12h13"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M13 7l5 5-5 5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (item.kind === "error" || item.status === "fail") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 8v5M12 16.5v.2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M10.3 3.9L2.6 17.4A2 2 0 004.3 20.4h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  if (item.status === "warn") {
    // aborted/cancelled call — a warning, not a failure (amber via row class)
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 9v4M12 16.4v.1"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }

  if (item.kind === "dependency") {
    // network exchange (two opposing arrows) — a successful API call
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 8h13l-3-3M20 16H7l3 3"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13l0-8z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
