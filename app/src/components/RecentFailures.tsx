import type { KeyboardEvent } from "react";
import { useDashboard } from "@/state/dashboard";
import type { AppEvent } from "@/lib/types";
import { failureMessage, fmtInt, isFailure, relTime } from "@/lib/format";

/**
 * Recent failures list — ports renderFailures (app.js:805) and the #failCard
 * markup (index.html:547). Newest failure rows from the matched slice
 * (agg.rows, already newest-first), capped at 6. The detail line prefers a real
 * prop message, falling back to failureMessage(ev). Clicking a row (or Enter /
 * Space) opens the drawer via onSelect(ev). Empty → "All clear".
 */
export function RecentFailures({
  onSelect,
}: {
  onSelect: (ev: AppEvent) => void;
}) {
  const { agg, derived } = useDashboard();
  const fails = agg.rows.filter((e) => isFailure(e.name)).slice(0, 6);

  return (
    <section className="card" id="failCard">
      <div className="card-head">
        <h2>Recent failures</h2>
        <span className="sub" id="failSub">
          {fmtInt(agg.failures)} in slice
        </span>
      </div>
      <div className="card-body" id="failBody" style={{ padding: "8px 10px" }}>
        {!fails.length ? (
          <div className="empty" style={{ padding: "22px 8px" }}>
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M9 12l2 2 4-4"
                stroke="var(--success)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
            <h3 style={{ color: "var(--success)" }}>All clear</h3>
            <p>No failure events in this slice.</p>
          </div>
        ) : (
          fails.map((ev, i) => {
            const p = ev.props || {};
            const detail =
              p.detail ||
              p.errorMessage ||
              p.error ||
              p.title ||
              failureMessage(ev);
            const tag = ev.name.replace(/([A-Z])/g, " $1").trim();
            const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(ev);
              }
            };
            return (
              <div
                key={
                  ev.timestamp +
                  ev.name +
                  (ev.sessionId ?? "") +
                  (ev.userId ?? "") +
                  "#" +
                  i
                }
                className="bd-row"
                data-ts={ev.timestamp}
                tabIndex={0}
                role="button"
                style={{
                  gridTemplateColumns: "1fr",
                  gap: "3px",
                  alignItems: "flex-start",
                  padding: "9px 10px",
                }}
                onClick={() => onSelect(ev)}
                onKeyDown={onKeyDown}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                  }}
                >
                  <span className="fail-tag">{tag}</span>
                  <span
                    className="ts-cell muted"
                    style={{ marginLeft: "auto" }}
                  >
                    {relTime(ev.timestamp, derived.now)}
                  </span>
                </div>
                <div
                  style={{
                    color: "var(--tx-2)",
                    fontSize: "11.5px",
                    width: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={detail}
                >
                  {detail}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
