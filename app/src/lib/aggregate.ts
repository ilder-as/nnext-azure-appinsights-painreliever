/* ============================================================================
   aggregate.ts — single-pass aggregation over the event array.
   Performance contract: filter + aggregate must stay well under 200ms on
   34k–65k rows. O(n) with Map/array accumulators; no nested scans.
   ============================================================================ */
import { buildColorMap, fmtDay, isFailure } from "./format";
import { dimValue } from "./dimensions";
import type {
  AppEvent,
  Aggregate,
  DaySeries,
  Derived,
  Dimension,
  Filters,
  Meta,
  Pair,
  UserStat,
} from "./types";

const DAY_MS = 86400000;

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

/** Top-N event types across the WHOLE dataset (stable hero stacking colours). */
export function globalTypeOrder(events: AppEvent[]): string[] {
  const m = new Map<string, number>();
  for (let i = 0; i < events.length; i++)
    m.set(events[i].name, (m.get(events[i].name) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
}

/** Window/colour context computed once from meta + the full dataset. */
export function computeDerived(meta: Meta | null, events: AppEvent[]): Derived {
  const now = meta?.to
    ? Date.parse(meta.to)
    : events[0]
      ? Date.parse(events[0].timestamp)
      : Date.now();
  const fromRaw = meta?.from
    ? Date.parse(meta.from)
    : events.length
      ? Date.parse(events[events.length - 1].timestamp)
      : now;

  const windowFromMs = startOfUtcDay(fromRaw);
  const endMid = startOfUtcDay(now);
  const days = Math.max(1, Math.round((endMid - windowFromMs) / DAY_MS) + 1);
  const dayLabels = Array.from({ length: days }, (_, i) =>
    fmtDay(new Date(windowFromMs + i * DAY_MS)),
  );

  const typeOrder = globalTypeOrder(events);
  return {
    now,
    windowFromMs,
    days,
    dayLabels,
    typeOrder,
    topTypes: typeOrder.slice(0, 6),
    colorMap: buildColorMap(typeOrder),
  };
}

function matchField(v: unknown, q: string): boolean {
  return v != null && String(v).toLowerCase().indexOf(q) !== -1;
}

function bump(map: Map<string | null, number>, key: string | null): void {
  map.set(key, (map.get(key) || 0) + 1);
}

function sortedPairs(map: Map<string | null, number>): Pair[] {
  return [...map.entries()]
    .map(([k, v]): Pair => [k == null ? "null" : k, v])
    .sort((a, b) => b[1] - a[1]);
}

/**
 * Filter once and compute every aggregate in a SINGLE pass: distributions,
 * unique users/sessions, failures, per-user stats, the stacked daily hero
 * series (top-6 + Other) and per-day distinct users/sessions sparklines.
 */
export function aggregate(
  events: AppEvent[],
  filters: Filters,
  derived: Derived,
  dims: Dimension[],
): Aggregate {
  const { windowFromMs, days, topTypes, colorMap, dayLabels } = derived;
  const qLc = filters.search.trim().toLowerCase();
  const evSet = filters.events;

  // Resolve active dimension filters (key → allowed values) to their Dimension.
  const dimByKey = new Map(dims.map((d) => [d.key, d]));
  const activeDims: { dim: Dimension; set: Set<string> }[] = [];
  for (const key in filters.dims) {
    const set = filters.dims[key];
    const dim = dimByKey.get(key);
    if (set && set.size && dim) activeDims.push({ dim, set });
  }

  const rows: AppEvent[] = [];
  const byType = new Map<string | null, number>();
  const dimCounts = new Map<string, Map<string | null, number>>();
  for (const d of dims) dimCounts.set(d.key, new Map());
  const authUsers = new Set<string>();
  const anonUsers = new Set<string>();
  const sessions = new Set<string>();
  const userStats = new Map<string, { count: number; last: string }>();
  let failures = 0;

  // per-day stacks for the hero (top types + Other) + distinct user/session sets
  const stacks = new Map<string, number[]>();
  for (const t of topTypes) stacks.set(t, new Array(days).fill(0));
  stacks.set("Other", new Array(days).fill(0));
  const topSet = new Set(topTypes);
  const dayTotals = new Array<number>(days).fill(0);
  const dayUserSets = Array.from({ length: days }, () => new Set<string>());
  const daySessSets = Array.from({ length: days }, () => new Set<string>());

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];

    // ---- filter: event-type, then each active dimension, then free-text -----
    if (evSet.size && !evSet.has(ev.name)) continue;
    let dimPass = true;
    for (const { dim, set } of activeDims) {
      const v = dimValue(ev, dim);
      if (!set.has(v == null ? "null" : v)) {
        dimPass = false;
        break;
      }
    }
    if (!dimPass) continue;
    if (qLc) {
      let hit =
        matchField(ev.authId, qLc) ||
        matchField(ev.operation, qLc) ||
        matchField(ev.name, qLc) ||
        matchField(ev.country, qLc) ||
        matchField(ev.city, qLc) ||
        matchField(ev.browser, qLc) ||
        matchField(ev.os, qLc) ||
        matchField(ev.userId, qLc);
      if (!hit && ev.props) {
        for (const k in ev.props) {
          if (
            k.toLowerCase().indexOf(qLc) !== -1 ||
            matchField(ev.props[k], qLc)
          ) {
            hit = true;
            break;
          }
        }
      }
      if (!hit) continue;
    }

    rows.push(ev);

    bump(byType, ev.name);
    for (const d of dims) bump(dimCounts.get(d.key)!, dimValue(ev, d));

    if (ev.userId) anonUsers.add(ev.userId);
    if (ev.sessionId) sessions.add(ev.sessionId);
    if (ev.authId) {
      authUsers.add(ev.authId);
      const cur = userStats.get(ev.authId);
      if (cur) {
        cur.count++;
        if (ev.timestamp > cur.last) cur.last = ev.timestamp;
      } else {
        userStats.set(ev.authId, { count: 1, last: ev.timestamp });
      }
    }
    if (isFailure(ev.name)) failures++;

    const di = Math.floor((Date.parse(ev.timestamp) - windowFromMs) / DAY_MS);
    if (di >= 0 && di < days) {
      const key = topSet.has(ev.name) ? ev.name : "Other";
      stacks.get(key)![di]++;
      dayTotals[di]++;
      if (ev.authId) dayUserSets[di].add(ev.authId);
      if (ev.sessionId) daySessSets[di].add(ev.sessionId);
    }
  }

  const daySeries: DaySeries[] = [
    ...topTypes.map((t) => ({
      name: t,
      color: colorMap[t],
      data: stacks.get(t)!,
    })),
    { name: "Other", color: "#5a5a72", data: stacks.get("Other")! },
  ];

  const userStatsArr: UserStat[] = [...userStats.entries()]
    .map(([authId, s]) => ({ authId, count: s.count, last: s.last }))
    .sort((a, b) => b.count - a.count);

  const byDim: Record<string, Pair[]> = {};
  for (const d of dims) byDim[d.key] = sortedPairs(dimCounts.get(d.key)!);

  return {
    rows,
    total: rows.length,
    byType: sortedPairs(byType),
    byDim,
    uniqueUsers: authUsers.size,
    anonUsers: anonUsers.size,
    sessions: sessions.size,
    eventTypes: byType.size,
    failures,
    userStats: userStatsArr,
    dayLabels,
    dayTotals,
    daySeries,
    dayUsers: dayUserSets.map((s) => s.size),
    daySessions: daySessSets.map((s) => s.size),
  };
}

