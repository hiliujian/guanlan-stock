<template>
  <!-- klinecharts 基于原生 canvas 渲染，直接用 div 作容器（H5 下等价于 DOM 节点） -->
  <div ref="el" class="kc-box" :style="{ height: height + 'px' }"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { init, dispose, CandleType, registerIndicator, type Chart, type KLineData, type IndicatorDrawParams } from "klinecharts";
import { isDark } from "@/utils/theme";
import { computeChip, type ChipResult } from "@/utils/analyzer";
import { UP, DOWN } from "@/utils/colors";
import type { Kline, Trend } from "@/utils/period";

// 成本分布（筹码）数据结构（来自 analyzer.computeChip）
type ChipData = ChipResult;

// klinecharts v9 无内置 CYQ，这里注册一个自定义「叠加」指标，把筹码成本分布以横向
// 直方图形式绘制在主图蜡烛窗格的右侧（同花顺式：价位为纵轴、占比为横轴、红绿区分
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

const el = ref<HTMLElement | null>(null);
let chart: Chart | null = null;
let ro: ResizeObserver | null = null;

// 红涨绿跌（A股惯例）：涨=红、跌=绿，颜色取自 @/utils/colors（与 CYQ 筹码直方图同源）

function buildStyles(area: boolean) {
  return {
    candle: {
      type: area ? CandleType.Area : CandleType.CandleSolid,
      bar: {
        upColor: UP,
        downColor: DOWN,
        noChangeColor: "#888888",
        upBorderColor: UP,
        downBorderColor: DOWN,
        upWickColor: UP,
        downWickColor: DOWN,
      },
      priceMark: {
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
      horizontal: { color: isDark.value ? "#22262b" : "#ededed" },
      vertical: { color: isDark.value ? "#22262b" : "#ededed" },
    },
    xAxis: {
      axisLine: { color: isDark.value ? "#33383f" : "#d8d8d8" },
      tickText: { color: isDark.value ? "#8b929e" : "#8a8a8a" },
    },
    yAxis: {
      axisLine: { color: isDark.value ? "#33383f" : "#d8d8d8" },
      tickText: { color: isDark.value ? "#8b929e" : "#8a8a8a" },
    },
    separator: { color: isDark.value ? "#2a2f36" : "#e6e6e6" },
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

function setup() {
  const node = el.value;
  if (!node) return;
  destroyChart();
  const c = init(node);
  if (!c) return;
  chart = c;
  const intraday = props.mode === "intraday";
  chart.setStyles(buildStyles(intraday));
  ensureCyq();
  if (intraday) {
    // 分时：主图叠加均价线(AVP = 成交额/成交量)，成交量、MACD 各独立窗格
    chart.createIndicator("AVP", true, { id: "candle_pane" });
    chart.createIndicator("VOL");
    chart.createIndicator("MACD");
  } else {
    // 日K：主图叠加 MA5/10/20/60，成交量、MACD 各独立窗格
    chart.createIndicator("MA", true, { id: "candle_pane" });
    chart.overrideIndicator({ name: "MA", calcParams: [5, 10, 20, 60] });
    chart.createIndicator("VOL");
    chart.createIndicator("MACD");
    // 筹码分布：主图右侧叠加成本分布直方图（自定义 CYQ 指标）
    const chip = props.klines && props.klines.length ? computeChip(props.klines) : null;
    if (chip) {
      chart.createIndicator("CYQ", true, { id: "candle_pane" });
      chart.overrideIndicator({ name: "CYQ", calcParams: [chip] }, "candle_pane");
    }
  }
  // applyNewData 放最后：触发全部指标（含 CYQ）以最新 calcParams 重算
  chart.applyNewData(buildData());
}

// 切换股票 / 周期刷新：重算筹码分布并重灌数据（指标自动重算）
function refreshChip() {
  if (!chart || props.mode !== "kline") return;
  const chip = props.klines && props.klines.length ? computeChip(props.klines) : null;
  try {
    if (chip) chart.overrideIndicator({ name: "CYQ", calcParams: [chip] }, "candle_pane");
  } catch (e) {
    /* CYQ 尚未创建则忽略 */
  }
}

function destroyChart() {
  if (chart) {
    try {
      dispose(chart);
    } catch (e) {
      /* 忽略重复销毁 */
    }
    chart = null;
  }
}

onMounted(async () => {
  await nextTick();
  setup();
  if (typeof window !== "undefined" && window.ResizeObserver) {
    ro = new ResizeObserver(() => {
      if (chart) {
        try {
          chart.resize();
        } catch (e) {
          /* noop */
        }
      }
    });
    if (el.value) ro.observe(el.value);
  }
});

// 数据更新（切换股票 / 周期刷新）→ 重灌数据，指标自动重算
watch(
  () => [props.klines, props.trends, props.preClose],
  () => {
    if (!chart) return;
    chart.applyNewData(buildData());
    refreshChip();
  }
);

// 周期切换（日K ↔ 分时）需要更换蜡烛类型与指标 → 整图重建
watch(
  () => props.mode,
  () => setup()
);

// 深浅主题切换 → 重设样式（canvas 不继承 CSS 变量，需主动重设配色）
watch(isDark, () => {
  if (chart) chart.setStyles(buildStyles(props.mode === "intraday"));
});

onBeforeUnmount(() => {
  if (ro) {
    ro.disconnect();
    ro = null;
  }
  destroyChart();
});
</script>

<style scoped>
.kc-box {
  width: 100%;
  /* 背景透明，露出卡片底色（var(--card)），由主题 CSS 控制明暗 */
  background: transparent;
}
</style>
