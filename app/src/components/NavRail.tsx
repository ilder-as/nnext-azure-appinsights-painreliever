import { useState, type ReactNode } from "react";
import { useDashboard } from "@/state/dashboard";
import { APP_NAME, APP_TAGLINE } from "@/config";

/**
 * Left navigation rail. "Sessions" switches the main view to the session trace;
 * the other items live on the Overview view and smooth-scroll to their section
 * (switching back to Overview first if needed).
 */

type NavKind = "scroll" | "view";
interface NavItem {
  id: string; // scroll target id ("__top" = page top), or the view name
  label: string;
  icon: ReactNode;
  kind: NavKind;
}

const OVERVIEW_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect
      x="3"
      y="3"
      width="7"
      height="9"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.7"
    />
    <rect
      x="14"
      y="3"
      width="7"
      height="5"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.7"
    />
    <rect
      x="14"
      y="12"
      width="7"
      height="9"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.7"
    />
    <rect
      x="3"
      y="16"
      width="7"
      height="5"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1.7"
    />
  </svg>
);
const SESSIONS_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
    <path d="M10 8.5l5 3.5-5 3.5z" fill="currentColor" />
  </svg>
);
const EXPLORER_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M4 6h16M4 12h16M4 18h10"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </svg>
);
const USERS_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
    <path
      d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
    <path
      d="M17 7.5a2.8 2.8 0 010 5.5M19 19c0-2-1-3.5-2.5-4.4"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </svg>
);
const FAILURES_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M12 8v5M12 16.5v.2"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <path
      d="M10.3 3.9L2.6 17.4A2 2 0 004.3 20.4h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
      stroke="currentColor"
      strokeWidth="1.6"
    />
  </svg>
);
const GEO_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M3 12h18M12 3c2.5 2.5 3.8 5.8 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.8-3.8-9S9.5 5.5 12 3z"
      stroke="currentColor"
      strokeWidth="1.6"
    />
  </svg>
);

const OBSERVE: NavItem[] = [
  { id: "__top", label: "Overview", icon: OVERVIEW_ICON, kind: "scroll" },
  { id: "sessions", label: "Sessions", icon: SESSIONS_ICON, kind: "view" },
  {
    id: "explorerCard",
    label: "Explorer",
    icon: EXPLORER_ICON,
    kind: "scroll",
  },
  { id: "usersCard", label: "Users", icon: USERS_ICON, kind: "scroll" },
];
const INSIGHT: NavItem[] = [
  { id: "failCard", label: "Failures", icon: FAILURES_ICON, kind: "scroll" },
  { id: "breakdownGrid", label: "Breakdowns", icon: GEO_ICON, kind: "scroll" },
];

function scrollToTarget(id: string) {
  if (id === "__top") window.scrollTo({ top: 0, behavior: "smooth" });
  else
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function NavRail() {
  const { meta, view, setView } = useDashboard();
  const resource = meta?.resource ?? "App Insights";
  const [activeScroll, setActiveScroll] = useState("__top");

  const go = (it: NavItem) => {
    if (it.kind === "view") {
      setView("sessions");
      return;
    }
    setActiveScroll(it.id);
    if (view !== "overview") {
      // switch back to Overview, then scroll once the section has mounted
      setView("overview");
      requestAnimationFrame(() =>
        requestAnimationFrame(() => scrollToTarget(it.id)),
      );
    } else {
      scrollToTarget(it.id);
    }
  };

  const isActive = (it: NavItem) =>
    it.kind === "view"
      ? view === "sessions"
      : view === "overview" && activeScroll === it.id;

  const renderItem = (it: NavItem) => (
    <button
      key={it.id}
      className={"nav-item" + (isActive(it) ? " active" : "")}
      type="button"
      onClick={() => go(it)}
    >
      {it.icon}
      <span>{it.label}</span>
    </button>
  );

  return (
    <aside className="rail">
      <div className="brand">
        <div className="brand-mark">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M3 13.5L9 7.5L13 11.5L21 4"
              stroke="#fff"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="21" cy="4" r="2.4" fill="#fff" />
          </svg>
        </div>
        <div className="brand-text">
          <b>{APP_NAME}</b>
          <span>{APP_TAGLINE}</span>
        </div>
      </div>
      <nav>
        <div className="nav-group-label">Observe</div>
        {OBSERVE.map(renderItem)}
        <div className="nav-group-label">Insight</div>
        {INSIGHT.map(renderItem)}
      </nav>
      <div className="nav-spacer"></div>
      <div className="rail-foot">
        <span className="dot"></span>
        <span>{resource}</span>
      </div>
    </aside>
  );
}
