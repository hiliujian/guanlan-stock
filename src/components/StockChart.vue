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
        <view class="kct-btn" :class="{ active: activeAction === 'support' }" role="button" @click="drawLine('support')">支撑</view>
        <view class="kct-btn" :class="{ active: activeAction === 'pressure' }" role="button" @click="drawLine('pressure')">压力</view>
        <view class="kct-btn" :class="{ active: activeAction === 'trend' }" role="button" @click="drawLine('trend')">趋势</view>
        <view class="kct-btn" :class="{ active: activeAction === 'fib' }" role="button" @click="drawLine('fib')">分割</view>
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
import { UP as UP_FALLBACK, DOWN as DOWN_FALLBACK, NO_CHANGE, TREND, INDICATOR_LINE_COLORS, cssColor } from "@/utils/colors";
import { computeChip, type ChipResult } from "@/utils/analyzer";
import type { Kline, Trend, PeriodKey } from "@/utils/period";
import type { ChartAuxConfig } from "@/store/chartAux";
import { MA_PERIODS, type ChartMaConfig } from "@/store/chartMa";
import { fmtPrice, fmtAmount } from "@/utils/format";

// 图表涨跌色以 global.css 的 --up/--down 为单一真源（CSS 变量驱动），与全站价格文字保持一致。
// canvas 不能解析 var()，故此处初始化时解析一次真实 hex 再喂给图表引擎；--up/--down 为主题不变量
// （浅/深主题值相同，见 global.css），无需在数据层监听主题切换。无 DOM 时回退到硬编码常量。
const UP = cssColor("--up", UP_FALLBACK);
const DOWN = cssColor("--down", DOWN_FALLBACK);

// 量柱/MACD 柱取涨跌色（兜底 UP/DOWN/中性色）：自定义指标拿不到 klinecharts 内置量柱默认样式，
// 故用项目统一涨跌色兜底，确保量柱可见——否则量面板会退化成无柱的平直线。
function readBarColors(defaultStyles: any): { up: string; down: string; noChange: string } {
  const base = (defaultStyles?.bars && defaultStyles.bars[0]) || {};
  return {
    up: base.upColor || UP,
    down: base.downColor || DOWN,
    noChange: base.noChangeColor || NO_CHANGE,
  };
}

