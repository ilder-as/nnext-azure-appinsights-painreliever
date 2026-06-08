import { Fragment, useEffect, useRef, useState, type MouseEvent } from "react";
import { fmtDuration, fullTime } from "@/lib/format";
import type { TimelineItem } from "@/lib/types";

/**
 * Detail drawer for a single dependency (outbound HTTP/fetch) timeline item.
 * Mirrors EventDrawer's shell/markup so it reuses the same drawer CSS. Shows the
 * full untemplated request URL, real result code, duration, host, page and ids.
 */
export default function DependencyDrawer({
  item,
  onClose,
}: {
  item: TimelineItem | null;
  onClose: () => void;
}) {
  const drawerRef = useRef<HTMLElement | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy");
  const open = item !== null;

  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    setCopyLabel("Copy");
    const t = window.setTimeout(() => drawerRef.current?.focus(), 40);
    return () => {
      window.clearTimeout(t);
      const el = lastFocused.current;
      if (el && typeof el.focus === "function") el.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const fail = item?.status === "fail";
  const warn = item?.status === "warn";
  const code = item?.resultCode ?? null;
  const codeText = code === "0" || !code ? "aborted" : code;

  const copyUrl = (e: MouseEvent<HTMLButtonElement>) => {
    const text = item?.rawName ?? item?.name ?? "";
    const target = e.currentTarget;
    const done = () => {
      setCopyLabel("Copied!");
      window.setTimeout(() => setCopyLabel("Copy"), 1400);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(done)
        .catch(() => {
          target.textContent = "Copy failed";
        });
    } else {
      done();
    }
  };

  const fields: { label: string; value: string | null }[] = item
    ? [
        { label: "Result code", value: codeText },
        {
          label: "Outcome",
          value: fail ? "Failed" : warn ? "Aborted / cancelled" : "Success",
        },
        { label: "Duration", value: fmtDuration(item.durationMs ?? 0) },
        { label: "Host", value: item.host ?? null },
        { label: "Page", value: item.route },
        { label: "Operation ID", value: item.operationId ?? null },
        { label: "Time", value: fullTime(item.ts) },
      ]
    : [];

  return (
    <>
      <div className={`scrim${open ? " open" : ""}`} onClick={onClose}></div>
      <aside
        className={`drawer${open ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Dependency detail"
        tabIndex={-1}
        ref={drawerRef}
      >
        <div className="drawer-head">
          <div className="dh-top">
            <div className="dh-title">
              <div className="dh-event">
                {item ? (
                  <>
                    <span
                      className="ev-dot"
                      style={{
                        background: fail
                          ? "#ff5c6c"
                          : warn
                            ? "#ffb454"
                            : "#4dd2ff",
                      }}
                    ></span>
                    {item.name}
                    {fail ? (
                      <>
                        {" "}
                        <span className="fail-tag">failed</span>
                      </>
                    ) : warn ? (
                      <>
                        {" "}
                        <span className="warn-tag">aborted</span>
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
              <div className="dh-time">{item ? fullTime(item.ts) : ""}</div>
            </div>
            <button className="icon-btn" aria-label="Close" onClick={onClose}>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
        <div className="drawer-body">
          {item ? (
            <>
              {fail ? (
                <div className="fail-banner">
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
                  <div className="fb-text">
                    <b>Failed call</b>
                    {`Returned HTTP ${code} after ${fmtDuration(item.durationMs ?? 0)}.`}
                  </div>
                </div>
              ) : warn ? (
                <div className="fail-banner warn">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 9v4M12 16.4v.1"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                  </svg>
                  <div className="fb-text">
                    <b>Aborted / cancelled</b>
                    No HTTP response (resultCode 0) — typically a request the
                    browser cancelled (e.g. navigating away). Usually harmless.
                  </div>
                </div>
              ) : null}

              <p className="dsection-label">Request</p>
              <div className="json-box">
                <button className="json-copy" onClick={copyUrl}>
                  {copyLabel}
                </button>
                <pre className="dep-url">{item.rawName ?? item.name}</pre>
              </div>

              <p className="dsection-label">Call context</p>
              <div className="field-grid">
                {fields.map((f) => {
                  const isNull = f.value == null || f.value === "";
                  return (
                    <Fragment key={f.label}>
                      <div className="fk">{f.label}</div>
                      <div className={`fv${isNull ? " is-null" : ""}`}>
                        {isNull ? "null" : f.value}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </aside>
    </>
  );
}
