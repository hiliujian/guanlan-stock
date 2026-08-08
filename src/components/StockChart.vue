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
      <view v-show="zoomVisible" class="kc-zoom" role="group" aria-label="图表缩放">
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

    <section class="kc-panel" :class="{ 'kc-panel--last': !showMacd }">
      <div class="kc-panel__hd">
        <text class="kc-panel__tag">成交量</text>
      </div>
      <div ref="volEl" class="kc-canvas" :style="{ height: volH + 'px' }"></div>
    </section>

    <section v-show="showMacd" class="kc-panel kc-panel--last">
      <div class="kc-panel__hd">
        <text class="kc-panel__tag">MACD</text>
      </div>
      <div ref="macdEl" class="kc-canvas" :style="{ height: macdH + 'px' }"></div>
    </section>

    <!-- 时间轴标注：三图共享一条对齐的时间标尺，按可视范围智能选取关键时间点，
         缩放/平移时动态重算；替代 klinecharts 内置轴（内置仅落在最底面板、拥挤且无法对齐三图）。 -->
    <view class="kc-xaxis" role="img" :aria-label="axisAria">
      <view
        v-for="(t, i) in axisLabels"
        :key="i"
        class="kc-xaxis__tick"
        :class="{ 'kc-xaxis__tick--left': i === 0, 'kc-xaxis__tick--right': i === axisLabels.length - 1 }"
        :style="{ left: t.x + 'px' }"
      >
        <text class="kc-xaxis__txt">{{ t.text }}</text>
      </view>
      <!-- 十字光标下的时间提示框：跟随横向十字线位置，与纵轴价格标尺（内置 crosshair）一致联动 -->
      <view
        v-if="crosshairTs.show"
        class="kc-xaxis__timeline"
        :style="{ left: crosshairTs.x + 'px' }"
      >
        <text class="kc-xaxis__timeline-txt">{{ crosshairTs.text }}</text>
      </view>
    </view>
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
    /** 是否显示均线 MA（价格面板叠加），默认开 */
    showMA?: boolean;
    /** 是否显示 MACD 面板（隐藏后时间轴自动移到成交量面板），默认开 */
    showMacd?: boolean;
    /**
     * 实时最新价（与行情头部同一个 5s 实时快照），仅在分时模式生效：
     * 用于把「最后一根分时柱」的动态价格同步为该实时价，使走势图最新值与
     * 股票卡片头部完全一致、同源、实时更新（避免两路独立请求各显示 1.77/1.78）。
     * 通过 klinecharts 的 updateData 仅更新最后一根，不重置缩放/滚动。
     */
    livePrice?: number;
    /** 实时昨收（与 livePrice 同源），用于分时着色与涨跌幅口径一致 */
    livePreClose?: number;
  }>(),
  { height: 440, showMA: true, showMacd: true }
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
    // 日K 丢弃时间分量（时间戳为当日 00:00，显示时分无意义），并清理残留分隔符。
    // crosshair/tooltip 传入 'YYYY-MM-DD HH:mm'，HH/mm 置空后会留下尾部冒号，
    // 需一并清掉，否则会出现 "2026-07-31:" 这种带末尾冒号的错误显示。
    return format
      .replace(/YYYY|MM|DD|HH|mm|ss/g, (k) => (k === "HH" || k === "mm" || k === "ss" ? "" : map[k]))
      .replace(/\s+/g, "")
      .replace(/-{2,}/g, "-")
      .replace(/:+/g, ":")
      .replace(/^[-:]+|[-:]+$/g, "");
  }
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (k) => map[k]);
}

