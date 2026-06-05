import { useDashboard } from "@/state/dashboard";
import { deltaGlyph, kpiIcon, sparkProxy, trendDelta } from "@/lib/kpi";
import { fmtInt, fmtPct } from "@/lib/format";
import { Sparkline } from "./Sparkline";

interface KpiCard {
  label: string;
  icon: string;
  color: string;
  value: string;
  spark: number[];
  danger?: boolean;
  sub?: string;
  dir: "up" | "down" | "flat";
  delta: string;
}

/**
 * KPI row — ports renderKPIs (dashboard/js/app.js:317). Five cards with
 * variant-c sparklines + ▲/▼ delta graft. Total/Users/Sessions compute their
 * own trendDelta; Event types is static "stable"; Failures uses a static label
 * and a sparkProxy-shaped sparkline.
 */
export function KpiRow() {
  const { agg, meta, derived } = useDashboard();

  const totalEvents = agg.rows.length;
  const failRate = totalEvents ? agg.failures / totalEvents : 0;

  const dailyTotals = agg.dayTotals;
  const usersSpark = agg.dayUsers;
  const sessSpark = agg.daySessions;
  const failSpark = sparkProxy(dailyTotals, agg.failures);

  const delta = trendDelta(dailyTotals);
  const usersDelta = trendDelta(usersSpark);
  const sessDelta = trendDelta(sessSpark);

  const cards: KpiCard[] = [
    {
      label: "Total events",
      icon: "M3 12h4l2 6 4-14 2 8h6",
      color: "#7c5cff",
      value: fmtInt(totalEvents),
      spark: dailyTotals,
      ...delta,
    },
    {
      label: "Unique users",
      icon: "CIRC",
      color: "#4dd2ff",
      value: fmtInt(agg.uniqueUsers),
      spark: usersSpark,
      sub: `${fmtInt(agg.anonUsers)} anon`,
      ...usersDelta,
    },
    {
      label: "Sessions",
      icon: "M4 12a8 8 0 0116 0",
      color: "#b388ff",
      value: fmtInt(agg.sessions),
      spark: sessSpark,
      sub: agg.sessions
        ? `${(totalEvents / agg.sessions).toFixed(1)} ev/session`
        : "",
      ...sessDelta,
    },
    {
      label: "Event types",
      icon: "GRID",
      color: "#4ee6a8",
      value: fmtInt(agg.eventTypes),
      spark: dailyTotals.map(() => agg.eventTypes),
      sub: `of ${meta?.eventTypes?.length ?? derived.typeOrder.length} tracked`,
      dir: "flat",
      delta: "stable",
    },
    {
      label: "Failure events",
      icon: "WARN",
      color: "#ff5c6c",
      danger: true,
      value: fmtInt(agg.failures),
      spark: failSpark,
      sub: `${fmtPct(failRate)} of total`,
      dir: "flat",
      delta: "failures",
    },
  ];

  return (
    <div className="kpi-row" id="kpiRow">
      {cards.map((c) => {
        const stroke = c.danger ? "var(--danger)" : "var(--accent)";
        return (
          <div className={`kpi${c.danger ? " danger" : ""}`} key={c.label}>
            <div className="kpi-label">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke={stroke}
                dangerouslySetInnerHTML={{ __html: kpiIcon(c.icon) }}
              />
              {c.label}
            </div>
            <div className="kpi-value tnum">{c.value}</div>
            <div className="kpi-foot">
              <span className={`kpi-delta ${c.dir}`}>
                {deltaGlyph(c.dir)} {c.delta}
                {c.sub ? (
                  <>
                    {" "}
                    <span className="delta-sub">· {c.sub}</span>
                  </>
                ) : null}
              </span>
              <Sparkline values={c.spark} color={c.color} danger={c.danger} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
