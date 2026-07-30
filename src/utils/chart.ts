// =====================================================================
// 图表配置构建器（纯函数）：把分析引擎结果转成 ECharts option。
// 参考 stock-analyzer.html（已验证可在 H5 正常绘制 K线/均线/量能/MACD/筹码）。
// 不依赖任何图表库，只产出 ECharts 兼容的 option 对象，由 KlineChart.vue 消费。
// =====================================================================
import type { Kline, Trend } from "./period";
import type { AnalysisResult } from "./analyzer";
import type { computeChip } from "./analyzer";
import { UP, DOWN } from "./colors";

type AnyObj = Record<string, any>;

function tail<T>(arr: T[], n: number): T[] {
  return arr.slice(Math.max(0, arr.length - n));
}
function maArr(arr: number[], n: number): (number | null)[] {
  const r: (number | null)[] = new Array(arr.length).fill(null);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= n) sum -= arr[i - n];
    if (i >= n - 1) r[i] = sum / n;
  }
  return r;
}

// 统一的缩放控件（可拖动 + 底部滑块）
const ZOOM = [
  { type: "inside", xAxisIndex: 0 },
  { type: "slider", xAxisIndex: 0, bottom: 4, height: 16, start: 55, end: 100 },
];

// ---------------- 蜡烛 + 均线 + 支撑压力 ----------------
export function buildCandleOpts(klines: Kline[], A: AnalysisResult): AnyObj {
  const data = tail(klines, 400);
  const dates = data.map((k) => k.date);
  const cdata = data.map((k) => [k.open, k.close, k.low, k.high]); // ECharts 顺序：开/收/低/高
  const close = data.map((k) => k.close);
  const ma5 = maArr(close, 5);
  const ma10 = maArr(close, 10);
  const ma20 = maArr(close, 20);
  const ma60 = maArr(close, 60);
  const support = +A.support.toFixed(2);
  const resistance = +A.resistance.toFixed(2);
  const buyLow = +(support * 0.985).toFixed(2);
  const buyHigh = +Math.max(buyLow + 0.01, Math.min(support * 1.03, resistance)).toFixed(2);

  return {
    animation: false,
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    legend: {
      data: ["K线", "MA5", "MA10", "MA20", "MA60"],
      top: 4,
      left: "center",
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { fontSize: 11 },
    },
    grid: { left: 48, right: 14, top: 26, bottom: 24 },
    xAxis: {
      type: "category",
      data: dates,
      boundaryGap: true,
      axisLabel: { show: false },
      axisLine: { lineStyle: { color: "#e5e5e5" } },
      axisTick: { show: false },
    },
    yAxis: {
      scale: true,
      splitLine: { lineStyle: { color: "#f2f2f2" } },
      axisLabel: { fontSize: 11 },
    },
    dataZoom: ZOOM,
    series: [
      {
        name: "K线",
        type: "candlestick",
        data: cdata,
        itemStyle: { color: UP, color0: DOWN, borderColor: UP, borderColor0: DOWN },
        markLine: {
          symbol: ["none", "none"],
          silent: true,
          lineStyle: { type: "dashed" },
          data: [
            {
              yAxis: support,
              name: "支撑",
              lineStyle: { color: DOWN },
              label: { formatter: "支撑 " + support, color: DOWN, position: "insideEndTop" },
            },
            {
              yAxis: resistance,
              name: "压力",
              lineStyle: { color: UP },
              label: { formatter: "压力 " + resistance, color: UP, position: "insideEndBottom" },
            },
          ],
        },
        markArea: {
          silent: true,
          data: [
            [
              {
                yAxis: buyLow,
                itemStyle: { color: "rgba(9,187,7,.10)" },
                label: { show: true, formatter: "买入参考区", color: DOWN, position: "insideTop" },
              },
              { yAxis: buyHigh },
            ],
          ],
        },
      },
      { name: "MA5", type: "line", data: ma5, smooth: true, showSymbol: false, lineStyle: { width: 1 }, itemStyle: { color: "#ff9f1c" } },
      { name: "MA10", type: "line", data: ma10, smooth: true, showSymbol: false, lineStyle: { width: 1 }, itemStyle: { color: "#3b82f6" } },
      { name: "MA20", type: "line", data: ma20, smooth: true, showSymbol: false, lineStyle: { width: 1.4 }, itemStyle: { color: "#8b5cf6" } },
      { name: "MA60", type: "line", data: ma60, smooth: true, showSymbol: false, lineStyle: { width: 1.4 }, itemStyle: { color: "#06b6d4" } },
    ],
  };
}

