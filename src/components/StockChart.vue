<template>
  <!-- 板块化行情图：价格 / 成交量 / MACD 拆成三张独立面板卡片，
       各自带背景与边框，块间留间距，三者横向滚动与缩放联动。 -->
  <div class="kc-panels">
    <section class="kc-panel">
      <div class="kc-panel__hd">
        <text class="kc-panel__tag">价格</text>
      </div>
      <div ref="priceEl" class="kc-canvas" :style="{ height: priceH + 'px' }"></div>
      <!-- 缩放工具栏：滚轮/捏合之外的显式入口，触屏与无障碍兜底 -->
      <view class="kc-zoom" role="group" aria-label="图表缩放">
        <view
          class="kc-zoom__btn"
          role="button"
          tabindex="0"
          aria-label="缩小"
          @click="zoomBy(-1)"
          @keydown.enter.prevent="zoomBy(-1)"
          >－</view
        >
        <view
          class="kc-zoom__btn"
          role="button"
          tabindex="0"
          aria-label="重置缩放"
          @click="resetZoom()"
          @keydown.enter.prevent="resetZoom()"
          >⟲</view
        >
        <view
          class="kc-zoom__btn"
          role="button"
          tabindex="0"
          aria-label="放大"
          @click="zoomBy(1)"
          @keydown.enter.prevent="zoomBy(1)"
          >＋</view
        >
      </view>
    </section>

    <section class="kc-panel">
      <div class="kc-panel__hd">
        <text class="kc-panel__tag">成交量</text>
      </div>
      <div ref="volEl" class="kc-canvas" :style="{ height: volH + 'px' }"></div>
    </section>

    <section class="kc-panel kc-panel--last">
      <div class="kc-panel__hd">
        <text class="kc-panel__tag">MACD</text>
      </div>
      <div ref="macdEl" class="kc-canvas" :style="{ height: macdH + 'px' }"></div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import {
  init,
  dispose,
  CandleType,
  registerIndicator,
  ActionType,
  type Chart,
  type KLineData,
  type IndicatorDrawParams,
} from "klinecharts";
import { isDark } from "@/utils/theme";
import { computeChip, type ChipResult } from "@/utils/analyzer";
import { UP, DOWN } from "@/utils/colors";
import type { Kline, Trend } from "@/utils/period";

type ChipData = ChipResult;

// klinecharts v9 无内置 CYQ，这里注册一个自定义「叠加」指标，把筹码成本分布以横向
// 直方图形式绘制在价格面板蜡烛窗格的右侧（同花顺式：价位为纵轴、占比为横轴、红绿区分
// 成本高于/低于现价）。计算复用 analyzer.computeChip，仅负责把结果画出来。
let cyqRegistered = false;
function ensureCyq() {
  if (cyqRegistered) return;
  try {
    registerIndicator<ChipData | null>({
      name: "CYQ",
      shortName: "筹码",
      calc: (_dataList, indicator) => {
        const chip = (indicator.calcParams && indicator.calcParams[0]) || null;
        return _dataList.map(() => chip);
      },
      createTooltipDataSource: (params) => {
        const chip = (params.indicator.calcParams && params.indicator.calcParams[0]) as ChipData | undefined;
        if (!chip) return { name: "筹码分布", calcParamsText: "", icons: [], values: [] };
        return {
          name: "筹码分布",
          calcParamsText: "",
          icons: [],
          values: [
            { title: "密集峰", value: chip.peakPrice.toFixed(2) },
            { title: "成本重心", value: chip.avgCost.toFixed(2) },
            { title: "获利盘", value: (chip.profitRatio * 100).toFixed(1) + "%" },
          ],
        };
      },
      draw: (params: IndicatorDrawParams) => {
        const { ctx, yAxis, bounding, indicator } = params;
        const chip = (indicator.calcParams && indicator.calcParams[0]) as ChipData | undefined;
        if (!chip || !chip.cats || !chip.cats.length) return false;
        const n = chip.cats.length;
        const prices = chip.cats.map(Number);
        const maxV = Math.max(1, ...chip.vals);
        // 右侧区域绘制（给价格轴标签留 38px 余地），宽度随容器自适应、上限 140px
        const regionW = Math.min(bounding.width * 0.3, 140);
        const xRight = bounding.right - 38;
        const xLeft = xRight - regionW;
        const yFirst = yAxis.convertToPixel(prices[0]);
        const yLast = yAxis.convertToPixel(prices[n - 1]);
        const span = Math.abs(yLast - yFirst) || 1;
        const barH = Math.max(1, span / n);
        ctx.save();
        ctx.globalAlpha = 0.8;
        for (let i = 0; i < n; i++) {
          const y = yAxis.convertToPixel(prices[i]);
          if (!isFinite(y)) continue;
          const w = (chip.vals[i] / maxV) * regionW;
          ctx.fillStyle = chip.colors[i] || "#888888";
          ctx.fillRect(xLeft, y - barH / 2, w, barH);
        }
        ctx.restore();
        return true;
      },
    });
    cyqRegistered = true;
  } catch (e) {
    /* 重复注册（HMR 等）则忽略 */
  }
}