// 三块面板各自的高度：价格占主，成交量/MACD 各约两成；隐藏 MACD 时其高度归零、
// 量能面板自动顶上补足，保证总高 = props.height 不变形
const priceH = computed(() => Math.max(170, Math.round(props.height * 0.56)));
const volH = computed(() =>
  props.showMacd
    ? Math.max(72, Math.round(props.height * 0.22))
    : Math.max(72, props.height - priceH.value)
);
const macdH = computed(() => (props.showMacd ? Math.max(80, props.height - priceH.value - volH.value) : 0));

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
  // 时间轴改由自定义覆盖层（kc-xaxis）统一绘制：三图对齐、可读、缩放联动；
  // 关闭 klinecharts 内置轴（内置仅落在最底面板，拥挤且无法对齐三图）。
  const showXAxis = false;
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
      // 最底面板 size="auto" 让 klinecharts 按 crosshair vertical text 高度自适应预留空间；
      // 其他面板 size=0 不留空白。轴线/刻度文字仍由 show=false 关闭，时间轴标签走 kc-xaxis。
      // 全部关闭内置 x 轴文字区：横轴日期提示统一由底部 .kc-xaxis__timeline 覆盖层承担，
      // 保证 K线/成交量/MACD 三图提示一致（不再只有最底面板有内置气泡）。
      size: 0 as number | "auto",
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
      // 纵轴价恪标尺（右侧 OHLC 气泡）保留；横轴时间提示统一交给项目自定义覆盖层
      // `.kc-xaxis__timeline`（已按 dataIndex 取价格图时间戳，分时显示 HH:mm、日K 显示日期），
      // 故关闭内置竖线时间气泡，避免英文 "Time:" 前缀、也与底部分时/日K 提示去重。
      horizontal: { text: { backgroundColor: isDark.value ? "#cfd3da" : "#5a5a5a" } },
      vertical: { text: { show: false, backgroundColor: isDark.value ? "#cfd3da" : "#5a5a5a" } },
    },
  };
}

