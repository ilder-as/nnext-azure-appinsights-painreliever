import { useDashboard } from "@/state/dashboard";

/**
 * ".refresh-btn" — re-fetches the latest export via useDashboard().refresh().
 * The ".loading" class drives the spinning icon (CSS), reflecting `refreshing`.
 * Markup mirrors index.html lines ~207-235.
 */
export function RefreshButton() {
  const { refresh, refreshing } = useDashboard();

  return (
    <button
      className={`refresh-btn${refreshing ? " loading" : ""}`}
      type="button"
      title="Reload the latest export (run extract.sh to pull fresh data)"
      aria-label="Reload latest data"
      onClick={refresh}
      disabled={refreshing}
    >
      <svg
        className="rb-icon"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M20 11a8 8 0 1 0-2.3 5.7"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path
          d="M20 5.5V11h-5.5"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="rb-label">Refresh</span>
    </button>
  );
}
