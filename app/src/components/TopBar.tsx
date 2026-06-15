import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboard } from "@/state/dashboard";
import { fmtDate } from "@/lib/format";
import { startOfUtcDay } from "@/lib/aggregate";
import { APP_NAME } from "@/config";
import type { DateRange } from "@/lib/types";
import { RefreshButton } from "./RefreshButton";

const DAY = 86400000;

/**
 * Relative "last refreshed" label. Ported verbatim from app.js refreshedLabel().
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

const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const fmtMs = (ms: number): string => fmtDate(new Date(ms).toISOString());

/**
 * Top bar: title, the date-range picker pill (presets + custom range that scope
 * the whole Overview), a "last refreshed" stamp, and refresh.
 */
export function TopBar() {
  const { meta, range, setRange } = useDashboard();
  const windowDays = meta?.windowDays ?? 14;

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const metaToMs = meta?.to ? Date.parse(meta.to) : null;
  const metaFromMs = meta?.from ? Date.parse(meta.from) : null;

  // Presets are relative to the data's latest timestamp (not wall clock).
  const presets: DateRange[] = useMemo(() => {
    if (metaToMs == null) return [];
    const dayStart = startOfUtcDay(metaToMs);
    const floor = metaFromMs ?? dayStart;
    const clamp = (ms: number) => Math.max(floor, ms);
    const lastN = (n: number): DateRange => ({
      fromMs: clamp(dayStart - (n - 1) * DAY),
      toMs: metaToMs,
      label: `Last ${n} days`,
    });
    const mon = (new Date(dayStart).getUTCDay() + 6) % 7; // Mon=0
    return [
      { fromMs: dayStart, toMs: metaToMs, label: "Today" },
      lastN(3),
      lastN(7),
      {
        fromMs: clamp(dayStart - mon * DAY),
        toMs: metaToMs,
        label: "This week",
      },
      lastN(14),
    ];
  }, [metaFromMs, metaToMs]);

  // Custom-range inputs (yyyy-mm-dd), seeded from the active range or full window.
  const [cFrom, setCFrom] = useState("");
  const [cTo, setCTo] = useState("");
  useEffect(() => {
    if (!open) return;
    setCFrom(isoDay(range?.fromMs ?? metaFromMs ?? Date.now()));
    setCTo(isoDay(range?.toMs ?? metaToMs ?? Date.now()));
  }, [open, range, metaFromMs, metaToMs]);

  // Only one dropdown open at a time (shared with the FilterBar menus).
  useEffect(() => {
    const onOpenOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== "daterange") setOpen(false);
    };
    document.addEventListener("menu-open", onOpenOther);
    return () => document.removeEventListener("menu-open", onOpenOther);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (r: DateRange | null) => {
    setRange(r);
    setOpen(false);
  };

  const applyCustom = () => {
    if (!cFrom || !cTo) return;
    let fromMs = Date.parse(cFrom + "T00:00:00Z");
    let toMs = Date.parse(cTo + "T23:59:59.999Z");
    if (!isFinite(fromMs) || !isFinite(toMs)) return;
    if (fromMs > toMs) [fromMs, toMs] = [toMs, fromMs];
    if (metaFromMs != null) fromMs = Math.max(fromMs, metaFromMs);
    if (metaToMs != null) toMs = Math.min(toMs, metaToMs);
    pick({ fromMs, toMs, label: "Custom" });
  };

  const label = range ? range.label : `Last ${windowDays} days`;
  const rangeText = range
    ? `${fmtMs(range.fromMs)} – ${fmtMs(range.toMs)}`
    : meta?.from && meta?.to
      ? `${fmtDate(meta.from)} – ${fmtDate(meta.to)}`
      : "";
  const minD = metaFromMs != null ? isoDay(metaFromMs) : undefined;
  const maxD = metaToMs != null ? isoDay(metaToMs) : undefined;

  return (
    <header className="topbar">
      <h1>{APP_NAME}</h1>
      <div className="dropdown" ref={rootRef}>
        <button
          className={"window-pill" + (range ? " active" : "")}
          aria-haspopup="true"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            const next = !open;
            if (next)
              document.dispatchEvent(
                new CustomEvent("menu-open", { detail: "daterange" }),
              );
            setOpen(next);
          }}
        >
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
          <span>{label}</span>
          <span className="win-range">{rangeText}</span>
          <svg className="chev" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div
          className={"menu date-menu" + (open ? " open" : "")}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="menu-head">
            <span>Date range</span>
            {range ? (
              <a
                role="button"
                tabIndex={0}
                onClick={() => pick(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") pick(null);
                }}
              >
                reset
              </a>
            ) : null}
          </div>

          <div
            className={"menu-item date-item" + (!range ? " sel" : "")}
            role="menuitemradio"
            aria-checked={!range}
            tabIndex={0}
            onClick={() => pick(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                pick(null);
              }
            }}
          >
            <span className="mi-label">Last {windowDays} days</span>
            <span className="mi-sub">full window</span>
          </div>

          {presets.map((p) => {
            const on = range?.label === p.label;
            return (
              <div
                key={p.label}
                className={"menu-item date-item" + (on ? " sel" : "")}
                role="menuitemradio"
                aria-checked={on}
                tabIndex={0}
                onClick={() => pick(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pick(p);
                  }
                }}
              >
                <span className="mi-label">{p.label}</span>
                <span className="mi-sub">
                  {fmtMs(p.fromMs)} – {fmtMs(p.toMs)}
                </span>
              </div>
            );
          })}

          <div className="date-custom">
            <div className="dc-label">Custom range</div>
            <div className="dc-row">
              <input
                type="date"
                aria-label="From date"
                min={minD}
                max={maxD}
                value={cFrom}
                onChange={(e) => setCFrom(e.target.value)}
              />
              <span className="dc-dash">–</span>
              <input
                type="date"
                aria-label="To date"
                min={minD}
                max={maxD}
                value={cTo}
                onChange={(e) => setCTo(e.target.value)}
              />
            </div>
            <button
              className="dc-apply"
              onClick={applyCustom}
              disabled={!cFrom || !cTo}
            >
              Apply range
            </button>
          </div>
        </div>
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
