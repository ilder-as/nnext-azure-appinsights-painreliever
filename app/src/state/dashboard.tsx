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
  staticCounts,
} from "@/lib/aggregate";
import { discoverDimensions } from "@/lib/dimensions";
import { deriveSessions } from "@/lib/sessions";
import type {
  AppEvent,
  Aggregate,
  Derived,
  Dimension,
  ErrorItem,
  Filters,
  Meta,
  Pair,
  Session,
  SortKey,
} from "@/lib/types";

type Status = "loading" | "ready" | "empty" | "error";
export type View = "overview" | "sessions";

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
  refreshing: boolean;
  anyFilterActive: boolean;
  // session trace
  errors: ErrorItem[];
  sessions: Session[];
  view: View;
  setView: (v: View) => void;
  openUserSessions: (authId: string) => void;
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
  return { meta, events, errors };
}

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<View>("overview");
  const searchTimer = useRef<number | undefined>(undefined);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    try {
      const { meta: m, events: ev, errors: ex } = await fetchData();
      setMeta(m);
      setEvents(ev);
      setErrors(ex);
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

  const derived = useMemo(
    () => (events.length ? computeDerived(meta, events) : EMPTY_DERIVED),
    [meta, events],
  );
  const dimensions = useMemo(() => discoverDimensions(events), [events]);
  const agg = useMemo(
    () => aggregate(events, filters, derived, dimensions),
    [events, filters, derived, dimensions],
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
    () => deriveSessions(events, errors),
    [events, errors],
  );

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
    refreshing,
    anyFilterActive,
    errors,
    sessions,
    view,
    setView,
    openUserSessions,
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
