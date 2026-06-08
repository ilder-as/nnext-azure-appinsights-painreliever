/* ============================================================================
   format.ts — pure helpers: formatting, escaping, summaries, colours.
   No DOM, no React. Defensive about nulls everywhere (every string field
   except userId/name/timestamp may be null per CONTRACT.md).

   summarize()/syntaxJson()/failureMessage() return pre-ESCAPED HTML strings;
   render them with the <Html> helper (dangerouslySetInnerHTML). They never
   emit unescaped user data.
   ============================================================================ */
import type { AppEvent, AvatarInfo, ColorMap } from "./types";

/* Generic "failure" heuristic: names ending in "Failed"/"Error" + PageNotFound. */
export const isFailure = (n: string | null | undefined): boolean =>
  n === "PageNotFound" || /(Failed|Error)$/.test(String(n || ""));

/* Stable categorical palette — vivid on dark. */
export const PALETTE = [
  "#7c5cff",
  "#4dd2ff",
  "#4ee6a8",
  "#ffb454",
  "#ff7eb6",
  "#b388ff",
  "#5c8bff",
  "#3fd0c9",
  "#c9b04a",
  "#8b8b9e",
  "#ff9f7c",
];

/** Build a stable name->colour map for every event type once, at load. Failures
 *  share danger red; the rest get palette colours in (volume) order. */
export function buildColorMap(allTypes: string[]): ColorMap {
  const map: ColorMap = {};
  let pi = 0;
  for (const t of allTypes) {
    if (isFailure(t)) {
      map[t] = "#ff5c6c";
      continue;
    }
    map[t] = PALETTE[pi % PALETTE.length];
    pi++;
  }
  return map;
}

/* ---------- number / time formatting --------------------------------------- */
export const fmtInt = (n: number): string =>
  Number(n || 0).toLocaleString("en-US");

export function fmtPct(n: number): string {
  if (!isFinite(n)) return "0%";
  return (n * 100).toFixed(n < 0.01 && n > 0 ? 2 : 1) + "%";
}

export function fmtBytes(b: unknown): string {
  const n = Number(b);
  if (!n || !isFinite(n)) return "—";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}

/** Duration in ms → human string ("553ms" / "1.76s" / "4.2min" / "1.6h").
 *  Sentry-Profiles style: 2-decimal seconds, coarser units above a minute. */
