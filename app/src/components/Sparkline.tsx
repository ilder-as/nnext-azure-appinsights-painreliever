import { useId } from "react";
import { sparkGeometry } from "@/lib/kpi";

/**
 * Tiny inline gradient-area sparkline with a last-point dot.
 * Ports the `sparkline()` helper from dashboard/js/app.js (variant-c graft).
 * Geometry comes from sparkGeometry(); danger forces the red accent.
 */
export function Sparkline({
  values,
  color,
  danger,
}: {
  values: number[];
  color: string;
  danger?: boolean;
}) {
  const geom = sparkGeometry(values);
  // A stable, unique gradient id so multiple sparklines don't collide.
  const gid = useId();

  if (geom.empty) {
    return <svg className="kpi-spark" viewBox={`0 0 ${geom.w} ${geom.h}`} />;
  }

  const c = danger ? "#ff5c6c" : color;
  return (
    <svg
      className="kpi-spark"
      viewBox={`0 0 ${geom.w} ${geom.h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="0.28" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={geom.area} fill={`url(#${gid})`} />
      <path
        d={geom.line}
        fill="none"
        stroke={c}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={geom.lastX.toFixed(1)}
        cy={geom.lastY.toFixed(1)}
        r="2"
        fill={c}
      />
    </svg>
  );
}
