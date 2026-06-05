import { useMemo, type KeyboardEvent } from "react";
import { useDashboard } from "@/state/dashboard";
import { donutData, donutOption } from "@/lib/chartOptions";
import { useECharts } from "@/lib/useECharts";
import { fmtInt, fmtPct } from "@/lib/format";

/**
 * "Event breakdown" donut card — ports renderDonut (dashboard/js/app.js:595).
 * Click a slice or a legend row to toggle that event-type filter ("Other"
 * is inert). Legend rows are keyboard-accessible (Enter / Space).
 */
export function DonutChart() {
  const { agg, derived, filters, toggleEvent } = useDashboard();
  const colorMap = derived.colorMap;

  const option = useMemo(() => donutOption(agg, colorMap), [agg, colorMap]);
  const { slices, grand } = useMemo(
    () => donutData(agg, colorMap),
    [agg, colorMap],
  );

  const chartRef = useECharts(option, [agg, colorMap], (p) => {
    if (p.name && p.name !== "Other") toggleEvent(p.name);
  });

  const toggle = (name: string) => {
    if (name !== "Other") toggleEvent(name);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, name: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(name);
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>Event breakdown</h2>
        <span className="sub">click to filter</span>
      </div>
      <div className="card-body">
        <div id="donutChart" className="chart" ref={chartRef} />
        <div id="donutLegend" className="bd-list" style={{ marginTop: 10 }}>
          {slices.map((d) => {
            const sel = filters.events.has(d.name);
            return (
              <div
                key={d.name}
                className={`bd-row${sel ? " active" : ""}`}
                data-type={d.name}
                tabIndex={0}
                role="button"
                aria-pressed={sel}
                onClick={() => toggle(d.name)}
                onKeyDown={(e) => onKeyDown(e, d.name)}
              >
                <div className="bd-label">
                  <span className="ev-dot" style={{ background: d.color }} />
                  <span className="bd-name">{d.name}</span>
                </div>
                <div className="bd-meta">
                  <span className="bd-count num">{fmtInt(d.value)}</span>
                  <span className="bd-pct num">{fmtPct(d.value / grand)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
