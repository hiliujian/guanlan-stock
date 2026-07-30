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

// ---------------- 博主画线 + 预测线（通用计算） ----------------
const TREND_UP = "#14b8a6"; // 上升趋势线（青）
const TREND_DOWN = "#f43f5e"; // 下降趋势线（玫红）
const FIB = "#f59e0b"; // 斐波那契回调（琥珀）
const PRED = "#db2777"; // 预测线（品红）

interface DrawPoint { x: string; price: number; high: number; low: number; }
interface DrawResult {
  trendLine: { dir: "up" | "down"; p1: [string, number]; p2: [string, number] } | null;
  fib: { label: string; price: number }[];
  prediction: { dates: string[]; values: number[] } | null;
}

// 由最近若干根 K 线/分时点，自动识别摆点，输出：
//  · 趋势线：连接近期两个同向摆点（上升连低点、下降连高点）
//  · 斐波那契回调：窗口内主要摆动高/低之间的 38.2/50/61.8 位置
//  · 预测线：对最近 N 根收盘做线性回归，外推未来 M 根（日期/时间向后延伸）
function calcDraw(points: DrawPoint[], kind: "day" | "intraday"): DrawResult {
  const n = points.length;
  if (n < 12) return { trendLine: null, fib: [], prediction: null };
  const order = kind === "day" ? 4 : 2;
  const look = kind === "day" ? 140 : n;
  const start = Math.max(0, n - look);
  const lows: number[] = [];
  const highs: number[] = [];
  for (let i = start + order; i < n - order; i++) {
    let isH = true;
    let isL = true;
    for (let j = i - order; j <= i + order; j++) {
      if (points[j].high > points[i].high) isH = false;
      if (points[j].low < points[i].low) isL = false;
    }
    if (isH) highs.push(i);
    if (isL) lows.push(i);
  }
  let trendLine: DrawResult["trendLine"] = null;
  if (lows.length >= 2) {
    const a = lows[lows.length - 2];
    const b = lows[lows.length - 1];
    if (points[b].price >= points[a].price) {
      trendLine = { dir: "up", p1: [points[a].x, +points[a].low.toFixed(2)], p2: [points[b].x, +points[b].low.toFixed(2)] };
    }
  }
  if (!trendLine && highs.length >= 2) {
    const a = highs[highs.length - 2];
    const b = highs[highs.length - 1];
    if (points[b].price <= points[a].price) {
      trendLine = { dir: "down", p1: [points[a].x, +points[a].high.toFixed(2)], p2: [points[b].x, +points[b].high.toFixed(2)] };
    }
  }
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = start; i < n; i++) {
    if (points[i].high > hi) hi = points[i].high;
    if (points[i].low < lo) lo = points[i].low;
  }
  const fib: { label: string; price: number }[] = [];
  const span = hi - lo;
  if (span > 0) {
    for (const lv of [0.382, 0.5, 0.618]) {
      fib.push({ label: "F" + (lv * 100).toFixed(1).replace(/\.0$/, ""), price: +(hi - span * lv).toFixed(2) });
    }
  }
  const Nreg = kind === "day" ? 30 : Math.min(45, n);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = n - Nreg; i < n; i++) {
    xs.push(i);
    ys.push(points[i].price);
  }
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) * (xs[i] - mx);
  }
  const slope = den ? num / den : 0;
  const intercept = my - slope * mx;
  const M = kind === "day" ? 12 : 24;
  const dates: string[] = [];
  const values: number[] = [];
  for (let k = 1; k <= M; k++) {
    const idx = n - 1 + k;
    const v = intercept + slope * idx;
    const x = kind === "day" ? genFutureDate(points[n - 1].x, k) : genFutureTime(points[n - 1].x, points, k);
    dates.push(x);
    values.push(+v.toFixed(2));
  }
  return { trendLine, fib, prediction: { dates, values } };
}

