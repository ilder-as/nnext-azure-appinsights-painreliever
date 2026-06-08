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

/** A dependency call from the App Insights `dependencies` table
 *  (data/dependencies.json) — an outbound HTTP/fetch with a REAL duration. */
export interface Dependency {
  timestamp: string;
  name: string; // raw "GET https://host/api/v1/projects/690/objects?no=D-PL680002"
  target: string | null; // host — the "project" badge
  success: boolean;
  resultCode: string | null; // "200" / "500" / "0" (network/abort) …
  durationMs: number; // REAL measured duration
  operation: string | null; // operation_Name (the page the call fired on)
  operationId: string | null;
  sessionId: string | null; // same id space as customEvents
  authId: string | null;
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
  apiCount: number; // dependency calls in the session
  apiFailCount: number; // real failed dependency calls (HTTP error codes)
  apiWarnCount: number; // aborted/cancelled calls (resultCode 0) — warnings
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  entryRoute: string | null;
  lastRoute: string | null;
}

export type TimelineKind = "action" | "route" | "error" | "dependency";

/** One step in a session's timeline (the replay breadcrumb). */
export interface TimelineItem {
  id: string;
  ts: string;
  kind: TimelineKind;
  name: string; // event name / "Navigated" / exception type / endpoint
  summaryHtml: string; // pre-escaped HTML (summarize / failureMessage / route)
  route: string | null;
  /** "warn" = aborted/cancelled dependency (resultCode 0), not a real failure. */
  status: "ok" | "fail" | "warn" | null;
  offsetMs: number; // real ms from session start
  playbackMs: number; // compressed ms (idle gaps capped) for replay
  durationMs?: number; // set for kind === "dependency" (real call duration)
  host?: string | null; // dependency target host (bar color / label)
  rawName?: string; // dependency: full untemplated "VERB url" (real ids)
  resultCode?: string | null; // dependency: HTTP/result code
  operationId?: string | null; // dependency: trace/operation id
}

export interface SessionTimeline {
  items: TimelineItem[];
  realTotalMs: number;
  playbackTotalMs: number;
}

/* ---- Profiles (real dependency latency) -----------------------------------
   Rolled up from the App Insights `dependencies` table (real outbound-call
   durations) over a 7-day window. Endpoints are the dependency `name` with ids
   templated; percentiles/self-time/fail-rate are over the REAL `durationMs`. */

/** Percentile bundle (ms) for a real-duration distribution. */
export interface Percentiles {
  p50: number;
  p75: number;
  p95: number;
  p99: number;
}

/** A session that had ≥1 failing call to a given endpoint (drill-down link). */
export interface FailSession {
  sessionId: string;
  authId: string | null;
  count: number; // failing calls to this endpoint in the session
  resultCode: string; // most recent failing result code
  lastTs: string; // most recent failing call timestamp
}

/** One endpoint, rolled up by real call duration. */
export interface ProfileFunction extends Percentiles {
  name: string; // templated endpoint, e.g. "GET /api/v1/projects/{id}/objects"
  count: number; // # calls (samples)
  selfTimeMs: number; // sum of real durations (drives default sort + bar)
  failCount: number; // # real failures (HTTP error codes, excludes aborts)
  warnCount: number; // # aborted/cancelled calls (resultCode 0)
  failRate: number; // real failures / count (0..1)
  platform: string; // dominant target host ("project" badge)
  platformColor: string;
  color: string; // endpoint color (leading dot)
  daySeries: number[]; // per-day p75 over the 7-day window — trend chart + spark
  /** % rise of recent-3d vs prior-3d p75 when flagged a regression, else null. */
  regressionPct: number | null;
  failSessions: FailSession[]; // sessions with failing calls, most recent first
  warnSessions: FailSession[]; // sessions with aborted calls, most recent first
}

/** One transactions-table row (same endpoint rollup, count-sorted). */
export interface TxnRow extends Percentiles {
  id: string;
  transaction: string; // templated endpoint
  project: string; // dominant target host
  color: string; // host color
  count: number;
  failRate: number;
  selfTimeMs: number;
}

/** One Failures-tab row: an endpoint with one or more failed calls. */
export interface FailureRow {
  id: string; // endpoint template (unique key)
  endpoint: string;
  target: string | null; // dominant host
  topResultCode: string; // most-frequent failing resultCode ("500" / "0" / …)
  failCount: number;
  failRate: number; // failCount / total calls for this endpoint
  p95Ms: number; // p95 of the FAILING calls' durations
  daySeries: number[]; // per-day fail counts (length = days)
  color: string;
}

/** Everything the Profiles view renders, from one pass over the dependencies. */
export interface Profiles {
  endpoints: ProfileFunction[]; // by descending self-time
  transactions: TxnRow[]; // by descending count
  regressed: ProfileFunction[]; // by descending regression %
  failures: FailureRow[]; // by descending fail count
  totalCalls: number;
  totalSessions: number;
  totalSelfTimeMs: number;
  failRate: number; // project-wide real-failure rate (0..1)
  warnRate: number; // project-wide abort/cancel rate (0..1)
  medianMs: number; // project-wide p50 real duration
  // 7-day dependency window (independent of the 30-day events meta)
  fromMs: number;
  toMs: number;
  days: number;
  dayLabels: string[];
}
