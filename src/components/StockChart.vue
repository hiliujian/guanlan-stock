<template>
  <!-- 专用 K 线行情图（KLineCharts 引擎）：单实例多面板（主图蜡烛/分时 + 成交量 + MACD），
       通过 layout 自动分面并控制高度；筹码分布叠加层默认绘制。 -->
  <div class="kc">
    <div ref="chartEl" class="kc-chart" :style="{ height: props.height + 'px' }"></div>
    <!-- 筹码分布叠加层（右侧横向直方图，与蜡烛同坐标系），默认不拦截指针 -->
    <canvas ref="cyqEl" class="kc-ov kc-ov--cyq"></canvas>
    <!-- 看盘画线工具栏：点击后在图上点击/拖拽绘制；支撑=绿、压力=红、趋势/分割=主色绿 -->
    <view v-if="showTools" class="kc-tools">
      <view v-if="autoDraw" class="kct-btn kct-auto" :class="{ active: autoEnabled }" role="button" @click="toggleAuto">自动</view>
      <view class="kct-btn" :class="{ active: activeAction === 'support' }" role="button" @click="drawLine('support', 'horizontalStraightLine', DOWN)">支撑</view>
      <view class="kct-btn" :class="{ active: activeAction === 'pressure' }" role="button" @click="drawLine('pressure', 'horizontalStraightLine', UP)">压力</view>
      <view class="kct-btn" :class="{ active: activeAction === 'trend' }" role="button" @click="drawLine('trend', 'straightLine', TREND)">趋势</view>
      <view class="kct-btn" :class="{ active: activeAction === 'fib' }" role="button" @click="drawLine('fib', 'fibonacciLine')">分割</view>
      <view class="kct-btn kct-clear" role="button" @click="clearUserOverlays">清空</view>
    </view>
    <!-- 自动线颜色图例（小白友好）：绿=支撑 红=压力 绿=趋势 -->
    <view v-if="showTools && autoDraw" class="kc-legend">
      <text class="kcl-it"><text class="kcl-dot s"></text>支撑</text>
      <text class="kcl-it"><text class="kcl-dot p"></text>压力</text>
      <text class="kcl-it"><text class="kcl-dot t"></text>趋势</text>
    </view>
    <!-- 自动线悬浮提示：跟随十字光标显示每条线的类型/价位/区间/触及次数/方向 -->
    <view v-if="tip.show" class="kc-tip" :style="tipStyle">
      <view v-for="(it, i) in tip.items" :key="i" class="kc-tip-row">
        <text class="kc-tip-dot" :style="{ background: it.color }"></text>
        <text class="kc-tip-label">{{ it.label }}</text>
        <text class="kc-tip-text">{{ it.text }}</text>
      </view>
    </view>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { init, dispose, registerIndicator, registerOverlay, ActionType } from "klinecharts";
import { isDark } from "@/utils/theme";
import { UP, DOWN } from "@/utils/colors";
const TREND = "#2f74ff"; // 趋势线专用蓝（与压力红/支撑绿三色区分，互不混淆，且对红绿色盲更友好）
import { computeChip, type ChipResult } from "@/utils/analyzer";
import type { Kline, Trend } from "@/utils/period";

// ---- 分时均价（AVP）自定义指标：累计成交额 / 累计成交量，叠加在主图 ----
let avpRegistered = false;
function ensureAvp() {
  if (avpRegistered) return;
  try {
    registerIndicator({
      name: "AVP",
      shortName: "均价",
      series: "price" as never, // 运行时即字符串 'price'，minified 枚举无值，直接传字面量
      calc: (dataList: any[]) => {
        let cumVol = 0;
        let cumAmt = 0;
        return dataList.map((d) => {
          cumVol += d.volume || 0;
          cumAmt += d.turnover || 0;
          const v = cumVol > 0 ? cumAmt / cumVol : d.close;
          return { avp: v };
        });
      },
      figures: [{ key: "avp", title: "均价: ", type: "line" }],
    } as never);
    avpRegistered = true;
  } catch {
    /* noop */
  }
}