// ---------------- 成交量 + 主力净流入 ----------------
export function buildVolOpts(
  rows: Kline[] | Trend[],
  flowMap: Record<string, number> | null,
  isDaily: boolean
): AnyObj {
  const data = tail(rows as any[], 400) as any[];
  const dates = data.map((p) => (p.date ? p.date : p.t));
  const vol = data.map((p) => p.vol);
  const cls = data.map((p) =>
    p.close != null ? (p.close >= p.open ? UP : DOWN) : p.price >= p.avg ? UP : DOWN
  );
  const series: AnyObj[] = [
    {
      name: "成交量",
      type: "bar",
      yAxisIndex: 0,
      data: vol.map((v, i) => ({ value: v, itemStyle: { color: cls[i] } })),
    },
  ];
  const legend = ["成交量"];
  let yAxis: AnyObj[] = [
    { name: "量", scale: true, splitLine: { lineStyle: { color: "#f2f2f2" } }, axisLabel: { fontSize: 11 } },
  ];
  if (isDaily && flowMap) {
    const flowArr = data.map((p) =>
      flowMap[p.date] != null ? +(flowMap[p.date] / 1e8).toFixed(2) : 0
    );
    series.push({
      name: "主力净流入(亿)",
      type: "bar",
      yAxisIndex: 1,
      data: flowArr.map((v) => ({ value: v, itemStyle: { color: v >= 0 ? UP : DOWN } })),
    });
    legend.push("主力净流入(亿)");
    yAxis.push({
      name: "亿",
      scale: true,
      position: "right",
      splitLine: { show: false },
      axisLabel: { fontSize: 11 },
    });
  }
  return {
    animation: false,
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    legend: {
      data: legend,
      top: 4,
      left: "center",
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { fontSize: 11 },
    },
    grid: { left: 48, right: isDaily && flowMap ? 46 : 14, top: 26, bottom: 24 },
    xAxis: {
      type: "category",
      data: dates,
      axisLabel: { show: false },
      axisLine: { lineStyle: { color: "#e5e5e5" } },
      axisTick: { show: false },
    },
    yAxis,
    dataZoom: ZOOM,
    series,
  };
}

// ---------------- MACD ----------------
export function buildMacdOpts(klines: Kline[]): AnyObj {
  const data = tail(klines, 400);
  const dates = data.map((k) => k.date);
  const close = data.map((k) => k.close);
  const e = (arr: number[], n: number) => {
    const r = new Array(arr.length).fill(0);
    const k = 2 / (n + 1);
    let p = 0;
    for (let i = 0; i < arr.length; i++) {
      p = i === 0 ? arr[0] : arr[i] * k + p * (1 - k);
      r[i] = p;
    }
    return r;
  };
  const e12 = e(close, 12);
  const e26 = e(close, 26);
  const dif = close.map((_, i) => e12[i] - e26[i]);
  const dea = e(dif, 9);
  const macdArr = dif.map((v, i) => (v - dea[i]) * 2);
  return {
    animation: false,
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    legend: {
      data: ["MACD", "DIF", "DEA"],
      top: 4,
      left: "center",
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { fontSize: 11 },
    },
    grid: { left: 48, right: 14, top: 26, bottom: 24 },
    xAxis: {
      type: "category",
      data: dates,
      axisLabel: { show: false },
      axisLine: { lineStyle: { color: "#e5e5e5" } },
      axisTick: { show: false },
    },
    yAxis: {
      scale: true,
      splitLine: { lineStyle: { color: "#f2f2f2" } },
      axisLabel: { fontSize: 11 },
    },
    dataZoom: ZOOM,
    series: [
      {
        name: "MACD",
        type: "bar",
        data: macdArr.map((v) => ({ value: +v.toFixed(3), itemStyle: { color: v >= 0 ? UP : DOWN } })),
      },
      { name: "DIF", type: "line", data: dif.map((v) => +v.toFixed(3)), showSymbol: false, lineStyle: { width: 1 }, itemStyle: { color: "#333333" } },
      { name: "DEA", type: "line", data: dea.map((v) => +v.toFixed(3)), showSymbol: false, lineStyle: { width: 1 }, itemStyle: { color: "#888888" } },
    ],
  };
}

// ---------------- 分时（价格 / 均价） ----------------
export function buildTrendOpts(trends: Trend[]): AnyObj {
  const times = trends.map((t) => t.t.slice(11));
  const price = trends.map((t) => t.price);
  const avg = trends.map((t) => t.avg);
  return {
    animation: false,
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    legend: {
      data: ["价格", "均价"],
      top: 4,
      left: "center",
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { fontSize: 11 },
    },
    grid: { left: 48, right: 14, top: 28, bottom: 28 },
    xAxis: {
      type: "category",
      data: times,
      boundaryGap: false,
      axisLabel: { show: true, fontSize: 10, interval: Math.floor(times.length / 6) },
      axisLine: { lineStyle: { color: "#e5e5e5" } },
      axisTick: { show: false },
    },
    yAxis: {
      scale: true,
      splitLine: { lineStyle: { color: "#f2f2f2" } },
      axisLabel: { fontSize: 11 },
    },
    dataZoom: ZOOM,
    series: [
      {
        name: "价格",
        type: "line",
        data: price,
        smooth: false,
        showSymbol: false,
        lineStyle: { width: 1.6, color: UP },
        areaStyle: { color: "rgba(250,81,81,.06)" },
      },
      { name: "均价", type: "line", data: avg, smooth: false, showSymbol: false, lineStyle: { width: 1.2, color: "#3b82f6" } },
    ],
  };
}

// ---------------- 筹码分布（横向柱） ----------------
export function buildChipOpts(chip: ReturnType<typeof computeChip>): AnyObj {
  const cats = chip.cats.slice().reverse();
  const vals = chip.vals.slice().reverse();
  const colors = chip.colors.slice().reverse();
  return {
    animation: false,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (p: any) => {
        const i = p[0].dataIndex;
        return "价位 " + cats[i] + "<br/>占比 " + vals[i] + "%";
      },
    },
    grid: { left: 48, right: 24, top: 10, bottom: 16 },
    xAxis: { type: "value", name: "占比%", axisLabel: { show: false } },
    yAxis: { type: "category", data: cats, axisLabel: { show: false } },
    series: [
      {
        type: "bar",
        data: vals.map((v, i) => ({ value: v, itemStyle: { color: colors[i] } })),
        barWidth: "92%",
      },
    ],
  };
}