// A股配色：涨=红(UP)、跌=绿(DOWN)。klinecharts 内置 MACD/VOL 直方图默认沿用「绿涨红跌」西式习惯
// （MACD 正值=绿、负值=红；VOL 收>开=绿、收<开=红），与 A股相反。这里强制覆盖直方图颜色：
// - MACD：柱值 >0（正值/上涨）=红，<0（负值/下跌）=绿；金叉/上穿即红、死叉/下穿即绿，整图逻辑自洽。
// - VOL：收>开（阳）=红，收<开（阴）=绿，与 K线阳红阴绿统一。
// MACD 的 DIF/DEA 两线另设对比色（金/蓝），与红绿柱区分、提升可读性。
// 仅作用于量/MACD 面板（价格面板用蜡烛自身的 up/down 色，已符合 A股）。
function applyAshareBarColors(c: Chart, kind: Kind) {
  if (kind !== "vol" && kind !== "macd") return;
  const styles: Record<string, unknown> = {
    bars: [{ upColor: UP, downColor: DOWN, noChangeColor: "#888888" }],
  };
  if (kind === "macd") {
    // 顺序对应 MACD 指标 figures：lines[0]=DIF、lines[1]=DEA
    styles.lines = [{ color: "#f5a623" }, { color: "#1c9cf0" }];
  }
  c.overrideIndicator({ name: kind === "vol" ? "VOL" : "MACD", styles });
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
    // 东财 trends2 的 f51 是完整日期时间字符串 "YYYY-MM-DD HH:MM"（非纯 "HH:MM"）。
    // 必须先取空格后的时间部分再按 ":" 切分；直接 split(":") 会把 "2026-08-03 09"
    // 当成小时 → NaN，导致整图时间戳失效、crosshair 显示 "Time: NaN-NaN-NaN"、刻度全丢。
    const tStr = t.t || "";
    const timePart = tStr.includes(" ") ? tStr.split(" ").pop()! : tStr;
    const [hh, mm] = timePart.split(":").map(Number);
    const h = isFinite(hh) ? hh : 0;
    const m = isFinite(mm) ? mm : 0;
    const ts = base.getTime() + (h * 60 + m) * 60_000;
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

// 把「最后一根分时柱」的动态价格同步为实时快照价（livePrice）：
// 仅更新最后一根（klinecharts updateData），不重灌整图、不重置缩放/滚动，
// 使分时走势图「最新值」与股票卡片头部（同源 5s 实时快照）严格一致。
// 非分时模式不生效（日K 末根为历史收盘价，语义不同，由头部 live 价独立展示）。
function applyLivePrice() {
  if (props.mode !== "intraday" || !priceChart) return;
  const lp = props.livePrice;
  if (typeof lp !== "number" || !isFinite(lp) || lp <= 0) return;
  const list = priceChart.getDataList() as Array<Record<string, any>>;
  if (!list.length) return;
  const last = list[list.length - 1];
  const updated: Record<string, any> = {
    ...last,
    close: lp, // 分时走势以 close 为现价
  };
  // 价格突破当前柱高/低时一并修正，避免出现 close 超出 high/low 的异常柱
  if (typeof last.high === "number") updated.high = Math.max(last.high, lp);
  if (typeof last.low === "number") updated.low = Math.min(last.low, lp);
  try {
    priceChart.updateData(updated as any);
  } catch (e) {
    /* 数据尚未就绪时忽略 */
  }
}

function computeChipFor(): ChipData | null {
  return props.klines && props.klines.length ? computeChip(props.klines) : null;
}

// 三实例横向滚动/缩放联动 -------------------------------------------------
let syncing = false;
// 数据刷新/初始挂载期间的「联动锁」：klinecharts 在 applyNewData 后会异步 scrollToRealTime，
// 三图各自滚动会经 OnScroll 互相污染（谁最后滚谁生效 → K线停在最新、量/MACD 停在中段）。
// 锁定期内屏蔽跨图联动，待内部滚动全部落定后，由 alignAll() 以价格面板为基准做一次权威对齐。
let lockSync = false;
let lockTimer: ReturnType<typeof setTimeout> | null = null;
// crosshair 联动标志：setCrosshair 同步到其他面板会触发其 OnCrosshairChange 回环，需跳过
let syncingCrosshair = false;
function alignScroll(src: Chart) {
  if (syncing || lockSync) return;
  syncing = true;
  const offset = src.getOffsetRightDistance();
  for (const c of [priceChart, volChart, macdChart]) {
    if (c && c !== src) {
      const d = offset - c.getOffsetRightDistance();
      if (Math.abs(d) > 0.5) c.scrollByDistance(d);
    }
  }
  syncing = false;
  scheduleAxisRender();
}
function alignZoom(src: Chart) {
  if (syncing || lockSync) return;
  syncing = true;
  const bs = src.getBarSpace();
  for (const c of [priceChart, volChart, macdChart]) {
    if (c && c !== src) {
      const cur = c.getBarSpace();
      if (Math.abs(cur - bs) > 0.01) c.setBarSpace(bs);
    }
  }
  bumpZoom();
  syncing = false;
  scheduleAxisRender();
}

// 解除联动锁并做「权威对齐」：等 klinecharts 内部 scrollToRealTime 全部落定后，
// 以价格面板为基准强制量/MACD 匹配其 barSpace + 右偏移。双 rAF 后再延时，
// 避开内部滚动动画；并补两次对齐兜住动画更慢的版本，确保三图稳定对齐到最新交易日。
function releaseSyncDeferred() {
  if (lockTimer) clearTimeout(lockTimer);
  const raf =
    typeof requestAnimationFrame !== "undefined"
      ? requestAnimationFrame
      : ((cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16));
  raf(() => {
    raf(() => {
      lockTimer = setTimeout(() => {
        alignAll(); // 此刻 lockSync 仍 true，内部 scrollByDistance 不会经 OnScroll 外泄
        lockSync = false; // 对齐完成后再放开跨图联动
        lockTimer = setTimeout(() => alignAll(), 450); // 慢动画补一次
      }, 160);
    });
  });
}

// 三实例初始/刷新后对齐：以价格面板为基准，把量/MACD 的 barSpace 与右偏移同步过来。
// 根因：量/MACD 面板主图蜡烛被压成 0 高，applyNewData 后 scrollToRealTime 行为异常，
// 导致三图初始可见范围错位（如 K线最新、量中段、MACD 左段），crosshair 也随之错位。
function alignAll() {
  if (!priceChart) return;
  syncing = true;
  const targetOff = priceChart.getOffsetRightDistance();
  const tbsRaw = priceChart.getBarSpace();
  const targetBs = typeof tbsRaw === "number" ? tbsRaw : (tbsRaw as unknown as { bar?: number }).bar ?? null;
  for (const c of [volChart, macdChart]) {
    if (!c) continue;
    try {
      if (targetBs != null) {
        const cbsRaw = c.getBarSpace();
        const cb = typeof cbsRaw === "number" ? cbsRaw : (cbsRaw as unknown as { bar?: number }).bar;
        if (typeof cb === "number" && Math.abs(cb - targetBs) > 0.01) c.setBarSpace(targetBs);
      }
    } catch (e) {
      /* noop */
    }
    try {
      const d = targetOff - c.getOffsetRightDistance();
      if (Math.abs(d) > 0.5) c.scrollByDistance(d);
    } catch (e) {
      /* noop */
    }
  }
  syncing = false;
  scheduleAxisRender();
}

// 把当前面板的 crosshair 同步到其余两个面板，实现 K线/成交量/MACD 三图十字光标联动：
// 鼠标在任一图移动，其余两图同位置显示垂直线（量/MACD 主图虽 0 高，indicator pane 仍会绘制）。
function syncCrosshairToOthers(src: Chart, realX: number | null, realY = 6) {
  syncingCrosshair = true;
  for (const o of [priceChart, volChart, macdChart]) {
    if (!o || o === src) continue;
    try {
      if (realX != null && isFinite(realX)) {
        // 各面板用各自「可见」的指标窗格承载十字线：价格→candle、成交量→VOL、MACD→MACD。
        // 量/MACD 的蜡烛主图被压成 0 高，若锁在 candle_pane 上十字线（及横轴日期提示伴随的
        // 垂直线）不可见；指向指标窗格即可让 K线/成交量也像 MACD 那样出现光标+日期提示。
        const paneId = o === priceChart ? "candle" : o === volChart ? "VOL" : "MACD";
        (o as any).setCrosshair?.({ x: realX, y: realY, paneId });
      } else {
        (o as any).clearCrosshair?.();
      }
    } catch (e) {
      /* 忽略个别面板同步失败 */
    }
  }
  syncingCrosshair = false;
}

// 缩放工具栏：默认隐藏，仅在用户缩放（滚轮 / 捏合 / 点按 ±或重置）时短暂显现，
// 停止操作 1.8s 后自动收起，避免长期遮挡图表视图。
const zoomVisible = ref(false);
let zoomHideTimer: ReturnType<typeof setTimeout> | null = null;
function bumpZoom() {
  zoomVisible.value = true;
  if (zoomHideTimer) clearTimeout(zoomHideTimer);
  zoomHideTimer = setTimeout(() => {
    zoomVisible.value = false;
  }, 1800);
}
function registerSync(c: Chart) {
  c.subscribeAction(ActionType.OnScroll, () => alignScroll(c));
  c.subscribeAction(ActionType.OnZoom, () => alignZoom(c));
  // 十字光标移动/显示/消失：联动更新底部时间提示框，
  // 三面板各订阅一次；以最后一次有效事件为准（三面板数据索引同步，故无歧义）。
  c.subscribeAction(ActionType.OnCrosshairChange, (payload) => {
    // 由 setCrosshair 同步触发的回环事件，跳过避免重复处理
    if (syncingCrosshair) return;
    // klinecharts OnCrosshairChange 回调类型：
    //   interface Crosshair { realX, realY, dataIndex, realDataIndex, kLineData?, paneId? }
    //   未悬停时 Crosshair 的所有字段缺失（payload 为 {} 或含空值）；悬停时 realX/dataIndex 有值。
    const p = (payload ?? {}) as Partial<{
      realX: number;
      realY: number;
      dataIndex: number;
      realDataIndex: number;
      kLineData: KLineData;
      paneId: string;
    }>;
    const el = priceEl.value;
    const data = priceChart?.getDataList() ?? [];
    const dIdx = typeof p.dataIndex === "number" && isFinite(p.dataIndex) ? p.dataIndex : null;
    const realX = typeof p.realX === "number" && isFinite(p.realX) ? p.realX : null;
    const realY = typeof p.realY === "number" && isFinite(p.realY) ? p.realY : 6;
    // 横轴提示文本按 dataIndex 从价格图数据取时间戳：三图数据同步、稳定可靠，
    // 不再依赖各面板回调里的 kLineData（量/MACD 面板主图高度为 0 时 kLineData 时常缺失，
    // 正是不显示横轴提示的根因）。也让 K线/成交量面板悬停同样有日期提示。
    if (dIdx == null || realX == null || !data.length) {
      crosshairTs.value = { show: false, x: 0, text: "" };
      syncCrosshairToOthers(c, null);
      return;
    }
    const ts = data[dIdx]?.timestamp;
    if (!ts) {
      crosshairTs.value = { show: false, x: 0, text: "" };
      syncCrosshairToOthers(c, null);
      return;
    }
    // 不同面板的 realX 是各自 canvas 内的像素，而三面板宽度一致、数据同步：
    // 为确保绝对对齐，这里用 dataIndex 重算价格面板的真实 x。
    let x = realX;
    try {
      const r = (priceChart?.convertToPixel({ dataIndex: dIdx }, { paneId: "candle" }) as { x?: number }) || null;
      if (r && typeof r.x === "number" && isFinite(r.x)) x = r.x;
    } catch (e) {
      /* 用 realX 兜底 */
    }
    const w = el?.getBoundingClientRect().width ?? 0;
    const safeX = w > 0 ? Math.max(10, Math.min(w - 10, x)) : x;
    crosshairTs.value = {
      show: true,
      x: safeX,
      text: crosshairDateText(ts, props.mode),
    };
    // 联动其余两图显示同位置 crosshair 垂直线
    syncCrosshairToOthers(c, realX, realY);
  });
}

// ── 自定义时间轴（覆盖层）──────────────────────────────────────────────
// 三图共享同一条时间标尺：用价格图的可视范围 + 坐标映射，按关键时间点标注，
// 缩放/平移时动态重算；保证 K线/量/MACD 三图横坐标严格对齐（同数据索引、同滚动缩放）。
const axisLabels = ref<{ x: number; text: string }[]>([]);
// 十字光标下的时间提示框：跟随 crosshair 横向位置，显示当前点位的日期/时间
// （对标主流财经软件：纵轴有价格标尺、横轴必然有日期标尺，两者联动出现/消失）。
const crosshairTs = ref<{ show: boolean; x: number; text: string }>({ show: false, x: 0, text: "" });
let axisScheduled = false;
function scheduleAxisRender() {
  if (axisScheduled) return;
  axisScheduled = true;
  const raf =
    typeof requestAnimationFrame !== "undefined"
      ? requestAnimationFrame
      : ((cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16));
  raf(() => {
    axisScheduled = false;
    renderAxis();
  });
}

// 按周期（日/周/月）自适应分组：依据相邻数据的时间跨度推断，避免依赖外部周期标记。
function inferPeriodGroup(data: KLineData[]): "day" | "week" | "month" {
  if (!data || data.length < 2) return "day";
  const dayMs = 86_400_000;
  const deltas: number[] = [];
  for (let i = 1; i < Math.min(data.length, 6); i++) {
    deltas.push((data[i].timestamp - data[i - 1].timestamp) / dayMs);
  }
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  if (avg >= 25) return "month";
  if (avg >= 5) return "week";
  return "day";
}

const p2 = (n: number) => String(n).padStart(2, "0");

// 坐标轴标签格式化：跨年显示 YYYY-MM；同年内日K 显示 MM-DD，周/月K 显示 MM（年份变化处带年）。
function formatAxisLabel(d: Date, prev: Date | null, group: "day" | "week" | "month"): string {
  const Y = d.getFullYear();
  const M = d.getMonth() + 1;
  if (!prev || prev.getFullYear() !== Y) return `${Y}-${p2(M)}`;
  if (group === "day") return `${p2(M)}-${p2(d.getDate())}`;
  return p2(M);
}

// 分时关键时间点（交易时段标记）：开盘/午间/收盘，与同花顺/东财一致。
const INTRADAY_MARKERS = ["09:30", "10:30", "11:30", "13:00", "14:00", "15:00"];
function findIntradayIndex(data: KLineData[], hhmm: string): number | null {
  const [h, m] = hhmm.split(":").map(Number);
  const base = new Date(data[0].timestamp);
  base.setHours(0, 0, 0, 0);
  const target = base.getTime() + (h * 60 + m) * 60_000;
  let best: number | null = null;
  let bestDiff = Infinity;
  for (let i = 0; i < data.length; i++) {
    const diff = Math.abs(data[i].timestamp - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

// 相邻标签最小间距（px）：375px 屏 ~6 个标签，420px ~7 个，密度贴近同花顺/东财
const MIN_LABEL_GAP = 52;
// 标签约 36px 宽（MM-DD 或 YYYY-MM），右侧最新标签需留出不被裁剪的安全内边距
const EDGE_PAD = 20;

function renderAxis() {
  const chart = priceChart;
  const el = priceEl.value;
  if (!chart || !el) {
    axisLabels.value = [];
    return;
  }
  const data = chart.getDataList();
  if (!data || !data.length) {
    axisLabels.value = [];
    return;
  }
  const range = chart.getVisibleRange();
  if (!range) {
    axisLabels.value = [];
    return;
  }
  const lo = Math.max(0, Math.floor(range.from));
  const hi = Math.min(data.length - 1, Math.ceil(range.to));
  if (hi < lo) {
    axisLabels.value = [];
    return;
  }
  const width = el.getBoundingClientRect().width;
  if (width <= 0) {
    axisLabels.value = [];
    return;
  }

  // x 坐标计算：优先用 convertToPixel（精确对齐 klinecharts 内部坐标）；
  // 若 API 不可用（返回 null/NaN，部分版本或生命周期时机问题），用等间距兜底。
  const visibleCount = hi - lo + 1;
  const barW = width / visibleCount;
  let convertOk = false;
  try {
    const testR = chart.convertToPixel({ dataIndex: lo }, { paneId: "candle" }) as { x?: number };
    convertOk = !!testR && typeof testR.x === "number" && isFinite(testR.x);
  } catch (e) {
    convertOk = false;
  }
  const xOf = (i: number): number => {
    if (convertOk) {
      try {
        const r = chart.convertToPixel({ dataIndex: i }, { paneId: "candle" }) as { x?: number };
        if (r && typeof r.x === "number" && isFinite(r.x)) return r.x;
      } catch (e) {
        /* 兜底到等间距 */
      }
    }
    return (i - lo + 0.5) * barW; // bar 中心位置
  };

  if (props.mode === "intraday") {
    // 分时：只标注具有代表性的交易时段节点（开盘/午间/收盘），天然控密度
    const out: { x: number; text: string }[] = [];
    let lastX = -Infinity;
    for (const mk of INTRADAY_MARKERS) {
      const idx = findIntradayIndex(data, mk);
      if (idx == null) continue;
      const x = xOf(idx);
      if (!isFinite(x) || x < EDGE_PAD / 2 || x > width - EDGE_PAD) continue;
      if (out.length && x - lastX < MIN_LABEL_GAP) continue;
      out.push({ x, text: mk });
      lastX = x;
    }
    axisLabels.value = out;
    return;
  }

  // ── K线（日/周/月）：从右向左取点，强制确保最新交易日始终可见且不被裁剪 ──
  const group = inferPeriodGroup(data);

  // 第一步：收集候选（月首、周首（周一）、月初第一个交易日、每 5 日辅助）
  type Candidate = { i: number; x: number; d: Date; key: boolean };
  const cands: Candidate[] = [];
  for (let i = lo; i <= hi; i++) {
    const d = new Date(data[i].timestamp);
    const x = xOf(i);
    // 边界内缩：右端给 20px 避免最新日期被容器 clip，左端给 4px
    if (!isFinite(x) || x < 4 || x > width - EDGE_PAD) continue;
    const day = d.getDate();
    const wd = d.getDay(); // 0=周日 1=周一 ...
    const month = d.getMonth();
    const isMonthStart =
      day === 1 || (i > lo && new Date(data[i - 1].timestamp).getMonth() !== month);
    const isWeekStart =
      wd === 1 ||
      (i > lo &&
        (new Date(data[i - 1].timestamp).getDate() !== day - 1 ||
          new Date(data[i - 1].timestamp).getMonth() !== month) &&
        wd <= 3);
    // 每 5/10/15/20/25/30 号也是辅助节点（当没有周/月首时，维持均匀密度）
    const is5th = day % 5 === 0;
    cands.push({ i, x, d, key: isMonthStart || isWeekStart || is5th });
  }
  if (!cands.length) {
    axisLabels.value = [];
    return;
  }

  // 第二步：从右向左贪心，最新点强制
  const picked: Candidate[] = [];
  const rightMost = cands[cands.length - 1];
  // 最新日期：强制不超出右边界；如果 xOf 给出的位置接近右边界但靠右，则向左贴边（transform:right 对齐）
  const rightSafeX = Math.min(width - EDGE_PAD, rightMost.x);
  const rightMostAdj: Candidate = { ...rightMost, x: rightSafeX };
  picked.push(rightMostAdj);
  let lastX = rightSafeX;
  const maxLabels = Math.max(5, Math.floor(width / MIN_LABEL_GAP));

  // 2a) 向左按关键级优先（月/周首 > 5 日 > 等间距兜底）
  for (let idx = cands.length - 2; idx >= 0 && picked.length < maxLabels; idx--) {
    const c = cands[idx];
    if (!c.key) continue;
    if (lastX - c.x < MIN_LABEL_GAP) continue;
    picked.push(c);
    lastX = c.x;
  }

  // 2b) 若仍稀疏（少于 4 个），按等间距补位（从 rightMost.i 向左 step）
  if (picked.length < 4) {
    const step = Math.max(1, Math.floor((hi - lo) / maxLabels));
    for (let i = rightMost.i - step; i >= lo && picked.length < maxLabels; i -= step) {
      const x = xOf(i);
      if (!isFinite(x) || x < EDGE_PAD / 2 || x > width - EDGE_PAD) continue;
      if (lastX - x < MIN_LABEL_GAP * 0.9) continue;
      if (picked.some((p) => p.i === i)) continue;
      picked.push({ i, x, d: new Date(data[i].timestamp), key: false });
      lastX = x;
    }
  }

  // 2c) 最左点强制可见（间距达标时补）
  const leftMost = cands[0];
  if (
    leftMost.i !== picked[picked.length - 1].i &&
    lastX - leftMost.x >= MIN_LABEL_GAP * 0.6 &&
    !picked.some((p) => p.i === leftMost.i)
  ) {
    picked.push(leftMost);
  }

  // 第三步：升序 + 格式化（跨年显 YYYY-MM，同年日K显 MM-DD）
  picked.sort((a, b) => a.i - b.i);
  const out: { x: number; text: string }[] = [];
  let prev: Date | null = null;
  for (const c of picked) {
    out.push({ x: c.x, text: formatAxisLabel(c.d, prev, group) });
    prev = c.d;
  }
  axisLabels.value = out;
}

// 十字光标下的时间文本格式化：日K=YYYY-MM-DD；分时=HH:MM
function crosshairDateText(ts: number, mode: "kline" | "intraday"): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  if (mode === "intraday") return `${p(d.getHours())}:${p(d.getMinutes())}`;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const axisAria = computed(() =>
  axisLabels.value.length ? "时间轴：" + axisLabels.value.map((t) => t.text).join("，") : "时间轴"
);

// 挂载单个面板实例
function mountPanel(kind: Kind, node: HTMLElement): Chart | null {
  const c = init(node, { customApi: { formatDate } });
  if (!c) return null;
  // 图表内置文案（crosshair OHLC 气泡等）默认英文(enUS)，统一切中文语言包，
  // 避免「Time: / Open:」等英文前缀；横轴时间提示由项目自定义覆盖层承担。
  try {
    c.setLocale("zh-CN");
  } catch (e) {
    /* 旧版本无此方法则忽略 */
  }
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
      if (props.showMA) {
        c.createIndicator("MA", true, { id: "candle_pane" });
        c.overrideIndicator({ name: "MA", calcParams: [5, 10, 20, 60] });
      }
      const chip = computeChipFor();
      if (chip) {
        c.createIndicator("CYQ", true, { id: "candle_pane" });
        c.overrideIndicator({ name: "CYQ", calcParams: [chip] }, "candle_pane");
      }
    }
  } else {
    // 成交量 / MACD 面板：主图蜡烛透明化并压成极小条，只显示各自指标
    c.createIndicator(kind === "vol" ? "VOL" : "MACD");
    // A股红涨绿跌：覆盖 MACD/VOL 直方图默认西式配色（见 applyAshareBarColors）
    applyAshareBarColors(c, kind);
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
  bumpZoom();
  if (!priceChart || !priceEl.value) return;
  const rect = priceEl.value.getBoundingClientRect();
  priceChart.zoomAtCoordinate(step, { x: rect.width / 2, y: rect.height / 2 });
}
function resetZoom() {
  bumpZoom();
  if (!priceChart) return;
  if (fitBarSpace.value != null) priceChart.setBarSpace(fitBarSpace.value);
  priceChart.scrollToRealTime();
}

function setup() {
  destroyAll();
  if (!priceEl.value || !volEl.value) return;
  lockSync = true; // 锁住跨图联动，屏蔽初始 applyNewData 各自 scrollToRealTime 的互相污染
  priceChart = mountPanel("price", priceEl.value);
  volChart = mountPanel("vol", volEl.value);
  // MACD 关闭时不创建该面板（时间轴已自动移到成交量面板）
  if (props.showMacd && macdEl.value) {
    macdChart = mountPanel("macd", macdEl.value);
  }
  scheduleAxisRender();
  releaseSyncDeferred(); // 内部滚动落定后权威对齐三图
  applyLivePrice(); // 初始挂载即把最后一根分时柱同步为实时价（与卡片头部一致）
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
  scheduleAxisRender();
  if (priceChart) {
    lockSync = true; // 切换股票/周期重灌数据时同样锁住跨图联动，避免异步滚动互相污染
    releaseSyncDeferred();
  }
  applyLivePrice(); // 重灌后把最后一根分时柱同步为实时价（与卡片头部一致）
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
  if (volChart) {
    volChart.setStyles(styleFor("vol"));
    applyAshareBarColors(volChart, "vol");
  }
  if (macdChart) {
    macdChart.setStyles(styleFor("macd"));
    applyAshareBarColors(macdChart, "macd");
  }
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
      scheduleAxisRender();
    });
    if (priceEl.value) ro.observe(priceEl.value);
    if (volEl.value) ro.observe(volEl.value);
    if (macdEl.value && props.showMacd) ro.observe(macdEl.value);
  }
});

