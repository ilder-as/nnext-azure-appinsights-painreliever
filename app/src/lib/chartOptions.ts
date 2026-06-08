/* ECharts option builders ported from dashboard/js/app.js (renderHero, renderDonut).
   Consume the Aggregate directly; components own click handlers + the legend DOM. */
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import { esc, fmtDuration, fmtInt, fmtPct } from "./format";
import type { Aggregate, ColorMap } from "./types";

export type HeroMode = "stacked" | "total";

/** Per-function P75 "time-to-event" trend line over the window (ms values). */
export function profileTrendOption(
  series: number[],
  labels: string[],
  color: string,
): EChartsOption {
  const rgba = (hex: string, a: number) => {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  };
  return {
    backgroundColor: "transparent",
    grid: { left: 8, right: 14, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(20,20,29,0.97)",
      borderColor: "#32324a",
      borderWidth: 1,
      textStyle: { color: "#f4f3fb", fontSize: 11.5 },
      axisPointer: {
        type: "shadow",
        shadowStyle: { color: "rgba(124,92,255,0.06)" },
      },
      extraCssText:
        "border-radius:10px;box-shadow:0 16px 40px -12px rgba(0,0,0,.7);",
      formatter: (p: unknown) => {
        const arr = p as { axisValue: string; data: number }[];
        const d = arr[0];
        return `${esc(d.axisValue)}<br/><b>${fmtDuration(d.data)}</b> p75`;
      },
    },
    xAxis: {
      type: "category",
      data: labels,
      axisLine: { lineStyle: { color: "#26263a" } },
      axisTick: { show: false },
      axisLabel: { color: "#65647a", fontSize: 10.5 },
    },
    yAxis: {
      type: "value",
      min: 0,
      splitLine: { lineStyle: { color: "#1a1a26" } },
      axisLabel: {
        color: "#65647a",
        fontSize: 10.5,
        formatter: (v: number) => fmtDuration(v),
      },
    },
    series: [
      {
        name: "p75",
        type: "line",
        smooth: 0.35,
        symbol: "circle",
        symbolSize: 6,
        showSymbol: false,
        data: series,
        lineStyle: {
          color,
          width: 2.5,
          shadowColor: rgba(color, 0.5),
          shadowBlur: 12,
        },
        itemStyle: { color },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: rgba(color, 0.28) },
            { offset: 1, color: rgba(color, 0) },
          ]),
        },
      },
    ],
  };
}

export function heroOption(agg: Aggregate, mode: HeroMode): EChartsOption {
  const series = agg.daySeries; // top-6 types + Other (name/color/data)
  const opt: EChartsOption = {
    backgroundColor: "transparent",
    grid: { left: 8, right: 14, top: 36, bottom: 8, containLabel: true },
    legend: {
      show: mode === "stacked",
      top: 0,
      left: 0,
      icon: "roundRect",
      itemWidth: 9,
      itemHeight: 9,
      itemGap: 14,
      textStyle: { color: "#9694a8", fontSize: 11 },
      data: series.map((s) => s.name),
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(20,20,29,0.97)",
      borderColor: "#32324a",
      borderWidth: 1,
      textStyle: { color: "#f4f3fb", fontSize: 11.5 },
      axisPointer: {
        type: "shadow",
        shadowStyle: { color: "rgba(124,92,255,0.06)" },
      },
      extraCssText:
        "border-radius:10px;box-shadow:0 16px 40px -12px rgba(0,0,0,.7);",
    },
    xAxis: {
      type: "category",
      data: agg.dayLabels,
      boundaryGap: mode === "stacked",
      axisLine: { lineStyle: { color: "#26263a" } },
      axisTick: { show: false },
      axisLabel: { color: "#65647a", fontSize: 10.5 },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#1a1a26" } },
      axisLabel: {
        color: "#65647a",
        fontSize: 10.5,
        formatter: (v: number) => (v >= 1000 ? v / 1000 + "k" : String(v)),
      },
    },
    series:
      mode === "stacked"
        ? series.map((s, idx) => ({
            name: s.name,
            type: "bar",
            stack: "all",
            data: s.data,
            barMaxWidth: 26,
            itemStyle: {
              color: s.color,
              borderRadius: idx === series.length - 1 ? [3, 3, 0, 0] : 0,
            },
            emphasis: { focus: "series" },
          }))
        : [
            {
              name: "Total events",
              type: "line",
              smooth: 0.35,
              symbol: "circle",
              symbolSize: 6,
              showSymbol: false,
              data: agg.dayTotals,
              lineStyle: {
                color: "#7c5cff",
                width: 2.5,
                shadowColor: "rgba(124,92,255,0.5)",
                shadowBlur: 12,
              },
              itemStyle: { color: "#9d7bff" },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: "rgba(124,92,255,0.28)" },
                  { offset: 1, color: "rgba(124,92,255,0.0)" },
                ]),
              },
            },
          ],
  };
  return opt;
}

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

/** Top-8 event types + an "Other" bucket — shared by the chart and its legend. */
export function donutData(
  agg: Aggregate,
  colorMap: ColorMap,
): {
  slices: DonutSlice[];
  grand: number;
} {
  const entries = agg.byType; // already sorted desc
  const grand = entries.reduce((s, e) => s + e[1], 0) || 1;
  const slices: DonutSlice[] = entries.slice(0, 8).map(([name, value]) => ({
    name,
    value,
    color: colorMap[name] || "#8b8b9e",
  }));
  const otherSum = entries.slice(8).reduce((s, e) => s + e[1], 0);
  if (otherSum > 0)
    slices.push({ name: "Other", value: otherSum, color: "#3a3a4e" });
  return { slices, grand };
}

export function donutOption(agg: Aggregate, colorMap: ColorMap): EChartsOption {
  const { slices, grand } = donutData(agg, colorMap);
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(20,20,29,0.97)",
      borderColor: "#32324a",
      borderWidth: 1,
      textStyle: { color: "#f4f3fb", fontSize: 11.5 },
      extraCssText: "border-radius:10px;",
      formatter: (p: unknown) => {
        const d = p as { name: string; value: number };
        return `<b>${esc(d.name)}</b><br/>${fmtInt(d.value)} events · ${fmtPct(d.value / grand)}`;
      },
    },
    series: [
      {
        type: "pie",
        radius: ["58%", "82%"],
        center: ["50%", "48%"],
        avoidLabelOverlap: true,
        padAngle: 1.5,
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 6,
          itemStyle: { shadowBlur: 18, shadowColor: "rgba(0,0,0,0.5)" },
        },
        data: slices.map((s) => ({
          name: s.name,
          value: s.value,
          itemStyle: { color: s.color, borderColor: "#14141d", borderWidth: 2 },
        })),
      },
    ],
    graphic: [
      {
        type: "text",
        left: "center",
        top: "40%",
        style: {
          text: fmtInt(grand),
          fill: "#f4f3fb",
          fontSize: 24,
          fontWeight: 600,
        },
      },
      {
        type: "text",
        left: "center",
        top: "53%",
        style: { text: "total events", fill: "#65647a", fontSize: 11 },
      },
    ],
  };
}
