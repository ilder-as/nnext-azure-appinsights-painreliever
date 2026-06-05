import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Html } from "@/components/Html";
import { avatarFor, displayName, fmtInt, fullTime } from "@/lib/format";
import type { Session, SessionTimeline } from "@/lib/types";
import { TimelineIcon } from "./TimelineIcon";

/* clamp a number into [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/* ms → "m:ss" (minutes with no leading pad, seconds zero-padded). */
function fmtClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const SPEEDS = [1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];

export function SessionReplay({
  session,
  timeline,
}: {
  session: Session;
  timeline: SessionTimeline;
}) {
  const { items, playbackTotalMs } = timeline;
  const single = playbackTotalMs <= 0 || items.length <= 1;

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [cursorMs, setCursorMs] = useState(0);

  // rAF bookkeeping (ids / last frame timestamp) lives in refs so the loop is
  // not torn down on every cursor tick.
  const rafId = useRef<number | null>(null);
  const lastTs = useRef<number | null>(null);

  // Timeline scroll container + per-row refs for "scroll current into view".
  const listRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Pointer-drag state for the scrub track.
  const dragging = useRef(false);
  const trackRef = useRef<HTMLDivElement | null>(null);

  // Reset everything when the session/timeline changes.
  useEffect(() => {
    setCursorMs(0);
    setPlaying(false);
    lastTs.current = null;
  }, [timeline]);

  // currentIndex = largest i with items[i].playbackMs <= cursorMs (>= 0).
  let currentIndex = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i].playbackMs <= cursorMs) currentIndex = i;
    else break;
  }

  // The rAF playback loop — only mounted while `playing`.
  useEffect(() => {
    if (!playing) return;
    const tick = (now: number) => {
      const prev = lastTs.current;
      lastTs.current = now;
      if (prev != null) {
        const frameDelta = now - prev;
        // Pure updater: just advance + clamp. Stopping at the end is handled by
        // the effect below (so we don't call setPlaying from inside an updater).
        setCursorMs((c) => Math.min(c + frameDelta * speed, playbackTotalMs));
      }
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
      rafId.current = null;
      lastTs.current = null;
    };
  }, [playing, speed, playbackTotalMs]);

  // Stop playback once the cursor reaches the end (outside the updater).
  useEffect(() => {
    if (playing && !single && cursorMs >= playbackTotalMs) setPlaying(false);
  }, [playing, single, cursorMs, playbackTotalMs]);

  // Scroll the current row into view inside the timeline (never the page).
  useLayoutEffect(() => {
    const row = rowRefs.current[currentIndex];
    if (row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentIndex]);

  const pct = single ? 0 : clamp(cursorMs / playbackTotalMs, 0, 1) * 100;

  const togglePlay = () => {
    if (single) return;
    setPlaying((p) => {
      const next = !p;
      if (next) {
        // Restart from the top if we were parked at the end.
        if (cursorMs >= playbackTotalMs) setCursorMs(0);
        lastTs.current = null;
      }
      return next;
    });
  };

  const seekToFraction = (clientX: number) => {
    const el = trackRef.current;
    if (!el || single) return;
    const rect = el.getBoundingClientRect();
    const frac = clamp((clientX - rect.left) / rect.width, 0, 1);
    setCursorMs(frac * playbackTotalMs);
  };

  const onTrackDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (single) return;
    dragging.current = true;
    setPlaying(false);
    e.currentTarget.setPointerCapture(e.pointerId);
    seekToFraction(e.clientX);
  };
  const onTrackMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    seekToFraction(e.clientX);
  };
  const onTrackUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const seekToItem = (playbackMs: number) => {
    setPlaying(false);
    setCursorMs(playbackMs);
  };

  const av = avatarFor(session.authId);
  const shortId = session.id.length > 10 ? session.id.slice(0, 8) : session.id;

  return (
    <section className="session-replay">
      <div className="replay-head">
        <div className="replay-title">
          <span className="avatar" style={{ background: av.color }}>
            {av.init}
          </span>
          <span className="name">{displayName(session.authId)}</span>
          <span className="sid">{shortId}</span>
        </div>
        <div className="replay-facts">
          <span>
            start <b>{fullTime(session.start)}</b>
          </span>
          <span>
            duration <b>{fmtClock(session.durationMs)}</b>
          </span>
          <span>
            events <b>{fmtInt(session.eventCount)}</b>
          </span>
          {session.errorCount > 0 ? (
            <span>
              errors <b>{fmtInt(session.errorCount)}</b>
            </span>
          ) : null}
          {session.browser ? (
            <span>
              browser <b>{session.browser}</b>
            </span>
          ) : null}
          {session.os ? (
            <span>
              os <b>{session.os}</b>
            </span>
          ) : null}
          {session.deviceType ? (
            <span>
              device <b>{session.deviceType}</b>
            </span>
          ) : null}
        </div>
      </div>

      <div className="scrubber">
        <div className="scrub-controls">
          <button
            className="scrub-play"
            onClick={togglePlay}
            disabled={single}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 7 5.5z" />
              </svg>
            )}
          </button>
          <span className="scrub-time">
            {fmtClock(cursorMs)} / {fmtClock(playbackTotalMs)}
          </span>
          <div className="scrub-speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                className={s === speed ? "on" : undefined}
                onClick={() => setSpeed(s)}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
        <div
          className="scrub-track"
          ref={trackRef}
          onPointerDown={onTrackDown}
          onPointerMove={onTrackMove}
          onPointerUp={onTrackUp}
          onPointerCancel={onTrackUp}
        >
          <div className="scrub-rail" />
          <div className="scrub-fill" style={{ width: `${pct}%` }} />
          {items.map((it) => (
            <div
              key={it.id}
              className={`scrub-tick k-${it.kind}`}
              style={{
                left: single
                  ? "0%"
                  : `${(it.playbackMs / playbackTotalMs) * 100}%`,
              }}
            />
          ))}
          <div className="scrub-cursor" style={{ left: `${pct}%` }} />
        </div>
      </div>

      <div className="replay-timeline" ref={listRef}>
        {items.map((it, i) => {
          const cls = [
            "tl-item",
            i === currentIndex ? "current" : "",
            it.status === "fail" ? "fail" : "",
            `k-${it.kind}`,
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={it.id}
              className={cls}
              data-id={it.id}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              onClick={() => seekToItem(it.playbackMs)}
            >
              <div className="tl-time">+{fmtClock(it.offsetMs)}</div>
              <div className="tl-icon">
                <TimelineIcon item={it} />
              </div>
              <div className="tl-body">
                <div className="tl-name">{it.name}</div>
                <Html className="tl-summary" html={it.summaryHtml} as="div" />
                {it.route ? <div className="tl-route">{it.route}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
