<template>
  <!-- 专用 K 线行情图（KLineCharts 引擎）：单实例多面板（主图蜡烛/分时 + 成交量 + MACD），
       通过 layout 自动分面并控制高度；筹码分布叠加层默认绘制。 -->
  <div class="kc">
    <!-- 自定义图例：提取到图表上方独立区域（替代 klinecharts 内置覆盖在图内的图例），按「主图/成交量/MACD」
         分三组各自成行（组内单行流动、屏宽不足才换行），组间及与图表之间用分割线隔开。随十字光标/数据更新。 -->
    <view v-if="legend.show" class="kc-legendbar">
      <view class="lg-row" :style="{ top: legendOffsets.price + 'px' }">
        <text class="lg-sec">主图</text>
        <text class="lg-time">{{ legend.time }}</text>
        <view class="lg-price"><text class="lg-k">价格:</text><text class="lg-v" :class="legend.chgPct != null && legend.chgPct >= 0 ? 'up' : 'down'">{{ fmtPrice(legend.c) }}</text><text class="lg-chg" :class="legend.chgPct != null && legend.chgPct >= 0 ? 'up' : 'down'">{{ legend.chgPct != null ? (legend.chgPct >= 0 ? '+' : '') + legend.chgPct.toFixed(2) + '%' : '' }}</text></view>
        <text v-if="props.mode !== 'kline'" class="lg-k">开:</text><text v-if="props.mode !== 'kline'" class="lg-v">{{ fmtPrice(legend.o) }}</text>
        <text v-if="props.mode !== 'kline'" class="lg-k">高:</text><text v-if="props.mode !== 'kline'" class="lg-v">{{ fmtPrice(legend.h) }}</text>
        <text v-if="props.mode !== 'kline'" class="lg-k">低:</text><text v-if="props.mode !== 'kline'" class="lg-v">{{ fmtPrice(legend.l) }}</text>
        <text v-for="(it, i) in legend.main" :key="'m' + i" class="lg-it" :class="{ 'has-color': !!it.color }" :style="it.color ? { color: it.color } : null"><text class="lg-l">{{ it.label }}:</text><text class="lg-v">{{ it.value }}</text></text>
      </view>
      <view class="lg-row" :style="{ top: legendOffsets.vol + 'px' }">
        <text class="lg-sec">成交量</text>
        <text v-for="(it, i) in legend.vol" :key="'v' + i" class="lg-it" :class="{ 'has-color': !!it.color }" :style="it.color ? { color: it.color } : null"><text class="lg-l">{{ it.label }}:</text><text class="lg-v">{{ it.value }}</text></text>
      </view>
      <view class="lg-row" :style="{ top: legendOffsets.macd + 'px' }" v-if="legend.macd.length">
        <text class="lg-sec">MACD</text>
        <text v-for="(it, i) in legend.macd" :key="'d' + i" class="lg-it" :class="{ 'has-color': !!it.color }" :style="it.color ? { color: it.color } : null"><text class="lg-l">{{ it.label }}:</text><text class="lg-v">{{ it.value }}</text></text>
      </view>
    </view>
    <div ref="chartEl" class="kc-chart" :style="{ height: props.height + 'px' }"></div>
    <!-- 筹码分布叠加层（右侧横向直方图，与蜡烛同坐标系），默认不拦截指针 -->
    <canvas ref="cyqEl" class="kc-ov kc-ov--cyq"></canvas>
    <!-- 看盘画线工具栏：点击后在图上点击/拖拽绘制；支撑=绿、压力=红、趋势/分割=主色绿。
         由外部画板图标控制 toolsOpen 淡入/淡出（<Transition> 处理进出场动画）。 -->
    <Transition name="kct">
      <view v-if="showTools && toolsOpen" class="kc-tools">
        <view class="kct-btn" :class="{ active: activeAction === 'support' }" role="button" @click="drawLine('support', 'horizontalStraightLine', DOWN)">支撑</view>
        <view class="kct-btn" :class="{ active: activeAction === 'pressure' }" role="button" @click="drawLine('pressure', 'horizontalStraightLine', UP)">压力</view>
        <view class="kct-btn" :class="{ active: activeAction === 'trend' }" role="button" @click="drawLine('trend', 'straightLine', TREND)">趋势</view>
        <view class="kct-btn" :class="{ active: activeAction === 'fib' }" role="button" @click="drawLine('fib', 'fibonacciLine')">分割</view>
        <view class="kct-btn kct-clear" role="button" @click="clearUserOverlays">清空</view>
      </view>
    </Transition>
    <!-- 智能标注悬浮提示：跟随十字光标显示每条线的类型/价位/区间/触及次数/方向 -->
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
// 指标折线调色板：主图/量/MACD 各 pane 的折线按「内容顺序」循环取色（橙/蓝/紫/绿/品红）。
// 与图表画线颜色保持一致，图例复用同一份颜色，避免图例与图线颜色脱节（用户要求各图例颜色不同）。
const INDICATOR_LINE_COLORS = ["#f5a623", "#1c9cf0", "#9b59b6", "#2ecc71", "#e11d74"];
import { computeChip, type ChipResult } from "@/utils/analyzer";
import type { Kline, Trend, PeriodKey } from "@/utils/period";
import type { ChartAuxConfig } from "@/store/chartAux";
import type { ChartMaConfig } from "@/store/chartMa";