// 数据更新（切换股票 / 周期刷新）→ 重灌数据，指标自动重算
watch(
  () => [props.klines, props.trends, props.preClose],
  () => refreshData()
);

// 实时快照价变化（每 ~5s）→ 仅把分时图最后一根同步为该实时价，
// 使走势图「最新值」与股票卡片头部严格一致（同源、实时），不重置缩放/滚动。
watch(
  () => [props.livePrice, props.livePreClose],
  () => applyLivePrice()
);

// 周期切换（日K ↔ 分时）需要更换蜡烛类型与指标 → 整图重建
watch(
  () => props.mode,
  () => setup()
);

// 指标开关：MA 动态增删（保留缩放态，不重建）；MACD 涉及面板结构与时间轴归属 → 重建整图
watch(
  () => props.showMA,
  (on) => {
    if (!priceChart) return;
    try {
      if (on) {
        priceChart.createIndicator("MA", true, { id: "candle_pane" });
        priceChart.overrideIndicator({ name: "MA", calcParams: [5, 10, 20, 60] });
      } else {
        priceChart.removeIndicator("candle_pane", "MA");
      }
    } catch (e) {
      /* 指标尚未就绪时忽略 */
    }
  }
);
watch(
  () => props.showMacd,
  () => setup()
);

// 深浅主题切换 → 重设样式（canvas 不继承 CSS 变量，需主动重设配色）
watch(isDark, () => applyTheme());

