/* ============================================================================
   sessions.ts — derive user sessions and per-session timelines for the
   "session trace" replay. Pure; reuses summarize/failureMessage/isFailure.
   ============================================================================ */
import { esc, isFailure, summarize } from "./format";
import { depOutcome, endpointTemplate } from "./profiles";
import type {
  ErrorItem,
  Session,
  SessionTimeline,
  TimelineItem,
  AppEvent,
  Dependency,
} from "./types";

/**
 * Group events (+errors) by sessionId into Session summaries, newest-first.
 * Events without a sessionId can't belong to a session and are skipped.
 */
export function deriveSessions(
  events: AppEvent[],
  errors: ErrorItem[],
  deps: Dependency[] = [],
): Session[] {
  const evBy = new Map<string, AppEvent[]>();
  for (const e of events) {
    if (!e.sessionId) continue;
    const arr = evBy.get(e.sessionId);
    if (arr) arr.push(e);
    else evBy.set(e.sessionId, [e]);
  }
  const depBy = new Map<string, Dependency[]>();
  for (const d of deps) {
    if (!d.sessionId) continue;
    const arr = depBy.get(d.sessionId);
    if (arr) arr.push(d);
    else depBy.set(d.sessionId, [d]);
  }
  const errCountBy = new Map<string, number>();
  for (const x of errors) {
    if (!x.sessionId) continue;
    errCountBy.set(x.sessionId, (errCountBy.get(x.sessionId) || 0) + 1);
  }

  const byTs = (a: { timestamp: string }, b: { timestamp: string }) =>
    a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0;

  // Union of session ids — a session may have events, dependencies, or both.
  const ids = new Set<string>([...evBy.keys(), ...depBy.keys()]);
  const sessions: Session[] = [];
  for (const id of ids) {
    const evs = (evBy.get(id) || []).slice().sort(byTs);
    const dps = (depBy.get(id) || []).slice().sort(byTs);

    // span covers both events and dependencies
    let startStr = "";
    let endStr = "";
    let startMs = Infinity;
    let endMs = -Infinity;
    const consider = (ts: string) => {
      const t = Date.parse(ts);
      if (t < startMs) {
        startMs = t;
        startStr = ts;
      }
      if (t > endMs) {
        endMs = t;
        endStr = ts;
      }
    };
    for (const e of evs) consider(e.timestamp);
    for (const d of dps) consider(d.timestamp);

    let authId: string | null = null;
    let userId: string | null = null;
    let failureCount = 0;
    let entryRoute: string | null = null;
    let lastRoute: string | null = null;
    for (const e of evs) {
      if (!authId && e.authId) authId = e.authId;
      if (!userId && e.userId) userId = e.userId;
      if (isFailure(e.name)) failureCount++;
      if (e.operation) {
        if (entryRoute == null) entryRoute = e.operation;
        lastRoute = e.operation;
      }
    }

    let apiCount = 0;
    let apiFailCount = 0;
    let apiWarnCount = 0;
    for (const d of dps) {
      apiCount++;
      const oc = depOutcome(d.success, d.resultCode);
      if (oc === "fail") apiFailCount++;
      else if (oc === "warn") apiWarnCount++;
      if (!authId && d.authId) authId = d.authId;
    }
    // deps-only session: take routes from the dependency operations
    if (!evs.length) {
      for (const d of dps) {
        if (d.operation) {
          if (entryRoute == null) entryRoute = d.operation;
          lastRoute = d.operation;
        }
      }
    }

    sessions.push({
      id,
      authId,
      userId,
      start: startStr,
      end: endStr,
      durationMs: Math.max(0, endMs - startMs),
      eventCount: evs.length,
      failureCount,
      errorCount: errCountBy.get(id) || 0,
      apiCount,
      apiFailCount,
      apiWarnCount,
      browser: evs.length ? evs[0].browser : null,
      os: evs.length ? evs[0].os : null,
      deviceType: evs.length ? evs[0].deviceType : null,
      entryRoute,
      lastRoute,
    });
  }

  sessions.sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0));
  return sessions;
}

