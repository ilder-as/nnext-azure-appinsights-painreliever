import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  aggregate,
  computeDerived,
  explorerRows,
  rangeDerived,
  staticCounts,
} from "@/lib/aggregate";
import { discoverDimensions } from "@/lib/dimensions";
import { deriveSessions } from "@/lib/sessions";
import { deriveProfiles } from "@/lib/profiles";
import type {
  AppEvent,
  Aggregate,
  DateRange,
  Dependency,
  Derived,
  Dimension,
  ErrorItem,
  Filters,
  Meta,
  Pair,
  Profiles,
  Session,
  SortKey,
} from "@/lib/types";

type Status = "loading" | "ready" | "empty" | "error";
export type View = "overview" | "sessions" | "profiles";

export interface DashboardValue {
  status: Status;
  error: string | null;
  meta: Meta | null;
  events: AppEvent[];
  derived: Derived;
  filters: Filters;
  agg: Aggregate;
  explorer: AppEvent[];
  menuCounts: { byType: Pair[]; byDim: Record<string, Pair[]> };
  /** Auto-discovered breakdown/filter axes for the loaded dataset. */
  dimensions: Dimension[];
  /** Active date-range scope for the Overview (null = full window). */
  range: DateRange | null;
  setRange: (r: DateRange | null) => void;
  refreshing: boolean;
  anyFilterActive: boolean;
  // session trace
  errors: ErrorItem[];
  sessions: Session[];
  /** Outbound dependency calls (real durations) — powers Profiles + waterfall. */
  dependencies: Dependency[];
  /** Profiles pivot over real dependency latency (7-day window). */
  profiles: Profiles;
  view: View;
  setView: (v: View) => void;
  openUserSessions: (authId: string) => void;
  openSession: (sessionId: string) => void;
  // actions
  toggleEvent: (name: string) => void;
  toggleDim: (key: string, value: string) => void;
  clearEvents: () => void;
  clearDim: (key: string) => void;
  setSearch: (q: string) => void;
  setFailOnly: (on: boolean) => void;
  setSort: (key: SortKey) => void;
  clearAll: () => void;
  refresh: () => void;
}

const EMPTY_DERIVED: Derived = {
  now: 0,
  windowFromMs: 0,
  days: 1,
  dayLabels: [""],
  typeOrder: [],
  topTypes: [],
  colorMap: {},
};

const DashboardContext = createContext<DashboardValue | null>(null);

const INITIAL_FILTERS: Filters = {
  events: new Set(),
  dims: {},
  search: "",
  failOnly: false,
  sortKey: "timestamp",
  sortDir: -1,
};

const bust = () => "?t=" + Date.now();

