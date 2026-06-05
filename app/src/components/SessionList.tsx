import type { KeyboardEvent } from "react";
import type { Session } from "@/lib/types";
import { avatarFor, displayName, fmtInt, fullTime } from "@/lib/format";

/** ms → "Xm Ys" (drops the seconds when zero) or "Xs" for sub-minute spans. */
function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/**
 * Scannable list of sessions for the session-trace view. Selecting a row
 * (click / Enter / Space) raises `onSelect(session.id)`; the active row is
 * highlighted. Purely presentational — sessions arrive pre-sorted.
 */
export function SessionList({
  sessions,
  selectedId,
  onSelect,
}: {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const onKeyDown = (id: string) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(id);
    }
  };

  return (
    <div className="session-list">
      <div className="session-list-head">
        <h2>Sessions</h2>
        <span className="sub">{fmtInt(sessions.length)} total</span>
      </div>
      <div className="session-list-scroll">
        {sessions.map((s) => {
          const av = avatarFor(s.authId);
          return (
            <div
              key={s.id}
              className={"session-row" + (s.id === selectedId ? " active" : "")}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(s.id)}
              onKeyDown={onKeyDown(s.id)}
            >
              <span className="avatar" style={{ background: av.color }}>
                {av.init}
              </span>
              <div className="sr-main">
                <div className="sr-user">{displayName(s.authId)}</div>
                <div className="sr-meta">
                  {fullTime(s.start)} · {fmtDuration(s.durationMs)}{" "}
                  <span className="route">
                    {s.entryRoute ?? "/"} → {s.lastRoute ?? "/"}
                  </span>
                </div>
              </div>
              <div className="sr-stats">
                <span className="sr-count">{fmtInt(s.eventCount)} events</span>
                {s.errorCount > 0 ? (
                  <span className="sr-err">{s.errorCount} err</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