/** Static, UNFILTERED counts over the full dataset for the filter menus: event
 *  types + the full value distribution per discovered dimension. */
export function staticCounts(
  events: AppEvent[],
  dims: Dimension[],
): { byType: Pair[]; byDim: Record<string, Pair[]> } {
  const t = new Map<string | null, number>();
  const dm = new Map<string, Map<string | null, number>>();
  for (const d of dims) dm.set(d.key, new Map());
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    t.set(ev.name, (t.get(ev.name) || 0) + 1);
    for (const d of dims) bump(dm.get(d.key)!, dimValue(ev, d));
  }
  const byDim: Record<string, Pair[]> = {};
  for (const d of dims) byDim[d.key] = sortedPairs(dm.get(d.key)!);
  return { byType: sortedPairs(t), byDim };
}

/**
 * Explorer rows: apply the explorer-local failOnly view + sort. Fast path: the
 * default (timestamp desc) sort is a no-op since rows arrive newest-first.
 */
export function explorerRows(rows: AppEvent[], filters: Filters): AppEvent[] {
  let r = filters.failOnly ? rows.filter((e) => isFailure(e.name)) : rows;
  const { sortKey, sortDir } = filters;
  if (sortKey === "timestamp" && sortDir === -1) return r;
  r = r.slice();
  if (sortKey === "timestamp") {
    r.sort(
      (a, b) => sortDir * (Date.parse(a.timestamp) - Date.parse(b.timestamp)),
    );
  } else {
    r.sort((a, b) => {
      const va = a[sortKey] == null ? "" : String(a[sortKey]);
      const vb = b[sortKey] == null ? "" : String(b[sortKey]);
      return va < vb ? -sortDir : va > vb ? sortDir : 0;
    });
  }
  return r;
}
