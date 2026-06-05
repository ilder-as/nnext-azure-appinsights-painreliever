import { useEffect, useState } from "react";
import { useDashboard } from "@/state/dashboard";
import { Html } from "@/components/Html";
import {
  avatarFor,
  displayName,
  fmtInt,
  isFailure,
  relTime,
  shortTime,
  summarize,
} from "@/lib/format";
import type { SortKey, AppEvent } from "@/lib/types";

const PAGE_SIZE = 100; // explorer rows rendered per page (never all at once)

/* Sortable header columns — order + labels mirror the original index.html thead. */
const SORT_COLS: { key: SortKey; label: string }[] = [
  { key: "timestamp", label: "Time" },
  { key: "name", label: "Event" },
  { key: "authId", label: "User" },
  { key: "operation", label: "Operation" },
];

export default function EventsExplorer({
  onSelect,
}: {
  onSelect: (ev: AppEvent) => void;
}) {
  const {
    explorer,
    filters,
    derived,
    meta,
    events,
    anyFilterActive,
    setFailOnly,
    setSort,
    clearAll,
  } = useDashboard();

  // Local pagination — render only the first `visibleCount` rows to the DOM.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Reset paging whenever the explorer array identity changes (filter/sort/data).
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [explorer]);

  const { colorMap, now } = derived;
  const total = explorer.length;
  const shown = Math.min(visibleCount, total);
  const rows = explorer.slice(0, shown);

  const fullWindow = meta ? meta.totalEvents : events.length;
  const showFullWindow = !anyFilterActive && !filters.failOnly;

  const allShown = shown >= total;
  const remaining = total - shown;

  return (
    <section className="card" id="explorerCard">
      <div className="card-head explorer-head">
        <h2>Events explorer</h2>
        <span className="sub live" id="explorerSub">
          {filters.failOnly ? "— failures only" : "— newest first"}
        </span>
        <div className="head-right">
          {/* explorer-local All / Failures only toggle */}
          <div
            className="fail-toggle"
            id="failToggle"
            role="group"
            aria-label="Explorer view"
          >
            <button
              className={filters.failOnly ? "" : "on"}
              data-fail="all"
              onClick={() => setFailOnly(false)}
            >
              All
            </button>
            <button
              className={filters.failOnly ? "on" : ""}
              data-fail="fail"
              onClick={() => setFailOnly(true)}
            >
              Failures only
            </button>
          </div>
        </div>
      </div>

      <div className="table-wrap" style={{ maxHeight: 560 }} id="explorerWrap">
        {total > 0 ? (
          <table className="dt" id="explorerTable">
            <thead>
              <tr>
                {SORT_COLS.map(({ key, label }) => {
                  const on = filters.sortKey === key;
                  return (
                    <th
                      key={key}
                      data-sort={key}
                      className={on ? "sorted" : undefined}
                      onClick={() => setSort(key)}
                    >
                      {label}{" "}
                      <span className="sort-ind">
                        {filters.sortDir === -1 ? "▼" : "▲"}
                      </span>
                    </th>
                  );
                })}
                <th>Summary</th>
              </tr>
            </thead>
            <tbody id="explorerBody">
              {rows.map((ev, i) => {
                const fail = isFailure(ev.name);
                const av = avatarFor(ev.authId);
                const onActivate = () => onSelect(ev);
                return (
                  <tr
                    key={
                      ev.timestamp +
                      ev.name +
                      (ev.sessionId ?? "") +
                      (ev.userId ?? "") +
                      "#" +
                      i
                    }
                    data-idx={i}
                    className={fail ? "row-failrow" : ""}
                    tabIndex={0}
                    onClick={onActivate}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onActivate();
                      }
                    }}
                  >
                    <td className="ts-cell">
                      {shortTime(ev.timestamp)}{" "}
                      <span className="ts-rel">
                        · {relTime(ev.timestamp, now)}
                      </span>
                    </td>
                    <td>
                      <span className={`ev-badge ${fail ? "fail" : ""}`}>
                        <span
                          className="ev-dot"
                          style={{
                            background: colorMap[ev.name] || "#8b8b9e",
                          }}
                        ></span>
                        {ev.name}
                        {fail ? (
                          <>
                            {" "}
                            <span className="fail-tag">fail</span>
                          </>
                        ) : null}
                      </span>
                    </td>
                    <td>
                      <div className="user-cell">
                        {ev.authId ? (
                          <>
                            <span
                              className="avatar"
                              style={{ background: av.color }}
                            >
                              {av.init}
                            </span>
                            <span className="user-name">
                              {displayName(ev.authId)}
                            </span>
                          </>
                        ) : (
                          <span className="muted">Anonymous</span>
                        )}
                      </div>
                    </td>
                    <td className="op-cell" title={ev.operation || ""}>
                      {ev.operation ? (
                        ev.operation
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="summary-cell">
                      <Html html={summarize(ev)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty" id="explorerEmpty" style={{ display: "flex" }}>
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
            <h3>No events match</h3>
            <p>
              Try widening your event-type or dimension selection, or clearing
              the search term.
            </p>
            {anyFilterActive || filters.failOnly ? (
              <button id="emptyClear" onClick={clearAll}>
                Clear all filters
              </button>
            ) : null}
          </div>
        )}
      </div>

      {total > 0 ? (
        <div
          className="explorer-foot"
          id="explorerFoot"
          style={{ display: "flex" }}
        >
          <span id="footStatus">
            Showing <b className="tnum">{fmtInt(shown)}</b> of{" "}
            <b className="tnum">{fmtInt(total)}</b> matched
            {showFullWindow ? (
              <>
                {" "}
                · <b className="tnum">{fmtInt(fullWindow)}</b> in full window
              </>
            ) : null}
          </span>
          <span className="foot-spacer"></span>
          <button
            className="load-more"
            id="loadMore"
            disabled={allShown}
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          >
            {allShown
              ? "All rows shown"
              : `Load ${Math.min(PAGE_SIZE, remaining)} more`}
          </button>
        </div>
      ) : null}
    </section>
  );
}
