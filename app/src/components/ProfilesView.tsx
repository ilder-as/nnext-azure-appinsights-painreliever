import { useMemo, useState } from "react";
import { useDashboard } from "@/state/dashboard";
import { useECharts } from "@/lib/useECharts";
import { profileTrendOption } from "@/lib/chartOptions";
import { Sparkline } from "@/components/Sparkline";
import {
  avatarFor,
  displayName,
  fmtDate,
  fmtDuration,
  fmtInt,
  fmtPct,
  relTime,
} from "@/lib/format";
import type { FailureRow, ProfileFunction, TxnRow } from "@/lib/types";

/**
 * Profiles — REAL API latency from the App Insights `dependencies` table.
 *
 * Each dependency is an outbound HTTP/fetch with a measured duration. We roll up
 * real P50–P99, self-time and fail-rate per endpoint (route templated), over the
 * deps' own 7-day window. Heavy lifting is in lib/profiles.ts (deriveProfiles);
 * this view is thin. Tabs: Transactions | Failures. Per-session waterfalls live
 * in the Sessions view.
 */

type FnSort = "self" | "p75" | "count" | "fails";
type Tab = "transactions" | "failures";

const FN_SORTS: { key: FnSort; label: string }[] = [
  { key: "self", label: "total time" },
  { key: "p75", label: "slowest" },
  { key: "count", label: "count" },
  { key: "fails", label: "most failures" },
];