async function fetchData(): Promise<{
  meta: Meta;
  events: AppEvent[];
  errors: ErrorItem[];
  dependencies: Dependency[];
}> {
  const [metaRes, evRes] = await Promise.all([
    fetch("./data/meta.json" + bust()),
    fetch("./data/events.json" + bust()),
  ]);
  if (!metaRes.ok) throw new Error("meta.json " + metaRes.status);
  if (!evRes.ok) throw new Error("events.json " + evRes.status);
  const meta = (await metaRes.json()) as Meta;
  const events = (await evRes.json()) as AppEvent[];
  if (!Array.isArray(events)) throw new Error("events.json is not an array");

  // exceptions are optional enrichment — never fail the load if absent
  let errors: ErrorItem[] = [];
  try {
    const exRes = await fetch("./data/exceptions.json" + bust());
    if (exRes.ok) {
      const parsed = await exRes.json();
      if (Array.isArray(parsed)) errors = parsed as ErrorItem[];
    }
  } catch {
    /* no exceptions.json → no error markers */
  }

  // dependencies (real HTTP-call durations) — optional, same as exceptions
  let dependencies: Dependency[] = [];
  try {
    const depRes = await fetch("./data/dependencies.json" + bust());
    if (depRes.ok) {
      const parsed = await depRes.json();
      if (Array.isArray(parsed)) dependencies = parsed as Dependency[];
    }
  } catch {
    /* no dependencies.json → empty Profiles, rest of app unaffected */
  }
  return { meta, events, errors, dependencies };
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [range, setRange] = useState<DateRange | null>(null);
  const searchTimer = useRef<number | undefined>(undefined);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    try {
      const {
        meta: m,
        events: ev,
        errors: ex,
        dependencies: dep,
      } = await fetchData();
      setMeta(m);
      setEvents(ev);
      setErrors(ex);
      setDependencies(dep);
      setError(null);
      setStatus(ev.length === 0 ? "empty" : "ready");
    } catch (err) {
      if (!isRefresh) setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
      // on refresh failure keep the existing view; surface via console
      if (isRefresh) console.error("[analytics] refresh failed:", err);
    } finally {
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  // Colours + full window from the whole dataset (stable across range changes).
  const derivedFull = useMemo(
    () => (events.length ? computeDerived(meta, events) : EMPTY_DERIVED),
    [meta, events],
  );
  // Effective derived: re-windowed to the selected range (keeps stable colours).
  const derived = useMemo(
    () =>
      range && events.length
        ? rangeDerived(derivedFull, range.fromMs, range.toMs)
        : derivedFull,
    [derivedFull, range, events.length],
  );
  // Events scoped to the active range (full dataset when no range).
  const rangeEvents = useMemo(() => {
    if (!range) return events;
    return events.filter((e) => {
      const t = Date.parse(e.timestamp);
      return t >= range.fromMs && t <= range.toMs;
    });
  }, [events, range]);
  const dimensions = useMemo(() => discoverDimensions(events), [events]);
  const agg = useMemo(
    () => aggregate(rangeEvents, filters, derived, dimensions),
    [rangeEvents, filters, derived, dimensions],
  );
  const explorer = useMemo(
    () => explorerRows(agg.rows, filters),
    [agg.rows, filters],
  );
  const menuCounts = useMemo(
    () => staticCounts(events, dimensions),
    [events, dimensions],
  );
  const sessions = useMemo(
    () => deriveSessions(events, errors, dependencies),
    [events, errors, dependencies],
  );
  // Profiles pivots real dependency latency over its own 7-day window —
  // independent of the events/filters.
  const profiles = useMemo(() => deriveProfiles(dependencies), [dependencies]);

  const anyFilterActive =
    filters.events.size > 0 ||
    Object.values(filters.dims).some((s) => s.size > 0) ||
    filters.search.length > 0;

  const toggleEvent = useCallback((name: string) => {
    setFilters((f) => {
      const events = new Set(f.events);
      if (events.has(name)) events.delete(name);
      else events.add(name);
      return { ...f, events };
    });
  }, []);
  const toggleDim = useCallback((key: string, value: string) => {
    setFilters((f) => {
      const dims = { ...f.dims };
      const set = new Set(dims[key]);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      if (set.size) dims[key] = set;
      else delete dims[key];
      return { ...f, dims };
    });
  }, []);
  const clearEvents = useCallback(
    () => setFilters((f) => ({ ...f, events: new Set<string>() })),
    [],
  );
  const clearDim = useCallback(
    (key: string) =>
      setFilters((f) => {
        const dims = { ...f.dims };
        delete dims[key];
        return { ...f, dims };
      }),
    [],
  );
  const setSearch = useCallback((q: string) => {
    // debounce so a fast typist doesn't re-aggregate on every keystroke
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      setFilters((f) => ({ ...f, search: q }));
    }, 120);
  }, []);
  const setFailOnly = useCallback(
    (on: boolean) => setFilters((f) => ({ ...f, failOnly: on })),
    [],
  );
  const setSort = useCallback((key: SortKey) => {
    setFilters((f) =>
      f.sortKey === key
        ? { ...f, sortDir: (f.sortDir === 1 ? -1 : 1) as 1 | -1 }
        : { ...f, sortKey: key, sortDir: key === "timestamp" ? -1 : 1 },
    );
  }, []);
  const clearAll = useCallback(() => {
    window.clearTimeout(searchTimer.current);
    setFilters((f) => ({
      ...f,
      events: new Set<string>(),
      dims: {},
      search: "",
      failOnly: false,
    }));
  }, []);
  const refresh = useCallback(() => void load(true), [load]);
  // Deep-link from Top Users → that user's sessions (immediate, not debounced).
  const openUserSessions = useCallback((authId: string) => {
    window.clearTimeout(searchTimer.current);
    setFilters((f) => ({ ...f, search: authId }));
    setView("sessions");
  }, []);
  // Deep-link to a specific session (e.g. from a failing endpoint in Profiles).
  // The session list filters on id, so searching the session id selects it.
  const openSession = useCallback((sessionId: string) => {
    window.clearTimeout(searchTimer.current);
    setFilters((f) => ({ ...f, search: sessionId }));
    setView("sessions");
  }, []);

  const value: DashboardValue = {
    status,
    error,
    meta,
    events,
    derived,
    filters,
    agg,
    explorer,
    menuCounts,
    dimensions,
    range,
    setRange,
    refreshing,
    anyFilterActive,
    errors,
    sessions,
    dependencies,
    profiles,
    view,
    setView,
    openUserSessions,
    openSession,
    toggleEvent,
    toggleDim,
    clearEvents,
    clearDim,
    setSearch,
    setFailOnly,
    setSort,
    clearAll,
    refresh,
  };

  return <DashboardContext value={value}>{children}</DashboardContext>;
}

export function useDashboard(): DashboardValue {
  const ctx = use(DashboardContext);
  if (!ctx)
    throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