const props = withDefaults(
  defineProps<{
    /** kline = 日K（蜡烛+均线+量+MACD）；intraday = 分时（走势+均价+量+MACD） */
    mode: "kline" | "intraday";
    klines?: Kline[];
    trends?: Trend[];
    /** 分时昨收，用于把每根分时柱的 open 设为昨收，从而得到正确的涨跌着色 */
    preClose?: number;
    height?: number;
    /** 是否显示均线 MA（日K 主图叠加），默认开 */
    showMA?: boolean;
    /** 是否显示 MACD 面板（隐藏后成交量面板自动顶上补足），默认开 */
    showMacd?: boolean;
    /** 实时最新价（仅分时模式生效）：把「最后一根分时柱」动态同步为实时价 */
    livePrice?: number;
    /** 实时昨收（与 livePrice 同源） */
    livePreClose?: number;
    /** 是否显示看盘画线工具栏（支撑/压力/趋势/黄金分割/自动/清空），默认关 */
    showTools?: boolean;
    /** 是否启用「自动画线」：系统按行情自动标注支撑/压力/趋势/黄金分割（半透明虚线、锁定不可拖拽）；默认关，仅看盘主图开启。手动绘制仍可用。 */
    autoDraw?: boolean;
    /** 是否把用户画的线持久化到本地（按 code 区分），默认开 */
    persist?: boolean;
    /** 当前股票代码，用于持久化 key；不传则不持久化（仅当前会话有效） */
    code?: string;
    /** 自动画线扫描窗口（近 N 根 K 线）；不传则按 mode 取默认（kline=120, intraday=240） */
    autoPeriod?: number;
    /** 自动画线灵敏度 1-10（越大越敏感→更多/更密价位与更紧聚类）；默认 5 */
    autoSensitivity?: number;
  }>(),
  { height: 440, showMA: true, showMacd: true, showTools: false, autoDraw: false, persist: true }
);

// ---- 类型别名（klinecharts 运行时实例）----
type KC = ReturnType<typeof init>;

// ---- 容器 / 实例 ----
const chartEl = ref<HTMLElement | null>(null);
const cyqEl = ref<HTMLCanvasElement | null>(null);
let chart: KC | null = null;
let ro: ResizeObserver | null = null;

// ---- 数据（KLineData，timestamp 为毫秒）----
let dataList: any[] = [];
let lastTs = 0; // 末根时间戳，用于实时价同步
let chipData: ChipResult | null = null;

function toKLineData(): any[] {
  const out: any[] = [];
  if (props.mode === "kline") {
    const ks = props.klines ?? [];
    for (const k of ks) {
      const t = Date.parse(k.date);
      if (!isFinite(t)) continue;
      out.push({
        timestamp: t,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.vol,
        turnover: k.amount,
      });
    }
  } else {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const baseMs = base.getTime();
    const pre = props.preClose || 0;
    const ts = props.trends ?? [];
    for (const t of ts) {
      const tStr = t.t || "";
      const timePart = tStr.includes(" ") ? tStr.split(" ").pop()! : tStr;
      const parts = timePart.split(":");
      const hh = Number(parts[0]) || 0;
      const mm = Number(parts[1]) || 0;
      const sec = baseMs + (hh * 60 + mm) * 60 * 1000;
      if (!isFinite(sec)) continue;
      out.push({
        timestamp: sec,
        open: pre,
        high: t.high,
        low: t.low,
        close: t.price,
        volume: t.vol,
        turnover: t.amount,
      });
    }
  }
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}