export function ProfilesView() {
  const { profiles, openSession } = useDashboard();
  const {
    endpoints,
    transactions,
    regressed,
    failures,
    totalCalls,
    totalSessions,
    totalSelfTimeMs,
    failRate,
    warnRate,
    medianMs,
    fromMs,
    toMs,
    dayLabels,
  } = profiles;

  const [fnSort, setFnSort] = useState<FnSort>("self");
  const [expanded, setExpanded] = useState<string | null>(
    endpoints[0]?.name ?? null,
  );
  const [tab, setTab] = useState<Tab>("transactions");

  const sortedFns = useMemo(() => {
    const arr = endpoints.slice();
    if (fnSort === "p75") arr.sort((a, b) => b.p75 - a.p75);
    else if (fnSort === "count") arr.sort((a, b) => b.count - a.count);
    else if (fnSort === "fails")
      arr.sort((a, b) => b.failCount - a.failCount || b.failRate - a.failRate);
    else arr.sort((a, b) => b.selfTimeMs - a.selfTimeMs);
    return arr;
  }, [endpoints, fnSort]);

  const maxSelf = endpoints.reduce((m, f) => Math.max(m, f.selfTimeMs), 1);
  const windowLabel =
    fromMs && toMs
      ? `${fmtDate(new Date(fromMs).toISOString())} – ${fmtDate(
          new Date(toMs).toISOString(),
        )} · dependencies`
      : "no dependency data";

  return (
    <>
      <header className="pf-head">
        <div>
          <h1 className="pf-title">
            Profiles <span className="pf-tag">real latency</span>
          </h1>
          <p className="pf-subtitle">
            Real Azure App Insights <b>dependency latency</b> — P50–P99 of
            measured request duration and failure rates per endpoint.
            Per-session load waterfalls are in the Sessions view.
          </p>
        </div>
        <div className="pf-head-stats">
          <span className="pf-window">{windowLabel}</span>
          <Stat label="Calls" value={fmtInt(totalCalls)} />
          <Stat label="Sessions" value={fmtInt(totalSessions)} />
          <Stat label="Median" value={fmtDuration(medianMs)} />
          <Stat
            label="Fail rate"
            value={fmtPct(failRate)}
            danger={failRate > 0}
          />
          <Stat label="Aborted" value={fmtPct(warnRate)} muted />
          <Stat label="Total time" value={fmtDuration(totalSelfTimeMs)} />
        </div>
      </header>

      <div className="grid-2">
        {/* LEFT — Slowest endpoints */}
        <section className="card">
          <div className="card-head">
            <h2>Endpoints</h2>
            <span className="sub">
              sorted by {FN_SORTS.find((s) => s.key === fnSort)?.label} · p75
              trend
            </span>
            <div className="head-right">
              <div className="seg" role="group" aria-label="Sort endpoints">
                {FN_SORTS.map((s) => (
                  <button
                    key={s.key}
                    className={"seg-btn" + (fnSort === s.key ? " active" : "")}
                    onClick={() => setFnSort(s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="card-body">
            <div className="pf-fn-list">
              {sortedFns.map((fn) => (
                <FunctionRow
                  key={fn.name}
                  fn={fn}
                  labels={dayLabels}
                  maxSelf={maxSelf}
                  nowMs={toMs}
                  expanded={expanded === fn.name}
                  onToggle={() =>
                    setExpanded((cur) => (cur === fn.name ? null : fn.name))
                  }
                  onOpenSession={openSession}
                />
              ))}
              {!sortedFns.length ? (
                <div className="empty" style={{ display: "flex" }}>
                  <h3>No dependencies</h3>
                  <p>
                    Run the extract-events skill to pull the dependencies table.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* RIGHT — Most regressed */}
        <section className="card">
          <div className="card-head">
            <h2>Most regressed endpoints</h2>
            <span className="sub">p75 latency, last 3d vs prior 3d</span>
          </div>
          <div className="card-body">
            {regressed.length ? (
              <div className="pf-reg-list">
                {regressed.map((fn) => (
                  <div className="pf-reg-row" key={fn.name}>
                    <span
                      className="ev-dot"
                      style={{ background: fn.color }}
                    ></span>
                    <span className="pf-reg-name">{fn.name}</span>
                    <span className="pf-fn-grow" />
                    <span className="pf-reg-pct">
                      ▲ {fmtPct(fn.regressionPct ?? 0)}
                    </span>
                    <span className="pf-reg-p75 num">
                      {fmtDuration(fn.p75)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty" style={{ display: "flex" }}>
                <svg viewBox="0 0 24 24" fill="none">
                  <circle
                    cx="11"
                    cy="11"
                    r="7"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M20 20l-3.5-3.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
                <h3>No regressed endpoints detected</h3>
                <p>
                  No endpoint’s p75 latency rose ≥25% in the last 3 days versus
                  the prior 3 (best-effort on a 7-day window).
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="pf-tabbar">
        <div className="seg" role="tablist" aria-label="Profiles detail">
          <button
            role="tab"
            aria-selected={tab === "transactions"}
            className={"seg-btn" + (tab === "transactions" ? " active" : "")}
            onClick={() => setTab("transactions")}
          >
            Transactions
          </button>
          <button
            role="tab"
            aria-selected={tab === "failures"}
            className={"seg-btn" + (tab === "failures" ? " active" : "")}
            onClick={() => setTab("failures")}
          >
            Failures{failures.length ? ` (${failures.length})` : ""}
          </button>
        </div>
      </div>

      {tab === "transactions" ? (
        <TransactionsTab rows={transactions} />
      ) : (
        <FailuresTab rows={failures} labels={dayLabels} />
      )}
    </>
  );
}

function Stat({
  label,
  value,
  danger,
  muted,
}: {
  label: string;
  value: string;
  danger?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="pf-stat">
      <span className="pf-stat-label">{label}</span>
      <span
        className={
          "pf-stat-value tnum" +
          (danger ? " pf-fail-rate" : muted ? " pf-warn-rate" : "")
        }
      >
        {value}
      </span>
    </div>
  );
}

/* ---- Slowest-endpoint row + expandable trend chart ------------------------ */

function FunctionRow({
  fn,
  labels,
  maxSelf,
  nowMs,
  expanded,
  onToggle,
  onOpenSession,
}: {
  fn: ProfileFunction;
  labels: string[];
  maxSelf: number;
  nowMs: number;
  expanded: boolean;
  onToggle: () => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const fillPct = Math.max(2, (fn.selfTimeMs / maxSelf) * 100);
  const hasFail = fn.failSessions.length > 0;
  const hasWarn = fn.warnSessions.length > 0;
  const [drill, setDrill] = useState<"fail" | "warn">(
    hasFail ? "fail" : "warn",
  );

  // open the row and focus the matching session drill-down from a chip
  const openDrill = (which: "fail" | "warn") => {
    setDrill(
      which === "fail"
        ? hasFail
          ? "fail"
          : "warn"
        : hasWarn
          ? "warn"
          : "fail",
    );
    if (!expanded) onToggle();
  };

  const effDrill =
    drill === "fail" && !hasFail
      ? "warn"
      : drill === "warn" && !hasWarn
        ? "fail"
        : drill;
  const sessions = effDrill === "fail" ? fn.failSessions : fn.warnSessions;

  return (
    <div className={"pf-fn-row" + (expanded ? " expanded" : "")}>
      <div className="pf-fn-head">
        {/* line 1 — full URL + p75 + sparkline (the clickable toggle) */}
        <div
          className="pf-fn-l1"
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onClick={onToggle}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggle();
            }
          }}
        >
          <span className="pf-caret" aria-hidden="true">
            ▸
          </span>
          <span className="ev-dot" style={{ background: fn.color }}></span>
          <span className="pf-fn-name">{fn.name}</span>
          <span className="pf-fn-grow" />
          <span className="pf-fn-p75 num" title="p75 latency">
            {fmtDuration(fn.p75)}
          </span>
          <span className="pf-fn-spark">
            <Sparkline
              values={fn.daySeries}
              color={fn.color}
              danger={fn.regressionPct != null}
            />
          </span>
        </div>
        {/* line 2 — chips (clickable) + count + host */}
        <div className="pf-fn-l2">
          {fn.regressionPct != null ? (
            <span className="pf-fn-regtag">regressed</span>
          ) : null}
          {fn.failCount > 0 ? (
            hasFail ? (
              <button
                type="button"
                className="pf-fn-failtag pf-chip-btn"
                onClick={() => openDrill("fail")}
                title={`${fmtInt(fn.failCount)} failed calls — ${fmtPct(fn.failRate)} of ${fmtInt(fn.count)} · open failing sessions`}
              >
                {fmtInt(fn.failCount)} fail
              </button>
            ) : (
              <span
                className="pf-fn-failtag"
                title={`${fmtInt(fn.failCount)} failed calls (no session id to open)`}
              >
                {fmtInt(fn.failCount)} fail
              </span>
            )
          ) : null}
          {fn.warnCount > 0 ? (
            hasWarn ? (
              <button
                type="button"
                className="pf-fn-warntag pf-chip-btn"
                onClick={() => openDrill("warn")}
                title={`${fmtInt(fn.warnCount)} aborted/cancelled calls (resultCode 0) · open aborted sessions`}
              >
                {fmtInt(fn.warnCount)} aborted
              </button>
            ) : (
              <span
                className="pf-fn-warntag"
                title={`${fmtInt(fn.warnCount)} aborted/cancelled calls (resultCode 0)`}
              >
                {fmtInt(fn.warnCount)} aborted
              </span>
            )
          ) : null}
          <span className="pf-fn-meta">
            {fmtInt(fn.count)} · {fn.platform}
          </span>
        </div>
        <span
          className="pf-fn-fill"
          style={{ width: `${fillPct}%`, background: fn.color }}
        />
      </div>
      {expanded ? (
        <div className="pf-fn-expand">
          <div className="pf-fn-pctls">
            <PctChip label="p50" v={fn.p50} />
            <PctChip label="p75" v={fn.p75} />
            <PctChip label="p95" v={fn.p95} />
            <PctChip label="p99" v={fn.p99} />
            <PctChip label="total" v={fn.selfTimeMs} accent />
          </div>
          <FunctionTrendChart fn={fn} labels={labels} />
          {hasFail || hasWarn ? (
            <div className="pf-failsess">
              <div className="pf-failsess-tabs">
                {hasFail ? (
                  <button
                    type="button"
                    className={
                      "pf-failsess-tab" + (effDrill === "fail" ? " active" : "")
                    }
                    onClick={() => setDrill("fail")}
                  >
                    Failing ({fn.failSessions.length})
                  </button>
                ) : null}
                {hasWarn ? (
                  <button
                    type="button"
                    className={
                      "pf-failsess-tab warn" +
                      (effDrill === "warn" ? " active" : "")
                    }
                    onClick={() => setDrill("warn")}
                  >
                    Aborted ({fn.warnSessions.length})
                  </button>
                ) : null}
                <span className="pf-failsess-hint muted">
                  most recent · tap to open the waterfall
                </span>
              </div>
              <div className="pf-failsess-list">
                {sessions.map((s) => {
                  const av = avatarFor(s.authId);
                  return (
                    <button
                      key={s.sessionId}
                      type="button"
                      className="pf-failsess-row"
                      onClick={() => onOpenSession(s.sessionId)}
                      title={`Open session ${s.sessionId}`}
                    >
                      <span className="avatar" style={{ background: av.color }}>
                        {av.init}
                      </span>
                      <span className="pf-failsess-user">
                        {displayName(s.authId)}
                      </span>
                      <span
                        className={"pf-fail-code " + codeClass(s.resultCode)}
                      >
                        {codeLabel(s.resultCode)}
                      </span>
                      <span className="pf-failsess-count">×{s.count}</span>
                      <span className="pf-failsess-time">
                        {relTime(s.lastTs, nowMs)}
                      </span>
                      <span className="pf-failsess-go" aria-hidden="true">
                        →
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PctChip({
  label,
  v,
  accent,
}: {
  label: string;
  v: number;
  accent?: boolean;
}) {
  return (
    <div className={"pf-pctchip" + (accent ? " accent" : "")}>
      <span className="pf-pctchip-k">{label}</span>
      <span className="pf-pctchip-v tnum">{fmtDuration(v)}</span>
    </div>
  );
}

function FunctionTrendChart({
  fn,
  labels,
}: {
  fn: ProfileFunction;
  labels: string[];
}) {
  const ref = useECharts(profileTrendOption(fn.daySeries, labels, fn.color), [
    fn,
    labels,
  ]);
  return <div className="pf-trend-chart" ref={ref} />;
}

/* ---- Transactions tab ----------------------------------------------------- */

function TransactionsTab({ rows }: { rows: TxnRow[] }) {
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => r.transaction.toLowerCase().includes(q))
      : rows;
    const out = filtered.slice();
    out.sort((a, b) => (a.count - b.count) * sortDir);
    return out;
  }, [rows, search, sortDir]);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Transactions</h2>
        <span className="sub">endpoints · p-values are real latency</span>
        <div className="head-right">
          <input
            className="pf-search"
            placeholder="Search endpoints…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search endpoints"
          />
        </div>
      </div>
      <div className="table-wrap" style={{ maxHeight: 620 }}>
        {view.length ? (
          <table className="dt pf-tx-table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Host</th>
                <th className="num-r">P50()</th>
                <th className="num-r">P75()</th>
                <th className="num-r">P95()</th>
                <th className="num-r">P99()</th>
                <th className="num-r">Fail%</th>
                <th
                  className="num-r sortable sorted"
                  onClick={() => setSortDir((d) => (d === -1 ? 1 : -1))}
                >
                  Count{" "}
                  <span className="sort-ind">{sortDir === -1 ? "▼" : "▲"}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.id}>
                  <td className="pf-tx-name" title={r.transaction}>
                    {r.transaction}
                  </td>
                  <td>
                    <span className="ev-badge">
                      <span
                        className="ev-dot"
                        style={{ background: r.color }}
                      ></span>
                      {r.project}
                    </span>
                  </td>
                  <td className="num-r">{fmtDuration(r.p50)}</td>
                  <td className="num-r">{fmtDuration(r.p75)}</td>
                  <td className="num-r">{fmtDuration(r.p95)}</td>
                  <td className="num-r">{fmtDuration(r.p99)}</td>
                  <td className="num-r">
                    {r.failRate > 0 ? (
                      <span className="pf-fail-rate">{fmtPct(r.failRate)}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="num-r pf-tx-count">{fmtInt(r.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty" style={{ display: "flex" }}>
            <h3>No endpoints match</h3>
            <p>Try a different search term.</p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---- Failures tab --------------------------------------------------------- */

function codeClass(code: string): string {
  if (code.startsWith("5")) return "s5";
  if (code.startsWith("4")) return "s4";
  if (code === "0") return "s0";
  return "";
}
function codeLabel(code: string): string {
  return code === "0" ? "network/abort" : code;
}

function FailuresTab({
  rows,
  labels,
}: {
  rows: FailureRow[];
  labels: string[];
}) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Failures</h2>
        <span className="sub">failing endpoints · real result codes</span>
      </div>
      <div className="table-wrap" style={{ maxHeight: 620 }}>
        {rows.length ? (
          <table className="dt pf-tx-table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Host</th>
                <th>Result code</th>
                <th className="num-r">Fails</th>
                <th className="num-r">Fail%</th>
                <th className="num-r">p95 (fail)</th>
                <th>7-day</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="pf-tx-name" title={r.endpoint}>
                    {r.endpoint}
                  </td>
                  <td>
                    <span className="ev-badge">
                      <span
                        className="ev-dot"
                        style={{ background: r.color }}
                      ></span>
                      {r.target ?? "—"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={"pf-fail-code " + codeClass(r.topResultCode)}
                      title={`top failing result code (${labels.length}-day window)`}
                    >
                      {codeLabel(r.topResultCode)}
                    </span>
                  </td>
                  <td className="num-r pf-tx-count">{fmtInt(r.failCount)}</td>
                  <td className="num-r">
                    <span className="pf-fail-rate">{fmtPct(r.failRate)}</span>
                  </td>
                  <td className="num-r">{fmtDuration(r.p95Ms)}</td>
                  <td>
                    <span className="pf-fail-spark">
                      <Sparkline values={r.daySeries} color={r.color} danger />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty" style={{ display: "flex" }}>
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 8v5M12 16.5v.2"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M10.3 3.9L2.6 17.4A2 2 0 004.3 20.4h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
            <h3>No failed calls</h3>
            <p>Every dependency call in the window succeeded.</p>
          </div>
        )}
      </div>
    </section>
  );
}
