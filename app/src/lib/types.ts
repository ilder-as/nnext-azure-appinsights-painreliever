/* Shared domain types — the data contract lives in ../../CONTRACT.md. */

/** A single App Insights customEvent, normalised to the dashboard contract.
 *  Custom dimensions all live in `props` — there are NO app-specific fields. */
export interface AppEvent {
  timestamp: string;
  name: string;
  userId: string | null;
  authId: string | null;
  sessionId: string | null;
  operation: string | null;
  city: string | null;
  country: string | null;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  props: Record<string, string>;
}

/** Built-in (standard AI field) vs discovered (custom-dimension) breakdown axis. */
export interface Dimension {
  key: string; // field name (country/browser/os/…) or props key
  label: string; // human label
  kind: "field" | "prop";
}

export interface Meta {
  generatedAt: string;
  resource: string;
  windowDays: number;
  from: string | null;
  to: string | null;
  totalEvents: number;
  eventTypes: string[];
}

export type SortKey = "timestamp" | "name" | "authId" | "operation";
export type SortDir = 1 | -1;

export interface Filters {
  events: Set<string>;
  /** Active dimension filters: dimension key → selected values. */
  dims: Record<string, Set<string>>;
  search: string;
  failOnly: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
}

export type ColorMap = Record<string, string>;

/** Window/colour context derived once from meta + the full dataset. */
export interface Derived {
  now: number; // ms — dataset "now" (meta.to)
  windowFromMs: number; // ms — midnight UTC of the window start
  days: number; // number of day buckets (inclusive)
  dayLabels: string[]; // "21/5" style, length === days
  typeOrder: string[]; // all event types, by descending volume
  topTypes: string[]; // top 6 (stable hero stacking)
  colorMap: ColorMap;
}

export type Pair = [string, number];

export interface DaySeries {
  name: string;
  color: string;
  data: number[];
}

export interface UserStat {
  authId: string;
  count: number;
  last: string;
}

/** Everything the dashboard needs, produced by a single O(n) pass. */
export interface Aggregate {
  rows: AppEvent[]; // matched events, newest-first preserved
  total: number;
  byType: Pair[];
  /** Per-dimension distributions, keyed by Dimension.key (sorted desc). */
  byDim: Record<string, Pair[]>;
  uniqueUsers: number;
  anonUsers: number;
  sessions: number;
  eventTypes: number;
  failures: number;
  userStats: UserStat[]; // by descending count
  dayLabels: string[];
  dayTotals: number[];
  daySeries: DaySeries[]; // stacked top types + "Other"
  dayUsers: number[]; // distinct authed users per day
  daySessions: number[]; // distinct sessions per day
}

export interface AvatarInfo {
  init: string;
  color: string;
}

/* ---- Session trace ("session replay") ------------------------------------- */

/** A JS error from the App Insights `exceptions` table (data/exceptions.json). */
export interface ErrorItem {
  timestamp: string;
  sessionId: string | null;
  userId: string | null;
  authId: string | null;
  operation: string | null;
  type: string | null; // exception type
  message: string | null; // innermost/outer message
  problemId: string | null;
  browser: string | null;
  os: string | null;
}

/** One user session, derived by grouping events (+errors) by sessionId. */
export interface Session {
  id: string;
  authId: string | null;
  userId: string | null;
  start: string;
  end: string;
  durationMs: number;
  eventCount: number; // action events
  failureCount: number; // *Failed / PageNotFound actions
  errorCount: number; // JS exceptions
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  entryRoute: string | null;
  lastRoute: string | null;
}

export type TimelineKind = "action" | "route" | "error";

/** One step in a session's timeline (the replay breadcrumb). */
export interface TimelineItem {
  id: string;
  ts: string;
  kind: TimelineKind;
  name: string; // event name / "Navigated" / exception type
  summaryHtml: string; // pre-escaped HTML (summarize / failureMessage / route)
  route: string | null;
  status: "ok" | "fail" | null;
  offsetMs: number; // real ms from session start
  playbackMs: number; // compressed ms (idle gaps capped) for replay
}

export interface SessionTimeline {
  items: TimelineItem[];
  realTotalMs: number;
  playbackTotalMs: number;
}