// ---- 样式（A 股红涨绿跌 + 主题）----
function buildStyles(): Record<string, unknown> {
  const dark = isDark.value;
  const grid = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const axisText = dark ? "#9aa3b2" : "#5a6472";
  const axisLine = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  const cross = dark ? "#cfd6e0" : "#5a6472";
  const crossTextBg = dark ? "rgba(255,255,255,0.88)" : "rgba(20,30,50,0.85)";
  const crossText = dark ? "#1a1a1a" : "#ffffff";
  const sep = dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
  return {
    grid: {
      horizontal: { color: grid, style: "solid" },
      vertical: { color: grid, style: "solid" },
    },
    candle: {
      type: props.mode === "intraday" ? "area" : "candle_solid",
      bar: {
        upColor: UP,
        downColor: DOWN,
        noChangeColor: "#888888",
        upBorderColor: UP,
        downBorderColor: DOWN,
        noChangeBorderColor: "#888888",
        upWickColor: UP,
        downWickColor: DOWN,
        noChangeWickColor: "#888888",
      },
      priceMark: {
        high: { show: false },
        low: { show: false },
        last: {
          show: true,
          upColor: UP,
          downColor: DOWN,
          noChangeColor: "#888888",
          line: { show: false, style: "dashed", size: 1, dashedValue: [4, 3] },
          text: { show: true, color: "#ffffff", backgroundColor: UP, paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2 },
        },
      },
      tooltip: { showRule: "always" },
      area: {
        lineSize: 2,
        lineColor: "#1677ff",
        value: "close",
        smooth: false,
        backgroundColor: [
          { offset: 0, color: "rgba(22,119,255,0.12)" },
          { offset: 1, color: "rgba(22,119,255,0.01)" },
        ],
      },
    },
    indicator: {
      bars: [
        { style: "fill", upColor: UP, downColor: DOWN, noChangeColor: "#888888", borderStyle: "solid", borderSize: 1, borderDashedValue: [2, 2] },
      ],
      lines: [
        { color: "#f5a623", size: 1 },
        { color: "#1c9cf0", size: 1 },
        { color: "#9b59b6", size: 1 },
        { color: "#2ecc71", size: 1 },
        { color: "#e11d74", size: 1 },
      ],
    },
    xAxis: {
      axisLine: { color: axisLine },
      tickLine: { color: axisLine, length: 3 },
      tickText: { color: axisText, size: 10 },
    },
    yAxis: {
      axisLine: { color: axisLine },
      tickLine: { color: axisLine, length: 3 },
      tickText: { color: axisText, size: 10 },
    },
    crosshair: {
      horizontal: { lineColor: cross, lineStyle: "dashed", lineSize: 1, textColor: crossText, textBackgroundColor: crossTextBg, textBorderColor: crossTextBg, textBorderSize: 1 },
      vertical: { lineColor: cross, lineStyle: "dashed", lineSize: 1, textColor: crossText, textBackgroundColor: crossTextBg, textBorderColor: crossTextBg, textBorderSize: 1 },
    },
    separator: { color: sep, size: 1 },
    overlay: {
      point: { color: "#07c160", radius: 4, borderColor: "#07c160", borderSize: 1 },
      line: { color: "#07c160", size: 1, style: "dashed" },
      text: { color: "#ffffff", backgroundColor: "#07c160" },
    },
  };
}

// ---- 布局（主图 + 成交量 + MACD 三分面，按比例控高）----
function buildLayout(): any[] {
  const usable = Math.max(140, props.height - 24); // 预留 x 轴条
  const priceH = Math.round(usable * (props.showMacd ? 0.56 : 0.7));
  const volH = Math.round(usable * (props.showMacd ? 0.22 : 0.3));
  const macdH = props.showMacd ? Math.max(60, usable - priceH - volH) : 0;
  const candleContent: string[] = [];
  if (props.mode === "kline" && props.showMA) candleContent.push("MA");
  if (props.mode === "intraday") candleContent.push("AVP");
  const layout: any[] = [
    { type: "candle", content: candleContent, options: { id: "candle_pane", height: priceH, minHeight: Math.round(priceH * 0.6) } },
    { type: "indicator", content: ["VOL"], options: { id: "vol_pane", height: volH, minHeight: 40 } },
  ];
  if (props.showMacd) layout.push({ type: "indicator", content: ["MACD"], options: { id: "macd_pane", height: macdH, minHeight: 60 } });
  return layout;
}