onBeforeUnmount(() => {
  if (ro) {
    ro.disconnect();
    ro = null;
  }
  if (zoomHideTimer) {
    clearTimeout(zoomHideTimer);
    zoomHideTimer = null;
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
  font-size: var(--font-xs);
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
  top: 12rpx;
  right: 12rpx;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  padding: 4rpx;
  border-radius: var(--radius-sm);
  background: var(--glass, rgba(255, 255, 255, 0.62));
  border: 1rpx solid var(--border);
  box-shadow: 0 6rpx 18rpx rgba(20, 30, 50, 0.16);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8rpx);
}
.kc-zoom__btn {
  width: 52rpx;
  height: 52rpx;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-md);
  line-height: 1;
  color: var(--text-2);
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
/* 时间轴覆盖层：三图共享一条对齐的时间标尺，位于三块面板之下、独立成行。
   每个标签居中对齐到对应数据点（与图表内纵向网格线同源），上方 5px 短刻度呼应网格。 */
.kc-xaxis {
  position: relative;
  height: 28px;
  margin-top: 2rpx;
  pointer-events: none;
  overflow: hidden;
  padding-right: 4px;
  box-sizing: border-box;
}
.kc-xaxis__tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}
/* 端点标签：最左端左对齐不超出左边框，最右端右对齐不超出右边框（避免被容器裁剪） */
.kc-xaxis__tick--left { transform: translateX(0); align-items: flex-start; }
.kc-xaxis__tick--right { transform: translateX(-100%); align-items: flex-end; }
.kc-xaxis__tick::before {
  content: "";
  width: 1px;
  height: 5px;
  background: var(--border);
  margin-bottom: 1px;
}
.kc-xaxis__txt {
  font-size: 11px;
  line-height: 1;
  color: var(--text-2);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
/* 十字光标下的时间提示框：样式对标 klinecharts 内置的纵轴价格标尺
   （灰底、圆角、左右箭头指示当前 x 位置，字体与纵轴保持一致）。 */
.kc-xaxis__timeline {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  padding: 0 8px;
  min-width: 72px;
  max-width: 130px;
  border-radius: 4px;
  background: #5a5a5a;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.18);
  z-index: 5;
  animation: kc-timeline-in 80ms ease-out both;
}
html[data-theme="dark"] .kc-xaxis__timeline,
:root.dark .kc-xaxis__timeline {
  background: #cfd3da;
}
.kc-xaxis__timeline::after {
  content: "";
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: 1px;
  height: 8px;
  background: #5a5a5a;
}
html[data-theme="dark"] .kc-xaxis__timeline::after,
:root.dark .kc-xaxis__timeline::after {
  background: #cfd3da;
}
.kc-xaxis__timeline-txt {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  color: #ffffff;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.3px;
}
html[data-theme="dark"] .kc-xaxis__timeline-txt,
:root.dark .kc-xaxis__timeline-txt {
  color: #1c2026;
}
@keyframes kc-timeline-in {
  from { opacity: 0; transform: translateX(-50%) scale(0.92); }
  to { opacity: 1; transform: translateX(-50%) scale(1); }
}
</style>