// ---- 分时均价（AVP）自定义指标：累计成交额 / 累计成交量，叠加在主图 ----
let avpRegistered = false;
function ensureAvp() {
  if (avpRegistered) return;
  try {
    registerIndicator({
      name: "AVP",
      // 主图叠加指标：shortName 设空字符串→主图标题栏不显示「均价」，
      // 避免与左侧图例「均价:223.63」重复（klinecharts 空串不会 fallback 到 name，见源码 1038 行）。
      // 图例的「均价:」前缀由下方 figure.title 提供。
      shortName: "",
      series: "price" as never, // 运行时即字符串 'price'，minified 枚举无值，直接传字面量
      calc: (dataList: any[]) => {
        // 直接用数据源已正确算好的每股均价（东财 f58 / 腾讯 cumAmt÷(手×100) / 新浪兜底 close）。
        // ⚠️ 旧逻辑 cumAmt/cumVol 自算存在单位错误：东财 vol 单位为「手」、amount 为「元」，
        // 相除得「元/手」≈ 真实价的 100 倍；而 AVP 与价格共用坐标轴，会把 y 轴撑爆、
        // 把真实价格线压成底部一条平直线（即「分时走势图变直线」的根因）。
        return dataList.map((d) => {
          const v = d && Number.isFinite(d.avg) && d.avg > 0 ? d.avg : (d?.close ?? 0);
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

// ---- 分时量（INTRADAY_VOL）自定义指标：与内置 VOL 算法完全一致（MA5/10/20 + 涨跌着色量柱），
// 量柱标题与图例前缀改为「分时量」，避免分时面板误显示「成交量」。面板标题栏 shortName 设空，
// 避免与图例「分时量:xxx」重复（同 AVP）。K 线模式仍用内置 VOL（显示「成交量」）。----
const VOL_MA_PARAMS = [5, 10, 20];
let intradayVolRegistered = false;
function ensureIntradayVol() {
  if (intradayVolRegistered) return;
  try {
    registerIndicator({
      name: "INTRADAY_VOL",
      // 量面板标题栏不显示「分时量」前缀，避免与左侧图例「分时量:xxx」重复（同 AVP 处理）。
      // 图例的「分时量:」前缀由下方 volume figure.title 提供；MA5/10/20 子线标题不变。
      shortName: "",
      series: "volume" as never, // 量价系列，klinecharts 据其渲染量柱并按涨跌着色
      calcParams: VOL_MA_PARAMS,
      shouldFormatBigNumber: true,
      precision: 0,
      minValue: 0,
      figures: [
        { key: "ma1", title: "MA5: ", type: "line" },
        { key: "ma2", title: "MA10: ", type: "line" },
        { key: "ma3", title: "MA20: ", type: "line" },
        {
          key: "volume",
          title: "分时量: ",
          type: "bar",
          // 量柱颜色跟随「逐分钟 tick 方向」（涨红跌绿、平盘中性色）：
          // 分时数据每根柱的 open 已设为上一分钟收盘价（首根=昨收），
          // 故 k.close > k.open 即「当前分钟价 > 上一分钟价」= 该分钟上涨→红，下跌→绿。
          // ⚠️ 自定义指标拿不到 klinecharts 内置 VOL 的量柱默认样式（defaultStyles.bars 为空），
          // 故用项目统一涨跌色 UP/DOWN 兜底，确保量柱可见——否则量面板会退化成无柱的平直线。
          styles: (data: any, _indicator: any, defaultStyles: any) => {
            const k = data?.current?.kLineData;
            const base = (defaultStyles?.bars && defaultStyles.bars[0]) || {};
            const up = base.upColor || UP;
            const down = base.downColor || DOWN;
            const noChange = base.noChangeColor || "#888888";
            if (!k) return { color: noChange };
            if (k.close > k.open) return { color: up };
            if (k.close < k.open) return { color: down };
            return { color: noChange };
          },
        },
      ],
      calc: (dataList: any[], indicator: any) => {
        const params = indicator.calcParams || VOL_MA_PARAMS;
        const volSums: number[] = [];
        return dataList.map((kLineData, i) => {
          const volume = kLineData.volume || 0;
          const vol: any = { volume };
          params.forEach((p: number, index: number) => {
            volSums[index] = (volSums[index] || 0) + volume;
            if (i >= p - 1) {
              vol[`ma${index + 1}`] = volSums[index] / p;
              volSums[index] -= dataList[i - (p - 1)]?.volume || 0;
            }
          });
          return vol;
        });
      },
    } as never);
    intradayVolRegistered = true;
  } catch {
    /* noop */
  }
}

// ---- MACDFS 自定义指标（分时级别 MACD，仅分时模式使用）----
// 与日K/周K 等 K 线模式使用的「内置 MACD」保持**完全一致**的算法与数值/形状：
// 直接复刻 klinecharts 源码 built-in MACD 的 calc（EMA 用「前 N 根 SMA 做种子」再转递归，
// 而非首根价做种子——两种种子方式形状差异显著，正是之前自定义 EMA 与日K 不一致的根因）。
// 命名 MACDFS = 分时级别 MACD，面板标题与日K 的 MACD 区分；柱着色/描边也与内置一致
// （柱>0 红、<0 绿、=0 中性；当前值>前值用描边、否则填充）。
let macdfsRegistered = false;
function ensureMacdfs() {
  if (macdfsRegistered) return;
  try {
    registerIndicator({
      name: "MACDFS",
      shortName: "MACDFS",
      calcParams: [12, 26, 9],
      figures: [
        { key: "dif", title: "DIF: ", type: "line" },
        { key: "dea", title: "DEA: ", type: "line" },
        {
          key: "macd",
          title: "MACD: ",
          type: "bar",
          // 量柱逐根着色：klinecharts 自定义指标不会自动按值正负选色（内置 MACD 才会）
          // 正确数据路径：data.current.indicatorData.macd（已验证 v3 修复）
          // 复刻内置 MACD 的柱着色/描边逻辑（data.current/prev.indicatorData.macd 为正确路径）
          styles: (data: any, _indicator: any, defaultStyles: any) => {
            const base = (defaultStyles?.bars && defaultStyles.bars[0]) || {};
            const up = base.upColor || UP;
            const down = base.downColor || DOWN;
            const noChange = base.noChangeColor || "#888888";
            const prevMacd = data?.prev?.indicatorData?.macd ?? Number.MIN_SAFE_INTEGER;
            const curMacd = data?.current?.indicatorData?.macd ?? Number.MIN_SAFE_INTEGER;
            let color = noChange;
            if (curMacd > 0) color = up;
            else if (curMacd < 0) color = down;
            const style = prevMacd < curMacd ? "stroke" : "fill";
            return { style, color, borderColor: color };
          },
        },
      ],
      // 复刻 klinecharts built-in MACD 的 calc（源码 3188 行附近）：
      // EMA 用「前 N 根 SMA 做种子」，而非首根价做种子——这是与日K 内置 MACD
      // 数值/形状完全一致的关键；前 ~32 根无 MACD 值（与日K 前截行为一致）。
      calc: (dataList: any[], indicator: any) => {
        const params = indicator.calcParams || [12, 26, 9];
        const [p1, p2, p3] = params as number[];
        const maxPeriod = Math.max(p1, p2);
        let closeSum = 0;
        let emaShort: number | undefined;
        let emaLong: number | undefined;
        let dif = 0;
        let difSum = 0;
        let dea = 0;
        return dataList.map((kLineData, i) => {
          const macd: any = {};
          const close = Number(kLineData.close) || 0;
          closeSum += close;
          if (i >= p1 - 1) {
            emaShort = i > p1 - 1 ? (2 * close + (p1 - 1) * (emaShort as number)) / (p1 + 1) : closeSum / p1;
          }
          if (i >= p2 - 1) {
            emaLong = i > p2 - 1 ? (2 * close + (p2 - 1) * (emaLong as number)) / (p2 + 1) : closeSum / p2;
          }
          if (i >= maxPeriod - 1) {
            dif = (emaShort as number) - (emaLong as number);
            macd.dif = dif;
            difSum += dif;
            if (i >= maxPeriod + p3 - 2) {
              dea = i > maxPeriod + p3 - 2 ? (dif * 2 + dea * (p3 - 1)) / (p3 + 1) : difSum / p3;
              macd.macd = (dif - dea) * 2;
              macd.dea = dea;
            }
          }
          return macd;
        });
      },
    } as never);
    macdfsRegistered = true;
  } catch {
    /* noop */
  }
}

// ---- 主图均线（MA）独立指标：MA5/MA10/MA20/MA60 各自注册为单线指标 ----
// klinecharts 内置 "MA" 指标一次渲染 4 条（calcParams=[5,10,20,60]）无法独立开关，
// 故注册 4 个独立指标，buildLayout 按 maConfig 决定往主图 push 哪几条。
// 每条线颜色由 buildStyles 的 indicator.lines 调色板按 content 顺序循环分配（橙/蓝/紫/绿）。
const MA_DEFS: { key: string; period: number }[] = [
  { key: "ma5", period: 5 },
  { key: "ma10", period: 10 },
  { key: "ma20", period: 20 },
  { key: "ma60", period: 60 },
  { key: "ma250", period: 250 },
];
let maRegistered = false;
function ensureMaIndicators() {
  if (maRegistered) return;
  try {
    for (let i = 0; i < MA_DEFS.length; i++) {
      const def = MA_DEFS[i];
      const key = def.key;
      // 每条 MA 在注册时就把线色烤进 figure 的 styles 回调（按 MA_DEFS 顺序取调色板：
      // MA5橙/MA10蓝/MA20紫/MA60绿）。这样不依赖全局 indicator.lines（单线指标都会抢 lines[0]）
      // 也不依赖运行时 overrideIndicator（实测会扰乱渲染与图表交互）。图例配色在 buildLegend 中
      // 用同一份 INDICATOR_LINE_COLORS 按相同顺序取，保证图例与图线颜色一致。
      const color = INDICATOR_LINE_COLORS[i % INDICATOR_LINE_COLORS.length];
      registerIndicator({
        name: "MA" + def.period,
        shortName: "MA" + def.period,
        series: "price" as never, // 与主图共享价格坐标轴
        calcParams: [def.period],
        figures: [{ key, title: "MA" + def.period + ": ", type: "line", styles: () => ({ color }) }],
        calc: (dataList: any[]) => {
          const res: any[] = [];
          let sum = 0;
          for (let j = 0; j < dataList.length; j++) {
            const c = Number(dataList[j].close) || 0;
            sum += c;
            if (j >= def.period) sum -= Number(dataList[j - def.period].close) || 0;
            res.push(j >= def.period - 1 ? { [key]: sum / def.period } : { [key]: null });
          }
          return res;
        },
      } as never);
    }
    maRegistered = true;
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
    /** 分时昨收：作为涨跌幅基准（首根分时柱的 open 也取此值）；量柱涨跌着色实际以「上一分钟收盘价」为每根 open（见 toKLineData），并非每根都设为昨收。 */
    preClose?: number;
    height?: number;
    /** 是否显示均线 MA（日K 主图叠加），默认开 */
    showMA?: boolean;
    /** 各周期均线独立开关（MA5/MA10/MA20/MA60），默认全开；仅日K 模式生效 */
    maConfig?: ChartMaConfig;
    /** MACD 面板内部的 DIF 线是否绘制，默认开 */
    macdDif?: boolean;
    /** MACD 面板内部的 DEA 线是否绘制，默认开 */
    macdDea?: boolean;
    /** 成交量面板内部的量均线 MA5 是否绘制，默认开 */
    volumeMa5?: boolean;
    /** 成交量面板内部的量均线 MA10 是否绘制，默认开 */
    volumeMa10?: boolean;
    /** 成交量面板内部的量均线 MA20 是否绘制，默认开 */
    volumeMa20?: boolean;
    /** 实时最新价（仅分时模式生效）：把「最后一根分时柱」动态同步为实时价 */
    livePrice?: number;
    /** 实时昨收（与 livePrice 同源） */
    livePreClose?: number;
    /** 是否显示看盘画线工具栏（支撑/压力/趋势/黄金分割/自动/清空），默认关 */
    showTools?: boolean;
    /** 看盘画线工具栏开关：由外部画板图标控制淡入/淡出，默认关 */
    toolsOpen?: boolean;
    /** 是否启用「智能标注」：系统按行情自动标注支撑/压力/趋势/黄金分割（半透明虚线、锁定不可拖拽）；默认关，仅看盘主图开启。手动绘制仍可用。 */
    autoDraw?: boolean;
    /** 是否把用户画的线持久化到本地（按 code 区分），默认开 */
    persist?: boolean;
    /** 当前股票代码，用于持久化 key；不传则不持久化（仅当前会话有效） */
    code?: string;
    /** 辅助线显示配置（总开关 + 压力/支撑/趋势逐线开关）；不传则按组件默认全开 */
    auxConfig?: ChartAuxConfig;
    /** 当前 K线周期（d/w/M/y），用于各周期默认缩放（显示约一个月等）；不传默认日K */
    period?: PeriodKey;
  }>(),
  { height: 440, showMA: true, macdDif: true, macdDea: true, volumeMa5: true, volumeMa10: true, volumeMa20: true, showTools: false, autoDraw: false, persist: true }
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
    // 分时量柱按「每分钟即时涨跌方向」着色（与同花顺一致）：open 取上一分钟收盘价，
    // 首根取昨收。这样量柱红绿随逐分钟 tick 方向交替，而非「价格 vs 昨收」的整块同色。
    let prevClose = pre;
    for (const t of ts) {
      const tStr = t.t || "";
      const timePart = tStr.includes(" ") ? tStr.split(" ").pop()! : tStr;
      const parts = timePart.split(":");
      const hh = Number(parts[0]) || 0;
      const mm = Number(parts[1]) || 0;
      const m = hh * 60 + mm;
      // 过滤非连续竞价交易时段的多余点：A 股仅 09:30–11:30 与 13:00–15:00 有分时；
      // 腾讯兜底源会附带 15:06–15:30 收盘后多余点（共 25 个），会导致图轴画到 15:30。
      const inSession = (m >= 570 && m <= 690) || (m >= 780 && m <= 900);
      if (!inSession) continue;
      const sec = baseMs + m * 60 * 1000;
      if (!isFinite(sec)) continue;
      out.push({
        timestamp: sec,
        open: prevClose,
        high: t.high,
        low: t.low,
        close: t.price,
        volume: t.vol,
        turnover: t.amount,
        avg: t.avg,
      });
      prevClose = t.price;
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
      // 关闭内置 tooltip/图例（指标名+数值默认常显并覆盖在图内，改为图表上方自定义图例）
      tooltip: { showRule: "none" },
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
      // 关闭内置 indicator 图例/末值标签（默认常显于各 pane、覆盖在图内，已改为图表上方自定义图例）
      tooltip: { showRule: "none" },
      lastValueMark: { show: false },
      bars: [
        { style: "fill", upColor: UP, downColor: DOWN, noChangeColor: "#888888", borderStyle: "solid", borderSize: 1, borderDashedValue: [2, 2] },
      ],
      lines: INDICATOR_LINE_COLORS.map((c) => ({ color: c, size: 1 })),
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
  const showVol = true; // 成交量面板常驻
  const showMacd = true; // MACD 面板常驻
  const subCount = (showVol ? 1 : 0) + (showMacd ? 1 : 0);
  // 副图数量决定主图高度占比：2 副图(量+MACD)→主图 0.56、量 0.22、MACD 顶满；
  // 1 副图→主图 0.7、副图 0.3；0 副图→主图占满全高。
  let priceH: number;
  let volH = 0;
  let macdH = 0;
  if (subCount === 2) {
    priceH = Math.round(usable * 0.56);
    volH = Math.round(usable * 0.22);
    macdH = Math.max(60, usable - priceH - volH);
  } else if (subCount === 1) {
    priceH = Math.round(usable * 0.7);
    if (showVol) volH = Math.max(40, usable - priceH);
    else macdH = Math.max(60, usable - priceH);
  } else {
    priceH = usable;
  }
  const candleContent: string[] = [];
  if (props.mode === "kline") {
    const mc = props.maConfig;
    // 按 maConfig 逐周期独立开关决定主图叠加哪些 MA（MA5/MA10/MA20/MA60/MA250）；
    // showMA 为总开关，false 时不叠加任何均线。分时模式无 MA（用 AVP 均价线）。
    const visibleMas = MA_DEFS.filter((d) => (mc ? mc[d.key as keyof ChartMaConfig] : true));
    if (props.showMA !== false && visibleMas.length) {
      visibleMas.forEach((d) => candleContent.push("MA" + d.period));
    }
  }
  if (props.mode === "intraday") candleContent.push("AVP");
  const layout: any[] = [
    { type: "candle", content: candleContent, options: { id: "candle_pane", height: priceH, minHeight: Math.round(priceH * 0.6) } },
  ];
  // 分时模式用 INTRADAY_VOL（图例显示「分时量」），K 线模式用内置 VOL（显示「成交量」）；
  // 成交量面板常驻（不可整体关闭）。
  if (showVol) {
    layout.push({ type: "indicator", content: [props.mode === "intraday" ? "INTRADAY_VOL" : "VOL"], options: { id: "vol_pane", height: volH, minHeight: 40 } });
  }
  // MACD 面板常驻（不可整体关闭）。
  if (showMacd) {
    layout.push({ type: "indicator", content: [props.mode === "intraday" ? "MACDFS" : "MACD"], options: { id: "macd_pane", height: macdH, minHeight: 60 } });
  }
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
  if (last) {
    // 同步本地 dataList 末根（chart.updateData 只改图表），使累计「当日最高/最低」图例随实时价更新
    last.high = Math.max(last.high, lp);
    last.low = Math.min(last.low, lp);
    last.close = lp;
  }
  chart.updateData({
    timestamp: lastTs,
    // open 保留上一分钟收盘价（分钟级着色），使实时最后一根的量柱颜色仍按 tick 方向判定
    open: last.open ?? props.preClose ?? 0,
    high: Math.max(last.high, lp),
    low: Math.min(last.low, lp),
    close: lp,
    volume: last.volume,
    turnover: last.turnover,
  });
  updateLegendLatest();
}

// ---- 默认缩放（柱宽 / 可见根数） ----
// 分时：铺满完整一天（9:30-15:00，约 240 根）。K线：按周期设定「默认可见根数」——柱更宽、更易读，
// 且各周期缩放观感协调（用户要求：日K 默认显示约一个月、周K 等也稍微放大）。数据仍保留全量，
// 可左右滑动查看更早。柱数不足该周期基准的（次新股/数据少）则走下面的铺满逻辑填满整宽。
// K线各周期默认可见根数（"稍微放大"：日K≈一个月、周K≈五个月、月K≈两年，柱更宽）：
const KLINE_DEFAULT_BARS: Record<Exclude<PeriodKey, "m">, number> = {
  d: 25, // 日K：约一个月交易日（如 7-10~8-11）
  w: 25, // 周K：约五个月（26-03-13~08-11）
  M: 25, // 月K：约两年（24-10~26-08）
};
// 根因：klinecharts 默认 barSpace=8px，单屏仅容约 44 根柱，默认只渲染末尾片段，需手动左拖才看全貌；
// 且图表实际绘制区 _totalBarSpace = 容器总宽 - 右侧 y 轴宽（yAxis 默认 outside），与 clientWidth 不等；
// 偏大则 from>0（左侧数据被裁），偏小则 realFrom<0（左侧留白，即此前「左边 2/5 空白」）。
// 解决（闭环精确铺满 + 边缘留余量）：① setOffsetRightDistance(0) 消除右偏移；
// ② K线分支：用全宽反推偏大 barSpace，读 getVisibleRange() 的可见跨度，闭环把「可见跨度」收敛到
//   ref+0.5（显示 ref 根 + 左右各半根柱余量）——首根/末根完整可见而非压在边缘被裁一半；
//   分时/柱数少的分支：把 from 收敛到 0（铺满全量），③ 再回退极小比例（相对 (count-1)/(count+1)），
//   使首根(9:30)完整可见而非压左边缘被裁，仅留约 1 根柱极窄右间隙（分时约 1.4px，肉眼不可见）。
// 注意：容器首帧可能未完成布局（clientWidth=0），若直接 return 会让 barSpace 停在默认 8px，
// 故宽度为 0 时延后到下一帧重试。
// 容器未布局时 fitViewAll 的重试计数（宽度就绪后归零）
let fitRetry = 0;
function fitViewAll() {
  if (!chart || !chartEl.value) return;
  const count = dataList.length;
  if (count <= 1) return;
  const w = chartEl.value.clientWidth;
  if (!w) {
    // 容器尚未完成布局：延后重试（最多 12 帧），避免长期 0 宽导致无限递归
    if (fitRetry++ < 12) {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => fitViewAll());
      else setTimeout(() => fitViewAll(), 30);
    }
    return;
  }
  fitRetry = 0;
  // ① 消除右偏移：避免 realFrom 因右偏移变为负而产生左空白
  chart.setOffsetRightDistance(0);
  // ② K线（日K/周K/月K）：默认显示最近 ref 根，且首根/末根完整可见（左右各留半根柱余量）
  if (props.mode !== "intraday") {
    const pk = (props.period === "m" ? "d" : (props.period ?? "d")) as Exclude<PeriodKey, "m">;
    const ref = KLINE_DEFAULT_BARS[pk] ?? KLINE_DEFAULT_BARS.d;
    if (count > ref) {
      // 用全宽反推偏大 barSpace（含 y 轴宽，故偏大→可见跨度>ref 会裁切边缘），
      // 闭环把「可见跨度」收敛到 ref+0.5：显示 ref 根 + 左右各半根柱余量 → 首末根不被裁一半。
      let space = w / ref; // 初值偏大（保证可见跨度≥ref）
      for (let i = 0; i < 6; i++) {
        chart.setBarSpace(space);
        const r = chart.getVisibleRange();
        if (!r) break;
        const span = r.to - r.from; // 实际可见跨度（柱数）
        const desired = ref + 0.5;  // ref 根 + 左右半根余量
        if (Math.abs(span - desired) < 0.25) break;
        // span 与 space 成反比：可见根数偏少→减小柱宽（span/desired<1），偏多→增大柱宽。
        // 注意方向与分时分支 (count-r.from)/count 一致（均缩小 space 以显示更多根）。
        space = space * span / desired;
        if (space < 1) { space = 1; break; } // 触底 1px（柱过多）：退化为尽量铺满
      }
      return;
    }
    // 柱数 ≤ ref（次新股/数据少）：柱宽更宽，走下面铺满逻辑填充满整宽
  }
  // 分时 / 柱数较少的 K线：偏大反推 → 收窄闭环，收敛到 from===0（数据完整且填满绘制区）
  let space = w / count; // 偏大（含 y 轴宽），保证 from≥0
  for (let i = 0; i < 6; i++) {
    chart.setBarSpace(space);
    const r = chart.getVisibleRange();
    if (!r || r.from <= 0) break; // 已铺满（from===0）
    // from>0：偏大导致左侧裁切；按 (count-from)/count 比例收窄，使其恰好为 0
    space = space * (count - r.from) / count;
    if (space < 1) { space = 1; break; } // 触底 1px（柱过多）：退化为尽量铺满
  }
  // ③ 收敛到 from===0 后，回退极小比例（相对 (count-1)/(count+1)），使首根(9:30)完整可见而非
  // 压在左边缘被裁。仅留约 1 根柱的极窄右间隙（分时约 1.4px，肉眼不可见），不会造成明显右侧空白。
  // 回退只会让 from 更小或不变，绝不会把首根裁掉。
  space = space * (count - 1) / (count + 1);
  if (space >= 1) chart.setBarSpace(space);
}

// 数据就绪回调：每次数据变化（首载 / 刷新 / 实时末根）后保持「铺满全貌」+ 刷新图例（所有模式通用）
function onDataReady() {
  fitViewAll();
  updateLegendLatest();
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
  if (dataReadyCb && chart) {
    try {
      chart.unsubscribeAction(ActionType.OnDataReady, dataReadyCb);
    } catch {
      /* noop */
    }
    dataReadyCb = null;
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
// 清空用户手动画的线（不影响系统智能标注），并清本地存储
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
// ---- 智能标注（小白友好）：系统按行情自动标注支撑/压力/趋势 ----
// 半透明虚线 + 锁定（不可拖拽编辑），与用户手绘的浓实线明显区分；不持久化，随数据刷新。
// 关键：KLineCharts overlay 的 point 字段是 { timestamp, value }（不是 price）；用错字段会导致价格→y 坐标失败被钳到顶部。
const autoIds: string[] = [];
const autoLevels: AutoLevel[] = [];
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

// 判定主趋势：用「窗口内低点位移 + 高点位移」的净方向决定，避免末段噪声导致 up&&down 冲突而整条不画。
// 净位移显著为正→上升趋势（沿低点连支撑线）；显著为负→下降趋势（沿高点连阻力线）；接近 0（真横盘）→不下结论。
function detectTrend(highs: Swing[], lows: Swing[]): { dir: "up" | "down"; points: { timestamp: number; value: number }[] } | null {
  const lo = lows.length >= 2 ? [lows[0], lows[lows.length - 1]] : null;
  const hi = highs.length >= 2 ? [highs[0], highs[highs.length - 1]] : null;
  if (!lo && !hi) return null;
  const loDelta = lo ? lo[1].value - lo[0].value : 0;
  const hiDelta = hi ? hi[1].value - hi[0].value : 0;
  const net = loDelta + hiDelta;
  const ref = (lo ? lo[0].value : 0) || (hi ? hi[0].value : 1) || 1;
  const thr = ref * 0.01; // 窗口内净位移 >1% 才算有趋势，过滤无方向横盘
  const upPts = (lo || hi) as { t: number; value: number }[];
  const downPts = (hi || lo) as { t: number; value: number }[];
  if (net > thr) return { dir: "up", points: [{ timestamp: upPts[0].t, value: upPts[0].value }, { timestamp: upPts[1].t, value: upPts[1].value }] };
  if (net < -thr) return { dir: "down", points: [{ timestamp: downPts[0].t, value: downPts[0].value }, { timestamp: downPts[1].t, value: downPts[1].value }] };
  return null;
}

// 灵敏度→算法参数映射：灵敏度越高→聚类容差越小（更密更多线）、窗口越小、最多线数越多
// （autoSensitivity 由调用方控制，当前 KlineCard 未传入，默认取中档 5）
function sensitivityParams() {
  const s = 5;
  const win = props.mode === "intraday" ? 3 : 5;
  const tolPct = 0.003 + (10 - s) * 0.0009; // s=10→0.3%  s=1→≈1.1%
  const maxLevels = clamp(Math.round(s / 2.5), 1, 4); // s=5→2  s=10→4  s=1→1
  return { s, win, tolPct, maxLevels };
}
// 扫描窗口（近 N 根）：日K=120、分时=240（autoPeriod 由调用方控制，当前未传入，统一取默认）
function scanPeriod(): number {
  return Math.min(props.mode === "intraday" ? 240 : 120, dataList.length);
}

interface AutoLevel {
  kind: "pressure" | "support" | "trend";
  price?: number;
  points?: { timestamp: number; value: number }[];
  color: string;
  label: string;
  touches?: number;
  src?: string; // 价位来源说明（如「大阳线实体下沿」），用于悬浮提示
  dir?: "up" | "down";
}
// ── 波段类型（5 类）──
type BandType = "uptrend" | "downtrend" | "pullback" | "bounce" | "box";

// 判定当前所处波段类型（5 类）。输入 highs/lows 必须来自「近端观测窗口」（即 prox），
// 高低点结构只允许取近端 N/4 窗口内的最近 2 组摆动点，忽略超远期高低点。
// 用近端最近 2 组摆动高/低点结构 + 当前价位置 + 近端整体方向联合判定。
function detectBandType(
  highs: Swing[], lows: Swing[], series: any[], current: number,
): BandType {
  const has2H = highs.length >= 2;
  const has2L = lows.length >= 2;
  // 摆动点不足时，用近端整体价格方向兜底
  if (!has2H && !has2L) {
    return current >= (series[0]?.close ?? 0) ? "uptrend" : "downtrend";
  }
  // 高低点结构特征（基于近端窗口内的最近 2 组）
  const hh = has2H && highs[highs.length - 1].value > highs[highs.length - 2].value; // 更高高点
  const hl = has2L && lows[lows.length - 1].value > lows[lows.length - 2].value;   // 更高低点
  const lh = has2H && highs[highs.length - 1].value < highs[highs.length - 2].value; // 更低高点
  const ll = has2L && lows[lows.length - 1].value < lows[lows.length - 2].value;   // 更低低点

  // 主升 / 主跌（结构清晰：两侧都满足）
  if (hh && hl) return "uptrend";
  if (lh && ll) return "downtrend";

  // 近端整体方向辅助（series 已是近端窗口，起点收盘即为近端起点）
  const firstClose = series[0]?.close ?? 0;
  const netUp = current > firstClose * 1.03;  // 近端涨幅 >3% 视为偏多
  const netDn = current < firstClose * 0.97;  // 近端跌幅 >3% 视为偏空

  // 主升（单侧）：更高低点 + 近端整体上涨
  if (hl && netUp && !ll) return "uptrend";
  // 主跌（单侧）：更低高点 + 近端整体下跌
  if (lh && netDn && !hh) return "downtrend";

  // 回档：近端整体仍抬升，但当前价已从最近摆动高点回落且未破坏前低
  if ((hh || hl || netUp) && has2H && current < highs[highs.length - 1].value) {
    const prevLow = has2L ? lows[lows.length - 2].value : -Infinity;
    if (current > prevLow) return "pullback";
  }
  // 反弹：近端整体仍降低，但当前价已从最近摆动低点反弹且未突破前高
  if ((lh || ll || netDn) && has2L && current > lows[lows.length - 1].value) {
    const prevHigh = has2H ? highs[highs.length - 2].value : Infinity;
    if (current < prevHigh) return "bounce";
  }

  // 箱体：近端窗口振幅 <6%（series 已是近端窗口，无需再切片）
  if (series.length >= 5) {
    const tHigh = Math.max(...series.map((d) => d.high));
    const tLow = Math.min(...series.map((d) => d.low));
    const tMid = (tHigh + tLow) / 2;
    if (tMid > 0 && (tHigh - tLow) / tMid < 0.06) return "box"; // 近端振幅 <6%
  }
  // 最终兜底：按近端整体方向
  return netUp ? "uptrend" : netDn ? "downtrend" : "box";
}

// 在一段 K 线序列里找「实体最大」的阳线 / 阴线
function findMaxBodyCandle(bars: any[]): { bull: any; bear: any } {
  let bull: any = null, bear: any = null, bullB = -1, bearB = -1;
  for (const d of bars) {
    const o = d.open, c = d.close;
    if (c > o) { const b = c - o; if (b > bullB) { bullB = b; bull = d; } }
    else if (c < o) { const b = o - c; if (b > bearB) { bearB = b; bear = d; } }
  }
  return { bull, bear };
}

// 计算系统画线（支撑/压力/趋势），结果同时驱动 overlay 与悬浮提示。
// ── 5 种波段各自独立规则（短线 1 支撑 + 1 压力，只取最强核心位）──
// 通用强制约束：所有点位（含摆动点 / 大阳大阴实体 / 兜底高低点）必须取自「近端观测窗口」(最近 N/4 根)，
//   严禁跨周期取远端历史高低点作为实时画线；远端价位仅可作备注，不参与绘制。
// ① 上涨主波段（主升）：高点抬高+低点抬高 → 支撑=近端窗口最大阳线实体下沿(开盘)；压力=近端阶段高点
// ② 下跌主波段（主跌）：高点降低+低点降低 → 支撑=仅近端低点(距现价<15%才画)；压力=近端最大阴线实体上沿(开盘)
// ③ 上涨回调波段（回档）：上涨中途回撤不破坏抬升 → 支撑=近端回调前区间最大阳线实体下沿；压力=近端回调起始高点
// ④ 下跌反弹波段（修复）：下跌中途上涨不改变降低 → 支撑=反弹内部最大阳线实体下沿；压力=反弹前近端下跌段大阴线实体上沿
// ⑤ 横盘箱体震荡：来回波动不持续创新高/新低 → 支撑=近端箱体下沿(摆动低点中位数)；压力=近端箱体上沿(摆动高点中位数)
function computeAutoLevels(): AutoLevel[] {
  const out: AutoLevel[] = [];
  const dl = dataList;
  if (!dl || dl.length < 10) return out;
  const N = scanPeriod();
  const recent = dl.slice(-N);
  const last = recent[recent.length - 1];
  const current = last?.close ?? 0;
  if (!current) return out;

  const { win } = sensitivityParams();
  // 近端观测窗口：最近 N/4 根（至少保留 8 根以能识别摆动点）；所有实时画线点位仅限此窗口。
  // 注意：findSwings 返回的 Swing.idx 是相对 prox 的下标，后续 slice 均基于 prox。
  const proxLen = Math.max(Math.ceil(N / 4), 8);
  const proxStart = Math.max(0, recent.length - proxLen);
  const prox = recent.slice(proxStart);

  // 摆动点仅取近端窗口内的最近 2 组，忽略超远期高低点
  const { highs, lows } = findSwings(prox, win);
  const band = detectBandType(highs, lows, prox, current);

  let supportPrice: number | null = null;
  let supportSrc = "";
  let pressurePrice: number | null = null;
  let pressureSrc = "";

  switch (band) {
    case "uptrend": {
      // ── 上涨主波段 ──
      // 支撑：近端窗口内最大阳线 实体下沿(开盘价)=资金进场成本区
      // 压力：近端阶段高点(摆动高点优先)；不足时用近端窗口实际最高价兜底
      const { bull } = findMaxBodyCandle(prox);
      if (bull) { supportPrice = bull.open; supportSrc = "近端最大阳线实体下沿(开盘)"; }
      if (highs.length) { pressurePrice = highs[highs.length - 1].value; pressureSrc = "近端阶段高点"; }
      else { pressurePrice = Math.max(...prox.map((d) => d.high)); pressureSrc = "近端最高价"; }
      break;
    }
    case "downtrend": {
      // ── 下跌主波段 ──
      // 压力：近端窗口内最大阴线 实体上沿(开盘价)=强压力位
      // 支撑：仅取近端窗口内绝对最低点兜底；距现价 <15% 才画，否则不画（太远对短线无意义）
      const { bear } = findMaxBodyCandle(prox);
      if (bear) { pressurePrice = bear.open; pressureSrc = "近端最大阴线实体上沿(开盘·强压)"; }
      const nearLow = Math.min(...prox.map((d) => d.low));
      if (current > 0 && (current - nearLow) / current < 0.15) {
        supportPrice = nearLow; supportSrc = "近端低点";
      }
      break;
    }
    case "pullback": {
      // ── 上涨回调波段 ──
      // 压力：近端最近摆动高点（回调起始点）
      // 支撑：回调起始高点之前「近端区间」内最大阳线实体下沿；无则近端最近摆动低点兜底
      //   ❌ 禁止取远端历史低点（如行情启动底部）作为支撑绘图
      if (highs.length) {
        const pullStart = highs[highs.length - 1]; // 回调起始高点
        pressurePrice = pullStart.value;
        pressureSrc = "回调起始高点";
        const preLeg = prox.slice(0, pullStart.idx); // 限定在近端窗口、回调起点之前
        if (preLeg.length >= 3) {
          const { bull } = findMaxBodyCandle(preLeg);
          if (bull) { supportPrice = bull.open; supportSrc = "前轮大阳线实体下沿(开盘)"; }
        }
      }
      // 兜底：近端最近摆动低点（仍是近端，非远端历史低点）
      if (supportPrice == null && lows.length) {
        supportPrice = lows[lows.length - 1].value;
        supportSrc = "近端前低(摆动低点)";
      }
      break;
    }
    case "bounce": {
      // ── 下跌反弹波段 ──
      // 支撑：反弹启动低点之后「近端区间」内最大阳线实体下沿
      // 压力：反弹前近端下跌段大阴线实体上沿(强压力)；无则近端前高兜底
      if (lows.length) {
        const bounceStart = lows[lows.length - 1]; // 反弹起始低点
        const bounceLeg = prox.slice(bounceStart.idx); // 反弹段（近端、起点之后）
        const { bull } = findMaxBodyCandle(bounceLeg);
        if (bull) { supportPrice = bull.open; supportSrc = "反弹最大阳线实体下沿(开盘)"; }
        const preLeg = prox.slice(0, bounceStart.idx); // 反弹前的近端下跌段
        if (preLeg.length >= 3) {
          const { bear } = findMaxBodyCandle(preLeg);
          if (bear) { pressurePrice = bear.open; pressureSrc = "下跌阴线实体上沿(开盘·强压)"; }
        }
      }
      if (pressurePrice == null && highs.length) {
        pressurePrice = highs[highs.length - 1].value;
        pressureSrc = "近端前高(摆动高点)";
      }
      break;
    }
    case "box": {
      // ── 横盘箱体震荡 ──
      // 支撑/压力：近端最近 3 个摆动低/高点的中位数（多次回踩 / 遇阻带）
      if (lows.length >= 2) {
        const rl = lows.slice(-3).map((s) => s.value);
        supportPrice = rl[Math.floor(rl.length / 2)];
        supportSrc = "箱体下沿(多次回踩)";
      }
      if (highs.length >= 2) {
        const rh = highs.slice(-3).map((s) => s.value);
        pressurePrice = rh[Math.floor(rh.length / 2)];
        pressureSrc = "箱体上沿(多次遇阻)";
      }
      break;
    }
  }

  // 输出支撑线（仅在价位有效且不为 0 时）
  if (supportPrice != null && Number.isFinite(supportPrice) && supportPrice > 0) {
    out.push({
      kind: "support", price: supportPrice,
      color: hexA(DOWN, 0.62), label: "支撑", src: supportSrc,
    });
  }
  // 输出压力线
  if (pressurePrice != null && Number.isFinite(pressurePrice) && pressurePrice > 0) {
    out.push({
      kind: "pressure", price: pressurePrice,
      color: hexA(UP, 0.62), label: "压力", src: pressureSrc,
    });
  }
  // 趋势线（沿用原逻辑，基于近端摆动点）
  const tr = detectTrend(highs, lows);
  if (tr) out.push({ kind: "trend", points: tr.points, dir: tr.dir, touches: tr.points.length, color: hexA(TREND, 0.72), label: tr.dir === "up" ? "上升趋势" : "下降趋势" });
  return out;
}
// 清旧智能标注并按当前辅助线开关重画（1 支撑 + 1 压力 + 趋势线，无区间阴影）
function drawAutoLevels() {
  autoIds.forEach((id) => { try { chart?.removeOverlay(id); } catch { /* noop */ } });
  autoIds.length = 0;
  autoLevels.length = 0;
  const cfg = props.auxConfig;
  // 无任何智能标注线开启 → 不绘制（各线独立开关，无总开关）
  if (!props.autoDraw || !chart || !cfg) return;
  if (!(cfg.pressure || cfg.support || cfg.trend)) return;
  const levels = computeAutoLevels();
  for (const lv of levels) {
    if (lv.kind === "pressure" && !cfg.pressure) continue;
    if (lv.kind === "support" && !cfg.support) continue;
    if (lv.kind === "trend" && !cfg.trend) continue;
    try {
      const id = `auto_${lv.kind}_${Math.random().toString(36).slice(2, 7)}`;
      if (lv.kind === "trend" && lv.points) {
        chart.createOverlay({
          id, name: "autoTrendLine", points: lv.points, lock: true,
          styles: { line: { color: lv.color, style: "dashed", size: 1.4, dashedValue: [4, 3] } },
        } as never);
      } else if (typeof lv.price === "number") {
        const t0 = dataList[0].timestamp;
        const text = `${lv.kind === "support" ? "支" : "压"} ${lv.price.toFixed(2)}`;
        // 背景用实色线条色（压=UP红 / 支=DOWN绿），复刻原生最后价标签背景；白字在图内样式统一设。
        const bg = lv.kind === "support" ? DOWN : UP;
        chart.createOverlay({
          id, name: "autoLevelLine", points: [{ timestamp: t0, value: lv.price }], lock: true,
          extendData: { text, bg },
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
    // 自动支撑/压力线：图内画虚线 + 右侧价格轴(y 轴)上画「支/压 + 价位」标签。
    // 标签样式完全复刻原生「最后价标签」(priceMark.last.text)：彩色实底（压红/支绿）+ 白字 + 方形无圆角 +
    // padding 4/2 + 字号 12/Helvetica Neue；紧贴轴左缘(x:0, align:left)去除多余左侧间距。
    registerOverlay({
      name: "autoLevelLine",
      needDefaultPointFigure: false,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      createPointFigures: (params: any) => {
        const coordinates = params.coordinates as { x: number; y: number }[];
        const bounding = params.bounding as { width: number; height: number };
        const overlay = params.overlay as any;
        if (!coordinates || coordinates.length < 1) return [];
        const y = coordinates[0].y;
        const col = overlay?.styles?.line?.color || "#888";
        return [{
          type: "line",
          attrs: { coordinates: [{ x: 0, y }, { x: bounding.width, y }] },
          styles: { style: "dashed", size: overlay?.styles?.line?.size || 1.2, color: col, dashedValue: overlay?.styles?.line?.dashedValue || [4, 3] },
          ignoreEvent: true,
        }];
      },
      createYAxisFigures: (params: any) => {
        const coordinates = params.coordinates as { x: number; y: number }[];
        const bounding = params.bounding as { width: number; height: number };
        const overlay = params.overlay as any;
        if (!coordinates || coordinates.length < 1) return [];
        const y = coordinates[0].y;
        // 复刻原生最后价标签：彩色实底 + 白字 + 方形无圆角 + padding 4/2；紧贴轴左缘(x:0, align:left)去多余左侧间距。
        const bg = overlay?.extendData?.bg || overlay?.styles?.line?.color || "#888";
        const text = overlay?.extendData?.text || "";
        return [{
          type: "text",
          attrs: { x: 0, y, text, align: "left", baseline: "middle" },
          styles: {
            color: "#ffffff",
            backgroundColor: bg,
            borderColor: "transparent",
            borderSize: 0,
            paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2,
          },
          ignoreEvent: true,
        }];
      },
    } as never);
    trendOverlayRegistered = true;
  } catch {
    /* noop */
  }
}

// ---- 智能标注悬浮提示框（跟随十字光标，显示类型/价位/区间/触及次数/方向）----
// 智能标注 lock:true 不响应 overlay 事件，故改用 onCrosshairChange + convertFromPixel 反算价格匹配最近线
interface TipItem { label: string; color: string; text: string; }
const tip = reactive<{ show: boolean; x: number; y: number; items: TipItem[] }>({ show: false, x: 0, y: 0, items: [] });
const tipStyle = computed(() => {
  const w = chartEl.value ? chartEl.value.clientWidth : 0;
  const left = tip.x > w - 170 ? tip.x - 178 : tip.x + 14;
  const top = Math.max(8, tip.y - 10);
  return { left: left + "px", top: top + "px" };
});
// ---- 自定义图例（提取到图表上方，替代 klinecharts 内置覆盖在图内的图例）----
interface LegendItem { label: string; value: string; color?: string; }
const legend = reactive<{
  show: boolean;
  time: string;
  o: number | null; h: number | null; l: number | null; c: number | null;
  chgPct: number | null;
  main: LegendItem[]; vol: LegendItem[]; macd: LegendItem[];
}>({
  show: false, time: "", o: null, h: null, l: null, c: null, chgPct: null,
  main: [], vol: [], macd: [],
});
// 图例分组对齐到各自面板顶部：复用 buildLayout 的高度算法，算出每个面板相对图表容器的 top（px），
// 使「主图」组贴主图顶部、「成交量」组贴量图顶部、「MACD」组贴 MACD 顶部，而非三者全堆在价格图上方。
const legendOffsets = computed(() => {
  const usable = Math.max(140, props.height - 24); // 预留底部 x 轴条
  const showVol = true; // 成交量面板常驻
  const showMacd = true; // MACD 面板常驻
  const subCount = (showVol ? 1 : 0) + (showMacd ? 1 : 0);
  let priceH: number;
  let volH = 0;
  if (subCount === 2) {
    priceH = Math.round(usable * 0.56);
    volH = Math.round(usable * 0.22);
  } else if (subCount === 1) {
    priceH = Math.round(usable * 0.7);
  } else {
    priceH = usable;
  }
  return { price: 0, vol: priceH, macd: priceH + volH };
});
function fmtPrice(v: number | null | undefined): string { return v != null && Number.isFinite(v) ? v.toFixed(2) : "--"; }
function fmtVol(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "--";
  if (v >= 1e8) return (v / 1e8).toFixed(2) + "亿";
  if (v >= 1e4) return (v / 1e4).toFixed(2) + "万";
  return String(Math.round(v));
}
// 从图表实例读取某 pane 各指标在「最后一根」的已算结果（用于无十字光标时显示最新值）
function readIndicatorResults(paneId: string, idx?: number): Record<string, any> {
  const out: Record<string, any> = {};
  try {
    const store: any = (chart as any)?.getChartStore?.();
    const insts: any[] = store?.getIndicatorStore?.()?.getInstances(paneId) || [];
    for (const inst of insts) {
      const res: any[] = inst?.result;
      if (!Array.isArray(res) || !res.length) continue;
      // idx 给定时取「选中柱子」的值（与 dataList 对齐）；否则取最新值
      const v = idx != null ? res[idx] : res[res.length - 1];
      if (v != null) out[inst.name] = v;
    }
  } catch {
    /* noop */
  }
  return out;
}
// 取某 pane 的指标结果：十字光标优先用事件（cross[paneId]），否则按 dataIndex 从实例读选中柱子的值，
// 最后兜底取最新值。关键：成交量/MACD 面板选中柱子时事件 cross 未必含主图数据，必须按 idx 从实例读，
// 否则落回「最新值」致量/MACD 图例不随选中柱子变化（即本 BUG 根因）。
function paneMap(paneId: string, cross?: Record<string, Record<string, any>>, idx?: number): Record<string, any> {
  if (cross && cross[paneId]) return cross[paneId];
  const byIdx = readIndicatorResults(paneId, idx);
  if (Object.keys(byIdx).length) return byIdx;
  return readIndicatorResults(paneId);
}
function buildLegend(kl: any, cross?: Record<string, Record<string, any>>, idx?: number) {
  if (!kl) return;
  const d = new Date(kl.timestamp);
  const p = (n: number) => String(n).padStart(2, "0");
  legend.time = props.mode === "intraday"
    ? `${p(d.getHours())}:${p(d.getMinutes())}`
    : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  legend.c = kl.close ?? null;
  if (props.mode === "intraday") {
    // 「开」= 当日开盘价（首根分时柱收盘价即 09:30 开盘价），固定不变，不可随光标变化。
    // 注意：每根分时柱的 open 字段被复用为「上一分钟收盘价」以给分时量柱着色（见 toKLineData），不能用于图例「开」。
    legend.o = dataList.length ? (dataList[0].close ?? props.preClose ?? null) : (props.preClose ?? null);
    // 分时图「高/低」= 当日（全天）最高/最低价，固定不变，不随光标变化（与同花顺一致）。
    // 直接取全部分时柱 high/low 的极值（high/low 缺失/异常时用收盘价兜底），即真正的全天最高/最低。
    let hh = -Infinity, ll = Infinity;
    for (const b of dataList) {
      if (!b) continue;
      const hi = Math.max(b.high, b.close); // high 缺失/异常时用收盘价兜底，保证极值有效
      const lo = Math.min(b.low, b.close);
      if (hi > hh) hh = hi;
      if (lo < ll) ll = lo;
    }
    legend.h = Number.isFinite(hh) ? hh : null;
    legend.l = Number.isFinite(ll) ? ll : null;
  } else {
    legend.o = kl.open ?? null;
    legend.h = kl.high ?? null; legend.l = kl.low ?? null;
  }
  // 涨跌幅基准：分时用昨收；K线用前一根收盘价（首根用开盘）
  const base = props.mode === "intraday"
    ? (props.preClose || kl.open || 0)
    : (idx && idx > 0 ? dataList[idx - 1]?.close || kl.open || 0 : kl.open || 0);
  legend.chgPct = base ? ((legend.c! - base) / base) * 100 : null;
  // 主图指标：分时=A VP均价；K线=各周期 MA（仅 maConfig 开启的）。
  // 颜色与图表画线一致：按「可见 MA 顺序」取调色板（MA5橙/MA10蓝/MA20紫/MA60绿）；AVP 取首色。
  const candle = paneMap("candle_pane", cross, idx);
  legend.main = [];
  if (props.mode === "intraday") {
    const avp = candle["AVP"];
    if (avp && Number.isFinite(avp.avp)) legend.main.push({ label: "均价", value: fmtPrice(avp.avp), color: INDICATOR_LINE_COLORS[0] });
  } else {
    const cfg = props.maConfig;
    const vis = (k: string) => props.showMA !== false && (cfg ? cfg[k as keyof ChartMaConfig] : true);
    let mi = 0;
    for (const def of MA_DEFS) {
      if (!vis(def.key)) continue;
      // 指标结果是一个对象（如 {ma5: 值}），取子键才得到数值；直接取会拿到对象导致 fmtPrice 显示 "--"
      const obj = candle["MA" + def.period] as Record<string, any> | undefined;
      const v = obj ? obj[def.key] : null;
      if (v != null) { legend.main.push({ label: "MA" + def.period, value: fmtPrice(v), color: INDICATOR_LINE_COLORS[mi] }); mi++; }
    }
  }
  // 量图：分时量/成交量 + 量 MA5/10/20（量 MA 取调色板前三位）
  const volMap = paneMap("vol_pane", cross, idx);
  const vol = volMap[props.mode === "intraday" ? "INTRADAY_VOL" : "VOL"];
  legend.vol = [];
  if (vol) {
    if (vol.volume != null) legend.vol.push({ label: props.mode === "intraday" ? "分时量" : "成交量", value: fmtVol(vol.volume) });
    // 量均线 MA5/MA10/MA20 各自独立开关（figure key: ma1/ma2/ma3）
    const volMaOn = [props.volumeMa5 !== false, props.volumeMa10 !== false, props.volumeMa20 !== false];
    const volMaKeys = ["ma1", "ma2", "ma3"];
    volMaKeys.forEach((k, i) => { if (volMaOn[i] && vol[k] != null) legend.vol.push({ label: "MA" + (i + 1) * 5, value: fmtVol(vol[k]), color: INDICATOR_LINE_COLORS[i] }); });
  }
  // MACD 图：DIF(橙)/DEA(蓝)/MACD(柱按正负红绿) —— DIF/DEA 各自独立开关
  const macdMap = paneMap("macd_pane", cross, idx);
  const md = macdMap[props.mode === "intraday" ? "MACDFS" : "MACD"];
  legend.macd = [];
  if (md) {
    if (md.macd != null) legend.macd.push({ label: "MACD", value: fmtPrice(md.macd), color: md.macd > 0 ? UP : md.macd < 0 ? DOWN : undefined });
    if (props.macdDif !== false && md.dif != null) legend.macd.push({ label: "DIF", value: fmtPrice(md.dif), color: INDICATOR_LINE_COLORS[0] });
    if (props.macdDea !== false && md.dea != null) legend.macd.push({ label: "DEA", value: fmtPrice(md.dea), color: INDICATOR_LINE_COLORS[1] });
  }
  legend.show = true;
}
function updateLegendLatest() {
  const last = dataList[dataList.length - 1];
  if (!last) { legend.show = false; return; }
  buildLegend(last, undefined, dataList.length - 1);
}

let crosshairCb: ((d: any) => void) | null = null;
let dataReadyCb: (() => void) | null = null;
function onCrosshair(c: any) {
  // 图例跟随十字光标：主图/成交量/MACD 任一面板悬浮都显示当前选中 K 线的 OHLC + 各面板指标值。
  // 此前仅在 candle_pane 才更新，导致在成交量/MACD 面板选柱时图例不跟随（始终显示最新值）。
  if (!c || c.kLineData == null || c.x == null || c.y == null) {
    tip.show = false;
    updateLegendLatest();
    return;
  }
  buildLegend(c.kLineData, c.indicatorData, c.dataIndex);
  // 智能标注悬浮吸附：仅主图面板处理
  if (!chart || !c.paneId || c.paneId !== "candle_pane") {
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
        const src = lv.src ? ` · ${lv.src}` : "";
        items.push({ label: lv.label, color: lv.color, text: `${lv.price.toFixed(2)}${src}` });
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

// 副图内部辅助线控制：成交量面板内的量均线 MA5/10/20、MACD 面板内的 DIF/DEA 线，
// 均为内置指标写死的 figure，无独立开关。这里通过 overrideIndicator 按面板覆盖 figures：
// 量均线 MA5/MA10/MA20、MACD 的 DIF/DEA 各自独立开关——关闭某条线即只把该 figure 从绘制列表中剔除，
// 其余线（含量柱 / MACD 柱的涨跌着色）保留。每根保留的线显式指定与图例一致的 INDICATOR_LINE_COLORS，
// 保证「图线 ↔ 图例」颜色统一。
// 注意：override 仅改「绘制用的 figures」，calc 仍照算，故图例显示需由 buildLegend 同步按开关剔除。
// 仅当「存在被关闭的线」时才覆盖（全部开启时跳过，沿用内置默认外观，零行为变化）。
function applySubOverrides() {
  if (!chart) return;
  const showVol = true; // 成交量面板常驻
  const showMacd = true; // MACD 面板常驻
  const volMaOn = [props.volumeMa5 !== false, props.volumeMa10 !== false, props.volumeMa20 !== false];
  const macdDifOn = props.macdDif !== false;
  const macdDeaOn = props.macdDea !== false;

  // 成交量面板：量柱 + 已开启的量均线（MA5=ma1/MA10=ma2/MA20=ma3），关闭的线直接剔除
  if (showVol && volMaOn.some((v) => !v)) {
    const volName = props.mode === "intraday" ? "INTRADAY_VOL" : "VOL";
    const volBarFigure = {
      key: "volume",
      title: props.mode === "intraday" ? "分时量: " : "成交量: ",
      type: "bar",
      baseValue: 0,
      styles: (data: any, _indicator: any, defaultStyles: any) => {
        const k = data?.current?.kLineData;
        const base = (defaultStyles?.bars && defaultStyles.bars[0]) || {};
        const up = base.upColor || UP;
        const down = base.downColor || DOWN;
        const noChange = base.noChangeColor || "#888888";
        if (!k) return { color: noChange };
        if (k.close > k.open) return { color: up };
        if (k.close < k.open) return { color: down };
        return { color: noChange };
      },
    };
    const maKeys = ["ma1", "ma2", "ma3"];
    const maTitles = ["MA5: ", "MA10: ", "MA20: "];
    const volFigures: any[] = [volBarFigure];
    volMaOn.forEach((on, i) => {
      if (on) volFigures.push({ key: maKeys[i], title: maTitles[i], type: "line", color: INDICATOR_LINE_COLORS[i] });
    });
    try {
      (chart as any).overrideIndicator({ name: volName, figures: volFigures }, "vol_pane");
    } catch {
      /* noop */
    }
  }

  // MACD 面板：MACD 柱 + 已开启的 DIF/DEA 线，关闭的线直接剔除
  if (showMacd && (!macdDifOn || !macdDeaOn)) {
    const macdName = props.mode === "intraday" ? "MACDFS" : "MACD";
    const macdBarFigure = {
      key: "macd",
      title: "MACD: ",
      type: "bar",
      baseValue: 0,
      styles: (data: any, _indicator: any, defaultStyles: any) => {
        const base = (defaultStyles?.bars && defaultStyles.bars[0]) || {};
        const up = base.upColor || UP;
        const down = base.downColor || DOWN;
        const noChange = base.noChangeColor || "#888888";
        const prevMacd = data?.prev?.indicatorData?.macd ?? Number.MIN_SAFE_INTEGER;
        const curMacd = data?.current?.indicatorData?.macd ?? Number.MIN_SAFE_INTEGER;
        let color = noChange;
        if (curMacd > 0) color = up;
        else if (curMacd < 0) color = down;
        const style = prevMacd < curMacd ? "stroke" : "fill";
        return { style, color, borderColor: color };
      },
    };
    const macdFigures: any[] = [macdBarFigure];
    if (macdDifOn) macdFigures.push({ key: "dif", title: "DIF: ", type: "line", color: INDICATOR_LINE_COLORS[0] });
    if (macdDeaOn) macdFigures.push({ key: "dea", title: "DEA: ", type: "line", color: INDICATOR_LINE_COLORS[1] });
    try {
      (chart as any).overrideIndicator({ name: macdName, figures: macdFigures }, "macd_pane");
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
  ensureIntradayVol();
  ensureMacdfs();
  ensureMaIndicators();
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
        const y = String(d.getFullYear()).slice(-2); // 两位年份
        // 分时：仅显示时分
        if (props.mode === "intraday") return `${p(d.getHours())}:${p(d.getMinutes())}`;
        // 按 klinecharts 传入的 format 精确格式化，确保年份/时间正确带出：
        if (format === "YYYY") return String(d.getFullYear());
        if (format === "YYYY-MM") return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
        if (format === "YYYY-MM-DD HH:mm")
          return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
        // 其余（如轴标签 MM-DD）：补两位年份，避免跨年仅显示月日
        return `${y}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      },
      formatBigNumber: (v: string | number) => String(v),
    },
  } as never);
  if (!chart) return;

  // 显式开启主图拖拽（横向滚动）与捏合/滚轮缩放——klinecharts 默认开启，但保险起见强制开启，
  // 避免任何状态下被意外禁用导致「主图不能拖拽/缩放」。
  try {
    chart.setScrollEnabled(true);
    chart.setZoomEnabled(true);
  } catch {
    /* noop */
  }

  // 十字光标订阅（驱动智能标注悬浮提示）；单实例，销毁时已解除订阅
  crosshairCb = onCrosshair;
  chart.subscribeAction(ActionType.OnCrosshairChange, crosshairCb as never);
  // 数据就绪订阅：分时模式首载/刷新/实时末根后保持「整日全貌」铺满视图
  dataReadyCb = onDataReady;
  chart.subscribeAction(ActionType.OnDataReady, dataReadyCb as never);

  chart.applyNewData(dataList);
  // 副图内部辅助线（量均线 / DIF·DEA）开关：在指标实例已随 layout 创建后覆盖 figures
  applySubOverrides();
  nextTick(() => {
    if (!chart || !chartEl.value) return;
    chart.resize();
    // 等主图比例尺测量完成再叠加 overlay，避免价格→像素映射过早被钳到顶部（表现为所有线堆在顶部一条虚线）
    const drawOverlays = () => {
      if (!chart || !chartEl.value) return;
      // 首载兜底：确保铺满全貌（OnDataReady 在 applyNewData 异步解析后才触发，
      // 此处保证容器尺寸确定后也对齐一次，所有模式通用）
      fitViewAll();
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
  // 容器尺寸变化（旋转/布局）后：重新铺满全貌，避免回到默认 barSpace 只显示末尾片段
  if (chart) fitViewAll();
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
  () => [props.mode, props.showMA, props.macdDif, props.macdDea, props.volumeMa5, props.volumeMa10, props.volumeMa20, props.maConfig?.ma5, props.maConfig?.ma10, props.maConfig?.ma20, props.maConfig?.ma60, props.maConfig?.ma250],
  () => buildChart()
);
watch(
  () => [props.livePrice, props.livePreClose],
  () => applyLivePrice()
);
watch(isDark, () => applyTheme());
// 辅助线开关变化（总开关 / 压力 / 支撑 / 趋势任一）→ 重画智能标注
watch(
  () => props.auxConfig,
  () => drawAutoLevels(),
  { deep: true }
);

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
/* 自定义图例：覆盖在图表之上的绝对定位层（不再单独占高度），三组分别对齐到各自面板顶部，
   替代原先堆在价格图上方的整块图例；pointer-events:none 避免遮挡图表交互。 */
.kc-legendbar {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  font-size: var(--font-xs);
  color: var(--text-2);
}
/* 每组一行：组内 token 单行流动，屏宽不足才换行；绝对定位贴到对应面板顶部，
   浅毛玻璃背景(var(--card) 本身半透明)保证压在图线上仍清晰可读 */
.lg-row {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4rpx 14rpx;
  padding: 5rpx 14rpx;
  background: var(--card);
}
/* 分组标题：标明该组数据属于哪个图（主图/成交量/MACD），使「每个图的数据」一目了然 */
.lg-sec {
  color: var(--text-3);
  font-weight: 500;
  margin-right: 2rpx;
}
.lg-time {
  font-weight: 500;
  color: var(--text);
  margin-right: 4rpx;
}
.lg-k {
  color: var(--text-3);
  margin-left: 8rpx;
}
.lg-v {
  color: var(--text);
}
.lg-chg {
  margin-left: 8rpx;
  font-weight: 500;
}
/* 价格 + 涨跌幅 作为一组紧排（替代原先与开/高/低 等同的间距），使「现价 + 涨跌」读感成一体；
   组与组之间仍由 .lg-row 的 flex gap 拉开，区分于后续开/高/低 */
.lg-price {
  display: inline-flex;
  align-items: center;
  gap: 4rpx;
  margin-right: 6rpx;
}
.lg-price .lg-k { margin-left: 0; }
.lg-price .lg-chg { margin-left: 0; }
/* 图例 token：组内单行流动；标签取弱化色；数值默认取主文本色（与主图「开 22.30」的 22.30 同色），
   仅当带线色（MA/DIF/DEA/MACD）时数值随线色。间距用 margin 而非 flex gap——<text> 非 flex 容器，
   gap 在 uni-app 内不生效，会导致标签↔数值贴死（即「分时量2180」无空格现象）。 */
.lg-it {
  display: inline-flex;
  align-items: center;
  color: var(--text-3);
}
.lg-it .lg-l {
  color: inherit;
}
.lg-it .lg-v {
  color: var(--text);
  margin-left: 8rpx;
}
.lg-it.has-color .lg-v {
  color: inherit;
}
.lg-l {
  color: var(--text-3);
}
.up {
  color: #ef232a;
}
.down {
  color: #09b07a;
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
/* 工具栏淡入/淡出（由画板图标控制 toolsOpen） */
.kct-enter-active,
.kct-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.kct-enter-from,
.kct-leave-to {
  opacity: 0;
  transform: translateY(-8rpx) scale(0.96);
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
/* 智能标注悬浮提示框：跟随十字光标，玻璃卡片，不拦截指针 */
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
