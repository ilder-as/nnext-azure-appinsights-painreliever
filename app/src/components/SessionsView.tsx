import { useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/state/dashboard";
import { sessionSlice, buildTimeline } from "@/lib/sessions";
import type { SessionTimeline } from "@/lib/types";
import { SessionList } from "./SessionList";
import { SessionReplay } from "./SessionReplay";

const EMPTY_TIMELINE: SessionTimeline = {
  items: [],
  realTotalMs: 0,
  playbackTotalMs: 0,
};

/**
 * Session trace ("session replay") feature. Composes the left session list with
 * the right replay panel for the currently selected session.
 *
 * The global search (filters.search) narrows the list to a single user — this is
 * how the Top-Users deep link (openUserSessions → search = email) lands here. An
 * empty search shows every session.
 */
export function SessionsView() {
  const { sessions, events, errors, filters } = useDashboard();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Filter sessions by the global search: case-insensitive substring over the
  // user identity + session id. Empty search ⇒ all sessions.
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => {
      const hay = `${s.authId ?? ""} ${s.userId ?? ""} ${s.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sessions, filters.search]);

  // Effective selection derived DURING render so it's never outside the filtered
  // list (no one-frame "no sessions" flash when the search narrows).
  const effectiveId =
    selectedId && filtered.some((s) => s.id === selectedId)
      ? selectedId
      : (filtered[0]?.id ?? null);

  // Persist the snap so the stored selection tracks what's shown.
  useEffect(() => {
    if (effectiveId !== selectedId) setSelectedId(effectiveId);
  }, [effectiveId, selectedId]);

  const selected = useMemo(
    () =>
      effectiveId ? (filtered.find((s) => s.id === effectiveId) ?? null) : null,
    [filtered, effectiveId],
  );

  const timeline = useMemo<SessionTimeline>(() => {
    if (!effectiveId) return EMPTY_TIMELINE;
    const slice = sessionSlice(events, errors, effectiveId);
    return buildTimeline(slice.events, slice.errors);
  }, [events, errors, effectiveId]);

  return (
    <div className="sessions-view">
      <SessionList
        sessions={filtered}
        selectedId={effectiveId}
        onSelect={setSelectedId}
      />
      {selected ? (
        // key by id → full remount per session resets cursor/playing/scroll
        <SessionReplay
          key={selected.id}
          session={selected}
          timeline={timeline}
        />
      ) : (
        <div className="sessions-empty">
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
          <h3>{filters.search.trim() ? "No sessions match" : "No sessions"}</h3>
        </div>
      )}
    </div>
  );
}
