import { useState } from "react";
import type { AppEvent } from "@/lib/types";
import { useDashboard } from "@/state/dashboard";
import { APP_NAME } from "@/config";
import { fmtInt } from "@/lib/format";
import { BootOverlay } from "@/components/BootOverlay";
import { NavRail } from "@/components/NavRail";
import { TopBar } from "@/components/TopBar";
import { FilterBar } from "@/components/FilterBar";
import { KpiRow } from "@/components/KpiRow";
import { HeroChart } from "@/components/HeroChart";
import { DonutChart } from "@/components/DonutChart";
import { BreakdownCard } from "@/components/BreakdownCard";
import { TopUsers } from "@/components/TopUsers";
import { RecentFailures } from "@/components/RecentFailures";
import { SessionsView } from "@/components/SessionsView";
import { ProfilesView } from "@/components/ProfilesView";
import EventsExplorer from "@/components/EventsExplorer";
import EventDrawer from "@/components/EventDrawer";

/**
 * Application shell — ports the static layout in dashboard/index.html.
 * Renders <BootOverlay/> while status !== 'ready' (mirrors #boot vs #app
 * toggling), then the ".app" grid (rail + main) once data is ready. Owns the
 * event-drawer selection state per the component contract.
 */
const EMPTY = new Set<string>();

export default function App() {
  const { status, meta, events, dimensions, agg, filters, toggleDim, view } =
    useDashboard();
  const [selected, setSelected] = useState<AppEvent | null>(null);

  if (status !== "ready") return <BootOverlay />;

  const resource = meta?.resource ?? "App Insights";
  const totalEvents = meta?.totalEvents ?? events.length;
  const windowDays = meta?.windowDays ?? 14;

  return (
    <>
      <div className="app">
        <NavRail />

        <main className="main">
          <TopBar />
          {/* The Profiles pivot is computed over the full unfiltered dataset, so
              the global filter bar would be misleading there — hide it. */}
          {view !== "profiles" && <FilterBar />}

          <div className="content">
            {view === "sessions" ? (
              <SessionsView />
            ) : view === "profiles" ? (
              <ProfilesView />
            ) : (
              <>
                <KpiRow />

                <div className="grid-2">
                  <HeroChart />
                  <DonutChart />
                </div>

                <div className="grid-4" id="breakdownGrid">
                  {dimensions.map((d) => (
                    <BreakdownCard
                      key={d.key}
                      dim={d}
                      pairs={agg.byDim[d.key] ?? []}
                      selected={filters.dims[d.key] ?? EMPTY}
                      onToggle={(v) => toggleDim(d.key, v)}
                    />
                  ))}
                </div>

                <div className="grid-explorer">
                  <EventsExplorer onSelect={setSelected} />

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                      minWidth: 0,
                    }}
                  >
                    <TopUsers />
                    <RecentFailures onSelect={setSelected} />
                  </div>
                </div>

                <div className="foot">
                  <span>{resource}</span>
                  <span className="dot-sep"></span>{" "}
                  <span>
                    {fmtInt(totalEvents)} events · {windowDays}-day window
                  </span>
                  <span className="dot-sep"></span> <span>{APP_NAME}</span>
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      <EventDrawer event={selected} onClose={() => setSelected(null)} />
    </>
  );
}