const props = withDefaults(
  defineProps<{
    /** kline = 日K（蜡烛+均线+量+MACD）；intraday = 分时（走势+均价+量+MACD） */
    mode: "kline" | "intraday";
    klines?: Kline[];
    trends?: Trend[];
    /** 分时昨收，用于把每根 K 的 open 设为昨收，从而得到正确的涨跌着色 */
    preClose?: number;
    height?: number;
  }>(),
  { height: 440 }
);

// 时间轴 / 十字光标日期格式化（接管 klinecharts 默认实现）：
// 默认实现依赖 Intl 的「, 」分割，locale 一变就崩，且日期零填充缺失（如 "2026-8-2"）；
// 日K 还会带无意义的 "00:00"。这里用原生 Date 字段零填充，完全对照主流财经软件：
//  · 日K：坐标轴/光标只显示日期（不显示 00:00）；自适应粒度由 klinecharts 决定——
//    跨年显示 YYYY、跨月显示 YYYY-MM、否则 MM-DD（与东财/同花顺一致）；
//  · 分时：显示 HH:mm（午休缺口由数据本身保留，符合真实交易时段）。
function formatDate(_dtf: Intl.DateTimeFormat, timestamp: number, format: string): string {
  const d = new Date(timestamp);
  const p = (n: number) => String(n).padStart(2, "0");
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    MM: p(d.getMonth() + 1),
    DD: p(d.getDate()),
    HH: p(d.getHours()),
    mm: p(d.getMinutes()),
    ss: p(d.getSeconds()),
  };
  if (props.mode === "kline") {
    // 日K 丢弃时间分量（时间戳为当日 00:00，显示时分无意义），并清理残留分隔符
    return format
      .replace(/YYYY|MM|DD|HH|mm|ss/g, (k) => (k === "HH" || k === "mm" || k === "ss" ? "" : map[k]))
      .replace(/\s+/g, "")
      .replace(/-{2,}/g, "-")
      .replace(/^-|-$/g, "");
  }
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (k) => map[k]);
}

// 三块面板各自的高度：价格占主，成交量/MACD 各约两成
const priceH = computed(() => Math.max(170, Math.round(props.height * 0.56)));
const volH = computed(() => Math.max(72, Math.round(props.height * 0.22)));
const macdH = computed(() => Math.max(80, props.height - priceH.value - volH.value));

const priceEl = ref<HTMLElement | null>(null);
const volEl = ref<HTMLElement | null>(null);
const macdEl = ref<HTMLElement | null>(null);

let priceChart: Chart | null = null;
let volChart: Chart | null = null;
let macdChart: Chart | null = null;
let ro: ResizeObserver | null = null;

// 价格面板「自适应全部数据」时的 barSpace 基准，用于缩放工具栏的「重置」一键还原。
const fitBarSpace = ref<number | null>(null);

// 红涨绿跌（A股惯例）：涨=红、跌=绿，颜色取自 @/utils/colors（与 CYQ 筹码直方图同源）
const TRANSPARENT = "rgba(0,0,0,0)";

type Kind = "price" | "vol" | "macd";

