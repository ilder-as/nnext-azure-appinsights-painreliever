/* ============================================================================
   profiles.ts — pivot the App Insights `dependencies` table into a
   Sentry-"Profiles"-style model using REAL outbound-call durations.

   Each dependency is an HTTP/fetch with a measured `durationMs`. We template the
   raw name (which embeds ids/object-numbers/queries) down to a stable endpoint,
   then roll up real-duration percentiles, self-time, fail-rate, a per-day p75
   trend, a best-effort regression, and a failures breakdown — over the deps'
   own ~7-day window (independent of the 30-day customEvents meta).

   Pure — no DOM/React. Single grouping pass + per-group percentile sorts.
   ============================================================================ */
import type {
  Dependency,
  FailSession,
  FailureRow,
  ProfileFunction,
  Profiles,
  TxnRow,
} from "./types";
import { fmtDay, PALETTE } from "./format";

const DAY_MS = 86400000;
const REGRESSION_MIN_SAMPLES = 50; // per 3-day period (weaker basis than 2×7d)
const REGRESSION_THRESHOLD = 0.25; // +25% p75 recent-vs-prior to flag

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

const KNOWN_VERBS = new Set([
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
]);

/** Collapse a raw dependency name to a stable endpoint template, keeping the
 *  HTTP verb and the path while replacing ids / object-numbers / queries.
 *    "GET https://h/api/v1/projects/690/objects?no=D-PL680002"
 *      → "GET /api/v1/projects/{id}/objects"
 *    "GET /assets/i18n/en.json" → unchanged   ("v1" survives) */
export function endpointTemplate(name: string | null): string {
  if (!name) return "(unknown)";
  let rest = name.trim();
  let verb = "";
  const sp = rest.indexOf(" ");
  if (sp > 0) {
    const head = rest.slice(0, sp);
    if (KNOWN_VERBS.has(head.toUpperCase())) {
      verb = head.toUpperCase();
      rest = rest.slice(sp + 1).trim();
    }
  }
  // strip scheme://host (and protocol-relative //host)
  const schemeM = rest.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]+(\/.*)?$/i);
  const protoM = rest.match(/^\/\/[^/]+(\/.*)?$/);
  let path = schemeM ? schemeM[1] || "/" : protoM ? protoM[1] || "/" : rest;
  // drop query / fragment
  const cut = path.search(/[?#]/);
  if (cut >= 0) path = path.slice(0, cut);
  if (!path.startsWith("/")) path = "/" + path;

  const segs = path.split("/").map((s) => {
    if (!s) return s;
    if (/^\d+$/.test(s)) return "{id}"; // pure numeric
    if (/^[A-Z]{1,3}-?[A-Z]{0,3}\d{3,}$/.test(s)) return "{id}"; // D-PL680002 / LL1570005
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    )
      return "{id}"; // canonical UUID
    if (/^[0-9a-f]{8,}$/i.test(s) && /\d/.test(s)) return "{id}"; // long hex/guid-ish
    const digits = (s.match(/\d/g) || []).length;
    if (digits >= 3 && digits / s.length > 0.4) return "{id}"; // mostly-digit mixed
    return s;
  });
  // collapse double slashes and drop a trailing slash (keep root "/")
  path = segs.join("/").replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  if (!path) path = "/";
  return verb ? `${verb} ${path}` : path;
}

export type DepOutcome = "ok" | "warn" | "fail";

/** Classify a dependency call. resultCode 0 (or empty) = aborted/cancelled
 *  request (no HTTP response) → a WARNING, not a real failure. A non-success
 *  call with a real HTTP code (4xx/5xx/…) is a failure. */
export function depOutcome(
  success: boolean,
  resultCode: string | null,
): DepOutcome {
  if (success) return "ok";
  if (!resultCode || resultCode === "0") return "warn";
  return "fail";
}

/** Linear-interpolation percentile (numpy "linear"). `sorted` ascending. */
function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];
  const idx = (p / 100) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Most frequent key in a count map ("" if empty). */
function dominant(counts: Map<string, number>): string {
  let best = "";
  let bestN = -1;
  for (const [k, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = k;
    }
  }
  return best;
}

/** Stable key → color map, by descending volume. */
function colorByOrder(order: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  order.forEach((k, i) => {
    map[k] = PALETTE[i % PALETTE.length];
  });
  return map;
}

