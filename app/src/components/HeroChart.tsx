import { useState } from "react";
import { useDashboard } from "@/state/dashboard";
import { heroOption, type HeroMode } from "@/lib/chartOptions";
import { useECharts } from "@/lib/useECharts";

/**
 * "Events over time" hero card — ports renderHero (dashboard/js/app.js:490).
 * Daily volume of the top event types with a local Stacked/Total toggle.
 */
export function HeroChart() {
  const { agg } = useDashboard();
  const [mode, setMode] = useState<HeroMode>("stacked");

  const chartRef = useECharts(heroOption(agg, mode), [agg, mode]);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Events over time</h2>
        <span className="sub">daily volume, top event types</span>
        <div className="head-right">
          <div className="seg" id="heroSeg">
            <button
              className={`seg-btn${mode === "stacked" ? " active" : ""}`}
              data-mode="stacked"
              onClick={() => setMode("stacked")}
            >
              Stacked
            </button>
            <button
              className={`seg-btn${mode === "total" ? " active" : ""}`}
              data-mode="total"
              onClick={() => setMode("total")}
            >
              Total
            </button>
          </div>
        </div>
      </div>
      <div className="card-body">
        <div id="heroChart" className="chart" ref={chartRef} />
      </div>
    </section>
  );
}
