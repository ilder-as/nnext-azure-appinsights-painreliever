/* ============================================================================
   sessions.ts — derive user sessions and per-session timelines for the
   "session trace" replay. Pure; reuses summarize/failureMessage/isFailure.
   ============================================================================ */
import { esc, isFailure, summarize } from "./format";
import type {
  ErrorItem,
  Session,
  SessionTimeline,
  TimelineItem,
  AppEvent,
} from "./types";

/**
 * Group events (+errors) by sessionId into Session summaries, newest-first.
 * Events without a sessionId can't belong to a session and are skipped.
 */
export function deriveSessions(
  events: AppEvent[],
  errors: ErrorItem[],
): Session[] {
  const evBy = new Map<string, AppEvent[]>();
  for (const e of events) {
    if (!e.sessionId) continue;
    const arr = evBy.get(e.sessionId);
    if (arr) arr.push(e);
    else evBy.set(e.sessionId, [e]);
  }
  const errCountBy = new Map<string, number>();
  for (const x of errors) {
    if (!x.sessionId) continue;
    errCountBy.set(x.sessionId, (errCountBy.get(x.sessionId) || 0) + 1);
  }

  const sessions: Session[] = [];
  for (const [id, evs] of evBy) {
    // events arrive newest-first overall; sort this session oldest-first
    evs.sort((a, b) =>
      a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
    );
    const first = evs[0];
    const last = evs[evs.length - 1];
    const startMs = Date.parse(first.timestamp);
    const endMs = Date.parse(last.timestamp);

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

    sessions.push({
      id,
      authId,
      userId,
      start: first.timestamp,
      end: last.timestamp,
      durationMs: Math.max(0, endMs - startMs),
      eventCount: evs.length,
      failureCount,
      errorCount: errCountBy.get(id) || 0,
      browser: first.browser,
      os: first.os,
      deviceType: first.deviceType,
      entryRoute,
      lastRoute,
    });
  }

  sessions.sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0));
  return sessions;
}

/** Filter a session's slice of events / errors (cheap O(n), called on select). */
export function sessionSlice(
  events: AppEvent[],
  errors: ErrorItem[],
  sessionId: string,
): { events: AppEvent[]; errors: ErrorItem[] } {
  return {
    events: events.filter((e) => e.sessionId === sessionId),
    errors: errors.filter((e) => e.sessionId === sessionId),
  };
}

/**
 * Build a session's ordered timeline: actions (with route changes surfaced as
 * "route" items) merged with JS errors, with real + compressed-playback offsets.
 */
export function buildTimeline(
  sessionEvents: AppEvent[],
  sessionErrors: ErrorItem[],
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
