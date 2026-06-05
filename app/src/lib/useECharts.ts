import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import { useEffect, useRef, type DependencyList, type RefObject } from "react";

export type EChartClickHandler = (params: {
  name?: string;
  dataIndex?: number;
  seriesName?: string;
}) => void;

/**
 * Bind an ECharts instance to a container ref.
 * - inits once, disposes on unmount
 * - setOption(option, true) whenever `deps` change
 * - keeps the canvas sized to its container via a rAF-coalesced ResizeObserver,
 *   and forces one resize after first layout (containers aren't at final width
 *   at init time — the original dashboard's first-paint bug).
 */
export function useECharts(
  option: EChartsOption,
  deps: DependencyList,
  onClick?: EChartClickHandler,
): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef<EChartClickHandler | undefined>(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    chart.on("click", (params) =>
      clickRef.current?.({
        name: (params as { name?: string }).name,
        dataIndex: (params as { dataIndex?: number }).dataIndex,
        seriesName: (params as { seriesName?: string }).seriesName,
      }),
    );

    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => chart.resize());
    });
    ro.observe(el);
    raf = requestAnimationFrame(() => chart.resize());

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return containerRef;
}