// ---- 叠加层：筹码分布 ----
function sizeCanvas(c: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  c.style.width = w + "px";
  c.style.height = h + "px";
  const ctx = c.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
function drawCyq() {
  const c = cyqEl.value;
  if (!c || !chart || !chartEl.value) return;
  const chip = chipData;
  const w = chartEl.value.clientWidth;
  const h = chartEl.value.clientHeight;
  const ctx = sizeCanvas(c, w, h);
  ctx.clearRect(0, 0, w, h);
  if (!chip || !chip.cats || !chip.cats.length) return;
  const prices = chip.cats.map(Number);
  const maxV = Math.max(1, ...chip.vals);
  const regionW = Math.min(w * 0.26, 120);
  const xRight = w - 2;
  const xLeft = xRight - regionW;
  ctx.strokeStyle = isDark.value ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(xLeft, 0);
  ctx.lineTo(xLeft, h);
  ctx.stroke();
  const n = prices.length;
  const yFirst = chart.convertToPixel({ price: prices[0] } as any, { paneId: "candle_pane" }) as any;
  const yLast = chart.convertToPixel({ price: prices[n - 1] } as any, { paneId: "candle_pane" }) as any;
  if (!yFirst || !yLast || typeof yFirst.y !== "number" || typeof yLast.y !== "number") return;
  const span = Math.abs(yLast.y - yFirst.y) || 1;
  const barH = Math.max(1, span / n);
  for (let i = 0; i < n; i++) {
    const yp = chart.convertToPixel({ price: prices[i] } as any, { paneId: "candle_pane" }) as any;
    if (!yp || typeof yp.y !== "number") continue;
    const bw = (chip.vals[i] / maxV) * regionW;
    ctx.fillStyle = chip.colors[i] || "#888888";
    ctx.fillRect(xLeft, yp.y - barH / 2, bw, barH);
  }
}

// ---- 实时价同步（仅分时）----
function applyLivePrice() {
  if (props.mode !== "intraday" || !chart || !dataList.length) return;
  const lp = props.livePrice;
  if (typeof lp !== "number" || !isFinite(lp) || lp <= 0) return;
  const last = dataList[dataList.length - 1];
  chart.updateData({
    timestamp: lastTs,
    open: props.preClose || last.open,
    high: Math.max(last.high, lp),
    low: Math.min(last.low, lp),
    close: lp,
    volume: last.volume,
    turnover: last.turnover,
  });
}

// ---- 生命周期 ----
function destroyChart() {
  if (crosshairCb && chart) {
    try {
      chart.unsubscribeAction(ActionType.OnCrosshairChange, crosshairCb);
    } catch {
      /* noop */
    }
    crosshairCb = null;
  }
  if (chart) {
    try {
      dispose(chart);
    } catch {
      /* noop */
    }
  }
  chart = null;
  overlayIds.length = 0;
}

// ---- 看盘画线工具：用户在图上拖拽绘制支撑/压力/趋势/黄金分割线 ----
// 绘制的线按股票 code 持久化到本地（localStorage），重进自动恢复；不传 code 则仅当前会话。
const overlayIds: string[] = [];
function genOverlayId(): string {
  return `ol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
function persistKey(): string {
  return props.code ? `kc_ol_${props.code}` : "";
}
// 把当前所有已画线同步进本地存储（绘制完成 / 清除时调用）
function persistSave() {
  const key = persistKey();
  if (!props.persist || !key || !chart) return;
  const list = overlayIds
    .map((id) => {
      const o: any = chart!.getOverlayById(id);
      if (!o || !o.points || !o.points.length) return null;
      return { id, type: o.name ?? o.type, points: o.points, styles: o.styles };
    })
    .filter(Boolean) as any[];
  try {
    uni.setStorageSync(key, list);
  } catch {
    /* noop */
  }
}
// 调用 KLineCharts 进入绘制交互；绘制完成后 onDrawEnd 落盘
type DrawAction = "support" | "pressure" | "trend" | "fib";
const activeAction = ref<DrawAction | "">("");
function drawLine(action: DrawAction, type: string, color?: string) {
  if (!chart) return;
  const id = genOverlayId();
  overlayIds.push(id);
  activeAction.value = action;
  const created = chart.createOverlay({
    id,
    name: type, // 关键：KLineCharts 用 overlay.name 匹配内置类型，不是 type
    styles: color ? { line: { color, style: "solid", size: 1.4 } } : undefined,
    onDrawEnd: () => {
      activeAction.value = "";
      persistSave();
    },
  } as never);
  if (!created) {
    overlayIds.pop(); // 创建失败（如已有绘制进行中）回退
    activeAction.value = "";
  }
}
// 清空用户手动画的线（不影响系统自动线），并清本地存储
function clearUserOverlays() {
  if (chart) overlayIds.forEach((id) => { try { chart!.removeOverlay(id); } catch { /* noop */ } });
  overlayIds.length = 0;
  activeAction.value = "";
  const key = persistKey();
  if (key) {
    try {
      uni.removeStorageSync(key);
    } catch {
      /* noop */
    }
  }
}
// ---- 自动画线（小白友好）：系统按行情自动标注支撑/压力/趋势 ----
// 半透明虚线 + 锁定（不可拖拽编辑），与用户手绘的浓实线明显区分；不持久化，随数据刷新。
// 关键：KLineCharts overlay 的 point 字段是 { timestamp, value }（不是 price）；用错字段会导致价格→y 坐标失败被钳到顶部。
const autoIds: string[] = [];
const autoLevels: AutoLevel[] = [];
const autoEnabled = ref(true);
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// 摆动点（pivot）：以 win 根为窗口取严格局部极值；窗口天然把相邻极值隔开 ≥win 根，无需额外 gap 过滤
type Swing = { idx: number; t: number; value: number };
function findSwings(series: any[], win: number): { highs: Swing[]; lows: Swing[] } {
  const highs: Swing[] = [];
  const lows: Swing[] = [];
  const n = series.length;
  for (let i = win; i < n - win; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - win; j <= i + win; j++) {
      if (j === i) continue;
      if (series[j].high >= series[i].high) isHigh = false;
      if (series[j].low <= series[i].low) isLow = false;
    }
    if (isHigh) highs.push({ idx: i, t: series[i].timestamp, value: series[i].high });
    if (isLow) lows.push({ idx: i, t: series[i].timestamp, value: series[i].low });
  }
  return { highs, lows };
}

// 把摆动点按价位容差聚成关键价位区间，按 触及次数 + 近期权重 打分排序
interface Cluster { price: number; min: number; max: number; touches: number; score: number; }
function clusterLevels(pts: Swing[], tolPct: number, recentN: number): Cluster[] {
  if (!pts.length) return [];
  const sorted = [...pts].sort((a, b) => a.value - b.value);
  const groups: { values: number[]; idxs: number[] }[] = [];
  for (const p of sorted) {
    const last = groups[groups.length - 1];
    const center = last ? last.values[0] : p.value;
    if (last && Math.abs(p.value - center) <= tolPct * center) last.values.push(p.value);
    else groups.push({ values: [p.value], idxs: [p.idx] });
  }
  return groups
    .map((g) => {
      const avg = g.values.reduce((s, v) => s + v, 0) / g.values.length;
      const min = Math.min(...g.values);
      const max = Math.max(...g.values);
      const lastTouch = Math.max(...g.idxs);
      const recency = 1 - (recentN - lastTouch) / Math.max(1, recentN); // 0~1，越近权重越大
      return { price: avg, min, max, touches: g.values.length, score: g.values.length * (0.5 + 0.5 * recency) };
    })
    .sort((a, b) => b.score - a.score);
}

// 判定主趋势：上升=近期摆动低点依次抬高；下降=近期摆动高点依次降低（二者冲突则不下结论，避免矛盾叠加）
function detectTrend(highs: Swing[], lows: Swing[]): { dir: "up" | "down"; points: { timestamp: number; value: number }[] } | null {
  const ls = lows.slice(-3);
  const hs = highs.slice(-3);
  const up = ls.length >= 2 && ls[ls.length - 1].value > ls[0].value;
  const down = hs.length >= 2 && hs[hs.length - 1].value < hs[0].value;
  if (up && !down) return { dir: "up", points: [{ timestamp: ls[0].t, value: ls[0].value }, { timestamp: ls[ls.length - 1].t, value: ls[ls.length - 1].value }] };
  if (down && !up) return { dir: "down", points: [{ timestamp: hs[0].t, value: hs[0].value }, { timestamp: hs[hs.length - 1].t, value: hs[hs.length - 1].value }] };
  return null;
}

// 灵敏度→算法参数映射：灵敏度越高→聚类容差越小（更密更多线）、窗口越小、最多线数越多
function sensitivityParams() {
  const s = clamp(props.autoSensitivity ?? 5, 1, 10);
  const win = props.mode === "intraday" ? 3 : 5;
  const tolPct = 0.003 + (10 - s) * 0.0009; // s=10→0.3%  s=1→≈1.1%
  const maxLevels = clamp(Math.round(s / 2.5), 1, 4); // s=5→2  s=10→4  s=1→1
  return { s, win, tolPct, maxLevels };
}
// 扫描窗口（近 N 根）：默认日K=120、分时=240；允许用户用 autoPeriod 覆盖
function scanPeriod(): number {
  const p = props.autoPeriod;
  if (typeof p === "number" && p > 0) return Math.min(p, dataList.length);
  return Math.min(props.mode === "intraday" ? 240 : 120, dataList.length);
}

interface AutoLevel {
  kind: "pressure" | "support" | "trend";
  price?: number;
  min?: number;
  max?: number;
  points?: { timestamp: number; value: number }[];
  color: string;
  label: string;
  touches: number;
  dir?: "up" | "down";
}
// 计算系统画线（支撑/压力/趋势），结果同时驱动 overlay 与悬浮提示
function computeAutoLevels(): AutoLevel[] {
  const out: AutoLevel[] = [];
  const dl = dataList;
  if (!dl || dl.length < 10) return out;
  const N = scanPeriod();
  const recent = dl.slice(-N);
  const { win, tolPct, maxLevels } = sensitivityParams();
  const { highs, lows } = findSwings(recent, win);
  for (const r of clusterLevels(highs, tolPct, recent.length).slice(0, maxLevels))
    out.push({ kind: "pressure", price: r.price, min: r.min, max: r.max, touches: r.touches, color: hexA(UP, 0.62), label: "压力" });
  for (const sp of clusterLevels(lows, tolPct, recent.length).slice(0, maxLevels))
    out.push({ kind: "support", price: sp.price, min: sp.min, max: sp.max, touches: sp.touches, color: hexA(DOWN, 0.62), label: "支撑" });
  const tr = detectTrend(highs, lows);
  if (tr) out.push({ kind: "trend", points: tr.points, dir: tr.dir, touches: tr.points.length, color: hexA(TREND, 0.72), label: tr.dir === "up" ? "上升趋势" : "下降趋势" });
  return out;
}
// 清旧自动线并按当前开关重画
function drawAutoLevels() {
  autoIds.forEach((id) => { try { chart?.removeOverlay(id); } catch { /* noop */ } });
  autoIds.length = 0;
  autoLevels.length = 0;
  if (!props.autoDraw || !chart || !autoEnabled.value) return;
  for (const lv of computeAutoLevels()) {
    try {
      const id = `auto_${lv.kind}_${Math.random().toString(36).slice(2, 7)}`;
      if (lv.kind === "trend" && lv.points) {
        chart.createOverlay({
          id, name: "autoTrendLine", points: lv.points, lock: true,
          styles: { line: { color: lv.color, style: "dashed", size: 1.4, dashedValue: [4, 3] } },
        } as never);
      } else if (typeof lv.price === "number") {
        const t0 = dataList[0].timestamp;
        chart.createOverlay({
          id, name: "horizontalStraightLine", points: [{ timestamp: t0, value: lv.price }], lock: true,
          styles: { line: { color: lv.color, style: "dashed", size: 1.2, dashedValue: [4, 3] } },
        } as never);
      }
      autoIds.push(id);
      autoLevels.push(lv);
    } catch {
      /* noop */
    }
  }
}
// 切换自动画线开关
function toggleAuto() {
  autoEnabled.value = !autoEnabled.value;
  drawAutoLevels();
}

// ---- 自动趋势线自定义 overlay（线段 + 末端三角箭头标示方向）----
let trendOverlayRegistered = false;
function ensureTrendOverlay() {
  if (trendOverlayRegistered) return;
  try {
    registerOverlay({
      name: "autoTrendLine",
      needDefaultPointFigure: false,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      createPointFigures: (params: any) => {
        const coordinates = params.coordinates as { x: number; y: number }[];
        const overlay = params.overlay as any;
        if (!coordinates || coordinates.length < 2) return [];
        const a = coordinates[0];
        const b = coordinates[coordinates.length - 1];
        const col = overlay?.styles?.line?.color || TREND;
        const up = b.y < a.y; // 像素坐标 y 越小价格越高
        const size = 7;
        const arrow = up
          ? [{ x: b.x, y: b.y }, { x: b.x - size, y: b.y + size * 1.6 }, { x: b.x + size, y: b.y + size * 1.6 }]
          : [{ x: b.x, y: b.y }, { x: b.x - size, y: b.y - size * 1.6 }, { x: b.x + size, y: b.y - size * 1.6 }];
        return [
          { type: "line", attrs: { coordinates: [a, b] }, styles: { style: "dashed", size: 1.4, color: col, dashedValue: [4, 3] }, ignoreEvent: true },
          { type: "polygon", attrs: { coordinates: arrow }, styles: { style: "fill", color: col, borderColor: col, borderSize: 1 }, ignoreEvent: true },
        ];
      },
    } as never);
    trendOverlayRegistered = true;
  } catch {
    /* noop */
  }
}

// ---- 自动线悬浮提示框（跟随十字光标，显示类型/价位/区间/触及次数/方向）----
// 自动线 lock:true 不响应 overlay 事件，故改用 onCrosshairChange + convertFromPixel 反算价格匹配最近线
interface TipItem { label: string; color: string; text: string; }
const tip = reactive<{ show: boolean; x: number; y: number; items: TipItem[] }>({ show: false, x: 0, y: 0, items: [] });
const tipStyle = computed(() => {
  const w = chartEl.value ? chartEl.value.clientWidth : 0;
  const left = tip.x > w - 170 ? tip.x - 178 : tip.x + 14;
  const top = Math.max(8, tip.y - 10);
  return { left: left + "px", top: top + "px" };
});
let crosshairCb: ((d: any) => void) | null = null;
function onCrosshair(c: any) {
  if (!chart || !c || !c.paneId || c.paneId !== "candle_pane" || c.x == null || c.y == null) {
    tip.show = false;
    return;
  }
  const pts = chart.convertFromPixel([{ x: c.x, y: c.y }], { paneId: "candle_pane" }) as any;
  const pt = Array.isArray(pts) ? pts[0] : pts;
  if (!pt || typeof pt.price !== "number") {
    tip.show = false;
    return;
  }
  const price = pt.price;
  const tol = price * 0.006; // 悬浮吸附容差（约 0.6%）
  const items: TipItem[] = [];
  for (const lv of autoLevels) {
    if (lv.kind === "trend" && lv.points && c.kLineData) {
      const [p1, p2] = lv.points;
      const tMin = Math.min(p1.timestamp, p2.timestamp);
      const tMax = Math.max(p1.timestamp, p2.timestamp);
      const ts = c.kLineData.timestamp as number;
      if (ts >= tMin && ts <= tMax) {
        const frac = (ts - p1.timestamp) / (p2.timestamp - p1.timestamp || 1);
        const interp = p1.value + (p2.value - p1.value) * frac;
        if (Math.abs(price - interp) <= tol) items.push({ label: lv.label, color: lv.color, text: `方向 ${lv.dir === "up" ? "↑ 上行" : "↓ 下行"} · 经 ${lv.touches} 点` });
      }
    } else if (typeof lv.price === "number") {
      if (Math.abs(price - lv.price) <= tol) {
        const zone = lv.min !== lv.max ? `区间 ${lv.min!.toFixed(2)}~${lv.max!.toFixed(2)}` : "";
        items.push({ label: lv.label, color: lv.color, text: `${lv.price.toFixed(2)} ${zone} · 触及 ${lv.touches} 次`.trim() });
      }
    }
  }
  if (!items.length) {
    tip.show = false;
    return;
  }
  tip.items = items;
  tip.x = c.x;
  tip.y = c.y;
  tip.show = true;
}
// 从本地存储恢复已画线（在 applyNewData 之后调用，依赖数据坐标系）
function restoreOverlays() {
  const key = persistKey();
  if (!props.persist || !key || !chart) return;
  let saved: any[] = [];
  try {
    saved = uni.getStorageSync(key) || [];
  } catch {
    saved = [];
  }
  if (!Array.isArray(saved)) return;
  for (const it of saved) {
    if (!it || !it.type || !Array.isArray(it.points) || !it.points.length) continue;
    try {
      const id = it.id || genOverlayId();
      chart.createOverlay({ id, name: it.type, points: it.points, styles: it.styles } as never);
      if (!overlayIds.includes(id)) overlayIds.push(id);
    } catch {
      /* noop */
    }
  }
}

// 完整构建图表（销毁旧实例并从头初始化）：仅在结构变化（mode/layout）或首次挂载时调用
function buildChart() {
  if (!chartEl.value) return;
  destroyChart();
  ensureAvp();
  ensureTrendOverlay();
  dataList = toKLineData();
  if (dataList.length) lastTs = dataList[dataList.length - 1].timestamp;
  chipData = props.klines && props.klines.length ? computeChip(props.klines) : null;

  chart = init(chartEl.value, {
    layout: buildLayout(),
    styles: buildStyles(),
    customApi: {
      formatDate: (dt: Intl.DateTimeFormat, timestamp: number, format: string) => {
        const d = new Date(timestamp);
        const p = (n: number) => String(n).padStart(2, "0");
        if (props.mode === "intraday") return `${p(d.getHours())}:${p(d.getMinutes())}`;
        return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      },
      formatBigNumber: (v: string | number) => String(v),
    },
  } as never);
  if (!chart) return;

  // 十字光标订阅（驱动自动线悬浮提示）；单实例，销毁时已解除订阅
  crosshairCb = onCrosshair;
  chart.subscribeAction(ActionType.OnCrosshairChange, crosshairCb as never);

  chart.applyNewData(dataList);
  nextTick(() => {
    if (!chart || !chartEl.value) return;
    chart.resize();
    // 等主图比例尺测量完成再叠加 overlay，避免价格→像素映射过早被钳到顶部（表现为所有线堆在顶部一条虚线）
    const drawOverlays = () => {
      if (!chart || !chartEl.value) return;
      drawCyq();
      restoreOverlays();
      drawAutoLevels();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(drawOverlays));
    else setTimeout(drawOverlays, 60);
  });
}

// 数据变化（klines/trends/preClose）增量刷新：避免整图重建导致的闪烁与实时卡顿
function refreshData() {
  if (!chart) {
    buildChart();
    return;
  }
  dataList = toKLineData();
  if (dataList.length) lastTs = dataList[dataList.length - 1].timestamp;
  chipData = props.klines && props.klines.length ? computeChip(props.klines) : null;
  try {
    chart.applyNewData(dataList);
  } catch {
    // 极少数情况下 applyNewData 失败，回退整图重建
    buildChart();
    return;
  }
  drawCyq();
  drawAutoLevels();
}

function resizeAll() {
  if (chart) {
    try {
      chart.resize();
    } catch {
      /* noop */
    }
  }
  drawCyq();
}

function applyTheme() {
  if (!chart) return;
  chart.setStyles(buildStyles() as never);
  drawCyq();
}

onMounted(async () => {
  await nextTick();
  buildChart();
  if (typeof window !== "undefined" && window.ResizeObserver) {
    ro = new ResizeObserver(() => resizeAll());
    if (chartEl.value) ro.observe(chartEl.value);
  }
});

// 结构变化（周期/均线/MACD 开关）→ 整图重建；数据变化（行情/昨收）→ 增量刷新
watch(
  () => [props.klines, props.trends, props.preClose],
  () => refreshData()
);
watch(
  () => [props.mode, props.showMA, props.showMacd],
  () => buildChart()
);
watch(
  () => [props.livePrice, props.livePreClose],
  () => applyLivePrice()
);
watch(isDark, () => applyTheme());

onBeforeUnmount(() => {
  if (ro) {
    ro.disconnect();
    ro = null;
  }
  if (cyqEl.value) {
    const ctx = cyqEl.value.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, cyqEl.value.width, cyqEl.value.height);
  }
  destroyChart();
});
</script>

<style scoped>
.kc {
  position: relative;
  width: 100%;
}
.kc-chart {
  position: relative;
  width: 100%;
  background: var(--card);
  border: 1rpx solid var(--border);
  border-radius: 16rpx;
  overflow: hidden;
  touch-action: none;
}
.kc-ov {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.kc-ov--cyq {
  z-index: 2;
}
/* 看盘画线工具栏：浮于图表右上角，玻璃药丸 */
.kc-tools {
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  z-index: 6;
  display: flex;
  gap: 8rpx;
  padding: 6rpx;
  background: var(--card);
  border: 1rpx solid var(--border);
  border-radius: 999rpx;
  box-shadow: var(--shadow-1);
}
.kct-btn {
  flex: 0 0 auto;
  height: 52rpx;
  line-height: 52rpx;
  padding: 0 18rpx;
  font-size: var(--font-xs);
  color: var(--text-2);
  background: var(--card-2);
  border-radius: 999rpx;
  transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
  cursor: pointer;
}
.kct-btn:active {
  background: var(--primary-soft);
  color: var(--primary);
  transform: scale(0.96);
}
/* 绘制中：按钮高亮，提示用户正在图上画线（KLineCharts 进入绘制交互） */
.kct-btn.active {
  background: var(--primary);
  color: #fff;
}
.kct-clear {
  color: var(--danger);
}
.kct-clear:active {
  background: rgba(229, 72, 77, 0.12);
}
/* 自动线颜色图例：浮于图表左下角，小白一眼看懂颜色含义 */
.kc-legend {
  position: absolute;
  left: 12rpx;
  bottom: 12rpx;
  z-index: 5;
  display: flex;
  gap: 16rpx;
  padding: 6rpx 14rpx;
  background: var(--card);
  border: 1rpx solid var(--border);
  border-radius: 999rpx;
  box-shadow: var(--shadow-1);
  font-size: var(--font-xs);
  color: var(--text-2);
  pointer-events: none;
}
.kcl-it {
  display: inline-flex;
  align-items: center;
  gap: 5rpx;
}
.kcl-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  display: inline-block;
}
.kcl-dot.s {
  background: #09b07a;
}
.kcl-dot.p {
  background: #ef232a;
}
.kcl-dot.t {
  background: #2f74ff;
}
/* 自动线悬浮提示框：跟随十字光标，玻璃卡片，不拦截指针 */
.kc-tip {
  position: absolute;
  z-index: 7;
  min-width: 150rpx;
  max-width: 320rpx;
  padding: 10rpx 12rpx;
  background: var(--card);
  border: 1rpx solid var(--border);
  border-radius: 14rpx;
  box-shadow: var(--shadow-2);
  font-size: var(--font-xs);
  color: var(--text);
  pointer-events: none;
}
.kc-tip-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 3rpx 0;
  white-space: nowrap;
}
.kc-tip-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  flex: 0 0 auto;
}
.kc-tip-label {
  color: var(--text-2);
  flex: 0 0 auto;
}
.kc-tip-text {
  color: var(--text);
  margin-left: auto;
  padding-left: 10rpx;
}
</style>