// 每个面板一套样式：价格面板画真实蜡烛；成交量/MACD 面板把蜡烛主图压成透明极小条，
// 只留各自的指标；时间轴仅在最底 MACD 面板显示（顺带收起其余面板的滚动条）。
function styleFor(kind: Kind) {
  const intraday = props.mode === "intraday";
  const hideCandle = kind !== "price";
  const showXAxis = kind === "macd";
  const gridColor = isDark.value ? "#1c2026" : "#eef1f5";
  const axisColor = isDark.value ? "#33383f" : "#d8d8d8";
  const tickColor = isDark.value ? "#8b929e" : "#8a8a8a";
  return {
    candle: {
      type: intraday ? CandleType.Area : CandleType.CandleSolid,
      bar: hideCandle
        ? {
            upColor: TRANSPARENT,
            downColor: TRANSPARENT,
            noChangeColor: TRANSPARENT,
            upBorderColor: TRANSPARENT,
            downBorderColor: TRANSPARENT,
            upWickColor: TRANSPARENT,
            downWickColor: TRANSPARENT,
          }
        : {
            upColor: UP,
            downColor: DOWN,
            noChangeColor: "#888888",
            upBorderColor: UP,
            downBorderColor: DOWN,
            upWickColor: UP,
            downWickColor: DOWN,
          },
      priceMark: hideCandle
        ? { high: { show: false }, low: { show: false }, last: { show: false } }
        : {
            high: { color: "#c8c8c8" },
            low: { color: "#c8c8c8" },
            last: {
              upColor: UP,
              downColor: DOWN,
              noChangeColor: "#888888",
              text: { color: "#ffffff" },
            },
          },
    },
    grid: {
      horizontal: { color: gridColor },
      vertical: { color: gridColor },
    },
    xAxis: {
      show: showXAxis,
      axisLine: { show: showXAxis, color: axisColor },
      tickText: { show: showXAxis, color: tickColor, size: 11 },
      tickLine: { show: showXAxis, color: axisColor },
    },
    yAxis: {
      axisLine: { color: axisColor },
      tickText: { color: tickColor },
      tickLine: { color: axisColor },
    },
    separator: { size: 1, color: isDark.value ? "#2a2f36" : "#e6e6e6" },
    crosshair: {
      horizontal: { text: { backgroundColor: isDark.value ? "#cfd3da" : "#5a5a5a" } },
      vertical: { text: { backgroundColor: isDark.value ? "#cfd3da" : "#5a5a5a" } },
    },
  };
}

function buildData(): KLineData[] {
  if (props.mode === "kline") {
    return (props.klines ?? []).map((k) => ({
      timestamp: Date.parse(k.date),
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.vol,
      turnover: k.amount,
    }));
  }
  // 分时：把 HH:MM 映射到「今日」时刻（保留 11:30–13:00 午休缺口，符合真实交易时段）。
  // 每根 open 固定为昨收 → close(现价) 高于/低于昨收即红/绿，得到同花顺式分时涨跌着色；
  // 蜡烛类型用 area，渲染为连续的分时走势 + 填充。均价(AVP)由内置指标在 setup() 中叠加。
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const pre = props.preClose || 0;
  return (props.trends ?? []).map((t) => {
    const [hh, mm] = t.t.split(":").map(Number);
    const ts = base.getTime() + (hh * 60 + mm) * 60_000;
    return {
      timestamp: ts,
      open: pre,
      high: t.high,
      low: t.low,
      close: t.price,
      volume: t.vol,
      turnover: t.amount,
    };
  });
}

function computeChipFor(): ChipData | null {
  return props.klines && props.klines.length ? computeChip(props.klines) : null;
}

// 三实例横向滚动/缩放联动 -------------------------------------------------
let syncing = false;
function alignScroll(src: Chart) {
  if (syncing) return;
  syncing = true;
  const offset = src.getOffsetRightDistance();
  for (const c of [priceChart, volChart, macdChart]) {
    if (c && c !== src) {
      const d = offset - c.getOffsetRightDistance();
      if (Math.abs(d) > 0.5) c.scrollByDistance(d);
    }
  }
  syncing = false;
}
function alignZoom(src: Chart) {
  if (syncing) return;
  syncing = true;
  const bs = src.getBarSpace();
  for (const c of [priceChart, volChart, macdChart]) {
    if (c && c !== src) {
      const cur = c.getBarSpace();
      if (Math.abs(cur - bs) > 0.01) c.setBarSpace(bs);
    }
  }
  syncing = false;
}
function registerSync(c: Chart) {
  c.subscribeAction(ActionType.OnScroll, () => alignScroll(c));
  c.subscribeAction(ActionType.OnZoom, () => alignZoom(c));
}

