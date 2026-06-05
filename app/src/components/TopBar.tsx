import { useDashboard } from "@/state/dashboard";
import { fmtDate } from "@/lib/format";
import { APP_NAME } from "@/config";
import { RefreshButton } from "./RefreshButton";

/**
 * Relative "last refreshed" label. Ported verbatim from app.js refreshedLabel().
 * Computed against the current wall clock at render time.
 */
function refreshedLabel(genAt: string | null | undefined): string {
  if (!genAt) return "just now";
  const diff = (Date.now() - Date.parse(genAt)) / 1000;
  if (!isFinite(diff)) return "just now";
  if (diff < 90) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

/**
 * Top bar (".topbar", index.html lines ~179-235): page title, the window pill
 * (window length + date range), a "last refreshed" stamp, and the refresh button.
 */
export function TopBar() {
  const { meta } = useDashboard();
  const windowDays = meta?.windowDays ?? 14;

  return (
    <header className="topbar">
      <h1>{APP_NAME}</h1>
      <div className="window-pill">
        <svg className="cal" viewBox="0 0 24 24" fill="none">
          <rect
            x="3"
            y="4.5"
            width="18"
            height="16"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path
            d="M3 9h18M8 2.5v4M16 2.5v4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
        <span>Last {windowDays} days</span>
        <span className="win-range">
          {meta?.from && meta?.to
            ? `${fmtDate(meta.from)} – ${fmtDate(meta.to)}`
            : ""}
        </span>
      </div>
      <div className="spacer"></div>
      <div className="refreshed">
        <span className="pulse"></span>Last refreshed{" "}
        <span className="num">{refreshedLabel(meta?.generatedAt)}</span>
      </div>
      <RefreshButton />
    </header>
  );
}