export function fmtDuration(ms: unknown): string {
  const n = Number(ms);
  if (!isFinite(n) || n < 0) return "—";
  if (n < 1000) {
    // Branch on the ROUNDED value so the threshold and the rendered number
    // agree — otherwise 9.999 → "10.00ms" and 999.6 → "1000ms".
    if (n < 9.995) return `${n.toFixed(2)}ms`;
    const r = Math.round(n);
    if (r < 1000) return `${r}ms`; // 1000 falls through to seconds below
  }
  if (n < 60000) return `${(n / 1000).toFixed(2)}s`;
  if (n < 3600000) return `${(n / 60000).toFixed(1)}min`;
  return `${(n / 3600000).toFixed(1)}h`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const pad = (n: number): string => String(n).padStart(2, "0");

/** Relative time vs the dataset's "now" (ms, the meta `to` timestamp). */
export function relTime(tsStr: string, now: number): string {
  const d = new Date(tsStr);
  const diff = (now - d.getTime()) / 1000;
  if (diff < 0) return "just now";
  if (diff < 60) return Math.floor(diff) + "s ago";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}
export function shortTime(tsStr: string): string {
  const d = new Date(tsStr);
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
export function fullTime(tsStr: string): string {
  return new Date(tsStr).toISOString().replace("T", " ").replace("Z", " UTC");
}
export function fmtDay(d: Date): string {
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}
/** "21 May" style short date for the window pill. */
export function fmtDate(tsStr: string): string {
  const d = new Date(tsStr);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/* ---------- identity helpers ----------------------------------------------- */
const AVATAR_COLORS = [
  "#7c5cff",
  "#4dd2ff",
  "#4ee6a8",
  "#ffb454",
  "#ff7eb6",
  "#b388ff",
  "#5c8bff",
  "#3fd0c9",
];
export function avatarFor(authId: string | null): AvatarInfo {
  if (!authId) return { init: "?", color: "#3a3a4e" };
  const parts = authId.split("@")[0].split(".");
  const init =
    ((parts[0][0] || "") + (parts[1] ? parts[1][0] : "")).toUpperCase() || "?";
  let h = 0;
  for (const c of authId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { init, color: AVATAR_COLORS[h % AVATAR_COLORS.length] };
}
export function displayName(authId: string | null): string {
  return authId ? authId.split("@")[0].replace(/\./g, " ") : "Anonymous";
}

export const FLAGS: Record<string, string> = {
  Norway: "🇳🇴",
  Sweden: "🇸🇪",
  Estonia: "🇪🇪",
  Poland: "🇵🇱",
  Denmark: "🇩🇰",
  Ireland: "🇮🇪",
  Lithuania: "🇱🇹",
  "Faroe Islands": "🇫🇴",
  Finland: "🇫🇮",
  Germany: "🇩🇪",
  Netherlands: "🇳🇱",
  "United Kingdom": "🇬🇧",
  Spain: "🇪🇸",
};

/* ---------- HTML escaping --------------------------------------------------- */
const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export function esc(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
}

/* ---------- per-event one-line human summary (real prop shapes) -------------
   Returns a pre-ESCAPED HTML string (values via esc()/b()). */
const PROP_NOISE = new Set(["environment", "language", "timezone"]);

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/**
 * Generic one-line summary for ANY event: the most label-like custom dimensions
 * (shortest values first, so ids/statuses win over long blobs), `key=value`.
 * Returns pre-ESCAPED HTML.
 */
export function summarize(ev: AppEvent): string {
  const p = ev.props || {};
  const keys = Object.keys(p).filter(
    (k) => !PROP_NOISE.has(k) && p[k] != null && p[k] !== "",
  );
  if (!keys.length) return "—";
  keys.sort((a, b) => String(p[a]).length - String(p[b]).length);
  return keys
    .slice(0, 3)
    .map((k) => `${esc(k)}=<b>${esc(truncate(String(p[k]), 60))}</b>`)
    .join(" · ");
}

const ERROR_KEYS = [
  "error",
  "errorMessage",
  "message",
  "detail",
  "title",
  "exception",
  "reason",
];

/** Generic failure message for the drawer banner: the first error-ish prop. */
export function failureMessage(ev: AppEvent): string {
  const p = ev.props || {};
  for (const k of ERROR_KEYS) {
    if (p[k] != null && p[k] !== "") return String(p[k]);
  }
  if (p.status) return `Failed (status ${p.status})`;
  return "This event represents a failed action.";
}

/* ---------- robust JSON syntax highlighter (returns escaped HTML) ---------- */
export function syntaxJson(obj: unknown): string {
  const json = JSON.stringify(obj, null, 2);
  const re =
    /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}\[\],:])|(\s+)/g;
  let out = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(json)) !== null) {
    if (m[1] !== undefined) {
      if (m[2] !== undefined) {
        out += `<span class="jk">${esc(m[1])}</span><span class="jp">${esc(m[2])}</span>`;
      } else {
        out += `<span class="js">${esc(m[1])}</span>`;
      }
    } else if (m[3] !== undefined) {
      out += `<span class="jn">${esc(m[3])}</span>`;
    } else if (m[4] !== undefined) {
      const cls = m[4] === "null" ? "jnull" : "jb";
      out += `<span class="${cls}">${esc(m[4])}</span>`;
    } else if (m[5] !== undefined) {
      out += `<span class="jp">${esc(m[5])}</span>`;
    } else {
      out += m[6]; // whitespace, safe as-is
    }
  }
  return out;
}