// 量均线 MA5/MA10/MA20 各自独立开关（与 applySubOverrides 共用，避免重复构造）
function volMaOnEnabled(): boolean[] {
  return [props.volumeMa5 !== false, props.volumeMa10 !== false, props.volumeMa20 !== false];
}

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
            const { up, down, noChange } = readBarColors(defaultStyles);
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
          title: "MACDFS: ", // 分时专属指标，图例前缀与面板标题 MACDFS 一致，避免与日K 的 MACD 混淆误导
          type: "bar",
          baseValue: 0, // 关键：与内置 MACD 一致锚定零轴；缺失时 klinecharts 会用 yAxis 区间下沿（getRange().from）作基线，分时 MACD 柱从底部向上画、零轴穿越消失、图形错乱
          // 量柱逐根着色：klinecharts 自定义指标不会自动按值正负选色（内置 MACD 才会）
          // 正确数据路径：data.current.indicatorData.macd（已验证 v3 修复）
          // 复刻内置 MACD 的柱着色/描边逻辑（data.current/prev.indicatorData.macd 为正确路径）
          styles: (data: any, _indicator: any, defaultStyles: any) => {
            const { up, down, noChange } = readBarColors(defaultStyles);
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
// 周期列表复用 chartMa 的 MA_PERIODS（与设置面板开关顺序一致）。
let maRegistered = false;
function ensureMaIndicators() {
  if (maRegistered) return;
  try {
    for (let i = 0; i < MA_PERIODS.length; i++) {
      const def = MA_PERIODS[i];
      const key = def.key;
      // 每条 MA 在注册时就把线色烤进 figure 的 styles 回调（按 MA_PERIODS 顺序取调色板：
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
    /** 当前 K线周期（m=分时/d/w/M），用于各周期默认缩放与智能标注多周期隔离；不传默认日K */
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
        noChangeColor: NO_CHANGE,
        upBorderColor: UP,
        downBorderColor: DOWN,
        noChangeBorderColor: NO_CHANGE,
        upWickColor: UP,
        downWickColor: DOWN,
        noChangeWickColor: NO_CHANGE,
      },
      priceMark: {
        high: { show: false },
        low: { show: false },
        last: {
          show: true,
          upColor: UP,
          downColor: DOWN,
          noChangeColor: NO_CHANGE,
          line: { show: false, style: "dashed", size: 1, dashedValue: [4, 3] },
          text: { show: true, color: "#ffffff", backgroundColor: UP, paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, size: 10 },
        },
      },
      // 关闭内置 tooltip/图例（指标名+数值默认常显并覆盖在图内，改为图表上方自定义图例）
      tooltip: { showRule: "none" },
      area: {
        lineSize: 1.5,
        lineColor: "#1677ff",
        value: "close",
        smooth: false,
        backgroundColor: [
          { offset: 0, color: "rgba(22,119,255,0.12)" },
          { offset: 1, color: "rgba(22,119,255,0.01)" },
        ],
        // 分时走势线最前端的脉动圆点（默认 radius:4 / rippleRadius:8，偏大）；
        // 与 lineSize 2→1.5 同步调细，颜色与走势线一致，保留脉动闪烁。
        point: {
          show: true,
          color: "#1677ff",
          radius: 3,
          rippleColor: "rgba(22,119,255,0.25)",
          rippleRadius: 6,
          animation: true,
          animationDuration: 1000,
        },
      },
    },
    indicator: {
      // 关闭内置 indicator 图例/末值标签（默认常显于各 pane、覆盖在图内，已改为图表上方自定义图例）
      tooltip: { showRule: "none" },
      lastValueMark: { show: false },
      bars: [
        { style: "fill", upColor: UP, downColor: DOWN, noChangeColor: NO_CHANGE, borderStyle: "solid", borderSize: 1, borderDashedValue: [2, 2] },
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
    // 分面分隔线加粗到 2px 并略加深，使主图/成交量/MACD 三块清晰分界，避免「主图穿到成交量」的粘连观感
    separator: { color: sep, size: 2 },
    overlay: {
      point: { color: "#07c160", radius: 4, borderColor: "#07c160", borderSize: 1 },
      line: { color: "#07c160", size: 1, style: "dashed" },
      text: { color: "#ffffff", backgroundColor: "#07c160" },
    },
  };
}

// 副图高度分配（成交量 + MACD 两面板常驻）：返回各面板相对图表容器的高度（px）。
// 主图占 0.56、量图占 0.22、MACD 顶满剩余（≥60px）。buildLayout 与 legendOffsets 共用，避免重复计算。
function subPaneHeights(usable: number): { priceH: number; volH: number; macdH: number } {
  const priceH = Math.round(usable * 0.56);
  const volH = Math.round(usable * 0.22);
  const macdH = Math.max(60, usable - priceH - volH);
  return { priceH, volH, macdH };
}

// ---- 布局（主图 + 成交量 + MACD 三分面，按比例控高）----
// 成交量面板与 MACD 面板均常驻显示（不可整体关闭），故布局恒为主图 0.56 + 量图 0.22 + MACD 顶满。
function buildLayout(): any[] {
  // 用真实容器高度（而非仅靠 props.height）：若 init 时容器尚未完成布局、量到的高度偏小，
  // 会导致 pane 总高 < 容器 → 画布下方露出容器底色（底部空白）、主图被压扁。回退 props.height 兜底。
  const h = Math.max(0, chartEl.value?.clientHeight ?? 0) || props.height;
  const usable = Math.max(140, h - 24); // 预留 x 轴条
  const { priceH, volH, macdH } = subPaneHeights(usable);
  const candleContent: string[] = [];
  if (props.mode === "kline") {
    const mc = props.maConfig;
    // 按 maConfig 逐周期独立开关决定主图叠加哪些 MA（MA5/MA10/MA20/MA60/MA250）；
    // showMA 为总开关，false 时不叠加任何均线。分时模式无 MA（用 AVP 均价线）。
    const visibleMas = MA_PERIODS.filter((d) => (mc ? mc[d.key as keyof ChartMaConfig] : true));
    if (props.showMA !== false && visibleMas.length) {
      visibleMas.forEach((d) => candleContent.push("MA" + d.period));
    }
  }
  if (props.mode === "intraday") candleContent.push("AVP");
  const layout: any[] = [
    { type: "candle", content: candleContent, options: { id: "candle_pane", height: priceH, minHeight: Math.round(priceH * 0.6) } },
  ];
  // 分时模式用 INTRADAY_VOL（图例显示「分时量」），K 线模式用内置 VOL（显示「成交量」）；成交量面板常驻。
  layout.push({ type: "indicator", content: [props.mode === "intraday" ? "INTRADAY_VOL" : "VOL"], options: { id: "vol_pane", height: volH, minHeight: 40 } });
  // MACD 面板常驻。
  layout.push({ type: "indicator", content: [props.mode === "intraday" ? "MACDFS" : "MACD"], options: { id: "macd_pane", height: macdH, minHeight: 60 } });
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
    ctx.fillStyle = chip.colors[i] || NO_CHANGE;
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
  // 关键修复：数据就绪（含首载 / 实时末根）后重画智能标注。
  // applyNewData 是异步解析，buildChart 内的 rAF 绘制早于数据可用时机，
  // 导致初始智能标注画不上（需手动关闭/打开一次开关才触发）；此处保证数据就绪即绘制。
  drawAutoLevels();
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
// 自定义画线工具：点击工具后保持激活，可连续画多条；再次点击同一工具才关闭。
type DrawAction = "support" | "pressure" | "trend" | "fib";
const activeAction = ref<DrawAction | "">("");
// 当前已"装填"、等待下一次点击落线的进度 overlay id（连续绘制模式）
let armedId: string | null = null;
// 关闭/清空过程中的守卫：避免 removeOverlay 触发的 onRemoved 又去重新装填
let disarming = false;

// 动作 → 自定义 overlay 名 + 线色 + 标签前缀（不再用内置名，避免「都绿/互斥」）
function mapDrawAction(a: DrawAction): { name: string; color?: string; tag: string } {
  if (a === "support") return { name: "kcHLine", color: DOWN, tag: "支" };
  if (a === "pressure") return { name: "kcHLine", color: UP, tag: "压" };
  if (a === "trend") return { name: "kcTrend", color: TREND, tag: "" };
  return { name: "kcFib", color: undefined, tag: "" };
}

// 工具仍处于激活态时，立即装填下一条待绘制的线（连续绘制）。
// 用 setTimeout 让上一次鼠标落线事件彻底结束后，再进入下一次绘制，避免复用同一次点击。
function reArm() {
  if (disarming || !activeAction.value || !chart) return;
  const { name, color, tag } = mapDrawAction(activeAction.value);
  const id = genOverlayId();
  overlayIds.push(id);
  armedId = id;
  const created = chart.createOverlay({
    id,
    name,
    extendData: { tag },
    styles: color ? { line: { color, style: "solid", size: 1.4 } } : undefined,
    onDrawEnd: () => {
      armedId = null;
      persistSave();
      // 完成一笔后继续保持激活，装填下一笔（下一帧，避免复用当前鼠标事件）
      setTimeout(reArm, 0);
    },
    onRemoved: () => {
      // 取消（ESC/右键删）半截线：若仍处于激活态则重新装填，保持连续绘制
      if (disarming) return;
      armedId = null;
      if (activeAction.value && chart) setTimeout(reArm, 0);
    },
  } as never);
  if (!created) {
    overlayIds.pop(); // 创建失败（如已有绘制进行中）回退
    armedId = null;
  }
}

// 关闭当前激活的工具：移除已装填的待绘线、清空激活态
function disarm() {
  disarming = true;
  if (armedId && chart) {
    try { chart.removeOverlay(armedId); } catch { /* noop */ }
  }
  armedId = null;
  disarming = false;
  activeAction.value = "";
}

// 点击工具按钮：激活 / 切换 / 关闭。再次点击同一工具 = 关闭。
function drawLine(action: DrawAction) {
  if (!chart) return;
  // 已是同一工具 → 关闭
  if (activeAction.value === action) {
    disarm();
    return;
  }
  // 切到另一工具：先清掉旧的待绘线
  if (armedId) {
    disarming = true;
    try { chart.removeOverlay(armedId); } catch { /* noop */ }
    armedId = null;
    disarming = false;
  }
  activeAction.value = action;
  reArm();
}
// 清空用户手动画的线（不影响系统智能标注），并清本地存储
function clearUserOverlays() {
  disarming = true;
  if (chart) overlayIds.forEach((id) => { try { chart!.removeOverlay(id); } catch { /* noop */ } });
  disarming = false;
  overlayIds.length = 0;
  armedId = null;
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
// 全局常量（画线规则总表）
const BAND_WIN = 30;      // 波段观测窗口：波段识别、结构支撑/压力计算，滚动右移，移出窗口价位剔除
const TRADE_WIN = 20;     // 短线观测窗口：交易参考支撑/压力计算，滚动右移
const TOL_PCT = 0.008;    // 价格聚类容差：abs(p1-p2)/max(p1,p2) ≤0.008 视为同一价格簇，一簇仅输出 1 条线
const SWING_WIN = 2;      // 摆动点左右确认 K 线：左右各 2 根验证；靠近首尾不足则不生成摆动点
const SWING_FREQ_MAX = 40;// 触碰频次满分
const SWING_REV_MAX = 35; // 反转反应满分
const SWING_SWAP_MAX = 25;// 角色互换满分
const MIN_TOUCH_COUNT = 2;   // S/B 最低触碰次数（价格簇摆动点个数）：单根插针脉冲（仅 1 个摆动点）不生成 S/B
const MIN_TOTAL_SCORE = 30;  // S/B 总分最低合格门槛：综合打分 < 30 不渲染（杜绝弱位错出买卖信号）
const BREAK_CONFIRM_CNT = 2; // 连续 N 根实体收盘击穿判定价位失效（仅尾部连续计入；单根影线/历史破位已收回不计）
const SUPPORT_COLOR = DOWN;        // 结构支撑（绿，对应 desc「红压力/绿支撑」）
const PRESSURE_COLOR = UP;         // 结构压力（红，对应 desc「红压力/绿支撑」）
const TRADE_SUPPORT_COLOR = UP;    // 交易参考支撑 S（红，买入信号，对应 desc「红S买入」）
const TRADE_PRESSURE_COLOR = DOWN; // 交易参考压力 B（绿，卖出信号，对应 desc「绿B卖出」）

// 摆动点（pivot）：以 win 根为窗口取严格局部极值；窗口天然把相邻极值隔开 ≥win 根，无需额外 gap 过滤
// 全局强制约束：K 线靠近图表首尾不足 win 根则不生成摆动点（findSwings 循环边界已保证）。
type SwingPt = { idx: number; t: number; value: number; k: any };
function findSwings(series: any[], win: number): { highs: SwingPt[]; lows: SwingPt[] } {
  const highs: SwingPt[] = [];
  const lows: SwingPt[] = [];
  const n = series.length;
  for (let i = win; i < n - win; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - win; j <= i + win; j++) {
      if (j === i) continue;
      if (series[j].high >= series[i].high) isHigh = false;
      if (series[j].low <= series[i].low) isLow = false;
    }
    if (isHigh) highs.push({ idx: i, t: series[i].timestamp, value: series[i].high, k: series[i] });
    if (isLow) lows.push({ idx: i, t: series[i].timestamp, value: series[i].low, k: series[i] });
  }
  return { highs, lows };
}

// 中位数（平台中轴 / 价格簇中枢）
function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface AutoLevel {
  kind: "pressure" | "support" | "trend";
  role?: "structSupport" | "tradeSupport" | "structPressure" | "tradePressure";
  price?: number;
  points?: { timestamp: number; value: number }[];
  color: string;
  bg: string;
  size: number;
  dashed: boolean;
  tag?: string;           // 轴标签短前缀：支/压/S/B（价格线用；趋势线无需）
  sub?: string;           // 轴标签小字描述（交易参考线），如 反弹/回调低吸
  label: string;          // 悬浮提示用的线条名称
  src?: string;           // 价位来源说明，用于悬浮提示
  dir?: "up" | "down";
}
// ── 波段类型（5 类）──
type BandType = "uptrend" | "downtrend" | "pullback" | "bounce" | "box";

// 判定当前所处波段类型（5 类），输入 highs/lows 来自 30 根波段窗口。
// breakDown：箱体/上涨结构但现价跌破前摆动低点→结构已破坏，统一判定支撑失效（结构支撑 + 交易S 全部隐藏），压力线保留。
function detectBandType(highs: SwingPt[], lows: SwingPt[], series: any[], current: number): { band: BandType; breakDown: boolean } {
  const has2H = highs.length >= 2;
  const has2L = lows.length >= 2;
  // 摆动点不足时，先用价格行为辅助识别「冲高回档 / 下跌反弹」形态
  if (!has2H && !has2L) {
    const ph = Math.max(...series.map((d) => d.high));
    const pl = Math.min(...series.map((d) => d.low));
    const mid = (ph + pl) / 2;
    const amp = mid > 0 ? (ph - pl) / mid : 0;
    if (amp > 0.06) {
      // 从近端高点回落 >4% 且未跌回近端低点 → 回档（典型冲高回落形态）
      if (ph > 0 && current < ph * 0.96 && pl > 0 && current > pl * 1.02) return { band: "pullback", breakDown: false };
      // 从近端低点反弹 >4% 且未突破近端高点 → 反弹
      if (pl > 0 && current > pl * 1.04 && ph > 0 && current < ph * 0.98) return { band: "bounce", breakDown: false };
    }
    return { band: current >= (series[0]?.close ?? 0) ? "uptrend" : "downtrend", breakDown: false };
  }
  const lastH = has2H ? highs[highs.length - 1] : null;
  const prevH = has2H ? highs[highs.length - 2] : null;
  const lastL = has2L ? lows[lows.length - 1] : null;
  const prevL = has2L ? lows[lows.length - 2] : null;
  const hh = !!lastH && !!prevH && lastH.value > prevH.value; // 更高高点
  const hl = !!lastL && !!prevL && lastL.value > prevL.value; // 更高低点
  const lh = !!lastH && !!prevH && lastH.value < prevH.value; // 更低高点
  const ll = !!lastL && !!prevL && lastL.value < prevL.value; // 更低低点

  const firstClose = series[0]?.close ?? 0;
  const netUp = current > firstClose * 1.03;  // 近端涨幅 >3% 视为偏多
  const netDn = current < firstClose * 0.97;  // 近端跌幅 >3% 视为偏空

  // ===== 下跌结构：先看是否其实是「反弹 bounce」 =====
  if (lh && ll) {
    const rebounded = !!lastL && current > lastL.value;   // 从近端低位反弹
    const prevHigh = prevH ? prevH.value : (lastH ? lastH.value : Infinity);
    if (rebounded && current <= prevHigh) return { band: "bounce", breakDown: false }; // 未突破近端前高
    return { band: "downtrend", breakDown: false };
  }
  if (lh && netDn && !hh) return { band: "downtrend", breakDown: false };

  // ===== 上涨结构：先看是否其实是「回档 pullback」 =====
  if (hh && hl) {
    const pulledBack = !!lastH && current < lastH.value;  // 从近端高位回落
    const prevLow = prevL ? prevL.value : (lastL ? lastL.value : -Infinity);
    if (current < prevLow) return { band: "box", breakDown: true }; // 跌破前低→结构已破坏，降级箱体，屏蔽全部 S 交易参考线、仅保留 B 压力线
    if (pulledBack && current >= prevLow) return { band: "pullback", breakDown: false }; // 未跌破近端前低
    return { band: "uptrend", breakDown: false };
  }
  if (hl && netUp && !ll) return { band: "uptrend", breakDown: false };

  // ===== 箱体：近端窗口振幅 <6% =====
  if (series.length >= 5) {
    const ph = Math.max(...series.map((d) => d.high));
    const pl = Math.min(...series.map((d) => d.low));
    const mid = (ph + pl) / 2;
    if (mid > 0 && (ph - pl) / mid < 0.06) return { band: "box", breakDown: false };
  }
  // 最终兜底：按近端整体方向
  return { band: netUp ? "uptrend" : netDn ? "downtrend" : "box", breakDown: false };
}

// 价格簇：把相近摆动点（≤TOL_PCT）合并为一簇，簇中枢取价位中位数（筹码密集中枢）
interface PriceCluster { center: number; members: SwingPt[]; }
function clusterSwings(pts: SwingPt[], tol: number): PriceCluster[] {
  if (!pts.length) return [];
  const sorted = [...pts].sort((a, b) => a.value - b.value);
  const clusters: PriceCluster[] = [];
  let cur: SwingPt[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const lastV = cur[cur.length - 1].value;
    const v = sorted[i].value;
    if (Math.abs(v - lastV) / Math.max(v, lastV) <= tol) cur.push(sorted[i]);
    else { clusters.push({ center: median(cur.map((p) => p.value)), members: cur }); cur = [sorted[i]]; }
  }
  clusters.push({ center: median(cur.map((p) => p.value)), members: cur });
  return clusters;
}

// 价格簇三维打分：触碰频次(40) + 反转反应(35) + 角色互换(25)
interface ClusterScore { touches: number; reversal: number; swap: number; score: number; broken: boolean; }
function scoreCluster(series: any[], cl: PriceCluster, role: "support" | "pressure", tol: number): ClusterScore {
  const center = cl.center;
  const lo = center * (1 - tol), hi = center * (1 + tol);
  let touches = 0, broken = false, breakCount = 0, revSum = 0;
  let prevSide = 0, crossed = false;
  const n = series.length;
  for (let i = 0; i < n; i++) {
    const d = series[i];
    let touched = false;
    if (role === "support") {
      if (d.low <= hi && d.low >= lo) touched = true;
      if (d.close < center) breakCount++; else breakCount = 0; // 连续实体收盘击穿计数
    } else {
      if (d.high >= lo && d.high <= hi) touched = true;
      if (d.close > center) breakCount++; else breakCount = 0;
    }
    if (touched) {
      touches++;
      // 触碰后 1~2 根的反转反应（大阳拉起 / 大阴回落）
      for (let k = i + 1; k <= Math.min(i + 2, n - 1); k++) {
        if (role === "support") {
          const r = (series[k].close - center) / center;
          if (r > 0.003) revSum += Math.min(20, (r / 0.01) * 12);
        } else {
          const r = (center - series[k].close) / center;
          if (r > 0.003) revSum += Math.min(20, (r / 0.01) * 12);
        }
      }
    }
    // 角色互换：窗口内价格曾上穿/下穿该价位（压力↔支撑转换）
    const side = d.close > center ? 1 : d.close < center ? -1 : 0;
    if (prevSide !== 0 && side !== 0 && side !== prevSide) crossed = true;
    if (side !== 0) prevSide = side;
  }
  // 失守判定：仅统计「尾部连续」实体击穿（breakCount 每遇未击穿即归零）。
  // 单根影线穿刺、或历史中段曾破位但已收回的情况，breakCount 在末尾已归零，不判失效——对齐规范「后续视图不再渲染」=当前破位。
  broken = breakCount >= BREAK_CONFIRM_CNT;
  // 频次：单次毛刺穿刺最高 10 分
  const freq = touches <= 1 ? Math.min(10, touches * 8) : Math.min(SWING_FREQ_MAX, touches * 8);
  const reversal = Math.min(SWING_REV_MAX, revSum);
  const swap = crossed ? 8 : SWING_SWAP_MAX; // 稳定未被穿越的支撑/压力拿满；来回震荡穿越位仅基础分（更符合交易常识）
  let score = freq + reversal + swap;
  if (broken) score *= 0.4; // 被实体击穿的价位大幅扣分（不再作为有效支撑/压力）
  return { touches, reversal, swap, score, broken };
}

// 窗口内取某角色综合得分第 1 的价格簇；minTouch 过滤单脉冲簇（摆动点个数 < minTouch 不生成线，默认不过滤）
function bestCluster(series: any[], pts: SwingPt[], role: "support" | "pressure", tol: number, minTouch = 1): { cl: PriceCluster; sc: ClusterScore } | null {
  const clusters = clusterSwings(pts, tol);
  let best: PriceCluster | null = null, bestSc: ClusterScore | null = null, bestScore = -1;
  for (const cl of clusters) {
    if (cl.members.length < minTouch) continue; // 单次插针脉冲（仅 1 个摆动点）直接过滤，不生成 S/B
    const sc = scoreCluster(series, cl, role, tol);
    if (sc.score > bestScore) { bestScore = sc.score; best = cl; bestSc = sc; }
  }
  return best && bestSc ? { cl: best, sc: bestSc } : null;
}

// 拐点 K 实体边缘（结构线专用，禁止影尖）：支撑取实体下沿、压力取实体上沿
function bodyEdge(cl: PriceCluster, role: "support" | "pressure"): number {
  const rep = cl.members.reduce((a, b) => (Math.abs(b.value - cl.center) < Math.abs(a.value - cl.center) ? b : a));
  return role === "support" ? Math.min(rep.k.open, rep.k.close) : Math.max(rep.k.open, rep.k.close);
}

// 各波段线条标签映射（轴标签短前缀 tag + 小字描述 sub + 悬浮名 name），严格按规范文档第八条映射
const BAND_LABELS: Record<BandType, {
  sS: { tag: string; name: string };
  tS: { tag: string; sub: string; name: string };
  sP: { tag: string; name: string };
  tP: { tag: string; sub: string; name: string };
}> = {
  uptrend: {
    sS: { tag: "支", name: "结构支撑" },
    tS: { tag: "S", sub: "回调低吸", name: "交易参考支撑 S" },
    sP: { tag: "压", name: "结构压力" },
    tP: { tag: "B", sub: "止盈减仓", name: "交易参考压力 B" },
  },
  pullback: {
    sS: { tag: "支", name: "结构支撑" },
    tS: { tag: "S", sub: "轻仓试多", name: "交易参考支撑 S" },
    sP: { tag: "压", name: "结构压力" },
    tP: { tag: "B", sub: "止盈减仓", name: "交易参考压力 B" },
  },
  downtrend: {
    sP: { tag: "压", name: "结构压力" },
    tP: { tag: "B", sub: "逢高离场", name: "交易参考压力 B" },
    sS: { tag: "支", name: "结构支撑" },
    tS: { tag: "S", sub: "轻仓反弹", name: "交易参考支撑 S" },
  },
  bounce: {
    sP: { tag: "压", name: "结构压力" },
    tP: { tag: "B", sub: "反弹减仓", name: "交易参考压力 B" },
    sS: { tag: "支", name: "结构支撑" },
    tS: { tag: "S", sub: "短线反弹", name: "交易参考支撑 S" },
  },
  box: {
    sS: { tag: "支", name: "结构支撑" },
    tS: { tag: "S", sub: "区间低吸", name: "交易参考支撑 S" },
    sP: { tag: "压", name: "结构压力" },
    tP: { tag: "B", sub: "区间高抛", name: "交易参考压力 B" },
  },
};

// 多周期前置隔离守卫：不同 K 线周期的窗口参数与可绘制线种完全不同，
// 多周期隔离：防止周/月 K 出现 S/B 买卖标签误导交易（P0 缺陷 2）。
// 说明：本项目 PeriodKey 为 "m"|"d"|"w"|"M"（无年 K 周期）。分时(m)视图不绘制任何智能标注线，
// 由 drawAutoLevels 提前 return 处理；此守卫只负责 kline 模式下的 d/w/M 周期隔离。
function resolvePeriodGuard(period: string = props.period ?? "d"): {
  bandWin: number; tradeWin: number;
  disableStruct: boolean; disableTrade: boolean; disableTrend: boolean;
} {
  let bandWin = BAND_WIN;
  let tradeWin = TRADE_WIN;
  let disableStruct = false;
  let disableTrade = false;
  let disableTrend = false;
  if (period === "w") {
    bandWin = 60;
    disableTrade = true; // 周 K：禁用 T 线 S/B，仅结构线 + 合规趋势线
  } else if (period === "M") {
    bandWin = 80;
    disableTrade = true;
    disableTrend = true; // 月 K：仅长期结构线
  }
  // 日 K（默认）保持 bandWin=30 / tradeWin=20，全开
  return { bandWin, tradeWin, disableStruct, disableTrade, disableTrend };
}

// 计算系统画线（智能标注）：每条 K 线图固定输出 4 根水平线（结构支撑/交易参考支撑/结构压力/交易参考压力）
// + 按需趋势线。结构线取自波段窗口、交易参考线取自短线窗口（窗口随周期变化，见 resolvePeriodGuard），
// 同方向价格簇综合得分取第 1 名。纯函数：由调用方（drawAutoLevels）决定数据序列与守卫（随周期变化的窗口/禁用开关见 resolvePeriodGuard）。
function computeAutoLevelsFromSeries(dl: Kline[], guard: ReturnType<typeof resolvePeriodGuard>): AutoLevel[] {
  const out: AutoLevel[] = [];
  if (!dl || dl.length < 12) return out;
  const last = dl[dl.length - 1];
  const current = last?.close ?? 0;
  if (!current) return out;

  const bandSeries = guard.bandWin > 0 ? dl.slice(-guard.bandWin) : [];
  const tradeSeries = guard.tradeWin > 0 ? dl.slice(-guard.tradeWin) : [];
  const { highs, lows } = findSwings(bandSeries, SWING_WIN);
  const { band, breakDown } = detectBandType(highs, lows, bandSeries, current);
  const L = BAND_LABELS[band];

  // 结构线：30 根波段窗口取同方向价格簇 No.1（破位失效则不渲染，避免误导）
  const supStruct = bestCluster(bandSeries, lows, "support", TOL_PCT);
  const presStruct = bestCluster(bandSeries, highs, "pressure", TOL_PCT);
  // 交易参考线：20 根短线窗口独立重算摆动点后取 No.1；MIN_TOUCH_COUNT 过滤单脉冲簇
  const tradeSwings = findSwings(tradeSeries, SWING_WIN);
  const supTrade = bestCluster(tradeSeries, tradeSwings.lows, "support", TOL_PCT, MIN_TOUCH_COUNT);
  const presTrade = bestCluster(tradeSeries, tradeSwings.highs, "pressure", TOL_PCT, MIN_TOUCH_COUNT);

  // 点位取值：结构线取拐点 K 实体边缘（横盘取平台中轴）；交易参考线取筹码密集中枢
  const structSupPrice = supStruct ? (band === "box" ? supStruct.cl.center : bodyEdge(supStruct.cl, "support")) : null;
  const structPresPrice = presStruct ? (band === "box" ? presStruct.cl.center : bodyEdge(presStruct.cl, "pressure")) : null;

  // 统一失效判定（破位隐藏）：结构/交易支撑线在「连续2根实体击穿(sc.broken)」或「箱体破位(breakDown)」任一成立时即视为失效，
  // 全部过滤不渲染，不再区分两套隐藏规则；仅保留未被击穿的有效价位线。压力线仅受自身 sc.broken 约束（箱体破位不影响上沿阻力）。
  const supInvalid = (supStruct?.sc.broken ?? false) || breakDown;
  const presInvalid = presStruct?.sc.broken ?? false;
  const supTradeInvalid = (supTrade?.sc.broken ?? false) || breakDown;
  const presTradeInvalid = presTrade?.sc.broken ?? false;

  // 结构支撑（绿粗虚线，满宽，无 S/B 标签；破位失效则不渲染）
  if (supStruct && !supInvalid && structSupPrice != null) {
    out.push({ kind: "support", role: "structSupport", price: structSupPrice, color: SUPPORT_COLOR, bg: SUPPORT_COLOR, size: 1, dashed: true, tag: L.sS.tag, label: L.sS.name, src: "结构支撑·波段低点簇 No.1" });
  }
  // 交易参考支撑（红细虚线，挂载 S 标签；与结构线同价则去重，避免密集平行线）
  // 硬性准入：①单脉冲过滤 ②总分≥30 ③未被统一失效判定(supTradeInvalid：连续2根实体破位或箱体破位)
  if (supTrade && !supTradeInvalid && supTrade.sc.score >= MIN_TOTAL_SCORE) {
    const price = supTrade.cl.center;
    // 结构支撑已存在且同价 → 去重交易参考支撑，避免密集平行线
    if (structSupPrice == null || Math.abs(price - structSupPrice) / structSupPrice > TOL_PCT)
      out.push({ kind: "support", role: "tradeSupport", price, color: TRADE_SUPPORT_COLOR, bg: TRADE_SUPPORT_COLOR, size: 1, dashed: true, tag: L.tS.tag, sub: L.tS.sub, label: L.tS.name, src: "交易参考支撑·短线低点簇 No.1" });
  }
  // 结构压力（红粗虚线，满宽，无 S/B 标签；破位失效则不渲染）
  if (presStruct && !presInvalid && structPresPrice != null) {
    out.push({ kind: "pressure", role: "structPressure", price: structPresPrice, color: PRESSURE_COLOR, bg: PRESSURE_COLOR, size: 1, dashed: true, tag: L.sP.tag, label: L.sP.name, src: "结构压力·波段高点簇 No.1" });
  }
  // 交易参考压力（绿细虚线，挂载 B 标签；硬性准入：单脉冲过滤 + 总分≥30 + 未破位）
  if (presTrade && !presTradeInvalid && presTrade.sc.score >= MIN_TOTAL_SCORE) {
    const price = presTrade.cl.center;
    if (structPresPrice == null || Math.abs(price - structPresPrice) / structPresPrice > TOL_PCT)
      out.push({ kind: "pressure", role: "tradePressure", price, color: TRADE_PRESSURE_COLOR, bg: TRADE_PRESSURE_COLOR, size: 1, dashed: true, tag: L.tP.tag, sub: L.tP.sub, label: L.tP.name, src: "交易参考压力·短线高点簇 No.1" });
  }

  // 趋势线：仅主升 uptrend 连 3 个抬升摆动低点；主跌连 3 个降低摆动高点；
  // pullback(走弱回调)/bounce/box 禁止绘制上升趋势线（防假多头视觉误导，对齐风控硬规则）
  let trendPts: { timestamp: number; value: number }[] | null = null;
  let trendDir: "up" | "down" = "up";
  if (band === "uptrend") {
    if (lows.length >= 3) {
      const a = lows[lows.length - 3], b = lows[lows.length - 2], c = lows[lows.length - 1];
      if (c.value > b.value && b.value > a.value) trendPts = [a, b, c].map((s) => ({ timestamp: s.t, value: s.value }));
    }
  } else if (band === "downtrend") {
    if (highs.length >= 3) {
      const a = highs[highs.length - 3], b = highs[highs.length - 2], c = highs[highs.length - 1];
      if (c.value < b.value && b.value < a.value) { trendPts = [a, b, c].map((s) => ({ timestamp: s.t, value: s.value })); trendDir = "down"; }
    }
  }
  if (trendPts) {
    out.push({ kind: "trend", points: trendPts, dir: trendDir, color: TREND, bg: TREND, size: 1.6, dashed: false, label: trendDir === "down" ? "下降趋势线" : "上升趋势线" });
  }
  return out;
}
// 清旧智能标注并按当前辅助线开关重画（固定 4 根水平线：结构支撑/交易参考支撑/结构压力/交易参考压力 + 按需趋势线）
function drawAutoLevels() {
  autoIds.forEach((id) => { try { chart?.removeOverlay(id); } catch { /* noop */ } });
  autoIds.length = 0;
  autoLevels.length = 0;
  const cfg = props.auxConfig;
  // 无任何智能标注线开启 → 不绘制（各线独立开关，无总开关）
  if (!props.autoDraw || !chart || !cfg) return;
  if (!(cfg.structLine || cfg.tradeLine || cfg.trend)) return;

  // 分时视图不绘制任何智能标注线（结构支撑/压力、交易参考 S/B、趋势线）。
  // 原因：分时价格轴自适应当日窄幅，且做T价位与日K不同源；曾尝试复用日K价位但落在轴外被裁、
  // 钳制贴边后又与分时走势脱节产生误导。权衡后统一不在分时显示智能标注，杜绝误导性信号。
  if (props.mode === "intraday") return;
  const guard = resolvePeriodGuard();
  const series = dataList as Kline[];
  const levels = computeAutoLevelsFromSeries(series, guard);
  for (const lv of levels) {
    // 多周期隔离：对应周期禁用的线种直接跳过（分时禁结构/趋势；周禁 T；月禁 T/趋势）
    if (guard.disableStruct && (lv.role === "structSupport" || lv.role === "structPressure")) continue;
    if (guard.disableTrade && (lv.role === "tradeSupport" || lv.role === "tradePressure")) continue;
    if (guard.disableTrend && lv.kind === "trend") continue;
    // 结构线开关 → 结构支撑 + 结构压力（与交易参考线同色：绿/红）
    if ((lv.role === "structSupport" || lv.role === "structPressure") && !cfg.structLine) continue;
    // 交易参考线开关 → S 交易参考支撑 + B 交易参考压力（浅绿/浅红）
    if ((lv.role === "tradeSupport" || lv.role === "tradePressure") && !cfg.tradeLine) continue;
    if (lv.kind === "trend" && !cfg.trend) continue;
    const id = `auto_${lv.kind}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      if (lv.kind === "trend" && lv.points) {
        chart.createOverlay({
          id, name: "autoTrendLine", points: lv.points, lock: true,
          styles: { line: { color: lv.color, style: lv.dashed ? "dashed" : "solid", size: lv.size || 1, dashedValue: [4, 3] } },
        } as never);
      } else if (typeof lv.price === "number") {
        const t0 = dataList[0].timestamp;
        const main = `${lv.tag ?? ""} ${lv.price.toFixed(2)}`;
        const sub = lv.sub || "";
        chart.createOverlay({
          id, name: "autoLevelLine", points: [{ timestamp: t0, value: lv.price }], lock: true,
          extendData: { text: main, sub, bg: lv.bg },
          styles: { line: { color: lv.color, style: lv.dashed ? "dashed" : "solid", size: lv.size || 1, dashedValue: [4, 3] } },
        } as never);
      }
      autoIds.push(id);
      autoLevels.push(lv);
    } catch {
      /* noop */
    }
  }
}

// ---- 自动趋势线自定义 overlay（线段 + 末端开放箭头标示方向）----
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
        // 末端实心箭头（指向趋势方向，尖端略超出线末端；比开放 V 形更直观准确）
        const lw = overlay?.styles?.line?.size || 1.6;
        const headLen = 10, headW = 5; // 细长实心箭头：长 10、半宽 5
        const tip = up ? { x: b.x, y: b.y - headLen } : { x: b.x, y: b.y + headLen };
        const left = { x: b.x - headW, y: b.y };
        const right = { x: b.x + headW, y: b.y };
        return [
          { type: "line", attrs: { coordinates: [a, b] }, styles: { style: "solid", size: lw, color: col }, ignoreEvent: true },
          { type: "polygon", attrs: { coordinates: [tip, left, right] }, styles: { style: "fill", color: col, borderColor: col, borderSize: 1 }, ignoreEvent: true },
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
        const overlay = params.overlay as any;
        if (!coordinates || coordinates.length < 1) return [];
        const y = coordinates[0].y;
        // 复刻原生最后价标签：彩色实底 + 白字 + 方形无圆角 + padding；紧贴轴左缘(x:0, align:left)去多余左侧间距。
        // 标签（含价格）统一 size 10；下方 sub 提示统一 size 8（无论结构线/交易参考线/S/B/支压）。
        const bg = overlay?.extendData?.bg || overlay?.styles?.line?.color || "#888";
        const main = overlay?.extendData?.text || "";
        const sub = overlay?.extendData?.sub || "";
        const figs: any[] = [{
          type: "text",
          attrs: { x: 0, y, text: main, align: "left", baseline: "middle" },
          styles: {
            color: "#ffffff", backgroundColor: bg, borderColor: "transparent", borderSize: 0,
            paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, size: 10,
          },
          ignoreEvent: true,
        }];
        if (sub) {
          figs.push({
            type: "text",
            attrs: { x: 0, y: y + 13, text: sub, align: "left", baseline: "middle" },
            styles: {
              color: "#ffffff", backgroundColor: bg, borderColor: "transparent", borderSize: 0,
              paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, size: 8,
            },
            ignoreEvent: true,
          });
        }
        return figs;
      },
    } as never);
    trendOverlayRegistered = true;
  } catch {
    /* noop */
  }
}

// ---- 用户手绘画线自定义 overlay（kcHLine / kcTrend / kcFib）----
// 解决内置 horizontalStraightLine/straightLine/fibonacciLine 的三处问题：
//  1) 互斥/标签消失：内置线在「绘制未完成」时若被新绘制覆盖会被丢弃（见 klinecharts addInstances 单进度实例逻辑）；
//     这里每条线独立实例、单点即完成，互不干扰；drawLine 采用连续绘制模式（armedId 跟踪当前待绘线，
//     完成 / ESC 取消后自动 reArm 保持激活，再次点击同一工具或点「清空」才关闭），从根本上规避互斥。
//  2) 标签都绿：内置 needDefaultYAxisFigure 的标签背景不跟随线色；这里用自定义 createYAxisFigures 按线色生成彩色实底白字。
//  3) 磁吸：performEventMoveForDrawing / performEventPressedMove 中把价位吸附到光标所在 K 线（箱体）的 high/low/open/close。
// 注意：registerOverlay 为「替换」语义，改内置线行为必须用新名字 + 完整渲染定义。
const SNAP_TOL_PX = 9; // 磁吸像素容差（与十字光标灵敏度同量级，手感贴近「竖线选箱体」）
// 两点间在给定 x 处的线性 y（趋势线延伸到面板左右边缘用）
function linearY(a: { x: number; y: number }, b: { x: number; y: number }, x: number): number {
  if (b.x === a.x) return a.y;
  return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
}
// 把价位吸附到光标所在蜡烛（dataIndex）的 O/H/L/C 关键价位（容差内才吸附，否则保持自由画线）
function snapValueToCandle(raw: number, dataIndex?: number): number {
  if (!chart || !dataList.length) return raw;
  if (typeof dataIndex !== "number" || dataIndex < 0 || dataIndex >= dataList.length) return raw;
  const k = dataList[dataIndex];
  if (!k) return raw;
  const cand = [k.high, k.low, k.open, k.close].filter((v: number) => Number.isFinite(v));
  if (!cand.length) return raw;
  // 价格→像素斜率，换算磁吸容差（价格轴线性，单点斜率足够）
  let pxPerPrice = 1;
  try {
    const r1 = (chart as any).convertToPixel([{ value: raw }], { paneId: "candle_pane" }) as any;
    const r2 = (chart as any).convertToPixel([{ value: raw + 1 }], { paneId: "candle_pane" }) as any;
    const y1 = Array.isArray(r1) ? r1[0]?.y : r1?.y;
    const y2 = Array.isArray(r2) ? r2[0]?.y : r2?.y;
    if (typeof y1 === "number" && typeof y2 === "number") pxPerPrice = Math.abs(y2 - y1) || 1;
  } catch {
    /* noop */
  }
  const priceTol = SNAP_TOL_PX / pxPerPrice;
  let best = raw;
  let bestD = priceTol;
  for (const lv of cand) {
    const d = Math.abs(lv - raw);
    if (d < bestD) {
      bestD = d;
      best = lv;
    }
  }
  return best;
}
// 就地吸附某个绘点（performPoint 即 points[i]，直接改 .value 即可）
function snapPointValue(pt: any) {
  if (!pt || typeof pt.value !== "number") return;
  const snapped = snapValueToCandle(pt.value, pt.dataIndex);
  if (snapped !== pt.value) pt.value = snapped;
}
let drawOverlayRegistered = false;
function ensureDrawOverlays() {
  if (drawOverlayRegistered) return;
  try {
    // ===== 横线（支撑/压力）：单指点完即完成；右侧价格标签按线色生成彩色实底白字 =====
    registerOverlay({
      name: "kcHLine",
      totalStep: 2,
      needDefaultPointFigure: true,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      createPointFigures: (params: any) => {
        const coordinates = params.coordinates as { x: number; y: number }[];
        const bounding = params.bounding as { width: number; height: number };
        if (!coordinates || coordinates.length < 1) return [];
        const y = coordinates[0].y;
        return [{ type: "line", attrs: { coordinates: [{ x: 0, y }, { x: bounding.width, y }] } }];
      },
      createYAxisFigures: (params: any) => {
        const coordinates = params.coordinates as { x: number; y: number }[];
        const overlay = params.overlay as any;
        if (!coordinates || coordinates.length < 1) return [];
        const y = coordinates[0].y;
        const col = overlay?.styles?.line?.color || "#888";
        const tag = overlay?.extendData?.tag || "";
        const price = overlay?.points?.[0]?.value;
        const text = (tag ? tag + " " : "") + (price != null ? Number(price).toFixed(2) : "");
        return [{
          type: "text",
          attrs: { x: 0, y, text, align: "left", baseline: "middle" },
          styles: {
            color: "#ffffff", backgroundColor: col, borderColor: "transparent", borderSize: 0,
            paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, size: 12,
          },
          ignoreEvent: true,
        }];
      },
      performEventPressedMove: (params: any) => {
        const points = params.points as any[];
        if (points[params.performPointIndex]) snapPointValue(points[params.performPointIndex]);
      },
      performEventMoveForDrawing: (params: any) => {
        const points = params.points as any[];
        if (points[points.length - 1]) snapPointValue(points[points.length - 1]);
      },
    } as never);
    // ===== 趋势线（两点线段，可斜/可竖）=====
    registerOverlay({
      name: "kcTrend",
      totalStep: 3,
      needDefaultPointFigure: true,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      createPointFigures: (params: any) => {
        const coordinates = params.coordinates as { x: number; y: number }[];
        const bounding = params.bounding as { width: number; height: number };
        if (coordinates.length === 2) {
          if (coordinates[0].x === coordinates[1].x) {
            return [{ type: "line", attrs: { coordinates: [{ x: coordinates[0].x, y: 0 }, { x: coordinates[0].x, y: bounding.height }] } }];
          }
          return [{ type: "line", attrs: { coordinates: [
            { x: 0, y: linearY(coordinates[0], coordinates[1], 0) },
            { x: bounding.width, y: linearY(coordinates[0], coordinates[1], bounding.width) },
          ] } }];
        }
        return [];
      },
      createYAxisFigures: (params: any) => {
        const coordinates = params.coordinates as { x: number; y: number }[];
        const overlay = params.overlay as any;
        if (!coordinates || coordinates.length < 1) return [];
        const col = overlay?.styles?.line?.color || TREND;
        const figs: any[] = [];
        coordinates.forEach((c: any, i: number) => {
          const price = overlay?.points?.[i]?.value;
          if (price == null) return;
          figs.push({
            type: "text",
            attrs: { x: 0, y: c.y, text: Number(price).toFixed(2), align: "left", baseline: "middle" },
            styles: {
              color: "#ffffff", backgroundColor: col, borderColor: "transparent", borderSize: 0,
              paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, size: 12,
            },
            ignoreEvent: true,
          });
        });
        return figs;
      },
      performEventPressedMove: (params: any) => {
        const points = params.points as any[];
        if (points[params.performPointIndex]) snapPointValue(points[params.performPointIndex]);
      },
      performEventMoveForDrawing: (params: any) => {
        const points = params.points as any[];
        if (points[points.length - 1]) snapPointValue(points[points.length - 1]);
      },
    } as never);
    // ===== 黄金分割（两点：起点/终点；按比例展开 7 档）=====
    registerOverlay({
      name: "kcFib",
      totalStep: 3,
      needDefaultPointFigure: true,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      createPointFigures: (params: any) => {
        const coordinates = params.coordinates as { x: number; y: number }[];
        const bounding = params.bounding as { width: number; height: number };
        const overlay = params.overlay as any;
        const points = overlay.points as any[];
        const pricePrec = (params.precision && params.precision.price) ?? 2;
        const col = overlay?.styles?.line?.color || "#888";
        const lines: any[] = [];
        const texts: any[] = [];
        if (coordinates.length > 1 && Number.isFinite(points[0]?.value) && Number.isFinite(points[1]?.value)) {
          const percents = [1, 0.786, 0.618, 0.5, 0.382, 0.236, 0];
          const yDif = coordinates[0].y - coordinates[1].y;
          const valueDif = points[0].value - points[1].value;
          percents.forEach((percent: number) => {
            const y = coordinates[1].y + yDif * percent;
            const value = ((points[1].value ?? 0) + valueDif * percent).toFixed(pricePrec);
            lines.push({ coordinates: [{ x: 0, y }, { x: bounding.width, y }] });
            texts.push({
              x: 0, y, text: `${value} (${(percent * 100).toFixed(1)}%)`, baseline: "bottom",
              // 分割线标签也跟随线色生成彩色实底白字，避免与横线一样出现「都绿」
              color: "#ffffff", backgroundColor: col, borderColor: "transparent", borderSize: 0,
              paddingLeft: 4, paddingRight: 4, paddingTop: 1, paddingBottom: 1, size: 11,
            });
          });
        }
        return [
          { type: "line", attrs: lines },
          { type: "text", isCheckEvent: false, attrs: texts },
        ];
      },
      performEventPressedMove: (params: any) => {
        const points = params.points as any[];
        if (points[params.performPointIndex]) snapPointValue(points[params.performPointIndex]);
      },
      performEventMoveForDrawing: (params: any) => {
        const points = params.points as any[];
        if (points[points.length - 1]) snapPointValue(points[points.length - 1]);
      },
    } as never);
    drawOverlayRegistered = true;
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
// 图例分组对齐到各自面板顶部：优先读取 klinecharts 真实分面顶边（getBounding().top），
// 保证图例分组精确贴到各面板顶部；图表未就绪时回退到与 buildLayout 一致的高度算法。
// 关键：不能只按 props.height 硬编码推算——若初始化时容器实测高度与 props.height 不一致（如绘制前量到偏小值），
// 硬编码偏移会让图例压错面板，看起来像「主图穿到成交量」。
const chartReady = ref(false);
const legendOffsets = computed(() => {
  if (chartReady.value && chart) {
    try {
      // 用图表实例真实分面包围盒的 top（相对容器），精确对齐图例分组到各面板顶部
      const vt = (chart as any).getSize?.("vol_pane")?.top;
      const mt = (chart as any).getSize?.("macd_pane")?.top;
      if (typeof vt === "number" && typeof mt === "number" && vt > 0 && mt > vt) {
        return { price: 0, vol: vt, macd: mt };
      }
    } catch {
      /* noop */
    }
  }
  const usable = Math.max(140, props.height - 24); // 预留底部 x 轴条
  const { priceH, volH } = subPaneHeights(usable);
  return { price: 0, vol: priceH, macd: priceH + volH };
});
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
    for (const def of MA_PERIODS) {
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
    if (vol.volume != null) legend.vol.push({ label: props.mode === "intraday" ? "分时量" : "成交量", value: fmtAmount(vol.volume) });
    // 量均线 MA5/MA10/MA20 各自独立开关（figure key: ma1/ma2/ma3）
    const volMaOn = volMaOnEnabled();
    const volMaKeys = ["ma1", "ma2", "ma3"];
    volMaKeys.forEach((k, i) => { if (volMaOn[i] && vol[k] != null) legend.vol.push({ label: "MA" + (i + 1) * 5, value: fmtAmount(vol[k]), color: INDICATOR_LINE_COLORS[i] }); });
  }
  // MACD 图：DIF(橙)/DEA(蓝)/MACD(柱按正负红绿) —— DIF/DEA 各自独立开关
  const macdMap = paneMap("macd_pane", cross, idx);
  const md = macdMap[props.mode === "intraday" ? "MACDFS" : "MACD"];
  legend.macd = [];
  if (md) {
    if (md.macd != null) legend.macd.push({ label: props.mode === "intraday" ? "MACDFS" : "MACD", value: fmtPrice(md.macd), color: md.macd > 0 ? UP : md.macd < 0 ? DOWN : undefined });
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
        if (Math.abs(price - interp) <= tol) items.push({ label: lv.label, color: lv.color, text: `方向 ${lv.dir === "up" ? "↑ 上行" : "↓ 下行"} · 经 ${lv.points?.length ?? 0} 点` });
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
// 旧版 localStorage 存的是内置 overlay 名，统一映射到自定义名（保留线色/样式，横线据线色补「支/压」标签）
const DRAW_TYPE_MAP: Record<string, string> = {
  horizontalStraightLine: "kcHLine",
  straightLine: "kcTrend",
  fibonacciLine: "kcFib",
};
function mapRestoreType(it: any): { name: string; extendData: any } {
  const name = DRAW_TYPE_MAP[it.type] || it.type;
  const extendData: any = {};
  if (name === "kcHLine") {
    const col = it.styles?.line?.color;
    // 旧版支撑=DOW(绿)、压力=UP(红)；线色即可区分，补标签前缀
    extendData.tag = col === UP ? "压" : "支";
  }
  return { name, extendData };
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
      const { name, extendData } = mapRestoreType(it);
      chart.createOverlay({ id, name, extendData, points: it.points, styles: it.styles } as never);
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
  const volMaOn = volMaOnEnabled();
  const macdDifOn = props.macdDif !== false;
  const macdDeaOn = props.macdDea !== false;

  // 成交量面板：量柱 + 已开启的量均线（MA5=ma1/MA10=ma2/MA20=ma3），关闭的线直接剔除
  if (volMaOn.some((v) => !v)) {
    const volName = props.mode === "intraday" ? "INTRADAY_VOL" : "VOL";
    const volBarFigure = {
      key: "volume",
      title: props.mode === "intraday" ? "分时量: " : "成交量: ",
      type: "bar",
      baseValue: 0,
      styles: (data: any, _indicator: any, defaultStyles: any) => {
        const k = data?.current?.kLineData;
        const { up, down, noChange } = readBarColors(defaultStyles);
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
  if (!macdDifOn || !macdDeaOn) {
    const macdName = props.mode === "intraday" ? "MACDFS" : "MACD";
    const macdBarFigure = {
      key: "macd",
      title: macdName === "MACDFS" ? "MACDFS: " : "MACD: ",
      type: "bar",
      baseValue: 0,
      styles: (data: any, _indicator: any, defaultStyles: any) => {
        const { up, down, noChange } = readBarColors(defaultStyles);
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
  chartReady.value = false; // 重建期间图例偏移回退到高度算法，待真实分面就绪后再用 getBounding 对齐
  destroyChart();
  ensureAvp();
  ensureIntradayVol();
  ensureMacdfs();
  ensureMaIndicators();
  ensureTrendOverlay();
  ensureDrawOverlays();
  dataList = toKLineData();
  if (dataList.length) lastTs = dataList[dataList.length - 1].timestamp;
  chipData = props.klines && props.klines.length ? computeChip(props.klines) : null;

  chart = init(chartEl.value, {
    layout: buildLayout(),
    styles: buildStyles(),
    customApi: {
      formatDate: (_dt: Intl.DateTimeFormat, timestamp: number, format: string) => {
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
    // 关键：chart.resize() 必须放到「浏览器完成布局/绘制之后」（post-paint rAF），而非 nextTick 微任务。
    // 否则 init 时若容器实测高度偏小（绘制前量到），画布会矮于容器 → 底部露出容器底色（空白）、
    // 主图被压扁、分面间隔被压缩到几乎不可见，看起来像「主图穿到成交量」。绘制后 resize 用真实尺寸重排，
    // 三个分面（主图/成交量/MACD）精确填满容器、互不重叠。
    const drawOverlays = () => {
      if (!chart || !chartEl.value) return;
      try { chart.resize(); } catch {
        /* noop */
      }
      // 首载兜底：确保铺满全貌（OnDataReady 在 applyNewData 异步解析后才触发，
      // 此处保证容器尺寸确定后也对齐一次，所有模式通用）
      fitViewAll();
      drawCyq();
      restoreOverlays();
      drawAutoLevels();
      chartReady.value = true; // 触发 legendOffsets 改用真实分面顶边
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
  () => [props.livePrice],
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
  color: var(--up);
}
.down {
  color: var(--down);
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
