import type { KeyboardEvent } from "react";
import type { Dimension, Pair } from "@/lib/types";
import { fmtInt, fmtPct, FLAGS } from "@/lib/format";

/**
 * Distribution card for a single discovered dimension.
 *
 * Rendered once per `dimensions` entry by App. The `pairs` come straight from
 * the aggregate (agg.byDim[dim.key]), already sorted descending. Rows are
 * clickable to toggle that value as a filter on the dimension.
 */
export function BreakdownCard({
  dim,
  pairs,
  selected,
  onToggle,
}: {
  dim: Dimension;
  pairs: Pair[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  const LIMIT = 10;
  const grand = pairs.reduce((s, e) => s + e[1], 0) || 1;
  const max = pairs.length ? pairs[0][1] : 1;
  const shown = pairs.slice(0, LIMIT);

  return (
    <section className="card">
      <div className="card-head">
        <h2>{dim.label}</h2>
        {pairs.length > LIMIT ? (
          <span className="sub">
            top {LIMIT} of {pairs.length}
          </span>
        ) : null}
      </div>
      <div className="card-body">
        <div className="bd-list">
          {!pairs.length ? (
            <div className="empty" style={{ padding: "24px 8px" }}>
              <svg viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <path
                  d="M8 12h8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              <p>No data for this slice</p>
            </div>
          ) : (
            shown.map(([value, val], i) => {
              const pct = val / grand;
              const wPct = Math.max(2, (val / max) * 100);
              const isSel = selected.has(value);
              const isNull = value == null || value === "null";
              const flag =
                dim.key === "country" && !isNull ? FLAGS[value] || "🏳️" : "";

              const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(value);
                }
              };

              return (
                <div
                  key={value + "#" + i}
                  className={`bd-row${isSel ? " active" : ""}`}
                  data-key={value}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSel}
                  onClick={() => onToggle(value)}
                  onKeyDown={onKeyDown}
                >
                  <div className="bd-label">
                    {flag ? <span className="flag">{flag}</span> : null}
                    {isNull ? (
                      <span className="bd-name muted">no value</span>
                    ) : (
                      <span className="bd-name">{value}</span>
                    )}
                  </div>
                  <div className="bd-meta">
                    <span className="bd-count num">{fmtInt(val)}</span>
                    <span className="bd-pct num">{fmtPct(pct)}</span>
                  </div>
                  <div
                    className="bd-fill"
                    style={{ width: `calc((100% - 16px) * ${wPct / 100})` }}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