// 由最后一根 K 线日期向后推算 k 个交易日（跳过周末），返回 YYYY-MM-DD
function genFutureDate(lastDate: string, k: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(lastDate);
  let y: number, mo: number, d: number;
  if (m) {
    y = +m[1];
    mo = +m[2];
    d = +m[3];
  } else {
    const mm = /^(\d{2})-(\d{2})$/.exec(lastDate);
    mo = mm ? +mm[1] : 1;
    d = mm ? +mm[2] : 1;
    y = new Date().getFullYear();
  }
  const dt = new Date(y, mo - 1, d);
  let added = 0;
  while (added < k) {
    dt.setDate(dt.getDate() + 1);
    const wd = dt.getDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

// 由最后分时时刻向后推算 k 个交易时刻（按观测间隔，跳过午休 11:30-13:00，上限 15:00）
function genFutureTime(lastTime: string, points: DrawPoint[], k: number): string {
  const tm = /^(\d{2}):(\d{2})/.exec(lastTime);
  if (!tm) return `T+${k}`;
  let hh = +tm[1];
  let mm = +tm[2];
  const n = points.length;
  const cnt = Math.min(20, n - 1);
  let tot = 0;
  let c = 0;
  for (let i = n - cnt; i < n; i++) {
    const a = /^(\d{2}):(\d{2})/.exec(points[i - 1].x);
    const b = /^(\d{2}):(\d{2})/.exec(points[i].x);
    if (a && b) {
      const diff = +b[1] * 60 + +b[2] - (+a[1] * 60 + +a[2]);
      if (diff > 0 && diff < 60) {
        tot += diff;
        c++;
      }
    }
  }
  const step = c ? tot / c : 1;
  for (let s = 0; s < k; s++) {
    mm += step;
    while (mm >= 60) {
      mm -= 60;
      hh++;
    }
    if (hh === 11 && mm >= 30) {
      hh = 13;
      mm = 0;
    }
    if (hh >= 15) {
      return `${String(15).padStart(2, "0")}:${String(0).padStart(2, "0")}`;
    }
  }
  return `${String(hh).padStart(2, "0")}:${String(Math.round(mm)).padStart(2, "0")}`;
}

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
  const bottomZone = +A.bottomZone.toFixed(2);
  const topZone = +A.topZone.toFixed(2);
  const lastDate = dates[dates.length - 1];
  const lastClose = close[close.length - 1];
  // 财经博主常用画线（趋势线 / 斐波那契）+ 预测线：基于近期 K 线形态自动绘制，
  // 让用户在图上直接看到「支撑趋势线 / 回调位 / 未来预测路径」。
  const draw = calcDraw(
    data.map((k) => ({ x: k.date, price: k.close, high: k.high, low: k.low })),
    "day"
  );
  const drawML: AnyObj[] = [];
  if (draw.trendLine) {
    const tc = draw.trendLine.dir === "up" ? TREND_UP : TREND_DOWN;
    drawML.push([
      {
        coord: [draw.trendLine.p1[0], draw.trendLine.p1[1]],
        lineStyle: { color: tc, width: 1.8 },
        label: { formatter: "趋势线", color: tc, position: "insideStartTop", fontSize: 10 },
      },
      { coord: [draw.trendLine.p2[0], draw.trendLine.p2[1]], lineStyle: { color: tc, width: 1.8 } },
    ]);
  }
  for (const f of draw.fib) {
    drawML.push({
      yAxis: f.price,
      lineStyle: { color: FIB, type: "dashed", width: 1, opacity: 0.7 },
      label: { formatter: f.label + " " + f.price, color: FIB, position: "insideEndBottom", fontSize: 9, opacity: 0.85 },
    });
  }
  let xData = dates;
  let predSeries: AnyObj | null = null;
  if (draw.prediction && draw.prediction.dates.length) {
    xData = dates.concat(draw.prediction.dates);
    const predData: (number | null)[] = new Array(xData.length).fill(null);
    predData[dates.length - 1] = +lastClose.toFixed(2);
    for (let i = 0; i < draw.prediction.values.length; i++) predData[dates.length + i] = draw.prediction.values[i];
    predSeries = {
      name: "预测",
      type: "line",
      data: predData,
      showSymbol: false,
      smooth: false,
      lineStyle: { width: 1.5, color: PRED, type: "dashed" },
      itemStyle: { color: PRED },
      z: 6,
    };
  }
  // 最新价位置标注：突破/破位/临近压力/临近支撑
  let lastMp: AnyObj | null = null;
  if (A.breakout) {
    lastMp = { coord: [lastDate, lastClose], value: "突破", itemStyle: { color: UP }, label: { color: "#fff", fontSize: 11, fontWeight: "bold" } };
  } else if (A.breakdown) {
    lastMp = { coord: [lastDate, lastClose], value: "破位", itemStyle: { color: DOWN }, label: { color: "#fff", fontSize: 11, fontWeight: "bold" } };
  } else if (A.nearRes) {
    lastMp = { coord: [lastDate, lastClose], value: "近压", itemStyle: { color: UP, opacity: 0.75 }, label: { color: "#fff", fontSize: 10 } };
  } else if (A.nearSup) {
    lastMp = { coord: [lastDate, lastClose], value: "近撑", itemStyle: { color: DOWN, opacity: 0.75 }, label: { color: "#fff", fontSize: 10 } };
  }

  return {
    animation: false,
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    legend: {
      data: ["K线", "MA5", "MA10", "MA20", "MA60", ...(predSeries ? ["预测"] : [])],
      top: 4,
      left: "center",
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { fontSize: 11 },
    },
    grid: { left: 48, right: 14, top: 26, bottom: 24 },
    xAxis: {
      type: "category",
      data: xData,
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
            ...(bottomZone < support * 0.97
              ? [{ yAxis: bottomZone, name: "低位区", lineStyle: { color: DOWN, opacity: 0.3, type: "dotted" }, label: { formatter: "低位区 " + bottomZone, color: DOWN, position: "insideEndTop", fontSize: 10, opacity: 0.6 } }]
              : []),
            {
              yAxis: support,
              name: "支撑",
              lineStyle: { color: DOWN },
              label: { formatter: (A.breakdown ? "支撑(已破) " : "支撑 ") + support, color: DOWN, position: "insideEndTop" },
            },
            {
              yAxis: resistance,
              name: "压力",
              lineStyle: { color: UP },
              label: { formatter: (A.breakout ? "压力(已突) " : "压力 ") + resistance, color: UP, position: "insideEndBottom" },
            },
            ...(topZone > resistance * 1.03
              ? [{ yAxis: topZone, name: "高位区", lineStyle: { color: UP, opacity: 0.3, type: "dotted" }, label: { formatter: "高位区 " + topZone, color: UP, position: "insideEndBottom", fontSize: 10, opacity: 0.6 } }]
              : []),
            ...drawML,
          ],
        },
        markPoint: lastMp
          ? { symbol: "pin", symbolSize: 44, silent: true, data: [lastMp] }
          : undefined,
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
      ...(predSeries ? [predSeries] : []),
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
export function buildTrendOpts(trends: Trend[], preClose = 0): AnyObj {
  const times = trends.map((t) => t.t.slice(11));
  const price = trends.map((t) => t.price);
  const avg = trends.map((t) => t.avg);
  const last = price.length ? price[price.length - 1] : 0;
  const up = preClose ? last >= preClose : true; // 高于/等于昨收为涨色，否则跌色
  const priceColor = up ? UP : DOWN;
  // 昨收参考线：分时图的标准基准，一眼看出当前价在昨收上方还是下方
  const preCloseData = preClose
    ? [
        {
          yAxis: +preClose.toFixed(2),
          label: {
            formatter: "昨收 " + preClose.toFixed(2),
            color: "#9aa0a6",
            position: "insideEndTop" as const,
            fontSize: 10,
          },
        },
      ]
    : [];
  // 财经博主常用画线（趋势线 / 斐波那契）+ 预测线：在分时走势上也自动绘制，
  // 让用户一眼看到「分时趋势方向 / 回调参考位 / 未来走势预测」。
  const draw = calcDraw(
    trends.map((t) => ({ x: t.t.slice(11), price: t.price, high: t.price, low: t.price })),
    "intraday"
  );
  const drawML: AnyObj[] = [];
  if (draw.trendLine) {
    const tc = draw.trendLine.dir === "up" ? TREND_UP : TREND_DOWN;
    drawML.push([
      {
        coord: [draw.trendLine.p1[0], draw.trendLine.p1[1]],
        lineStyle: { color: tc, width: 1.6 },
        label: { formatter: "趋势线", color: tc, position: "insideStartTop", fontSize: 10 },
      },
      { coord: [draw.trendLine.p2[0], draw.trendLine.p2[1]], lineStyle: { color: tc, width: 1.6 } },
    ]);
  }
  for (const f of draw.fib) {
    drawML.push({
      yAxis: f.price,
      lineStyle: { color: FIB, type: "dashed", width: 1, opacity: 0.6 },
      label: { formatter: f.label + " " + f.price, color: FIB, position: "insideEndBottom", fontSize: 9, opacity: 0.8 },
    });
  }
  const fullML = {
    symbol: ["none", "none"] as [string, string],
    silent: true,
    lineStyle: { type: "dashed" },
    data: [...preCloseData, ...drawML],
  };
  // 预测线：以最近分时点线性回归外推未来时刻，x 轴拼接未来时间，价格/均价用 null 补齐长度
  let xData = times;
  let predSeries: AnyObj | null = null;
  const padLen = draw.prediction ? draw.prediction.dates.length : 0;
  if (draw.prediction && draw.prediction.dates.length) {
    xData = times.concat(draw.prediction.dates);
    const predData: (number | null)[] = new Array(xData.length).fill(null);
    predData[times.length - 1] = +last.toFixed(2);
    for (let i = 0; i < draw.prediction.values.length; i++) predData[times.length + i] = draw.prediction.values[i];
    predSeries = {
      name: "预测",
      type: "line",
      data: predData,
      showSymbol: false,
      smooth: false,
      lineStyle: { width: 1.4, color: PRED, type: "dashed" },
      itemStyle: { color: PRED },
      z: 6,
    };
  }
  const priceData = price.concat(new Array(padLen).fill(null));
  const avgData = avg.concat(new Array(padLen).fill(null));
  return {
    animation: false,
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    legend: {
      data: ["价格", "均价", ...(predSeries ? ["预测"] : [])],
      top: 4,
      left: "center",
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { fontSize: 11 },
    },
    grid: { left: 48, right: 14, top: 28, bottom: 28 },
    xAxis: {
      type: "category",
      data: xData,
      boundaryGap: false,
      axisLabel: { show: true, fontSize: 10, interval: Math.floor(xData.length / 6) },
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
        data: priceData,
        smooth: false,
        showSymbol: false,
        lineStyle: { width: 1.6, color: priceColor },
        areaStyle: { color: up ? "rgba(7,193,96,.06)" : "rgba(250,81,81,.06)" },
        markLine: fullML,
      },
      { name: "均价", type: "line", data: avgData, smooth: false, showSymbol: false, lineStyle: { width: 1.2, color: "#3b82f6" } },
      ...(predSeries ? [predSeries] : []),
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
