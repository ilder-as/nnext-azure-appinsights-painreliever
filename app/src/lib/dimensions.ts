/* ============================================================================
   dimensions.ts — discover the breakdown/filter axes for ANY project's data.
   Built-in standard AI fields (country/browser/os/…) plus custom-dimension keys
   auto-detected from props by coverage + bounded cardinality. No app-specific
   assumptions — this is what makes the dashboard populate dynamically.
   ============================================================================ */
import type { AppEvent, Dimension } from "./types";

// Standard AI field axes, in preferred display order. The same cardinality rule
// is applied, so single-value fields (e.g. deviceType all "Browser") drop out.
const FIELD_DIMS: { key: string; label: string }[] = [
  { key: "country", label: "Country" },
  { key: "browser", label: "Browser" },
  { key: "os", label: "Operating system" },
  { key: "deviceType", label: "Device" },
  { key: "city", label: "City" },
];

// Custom-dimension keys that are never useful as a breakdown axis.
const NOISE = new Set(["environment", "language", "timezone"]);

const MIN_DISTINCT = 2;
const MAX_DISTINCT = 40; // above this it's an id/free-text, not an axis
const MIN_COVERAGE = 0.12; // present on ≥12% of events
const MAX_PROP_DIMS = 6;
const MAX_TOTAL = 8;
const DISTINCT_CAP = 80; // stop growing the set once clearly over MAX_DISTINCT

interface Stat {
  distinct: Set<string>;
  cov: number;
  over: boolean;
}

function tally(map: Map<string, Stat>, key: string, value: string): void {
  let s = map.get(key);
  if (!s) {
    s = { distinct: new Set(), cov: 0, over: false };
    map.set(key, s);
  }
  s.cov++;
  if (!s.over) {
    s.distinct.add(value);
    if (s.distinct.size > DISTINCT_CAP) s.over = true;
  }
}

/** Read a dimension's value off an event (built-in field or custom prop).
 *  Missing, empty, and the literal string "null" all normalise to null (one
 *  "no value" bucket) — otherwise they'd collide on the "null" display key. */
export function dimValue(ev: AppEvent, dim: Dimension): string | null {
  const v =
    dim.kind === "field"
      ? (ev as unknown as Record<string, unknown>)[dim.key]
      : ev.props
        ? ev.props[dim.key]
        : undefined;
  return v == null || v === "" || v === "null" ? null : String(v);
}

/** Prettify a camelCase / snake prop key into a label ("workType" → "Work type"). */
export function labelForKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+Id$/i, "")
    .trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : key;
}

/**
 * Discover the dimensions to display/filter for this dataset: built-in fields
 * that vary, then the top custom-dimension keys by coverage (cardinality-bounded).
 */
export function discoverDimensions(events: AppEvent[]): Dimension[] {
  const n = events.length || 1;
  const fieldStats = new Map<string, Stat>();
  const propStats = new Map<string, Stat>();

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    for (const f of FIELD_DIMS) {
      const v = (ev as unknown as Record<string, unknown>)[f.key];
      if (v != null && v !== "") tally(fieldStats, f.key, String(v));
    }
    const p = ev.props;
    if (p) {
      for (const k in p) {
        if (NOISE.has(k)) continue;
        const v = p[k];
        if (v != null && v !== "") tally(propStats, k, String(v));
      }
    }
  }

  const good = (s: Stat): boolean =>
    !s.over &&
    s.distinct.size >= MIN_DISTINCT &&
    s.distinct.size <= MAX_DISTINCT &&
    s.cov / n >= MIN_COVERAGE;

  const dims: Dimension[] = [];
  for (const f of FIELD_DIMS) {
    const s = fieldStats.get(f.key);
    if (s && good(s)) dims.push({ key: f.key, label: f.label, kind: "field" });
  }

  const props = [...propStats.entries()]
    .filter(([, s]) => good(s))
    .sort(
      (a, b) => b[1].cov - a[1].cov || a[1].distinct.size - b[1].distinct.size,
    )
    .slice(0, MAX_PROP_DIMS)
    .map(
      ([key]): Dimension => ({ key, label: labelForKey(key), kind: "prop" }),
    );

  return [...dims, ...props].slice(0, MAX_TOTAL);
}