interface FailSessAcc {
  count: number;
  authId: string | null;
  code: string;
  lastTs: string;
}
function bumpSess(
  map: Map<string, FailSessAcc>,
  sessionId: string,
  authId: string | null,
  code: string,
  ts: string,
) {
  const s = map.get(sessionId);
  if (s) {
    s.count++;
    if (ts > s.lastTs) {
      s.lastTs = ts;
      s.code = code;
    }
  } else {
    map.set(sessionId, { count: 1, authId, code, lastTs: ts });
  }
}
interface Group {
  durations: number[];
  selfTimeMs: number;
  count: number;
  failCount: number;
  warnCount: number;
  hosts: Map<string, number>;
  perDayDur: number[][]; // per-day duration arrays (for p75 trend + regression)
  perDayFail: number[]; // per-day fail counts
  failCodes: Map<string, number>; // resultCode → count (failing calls only)
  failDur: number[]; // durations of failing calls (for p95)
  failSessions: Map<string, FailSessAcc>; // sessionId → failing-call summary
  warnSessions: Map<string, FailSessAcc>; // sessionId → aborted-call summary
}

export function deriveProfiles(deps: Dependency[]): Profiles {
  // 1. window from the deps themselves (independent of the 30-day events meta)
  let minTs = Infinity;
  let maxTs = -Infinity;
  for (const d of deps) {
    const t = Date.parse(d.timestamp);
    if (t < minTs) minTs = t;
    if (t > maxTs) maxTs = t;
  }
  if (!isFinite(minTs)) {
    return {
      endpoints: [],
      transactions: [],
      regressed: [],
      failures: [],
      totalCalls: 0,
      totalSessions: 0,
      totalSelfTimeMs: 0,
      failRate: 0,
      warnRate: 0,
      medianMs: 0,
      fromMs: 0,
      toMs: 0,
      days: 1,
      dayLabels: [""],
    };
  }
  const fromMs = startOfUtcDay(minTs);
  const toMs = maxTs;
  const days = Math.max(
    1,
    Math.round((startOfUtcDay(maxTs) - fromMs) / DAY_MS) + 1,
  );
  const dayLabels = Array.from({ length: days }, (_, i) =>
    fmtDay(new Date(fromMs + i * DAY_MS)),
  );

  const newGroup = (): Group => ({
    durations: [],
    selfTimeMs: 0,
    count: 0,
    failCount: 0,
    warnCount: 0,
    hosts: new Map(),
    perDayDur: Array.from({ length: days }, () => [] as number[]),
    perDayFail: new Array(days).fill(0),
    failCodes: new Map(),
    failDur: [],
    failSessions: new Map(),
    warnSessions: new Map(),
  });

  // 2. single grouping pass keyed by endpoint template
  const groups = new Map<string, Group>();
  const hostTotals = new Map<string, number>();
  const sessions = new Set<string>();
  const allDur: number[] = [];
  let totalFail = 0;
  let totalWarn = 0;
  let totalSelfTimeMs = 0;

  for (const d of deps) {
    const dur = d.durationMs || 0;
    const tpl = endpointTemplate(d.name);
    let g = groups.get(tpl);
    if (!g) {
      g = newGroup();
      groups.set(tpl, g);
    }
    g.durations.push(dur);
    g.selfTimeMs += dur;
    g.count++;
    const host = d.target || "unknown";
    g.hosts.set(host, (g.hosts.get(host) || 0) + 1);
    hostTotals.set(host, (hostTotals.get(host) || 0) + 1);
    const di = Math.floor((Date.parse(d.timestamp) - fromMs) / DAY_MS);
    if (di >= 0 && di < days) g.perDayDur[di].push(dur);
    const oc = depOutcome(d.success, d.resultCode);
    if (oc === "warn") {
      g.warnCount++;
      totalWarn++;
      if (d.sessionId)
        bumpSess(g.warnSessions, d.sessionId, d.authId, "0", d.timestamp);
    } else if (oc === "fail") {
      g.failCount++;
      totalFail++;
      const code = d.resultCode ?? "?";
      g.failCodes.set(code, (g.failCodes.get(code) || 0) + 1);
      g.failDur.push(dur);
      if (di >= 0 && di < days) g.perDayFail[di]++;
      if (d.sessionId)
        bumpSess(g.failSessions, d.sessionId, d.authId, code, d.timestamp);
    }
    if (d.sessionId) sessions.add(d.sessionId);
    allDur.push(dur);
    totalSelfTimeMs += dur;
  }

  const hostColor = colorByOrder(
    [...hostTotals.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h),
  );
  // endpoint colors by descending volume
  const endpointColor = colorByOrder(
    [...groups.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([k]) => k),
  );
  const fallback = "#8b8b9e";

  // regression windows: last-3-complete-days vs prior-3 (trailing day partial)
  const lastFull = days - 2;
  const recentLo = lastFull - 2;
  const priorHi = recentLo - 1;
  const priorLo = priorHi - 2;
  const canRegress = priorLo >= 0;

  // 3. project each group → endpoint rollup
  const endpoints: ProfileFunction[] = [];
  const transactions: TxnRow[] = [];
  const failures: FailureRow[] = [];

  for (const [tpl, g] of groups) {
    const sorted = g.durations.slice().sort((a, b) => a - b);
    const p50 = percentile(sorted, 50);
    const p75 = percentile(sorted, 75);
    const p95 = percentile(sorted, 95);
    const p99 = percentile(sorted, 99);
    const failRate = g.failCount / g.count;
    const host = dominant(g.hosts);
    const color = endpointColor[tpl] || fallback;
    const daySeries = g.perDayDur.map((arr) =>
      arr.length
        ? percentile(
            arr.slice().sort((a, b) => a - b),
            75,
          )
        : 0,
    );

    let regressionPct: number | null = null;
    if (canRegress) {
      const recent: number[] = [];
      for (let d = recentLo; d <= lastFull; d++) recent.push(...g.perDayDur[d]);
      const prior: number[] = [];
      for (let d = priorLo; d <= priorHi; d++) prior.push(...g.perDayDur[d]);
      if (
        recent.length >= REGRESSION_MIN_SAMPLES &&
        prior.length >= REGRESSION_MIN_SAMPLES
      ) {
        const rp = percentile(
          recent.sort((a, b) => a - b),
          75,
        );
        const pp = percentile(
          prior.sort((a, b) => a - b),
          75,
        );
        if (pp > 0 && (rp - pp) / pp >= REGRESSION_THRESHOLD)
          regressionPct = (rp - pp) / pp;
      }
    }

    const sessList = (m: Map<string, FailSessAcc>): FailSession[] =>
      [...m.entries()]
        .map(([sessionId, fs]) => ({
          sessionId,
          authId: fs.authId,
          count: fs.count,
          resultCode: fs.code,
          lastTs: fs.lastTs,
        }))
        // most recent first; tiebreak by count
        .sort((a, b) =>
          a.lastTs < b.lastTs
            ? 1
            : a.lastTs > b.lastTs
              ? -1
              : b.count - a.count,
        )
        .slice(0, 20);
    const failSessions = sessList(g.failSessions);
    const warnSessions = sessList(g.warnSessions);

    endpoints.push({
      name: tpl,
      count: g.count,
      selfTimeMs: g.selfTimeMs,
      failCount: g.failCount,
      warnCount: g.warnCount,
      failRate,
      platform: host,
      platformColor: hostColor[host] || fallback,
      color,
      daySeries,
      regressionPct,
      failSessions,
      warnSessions,
      p50,
      p75,
      p95,
      p99,
    });

    transactions.push({
      id: tpl,
      transaction: tpl,
      project: host,
      color: hostColor[host] || fallback,
      count: g.count,
      failRate,
      selfTimeMs: g.selfTimeMs,
      p50,
      p75,
      p95,
      p99,
    });

    if (g.failCount > 0) {
      failures.push({
        id: tpl,
        endpoint: tpl,
        target: host,
        topResultCode: dominant(g.failCodes),
        failCount: g.failCount,
        failRate,
        p95Ms: percentile(
          g.failDur.slice().sort((a, b) => a - b),
          95,
        ),
        daySeries: g.perDayFail,
        color: hostColor[host] || fallback,
      });
    }
  }

  endpoints.sort((a, b) => b.selfTimeMs - a.selfTimeMs);
  transactions.sort((a, b) => b.count - a.count);
  failures.sort((a, b) => b.failCount - a.failCount);
  const regressed = endpoints
    .filter((e) => e.regressionPct != null)
    .sort((a, b) => (b.regressionPct || 0) - (a.regressionPct || 0));

  return {
    endpoints,
    transactions,
    regressed,
    failures,
    totalCalls: deps.length,
    totalSessions: sessions.size,
    totalSelfTimeMs,
    failRate: deps.length ? totalFail / deps.length : 0,
    warnRate: deps.length ? totalWarn / deps.length : 0,
    medianMs: percentile(
      allDur.sort((a, b) => a - b),
      50,
    ),
    fromMs,
    toMs,
    days,
    dayLabels,
  };
}
