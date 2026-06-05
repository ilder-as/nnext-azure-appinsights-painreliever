import { useDashboard } from "@/state/dashboard";

/**
 * Full-screen boot overlay (".boot", index.html lines ~16-41). Rendered only
 * while status !== 'ready'. The CSS toggles the spinner / error icon via the
 * ".error" modifier class.
 *
 *  - loading: spinner + "Loading telemetry…"
 *  - empty:   "No events in this window" + widen-window hint (see app.js showEmpty)
 *  - error:   ".error" modifier + run-the-extractor instructions (app.js showError)
 */
export function BootOverlay() {
  const { status } = useDashboard();
  if (status === "ready") return null;

  const isError = status === "error";
  const isEmpty = status === "empty";

  let title = "Loading telemetry…";
  if (isError) title = "Couldn’t load telemetry data";
  else if (isEmpty) title = "No events in this window";

  return (
    <div
      className={`boot${isError ? " error" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="spinner" aria-hidden="true"></div>
      <div className="boot-err-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M12 8v5M12 16.4v.1"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <path
            d="M10.3 4.4L3 17a2 2 0 001.7 3h14.6a2 2 0 001.7-3L13.7 4.4a2 2 0 00-3.4 0z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      </div>
      <div className="boot-title">{title}</div>
      <div className="boot-sub">
        {isError ? (
          <>
            The dashboard needs <span className="mono">./data/meta.json</span>{" "}
            and <span className="mono">./data/events.json</span>. Generate them
            first by running:
          </>
        ) : isEmpty ? (
          <>
            <span className="mono">./data/events.json</span> loaded but contains
            no events for the selected window. Re-run the extractor with a wider
            window, e.g.{" "}
            <span className="mono">WINDOW_DAYS=30 ../extract/extract.sh</span>.
          </>
        ) : (
          "Reading ./data/events.json and computing aggregates"
        )}
      </div>
      {isError && <pre className="boot-cmd">../extract/extract.sh</pre>}
    </div>
  );
}