// 挂载单个面板实例
function mountPanel(kind: Kind, node: HTMLElement): Chart | null {
  const c = init(node, { customApi: { formatDate } });
  if (!c) return null;
  // 关键：双指捏合缩放。浏览器默认 touch-action 会拦截双指手势（视为页面缩放），
  // 必须显式设为 none，把所有触摸手势交给 klinecharts 自行处理，否则 pinch 不生效。
  node.style.touchAction = "none";
  // 自定义滚轮缩放（修复 PC 端鼠标滚轮无法缩放）：
  // klinecharts 原生滚轮只在「主图蜡烛区(MAIN widget)」生效——而本图把成交量/MACD 面板的
  // 蜡烛主图压成 0 高(setPaneOptions height:0)，这两块根本没有 MAIN 区可悬停，原生滚轮在
  // 它们上面完全失效；价格面板也只在精确停在蜡烛上才生效。故在捕获阶段挂自有 wheel 监听，
  // 用官方 zoomAtCoordinate 直接缩放(不依赖 MAIN widget、按光标位置锚定)，并
  // stopImmediatePropagation 挡掉原生那套会失效/重复的滚轮处理。三面板经既有 OnZoom 订阅自动联动。
  node.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const rect = node.getBoundingClientRect();
      // klinecharts 的 zoom(scale) 实现为 barSpace += scale*(barSpace/10)：
      // scale 为正 → 放大，为负 → 缩小（原生滚轮也是 scroll up=正=放大）。
      // 故上滚(deltaY<0)放大、下滚(deltaY>0)缩小；并按幅度缩放让触控板更顺滑。
      // 此前代码缩小侧传 0.9（正值）→ 实际仍放大，造成「只能放大不能缩小」。
      const step = (e.deltaY < 0 ? 1 : -1) * Math.min(1, Math.abs(e.deltaY) / 100);
      c.zoomAtCoordinate(step, {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    { capture: true, passive: false }
  );
  c.setStyles(styleFor(kind));
  if (kind === "price") {
    ensureCyq();
    if (props.mode === "intraday") {
      c.createIndicator("AVP", true, { id: "candle_pane" });
    } else {
      c.createIndicator("MA", true, { id: "candle_pane" });
      c.overrideIndicator({ name: "MA", calcParams: [5, 10, 20, 60] });
      const chip = computeChipFor();
      if (chip) {
        c.createIndicator("CYQ", true, { id: "candle_pane" });
        c.overrideIndicator({ name: "CYQ", calcParams: [chip] }, "candle_pane");
      }
    }
  } else {
    // 成交量 / MACD 面板：主图蜡烛透明化并压成极小条，只显示各自指标
    c.createIndicator(kind === "vol" ? "VOL" : "MACD");
    c.setPaneOptions({ id: "candle_pane", height: 0, minHeight: 0 });
  }
  c.applyNewData(buildData());
  // 价格面板初次灌数据后，记录自适应基准（供「重置」还原；量/MACD 经 OnZoom 联动）
  // 注：klinecharts v9.7 类型把 getBarSpace() 标为 number，但运行时返回 {bar,...}，故兼容取值。
  if (kind === "price") {
    const bs = c.getBarSpace() as unknown as { bar?: number };
    fitBarSpace.value = typeof bs === "number" ? bs : (bs.bar as number);
  }
  registerSync(c);
  return c;
}

// 缩放工具栏（＋/－/重置）：触屏与无障碍兜底，PC 滚轮与双指捏合仍可用。
// 仅在价格面板操作，经既有的 OnZoom 订阅自动联动量/MACD 面板。
function zoomBy(step: number) {
  if (!priceChart || !priceEl.value) return;
  const rect = priceEl.value.getBoundingClientRect();
  priceChart.zoomAtCoordinate(step, { x: rect.width / 2, y: rect.height / 2 });
}
function resetZoom() {
  if (!priceChart) return;
  if (fitBarSpace.value != null) priceChart.setBarSpace(fitBarSpace.value);
  priceChart.scrollToRealTime();
}

function setup() {
  destroyAll();
  if (!priceEl.value || !volEl.value || !macdEl.value) return;
  priceChart = mountPanel("price", priceEl.value);
  volChart = mountPanel("vol", volEl.value);
  macdChart = mountPanel("macd", macdEl.value);
}

// 切换股票 / 周期刷新：重灌数据（指标自动重算），并刷新价格面板的筹码分布
function refreshData() {
  const data = buildData();
  priceChart?.applyNewData(data);
  volChart?.applyNewData(data);
  macdChart?.applyNewData(data);
  // 数据长度变化会改变自适应基准，重记以便「重置」仍贴合当前数据
  if (priceChart) {
    const bs = priceChart.getBarSpace() as unknown as { bar?: number };
    fitBarSpace.value = typeof bs === "number" ? bs : (bs.bar as number);
  }
  if (priceChart && props.mode === "kline") {
    const chip = computeChipFor();
    try {
      if (chip) priceChart.overrideIndicator({ name: "CYQ", calcParams: [chip] }, "candle_pane");
    } catch (e) {
      /* CYQ 尚未创建则忽略 */
    }
  }
}

function destroyChart(c: Chart | null) {
  if (c) {
    try {
      dispose(c);
    } catch (e) {
      /* 忽略重复销毁 */
    }
  }
}
function destroyAll() {
  destroyChart(priceChart);
  destroyChart(volChart);
  destroyChart(macdChart);
  priceChart = volChart = macdChart = null;
}

function applyTheme() {
  if (priceChart) priceChart.setStyles(styleFor("price"));
  if (volChart) volChart.setStyles(styleFor("vol"));
  if (macdChart) macdChart.setStyles(styleFor("macd"));
}

onMounted(async () => {
  await nextTick();
  setup();
  if (typeof window !== "undefined" && window.ResizeObserver) {
    ro = new ResizeObserver(() => {
      for (const c of [priceChart, volChart, macdChart]) {
        if (c) {
          try {
            c.resize();
          } catch (e) {
            /* noop */
          }
        }
      }
    });
    if (priceEl.value) ro.observe(priceEl.value);
    if (volEl.value) ro.observe(volEl.value);
    if (macdEl.value) ro.observe(macdEl.value);
  }
});

// 数据更新（切换股票 / 周期刷新）→ 重灌数据，指标自动重算
watch(
  () => [props.klines, props.trends, props.preClose],
  () => refreshData()
);

// 周期切换（日K ↔ 分时）需要更换蜡烛类型与指标 → 整图重建
watch(
  () => props.mode,
  () => setup()
);

// 深浅主题切换 → 重设样式（canvas 不继承 CSS 变量，需主动重设配色）
watch(isDark, () => applyTheme());

onBeforeUnmount(() => {
  if (ro) {
    ro.disconnect();
    ro = null;
  }
  destroyAll();
});
</script>

<style scoped>
.kc-panels {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}
/* 每个子图是一张独立面板卡片：底色略深一档、细边框、圆角，块间留空 → 清晰的板块感 */
.kc-panel {
  position: relative;
  background: var(--card-2);
  border: 1rpx solid var(--border);
  border-radius: 16rpx;
  overflow: hidden;
}
.kc-panel__hd {
  display: flex;
  align-items: center;
  padding: 12rpx 16rpx 4rpx;
}
.kc-panel__tag {
  font-size: 22rpx;
  font-weight: 600;
  letter-spacing: 1rpx;
  color: var(--text-2);
}
.kc-canvas {
  width: 100%;
  /* 背景透明，露出面板底色（var(--card-2)），由主题 CSS 控制明暗 */
  background: transparent;
}
/* 缩放工具栏：浮于价格面板右上角，毛玻璃底、纵向三键（－ / 重置 / ＋）。
   触屏与无障碍兜底，滚轮与双指捏合仍为主交互；z-index 高于 canvas。 */
.kc-zoom {
  position: absolute;
  top: 16rpx;
  right: 16rpx;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 6rpx;
  border-radius: 14rpx;
  background: var(--glass, rgba(255, 255, 255, 0.62));
  border: 1rpx solid var(--border);
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8rpx);
}
.kc-zoom__btn {
  width: 64rpx;
  height: 64rpx;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36rpx;
  line-height: 1;
  color: var(--text);
  border-radius: 10rpx;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
  user-select: none;
}
.kc-zoom__btn:active {
  background: var(--primary);
  color: #fff;
  transform: scale(0.94);
}
.kc-zoom__btn:focus-visible {
  outline: 2rpx solid var(--primary);
  outline-offset: 2rpx;
}
</style>