/** Filter a session's slice of events / errors / deps (cheap O(n), on select). */
export function sessionSlice(
  events: AppEvent[],
  errors: ErrorItem[],
  deps: Dependency[],
  sessionId: string,
): { events: AppEvent[]; errors: ErrorItem[]; deps: Dependency[] } {
  return {
    events: events.filter((e) => e.sessionId === sessionId),
    errors: errors.filter((e) => e.sessionId === sessionId),
    deps: deps.filter((d) => d.sessionId === sessionId),
  };
}

/**
 * Build a session's ordered timeline: actions (with route changes surfaced as
 * "route" items) merged with JS errors, with real + compressed-playback offsets.
 */
export function buildTimeline(
  sessionEvents: AppEvent[],
  sessionErrors: ErrorItem[],
  sessionDependencies: Dependency[] = [],
  maxGapMs = 4000,
): SessionTimeline {
  type Raw = { ts: string; make: (route: string | null) => TimelineItem };

  const raws: Raw[] = [];

  // actions (+ a synthetic route item on the first known route and every change)
  let curRoute: string | null = null;
  const sorted = [...sessionEvents].sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
  );
  for (const e of sorted) {
    const op = e.operation;
    if (op != null && op !== curRoute) {
      curRoute = op;
      raws.push({
        ts: e.timestamp,
        make: () => ({
          id: "",
          ts: e.timestamp,
          kind: "route",
          name: "Navigated",
          summaryHtml: esc(op),
          route: op,
          status: null,
          offsetMs: 0,
          playbackMs: 0,
        }),
      });
    }
    const fail = isFailure(e.name);
    raws.push({
      ts: e.timestamp,
      make: (route) => ({
        id: "",
        ts: e.timestamp,
        kind: "action",
        name: e.name,
        summaryHtml: summarize(e),
        route: e.operation ?? route,
        status: fail ? "fail" : "ok",
        offsetMs: 0,
        playbackMs: 0,
      }),
    });
  }

  // JS errors
  for (const x of sessionErrors) {
    raws.push({
      ts: x.timestamp,
      make: (route) => ({
        id: "",
        ts: x.timestamp,
        kind: "error",
        name: x.type || "Error",
        summaryHtml: esc(x.message || x.type || "Unhandled error"),
        route: x.operation ?? route,
        status: "fail",
        offsetMs: 0,
        playbackMs: 0,
      }),
    });
  }

  // dependency calls (real durations → waterfall bars)
  for (const dep of sessionDependencies) {
    raws.push({
      ts: dep.timestamp,
      make: (route) => ({
        id: "",
        ts: dep.timestamp,
        kind: "dependency",
        name: endpointTemplate(dep.name),
        summaryHtml: esc(
          (dep.target ?? "") + (dep.resultCode ? " · " + dep.resultCode : ""),
        ),
        route: dep.operation ?? route,
        status: depOutcome(dep.success, dep.resultCode),
        offsetMs: 0,
        playbackMs: 0,
        durationMs: dep.durationMs,
        host: dep.target,
        rawName: dep.name,
        resultCode: dep.resultCode,
        operationId: dep.operationId,
      }),
    });
  }

  raws.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  if (raws.length === 0)
    return { items: [], realTotalMs: 0, playbackTotalMs: 0 };

  const startMs = Date.parse(raws[0].ts);
  const items: TimelineItem[] = [];
  let prevOffset = 0;
  let playback = 0;
  let lastRoute: string | null = null;
  for (let i = 0; i < raws.length; i++) {
    const item = raws[i].make(lastRoute);
    if (item.route != null) lastRoute = item.route;
    const offsetMs = Date.parse(item.ts) - startMs;
    if (i > 0) playback += Math.min(offsetMs - prevOffset, maxGapMs);
    prevOffset = offsetMs;
    item.offsetMs = offsetMs;
    item.playbackMs = playback;
    item.id = item.ts + "#" + i;
    items.push(item);
  }

  return {
    items,
    realTotalMs: items[items.length - 1].offsetMs,
    playbackTotalMs: playback,
  };
}
