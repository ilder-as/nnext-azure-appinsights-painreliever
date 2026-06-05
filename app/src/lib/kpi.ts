/* KPI helpers ported from dashboard/js/app.js (deltaGlyph, trendDelta,
   sparkProxy, sparkline geometry, kpiIcon). Pure — no DOM/React. */

export type TrendDir = "up" | "down" | "flat";
export interface Trend {
  dir: TrendDir;
  delta: string;
}

export function deltaGlyph(dir: TrendDir): string {
  return dir === "up" ? "▲" : dir === "down" ? "▼" : "▪";
}

/**
 * Soft up/down trend. The final day in the window is almost always PARTIAL (it
 * ends at meta.to, not midnight), so we compare the last COMPLETE day against
 * the mean of the days before it rather than the partial trailing day.
 */
export function trendDelta(series: number[]): Trend {
  if (series.length < 3) return { dir: "flat", delta: "stable" };
  const full = series.slice(0, -1); // drop trailing partial day
  if (full.length < 2) return { dir: "flat", delta: "stable" };
  const last = full[full.length - 1] || 0;
  const prior = full.slice(0, -1);
  const mean = prior.reduce((a, b) => a + b, 0) / Math.max(prior.length, 1);
  if (mean === 0) return { dir: "flat", delta: "new" };
  const pct = (last - mean) / mean;
  const sign = pct >= 0 ? "+" : "−";
  return {
    dir: pct >= 0.01 ? "up" : pct <= -0.01 ? "down" : "flat",
    delta: `${sign}${Math.abs(pct * 100).toFixed(1)}%`,
  };
}

/** Distribute a scalar count across a day-shaped series for a believable sparkline. */
export function sparkProxy(shape: number[], total: number): number[] {
  const sum = shape.reduce((a, b) => a + b, 0) || 1;
  return shape.map((v) => Math.round((v / sum) * total));
}

export interface SparkGeometry {
  empty: boolean;
  w: number;
  h: number;
  line: string; // path "d" for the trend line
  area: string; // path "d" for the filled area
  lastX: number;
  lastY: number;
}

/** Geometry for the tiny gradient-area sparkline (rendered by Sparkline.tsx). */
export function sparkGeometry(values: number[], w = 78, h = 26): SparkGeometry {
  if (!values || !values.length)
    return { empty: true, w, h, line: "", area: "", lastX: 0, lastY: 0 };
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i): [number, number] => {
    const x = (i / Math.max(values.length - 1, 1)) * (w - 2) + 1;
    const y = h - 3 - ((v - min) / span) * (h - 6);
    return [x, y];
  });
  const line = pts
    .map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1))
    .join(" ");
  const area = line + ` L${(w - 1).toFixed(1)} ${h} L1 ${h} Z`;
  const last = pts[pts.length - 1];
  return { empty: false, w, h, line, area, lastX: last[0], lastY: last[1] };
}

/** Inner SVG markup for a KPI icon (rendered inside an <svg> via Html). */
export function kpiIcon(icon: string): string {
  if (icon === "CIRC")
    return '<circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>';
  if (icon === "GRID")
    return '<rect x="3" y="3" width="7" height="7" rx="1.4" stroke="currentColor" stroke-width="1.7"/><rect x="14" y="3" width="7" height="7" rx="1.4" stroke="currentColor" stroke-width="1.7"/><rect x="3" y="14" width="7" height="7" rx="1.4" stroke="currentColor" stroke-width="1.7"/><rect x="14" y="14" width="7" height="7" rx="1.4" stroke="currentColor" stroke-width="1.7"/>';
  if (icon === "WARN")
    return '<path d="M12 9v4M12 16.4v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10.3 4.4L3 17a2 2 0 001.7 3h14.6a2 2 0 001.7-3L13.7 4.4a2 2 0 00-3.4 0z" stroke="currentColor" stroke-width="1.6"/>';
  return `<path d="${icon}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
}
