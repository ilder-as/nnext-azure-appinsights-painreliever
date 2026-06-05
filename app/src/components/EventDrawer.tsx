import { Fragment, useEffect, useRef, useState, type MouseEvent } from "react";
import { useDashboard } from "@/state/dashboard";
import { Html } from "@/components/Html";
import {
  avatarFor,
  esc,
  failureMessage,
  FLAGS,
  fullTime,
  isFailure,
  relTime,
  summarize,
  syntaxJson,
} from "@/lib/format";
import type { AppEvent } from "@/lib/types";

/* One field row in the "Event context" grid. `html` entries are intentionally
   pre-composed, trusted markup (see openDrawer); everything else is a plain
   value that React escapes when rendered as a text node. */
type Field =
  | { label: string; value: string | null }
  | { label: string; html: string };

export default function EventDrawer({
  event,
  onClose,
}: {
  event: AppEvent | null;
  onClose: () => void;
}) {
  const { derived } = useDashboard();
  const drawerRef = useRef<HTMLElement | null>(null);
  // The element focused before the drawer opened — restore focus to it on close.
  const lastFocused = useRef<HTMLElement | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy");

  const open = event !== null;

  // Capture the previously focused element, move focus into the dialog, and
  // restore focus on close — matching the original modal focus management.
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

  // Close on Esc while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const fail = event ? isFailure(event.name) : false;
  const p = event?.props ?? {};
  const av = event ? avatarFor(event.authId) : null;
  const { colorMap, now } = derived;

  const copyJson = (e: MouseEvent<HTMLButtonElement>) => {
    const text = JSON.stringify(p, null, 2);
    const target = e.currentTarget;
    const done = () => {
      setCopyLabel("Copied!");
      window.setTimeout(() => setCopyLabel("Copy"), 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
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

  // Field list + order mirror openDrawer exactly. User/Country are trusted html.
  const fields: Field[] =
    event && av
      ? [
          event.authId
            ? {
                label: "User",
                html: `<span class="uflag"><span class="avatar" style="width:16px;height:16px;font-size:8px;display:inline-grid;vertical-align:middle;background:${av.color}">${esc(av.init)}</span></span>${esc(event.authId)}`,
              }
            : { label: "User", value: null },
          { label: "Anon ID", value: event.userId },
          { label: "Session", value: event.sessionId },
          { label: "Operation", value: event.operation },
          { label: "City", value: event.city },
          event.country
            ? {
                label: "Country",
                html: `${FLAGS[event.country] || ""} ${esc(event.country)}`,
              }
            : { label: "Country", value: null },
          { label: "Browser", value: event.browser },
          { label: "OS", value: event.os },
          { label: "Device", value: event.deviceType },
          { label: "Environment", value: p.environment ?? null },
          { label: "Language", value: p.language ?? null },
        ]
      : [];

  return (
    <>
      <div
        className={`scrim${open ? " open" : ""}`}
        id="scrim"
        onClick={onClose}
      ></div>
      <aside
        className={`drawer${open ? " open" : ""}`}
        id="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Event detail"
        tabIndex={-1}
        ref={drawerRef}
      >
        <div className="drawer-head">
          <div className="dh-top">
            <div className="dh-title">
              <div className="dh-event" id="dEvent">
                {event ? (
                  <>
                    <span
                      className="ev-dot"
                      style={{ background: colorMap[event.name] || "#8b8b9e" }}
                    ></span>
                    {event.name}
                    {fail ? (
                      <>
                        {" "}
                        <span className="fail-tag">failure</span>
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
              <div className="dh-time" id="dTime">
                {event
                  ? `${fullTime(event.timestamp)}  ·  ${relTime(event.timestamp, now)}`
                  : ""}
              </div>
            </div>
            <button
              className="icon-btn"
              id="drawerClose"
              aria-label="Close"
              onClick={onClose}
            >
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
        <div className="drawer-body" id="drawerBody">
          {event ? (
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
                    <b>Failure event</b>
                    <Html html={esc(failureMessage(event))} />
                  </div>
                </div>
              ) : null}

              <p className="dsection-label">Summary</p>
              <div className="d-summary">
                <Html html={summarize(event)} />
              </div>

              <p className="dsection-label">Event context</p>
              <div className="field-grid">
                {fields.map((f) => {
                  const isHtml = "html" in f;
                  const isNull = !isHtml && (f.value == null || f.value === "");
                  return (
                    <Fragment key={f.label}>
                      <div className="fk">{f.label}</div>
                      {isHtml ? (
                        <Html as="div" className="fv" html={f.html} />
                      ) : (
                        <div className={`fv${isNull ? " is-null" : ""}`}>
                          {isNull ? "null" : f.value}
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>

              <p className="dsection-label">Custom dimensions (props)</p>
              <div className="json-box">
                <button className="json-copy" id="copyJson" onClick={copyJson}>
                  {copyLabel}
                </button>
                <pre>
                  <Html html={syntaxJson(p)} />
                </pre>
              </div>
            </>
          ) : null}
        </div>
      </aside>
    </>
  );
}
