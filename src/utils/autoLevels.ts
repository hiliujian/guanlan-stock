// =====================================================================
// 智能标注（支撑/压力）共享算法模块
// ---------------------------------------------------------------------
// 单一真源：StockChart.vue（图表画线）与 analyzer.ts（分析报告）共用本文件，
// 保证「图表看到的支撑/压力」与「报告输出的支撑/压力」100% 同源：
//   · 同一套摆动点 findSwings + 价格簇 clusterSwings + 三维打分 scoreCluster
//   · 同一套波段识别 detectBandType + 文案映射 BAND_LABELS
//   · 同一套周期守卫 resolvePeriodGuard（d / w / M / m 多周期隔离）
//   · 同一套四维权重修正（量能 / 筹码 / DMI 趋势 / 箱体）
// 本文件为纯函数，无任何 DOM / 平台依赖，可供报告（Node 侧纯算）与图表共用。
// =====================================================================
import { UP, DOWN, TREND } from "@/utils/colors";

// 全局常量（画线规则总表）—— 与图表 StockChart.vue 完全同步，杜绝两套参数分歧
// （仅 TOL_PCT/MIN_TOTAL_SCORE 被 scripts 测试引用需保留 export，其余为模块内私有）
const BAND_WIN = 30;      // 波段观测窗口：结构支撑/压力计算，滚动右移，移出窗口价位剔除
const TRADE_WIN = 20;     // 短线观测窗口：交易参考支撑/压力计算，滚动右移
export const TOL_PCT = 0.008;    // 价格聚类容差：abs(p1-p2)/max(p1,p2) ≤0.008 视为同一价格簇，一簇仅输出 1 条线
const SWING_WIN = 2;      // 摆动点左右确认 K 线：左右各 2 根验证；靠近首尾不足则不生成摆动点
const MIN_BARS = SWING_WIN * 2 + 1; // 最少 K 线数（5）：低于该数形态无统计意义，不产生任何价位；次新股/周月K短历史也能兜底出位
const SWING_FREQ_MAX = 40;// 触碰频次满分
const SWING_REV_MAX = 35; // 反转反应满分
const SWING_SWAP_MAX = 25;// 角色互换满分
const MIN_TOUCH_COUNT = 2;   // 合格价格簇最低摆动点个数；不足者不形成簇（交易线改走最近摆动点/窗口极值兜底，降级为弱参考）
export const MIN_TOTAL_SCORE = 30;  // S/B 合格簇总分门槛：<30 或触碰<2 仍渲染但降级为淡化「弱参考」，不驱动买卖信号
const BREAK_CONFIRM_CNT = 2; // 连续 N 根实体收盘击穿判定价位失效（仅尾部连续计入；单根影线/历史破位已收回不计）
const VOL_MULTIPLE = 1.3;    // 放量阈值（相对 VMA20）：触碰时量能 > VMA20*1.3 视为放量确认

// 颜色（与图表涨跌色一致：A 股红涨绿跌）。图表中 UP/DOWN 经 cssColor 解析，
// 而 --up/--down 为主题不变量（浅/深主题值相同），这里直接复用 colors 常量即得等价色。
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

// ── 波段类型（5 类）──
type BandType = "uptrend" | "downtrend" | "pullback" | "bounce" | "box";

// 判定当前所处波段类型（5 类），输入 highs/lows 来自 30 根波段窗口。
// breakDown：箱体/上涨结构但现价跌破前摆动低点→结构已破坏，相关支撑统一判为「已破位」淡化展示（不隐藏），压力线正常保留。
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
    if (current < prevLow) return { band: "box", breakDown: true }; // 跌破前低→结构破坏：支撑/S 全部按「已破位」淡化，B 压力线正常保留
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

// 四维权重修正上下文：量能 VMA20 / 筹码密集峰与成本重心 / DMI 趋势强度。
// 报告（analyzer）传入该上下文以对支撑/压力综合打分做量价·筹码·趋势联动修正；
// 图表（computeAutoLevelsFromSeries）不传 → 修正项全为 0，输出与改造前 100% 一致。
export interface LevelCtx {
  vma20Last?: number; // 成交量 VMA20（最近一根），用于放量判定
  volMultiple?: number; // 放量倍数阈值，默认 VOL_MULTIPLE
  chipPeak?: number;  // 筹码密集峰 peakPrice
  chipAvg?: number;   // 筹码成本重心 avgCost
  adx?: number;       // DMI ADX（趋势强度）
  pdi?: number;       // +DI
  mdi?: number;       // -DI
  inBox?: boolean;    // 当前是否处于箱体区间（由 buildRawLevels 自动填充）
}

// 价格簇三维打分：触碰频次(40) + 反转反应(35) + 角色互换(25)，叠加四维权重修正。
// baseScore = 未叠加四维修正的基准分（图表/报告共用，保证两侧选簇与门槛 100% 一致）；
// score = baseScore + 量能/筹码/DMI 修正（仅报告用于强弱评级展示，不参与选簇与门槛）。
interface ClusterScore {
  touches: number; reversal: number; swap: number; score: number; baseScore: number; broken: boolean;
  volBoost?: number; chipBoost?: number; dmiBoost?: number;
}
function scoreCluster(series: any[], cl: PriceCluster, role: "support" | "pressure", tol: number, ctx?: LevelCtx): ClusterScore {
  const center = cl.center;
  const lo = center * (1 - tol), hi = center * (1 + tol);
  let touches = 0, broken = false, breakCount = 0, revSum = 0;
  let prevSide = 0, crossed = false;
  const n = series.length;
  let volConfirmed = 0;
  const vma20 = ctx?.vma20Last ?? 0;
  const volMult = ctx?.volMultiple ?? VOL_MULTIPLE;
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
      // 量能修正（±6）：触碰价位时量能 > VMA20*volMult → 放量确认，可靠性提升
      if (vma20 > 0 && d.vol > vma20 * volMult) volConfirmed++;
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
  const baseScore = score; // 基准分（与四维修正解耦，图表/报告选簇与门槛共用）
  // ── 四维权重修正 ──
  let volBoost = 0, chipBoost = 0, dmiBoost = 0;
  if (ctx) {
    if (volConfirmed > 0) volBoost = 6; // 放量触碰确认
    const peak = ctx.chipPeak, avg = ctx.chipAvg;
    if (peak && peak > 0 && Math.abs(center - peak) / peak < 0.03) chipBoost = 5;        // 贴近筹码密集峰：强支撑/压力
    // 线位远高于成本重心：成本区在线下方（获利盘密集），并非「上方套牢盘」——
    // 扣分原因是获利回吐 + 向成本回归会考验该价位的可靠性（与 analyzer「高于成本重心」同语义）
    else if (avg && avg > 0 && center > avg * 1.1) chipBoost = -5;                        // 远离成本重心：获利回吐·回归压力
    const adx = ctx.adx ?? 0, pdi = ctx.pdi ?? 0, mdi = ctx.mdi ?? 0;
    if (adx > 25) {
      if (pdi > mdi) { if (role === "support") dmiBoost = 8; }                            // 上涨趋势：支撑可靠性 +8
      else if (mdi > pdi) { if (role === "pressure") dmiBoost = 8; else dmiBoost = -8; }  // 下跌趋势：压力 +8，支撑 -8
    }
  }
  score += volBoost + chipBoost + dmiBoost;
  return { touches, reversal, swap, score, baseScore, broken, volBoost, chipBoost, dmiBoost };
}

// 窗口内取某角色综合得分第 1 的价格簇；minTouch 过滤单脉冲簇（摆动点个数 < minTouch 不生成线，默认不过滤）
// 选簇按 baseScore（与四维修正解耦）：报告侧 ctx 修正只影响展示评级，绝不影响选中哪个簇，
// 否则图表（无 ctx）与报告（有 ctx）会画出/选出不同价位的支撑压力线。
function bestCluster(series: any[], pts: SwingPt[], role: "support" | "pressure", tol: number, minTouch = 1, ctx?: LevelCtx): { cl: PriceCluster; sc: ClusterScore } | null {
  const clusters = clusterSwings(pts, tol);
  let best: PriceCluster | null = null, bestSc: ClusterScore | null = null, bestScore = -1;
  for (const cl of clusters) {
    if (cl.members.length < minTouch) continue; // 单次插针脉冲（仅 1 个摆动点）直接过滤，不生成 S/B
    const sc = scoreCluster(series, cl, role, tol, ctx);
    if (sc.baseScore > bestScore) { bestScore = sc.baseScore; best = cl; bestSc = sc; }
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

// 多周期前置隔离守卫：不同 K 线周期的窗口参数与可绘制线种完全不同，防止周/月 K 出现 S/B 买卖标签误导。
// PeriodKey 为 "m"|"d"|"w"|"M"（无年 K）。
//   · d（日 K，默认）：bandWin=30 / tradeWin=20，结构线 + 交易线 + 趋势线全开
//   · w（周 K）：bandWin=60，禁用交易参考线 S/B（仅结构线 + 合规趋势线）
//   · M（月 K）：bandWin=80，禁用交易参考线 + 趋势线（仅长期结构线）
//   · m（分时）：复用日线数据计算，但仅展示交易参考线 S/B，隐藏结构支撑/压力 + 趋势线
// 纯函数：不再依赖组件 props，由调用方传入 period。
interface PeriodGuard {
  bandWin: number;
  tradeWin: number;
  disableTrade: boolean;
  disableTrend: boolean;
  disableStruct: boolean;
}
export function resolvePeriodGuard(period: string = "d"): PeriodGuard {
  let bandWin = BAND_WIN;
  let tradeWin = TRADE_WIN;
  let disableTrade = false;
  let disableTrend = false;
  let disableStruct = false;
  if (period === "w") {
    bandWin = 60;
    disableTrade = true; // 周 K：禁用 T 线 S/B，仅结构线 + 合规趋势线
  } else if (period === "M") {
    bandWin = 80;
    disableTrade = true;
    disableTrend = true; // 月 K：仅长期结构线
  } else if (period === "m") {
    disableStruct = true; // 分时：仅展示 S/B 交易参考线，隐藏结构支撑/压力
    disableTrend = true;
  }
  // 日 K（默认）保持 bandWin=30 / tradeWin=20，全开
  return { bandWin, tradeWin, disableTrade, disableTrend, disableStruct };
}

// =====================================================================
// 报告 / 图表共用的「价位选择」核心：返回 4 组价位的原始选择结果（含失效标记、分数、箱体），
// 由 computePriceLevels（报告）与 computeAutoLevelsFromSeries（图表）各自映射，保证同源。
// =====================================================================
interface RawLevel {
  price: number | null;
  cluster: PriceCluster | null;
  sc: ClusterScore | null;
  broken: boolean;  // 原始破位（连续实体击穿）；降级展示与否由 ensure*Line 统一裁决
}
interface RawLevels {
  band: BandType;
  breakDown: boolean;
  boxBottom: number | null;
  boxTop: number | null;
  highs: SwingPt[];
  lows: SwingPt[];
  tradeHighs: SwingPt[]; // 短线窗口（20 根）摆动高点：交易参考线簇缺失时兜底用
  tradeLows: SwingPt[];  // 短线窗口摆动低点
  structSupport: RawLevel;
  structPressure: RawLevel;
  tradeSupportS: RawLevel;
  tradePressureB: RawLevel;
}
function emptyRaw(): RawLevels {
  return {
    band: "box", breakDown: false, boxBottom: null, boxTop: null,
    highs: [], lows: [], tradeHighs: [], tradeLows: [],
    structSupport: { price: null, cluster: null, sc: null, broken: false },
    structPressure: { price: null, cluster: null, sc: null, broken: false },
    tradeSupportS: { price: null, cluster: null, sc: null, broken: false },
    tradePressureB: { price: null, cluster: null, sc: null, broken: false },
  };
}
function buildRawLevels(series: any[], guard: PeriodGuard, ctx?: LevelCtx): RawLevels {
  const last = series[series.length - 1];
  const current = last?.close ?? 0;
  if (!series || series.length < MIN_BARS) return emptyRaw();
  const bandSeries = guard.bandWin > 0 ? series.slice(-guard.bandWin) : [];
  const tradeSeries = guard.tradeWin > 0 ? series.slice(-guard.tradeWin) : [];
  const sw = findSwings(bandSeries, SWING_WIN);
  // 前复权负价守卫：高分红股深度历史（如实测中远海控月/周K）经前复权后价位可能为负，
  // 负价拐点无交易意义，统一剔除；正常全正数据此过滤为空操作。
  const highs = sw.highs.filter((p) => p.value > 0);
  const lows = sw.lows.filter((p) => p.value > 0);
  const { band, breakDown } = detectBandType(highs, lows, bandSeries, current);
  // 箱体识别：(maxHigh-minLow)/midPrice < 0.06 视为箱体，记录上下沿
  let boxBottom: number | null = null;
  let boxTop: number | null = null;
  if (bandSeries.length >= 5) {
    const ph = Math.max(...bandSeries.map((d: any) => d.high));
    const pl = Math.min(...bandSeries.map((d: any) => d.low));
    const mid = (ph + pl) / 2;
    if (mid > 0 && (ph - pl) / mid < 0.06) { boxBottom = pl; boxTop = ph; }
  }
  // 把箱体标记回填 ctx（仅用于量价·筹码·趋势修正语境；箱体+4 分在报告侧统一叠加，不影响簇选择）
  const effCtx = ctx ? { ...ctx, inBox: !!boxBottom } : undefined;

  const supStruct = guard.disableStruct ? null : bestCluster(bandSeries, lows, "support", TOL_PCT, MIN_TOUCH_COUNT, effCtx);
  const presStruct = guard.disableStruct ? null : bestCluster(bandSeries, highs, "pressure", TOL_PCT, MIN_TOUCH_COUNT, effCtx);
  const tsw = findSwings(tradeSeries, SWING_WIN);
  const tradeSwings = { highs: tsw.highs.filter((p) => p.value > 0), lows: tsw.lows.filter((p) => p.value > 0) };
  const supTrade = guard.disableTrade ? null : bestCluster(tradeSeries, tradeSwings.lows, "support", TOL_PCT, MIN_TOUCH_COUNT, effCtx);
  const presTrade = guard.disableTrade ? null : bestCluster(tradeSeries, tradeSwings.highs, "pressure", TOL_PCT, MIN_TOUCH_COUNT, effCtx);

  // 点位取值：结构线取拐点 K 实体边缘（横盘取平台中轴）；交易参考线取筹码密集中枢
  const structSupPrice = supStruct ? (band === "box" ? supStruct.cl.center : bodyEdge(supStruct.cl, "support")) : null;
  const structPresPrice = presStruct ? (band === "box" ? presStruct.cl.center : bodyEdge(presStruct.cl, "pressure")) : null;
  // 失效不再在原始层隐藏：破位/错误侧由 ensureStructLine/ensureTradeLine 统一降级渲染（淡化 + 已破位/弱参考/兜底）。

  return {
    band, breakDown, boxBottom, boxTop, highs, lows,
    tradeHighs: tradeSwings.highs, tradeLows: tradeSwings.lows,
    structSupport: {
      price: structSupPrice,
      cluster: supStruct?.cl ?? null,
      sc: supStruct?.sc ?? null,
      broken: supStruct?.sc.broken ?? false,
    },
    structPressure: {
      price: structPresPrice,
      cluster: presStruct?.cl ?? null,
      sc: presStruct?.sc ?? null,
      broken: presStruct?.sc.broken ?? false,
    },
    tradeSupportS: {
      price: supTrade ? supTrade.cl.center : null,
      cluster: supTrade?.cl ?? null,
      sc: supTrade?.sc ?? null,
      broken: supTrade?.sc.broken ?? false,
    },
    tradePressureB: {
      price: presTrade ? presTrade.cl.center : null,
      cluster: presTrade?.cl ?? null,
      sc: presTrade?.sc ?? null,
      broken: presTrade?.sc.broken ?? false,
    },
  };
}

// =====================================================================
// 图表映射：把 RawLevels 转成图表 AutoLevel[]（与改造前输出完全一致；不传 ctx → 无权重修正）
// =====================================================================
export interface AutoLevel {
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
// hex → rgba 淡化（破位/兜底的结构线用，视觉上与有效线区分）
function fadeColor(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// 结构线「必须画出」：优先有效簇价；破位（实体击穿/箱体破位）→ 仍显示原价但淡化+「已破位」标注；
// 无簇 → 最近摆动点，再无 → 窗口极值，淡化兜底（不渲染子标签）。返回 null 仅当数据不足/周期禁结构线。
function ensureStructLine(
  series: any[], raw: RawLevels, role: "support" | "pressure", guard: PeriodGuard
): { price: number; tag: string; sub: string; label: string; src: string; degraded: boolean } | null {
  const r = role === "support" ? raw.structSupport : raw.structPressure;
  // 数据不足（少于 MIN_BARS）或周期守卫禁结构线（分时）→ 不画
  if (guard.disableStruct || !series || series.length < MIN_BARS) return null;
  const L = BAND_LABELS[raw.band];
  const base = role === "support" ? L.sS : L.sP;
  const srcBase = role === "support" ? "结构支撑" : "结构压力";
  const current = series[series.length - 1]?.close ?? 0;
  if (r.price != null) {
    // 破位（连续实体击穿，或支撑遇箱体破位）→ 不隐藏，淡化 + 「破」标注
    const broken = r.broken || (role === "support" && raw.breakDown);
    // 错误侧守卫：现价已越过画线（收于支撑线下方 / 压力线上方）→ 即使未达「连续2根击穿簇中枢」
    // 判破基准（画线基准=实体边缘 ≠ 判破基准=簇中枢，存在价格长期驻留画线错误侧的窗口），
    // 也按破位降级标注，杜绝「有效支撑悬在头顶 / 有效压力坠在脚下」的视觉误导。
    const wrongSide = current > 0 && (role === "support" ? current < r.price : current > r.price);
    if (broken || wrongSide) return { price: r.price, tag: base.tag, sub: "已破位", label: base.name, src: `${srcBase}·已破位（原价位 ${r.price.toFixed(3)}）`, degraded: true };
    return { price: r.price, tag: base.tag, sub: "", label: base.name, src: `${srcBase}·波段${role === "support" ? "低点" : "高点"}簇 No.1`, degraded: false };
  }
  // 簇缺失 → 最近摆动点；若最近摆动点已在现价错误侧（突破/破位行情）改用窗口极值
  // （极值窗口含当前 K，必在正确侧）；再无正价极值则不画。
  const pts = role === "support" ? raw.lows : raw.highs;
  let price: number | null = pts.length ? pts[pts.length - 1].value : null;
  if (price != null && current > 0 && (role === "support" ? price > current : price < current)) price = null;
  if (price == null) {
    const sl = (guard.bandWin > 0 ? series.slice(-guard.bandWin) : series)
      .map((d: any) => (role === "support" ? d.low : d.high))
      .filter((v: number) => v > 0);
    if (!sl.length) return null;
    price = role === "support" ? Math.min(...sl) : Math.max(...sl);
  }
  return { price, tag: base.tag, sub: "", label: base.name, src: `${srcBase}·兜底（簇缺失）`, degraded: true };
}

// 交易参考线状态：ok=合格可执行参考；broken=破位/现价错误侧（淡化+已破位）；
// weak=簇存在但触碰/打分证据不足（淡化+弱参考）；ref=无簇兜底最近短线摆动点/窗口极值（淡化兜底）。
export type TradeLineStatus = "ok" | "broken" | "weak" | "ref";
export interface TradeLineState {
  price: number;
  status: TradeLineStatus;
  tag: string;
  sub: string;
  label: string;
  src: string;
  sc: ClusterScore | null;
}
// 交易参考线「必须画出」：合格簇 → 正常动作提示；破位/错误侧 → 淡化「已破位」；
// 证据不足（低分/少触碰）→ 淡化「弱参考」；无簇 → 最近短线摆动点 → 短线窗口极值，淡化兜底。
// 与结构线同一兜底哲学：任何情况下日 K 都给得出 S/B 两条参考，但不可执行的降级线绝不动作话术误导。
function ensureTradeLine(
  series: any[], raw: RawLevels, role: "support" | "pressure", guard: PeriodGuard
): TradeLineState | null {
  if (guard.disableTrade || !series || series.length < MIN_BARS) return null;
  const r = role === "support" ? raw.tradeSupportS : raw.tradePressureB;
  const cur = series[series.length - 1]?.close ?? 0;
  const L = BAND_LABELS[raw.band];
  const base = role === "support" ? L.tS : L.tP;
  const srcBase = role === "support" ? "交易参考支撑" : "交易参考压力";
  const sideText = role === "support" ? "低点" : "高点";
  if (r.price != null) {
    // 错误侧守卫：现价已越过 S（在其下方）/B（在其上方）→ 按破位降级
    const wrongSide = cur > 0 && (role === "support" ? r.price > cur : r.price < cur);
    const broken = r.broken || (role === "support" && raw.breakDown) || wrongSide;
    const weak = !broken && (r.sc == null || r.sc.baseScore < MIN_TOTAL_SCORE || r.sc.touches < MIN_TOUCH_COUNT);
    const status: TradeLineStatus = broken ? "broken" : weak ? "weak" : "ok";
    const sub = status === "ok" ? base.sub : status === "broken" ? "已破位" : "弱参考";
    const src = status === "ok"
      ? `${srcBase}·短线${sideText}簇 No.1`
      : status === "broken"
        ? `${srcBase}·已破位（原价位 ${r.price.toFixed(3)}）`
        : `${srcBase}·弱参考（触碰/反转证据不足）`;
    return { price: r.price, status, tag: base.tag, sub, label: base.name, src, sc: r.sc };
  }
  // 簇缺失 → 最近短线摆动点；若其已在现价错误侧（突破/破位行情）改用短线窗口极值
  // （窗口含当前 K，必在正确侧）；再无正价极值则不画。
  const pts = role === "support" ? raw.tradeLows : raw.tradeHighs;
  let price: number | null = pts.length ? pts[pts.length - 1].value : null;
  if (price != null && cur > 0 && (role === "support" ? price > cur : price < cur)) price = null;
  if (price == null) {
    const sl = (guard.tradeWin > 0 ? series.slice(-guard.tradeWin) : series)
      .map((d: any) => (role === "support" ? d.low : d.high))
      .filter((v: number) => v > 0);
    if (!sl.length) return null;
    price = role === "support" ? Math.min(...sl) : Math.max(...sl);
  }
  return { price, status: "ref", tag: base.tag, sub: "", label: base.name, src: `${srcBase}·兜底（簇缺失）`, sc: null };
}

// 跨角色同价位去重：支撑与压力价位差 ≤TOL_PCT 时（实测如纺织服饰支@13665.82/压@13666.33），
// 保留现价「正确侧」那根（现价在其上方→支撑；在其下方→压力），另一根必然是破位降级线，丢弃以免重叠误导。
function pruneCrossRole<T extends { price?: number }>(
  sup: T | null, pres: T | null, cur: number
): [T | null, T | null] {
  if (sup && pres && typeof sup.price === "number" && typeof pres.price === "number" &&
    Math.abs(sup.price - pres.price) / Math.max(sup.price, pres.price) <= TOL_PCT) {
    return sup.price <= cur ? [sup, null] : [null, pres];
  }
  return [sup, pres];
}

/**
 * 图表智能标注映射。
 * 结构线与交易参考线「各自必出」：即使价位重合（≤TOL_PCT）也不互相隐藏，
 * 重合时由 StockChart 绘制层把交易标签并入结构线标签栈（同一条线显示支+S 两枚角色标签），
 * 既保证四类线种永远可见，又不画重叠虚线。跨角色（支≈压）仍只保留现价正确侧那根。
 */
export function computeAutoLevelsFromSeries(series: any[], guard: PeriodGuard): AutoLevel[] {
  const raw = buildRawLevels(series, guard);
  const cur = series[series.length - 1]?.close ?? 0;

  // 结构支撑/压力「必须画出」：破位（连续实体击穿/箱体破位/现价错误侧）淡化+「已破位」标注；
  // 簇缺失（摆动点不足/分散）退化为最近摆动点或窗口极值，仅淡化展示。杜绝"时有时无"。
  let sSup: AutoLevel | null = null, sPres: AutoLevel | null = null;
  const sup = ensureStructLine(series, raw, "support", guard);
  if (sup) {
    sSup = { kind: "support", role: "structSupport", price: sup.price, color: sup.degraded ? fadeColor(SUPPORT_COLOR, 0.5) : SUPPORT_COLOR, bg: SUPPORT_COLOR, size: 1, dashed: true, tag: sup.tag, sub: sup.sub, label: sup.label, src: sup.src };
  }
  const pres = ensureStructLine(series, raw, "pressure", guard);
  if (pres) {
    sPres = { kind: "pressure", role: "structPressure", price: pres.price, color: pres.degraded ? fadeColor(PRESSURE_COLOR, 0.5) : PRESSURE_COLOR, bg: PRESSURE_COLOR, size: 1, dashed: true, tag: pres.tag, sub: pres.sub, label: pres.label, src: pres.src };
  }
  // 跨角色同价位（支≈压）只保留现价正确侧那根
  [sSup, sPres] = pruneCrossRole(sSup, sPres, cur);

  // 交易参考 S/B「必须画出」：ok=正常动作色 + 动作提示；broken/weak/ref 一律淡化展示中性话术，
  // 绝不以可执行的「低吸/减仓」话术呈现弱位。与结构线同价时两根线都保留（绘制层合并为标签栈）。
  const mkTrade = (st: TradeLineState | null, role: "tradeSupport" | "tradePressure", baseColor: string): AutoLevel | null => {
    if (!st) return null;
    return {
      kind: role === "tradeSupport" ? "support" : "pressure", role, price: st.price,
      color: st.status === "ok" ? baseColor : fadeColor(baseColor, 0.5), bg: baseColor,
      size: 1, dashed: true, tag: st.tag, sub: st.sub, label: st.label, src: st.src,
    };
  };
  let tS = mkTrade(ensureTradeLine(series, raw, "support", guard), "tradeSupport", TRADE_SUPPORT_COLOR);
  let tP = mkTrade(ensureTradeLine(series, raw, "pressure", guard), "tradePressure", TRADE_PRESSURE_COLOR);
  // 跨角色同价位（S≈B）只保留现价正确侧那根
  [tS, tP] = pruneCrossRole(tS, tP, cur);

  const out: AutoLevel[] = [];
  if (sSup) out.push(sSup);
  if (sPres) out.push(sPres);
  if (tS) out.push(tS);
  if (tP) out.push(tP);

  // 趋势线：仅主升 uptrend 连 3 个抬升摆动低点；主跌连 3 个降低摆动高点；
  // pullback(走弱回调)/bounce/box 禁止绘制上升趋势线（防假多头视觉误导，对齐风控硬规则）
  let trendPts: { timestamp: number; value: number }[] | null = null;
  let trendDir: "up" | "down" = "up";
  if (raw.band === "uptrend") {
    if (raw.lows.length >= 3) {
      const a = raw.lows[raw.lows.length - 3], b = raw.lows[raw.lows.length - 2], c = raw.lows[raw.lows.length - 1];
      if (c.value > b.value && b.value > a.value) trendPts = [a, b, c].map((s) => ({ timestamp: s.t, value: s.value }));
    }
  } else if (raw.band === "downtrend") {
    if (raw.highs.length >= 3) {
      const a = raw.highs[raw.highs.length - 3], b = raw.highs[raw.highs.length - 2], c = raw.highs[raw.highs.length - 1];
      if (c.value < b.value && b.value < a.value) { trendPts = [a, b, c].map((s) => ({ timestamp: s.t, value: s.value })); trendDir = "down"; }
    }
  }
  if (trendPts) {
    out.push({ kind: "trend", points: trendPts, dir: trendDir, color: TREND, bg: TREND, size: 1.6, dashed: false, label: trendDir === "down" ? "下降趋势线" : "上升趋势线" });
  }
  return out;
}

// =====================================================================
// 报告映射：把 RawLevels 转成分层 PriceLevelGroup（带强弱评级 / 量能·筹码佐证 / 对应图表标签）
// =====================================================================
interface PriceLevelItem {
  price: number;          // 价位
  totalScore: number;     // 综合总分（量价·筹码·趋势加权后，0-100 量级）
  touchCount: number;     // 触碰次数
  isBroken: boolean;      // 失效：连续2根实体击穿 / 箱体破位 / 现价已收于画线错误侧
  status: "ok" | "broken" | "weak" | "ref"; // 与图表一一对应：ok=正常 / broken=已破位 / weak=证据不足弱参考 / ref=簇缺失兜底
  level: "强" | "中" | "弱"; // 强弱评级
  volDesc: string;        // 量能描述：放量确认/缩量触碰
  labelTag: string;       // 对应图表标签：支/压/S/B
  desc: string;           // 行情定性：回调低吸/逢高离场等（复用 BAND_LABELS 文案）
}
export interface PriceLevelGroup {
  band: BandType;
  breakDown: boolean;
  boxBottom: number | null;               // 箱体下沿
  boxTop: number | null;                 // 箱体上沿
  structSupport: PriceLevelItem | null;   // sS 结构支撑
  structPressure: PriceLevelItem | null;  // sP 结构压力
  tradeSupportS: PriceLevelItem | null;   // tS S 交易支撑
  tradePressureB: PriceLevelItem | null;  // tP B 交易压力
}
export function computePriceLevels(series: any[], guard: PeriodGuard, ctxIn?: LevelCtx): PriceLevelGroup {
  const raw = buildRawLevels(series, guard, ctxIn);
  const L = BAND_LABELS[raw.band];
  const inBox = !!raw.boxBottom;
  const cur = series[series.length - 1]?.close ?? 0;
  const mk = (
    role: "structSupport" | "structPressure",
    rl: RawLevel,
    tag: string, name: string, sub: string
  ): PriceLevelItem | null => {
    // 结构线专用：破位（含错误侧）也照常产出 broken 项，报告与图表降级展示同价同状态；
    // 交易线不走本函数（由 tradeMk + ensureTradeLine 产出 ok/broken/weak/ref 四态）。
    if (rl.price == null || !rl.sc) return null;
    const boxBoost = inBox ? 4 : 0; // 箱体区间内统一 +4 分
    const finalScore = rl.sc.score + boxBoost;
    const isSupportRole = role === "structSupport";
    const isBroken = rl.broken || (isSupportRole && raw.breakDown)
      // 错误侧守卫（与图表 ensureStructLine 同口径）：现价收于画线错误侧即视为失效，
      // 避免报告把「现价上方的支撑 / 现价下方的压力」标成有效价位。
      || (cur > 0 && rl.price != null && (isSupportRole ? rl.price > cur : rl.price < cur));
    let level: "强" | "中" | "弱" = "弱";
    if (isBroken) level = "弱";
    else if (finalScore >= 60) level = "强";
    else if (finalScore >= 40) level = "中";
    const volBoost = rl.sc.volBoost ?? 0;
    const volDesc = volBoost > 0 ? "放量确认（量能配合，可靠性高）" : "缩量/无量触碰（可靠性一般）";
    return {
      price: rl.price,
      totalScore: Math.round(finalScore),
      touchCount: rl.sc.touches,
      isBroken,
      status: isBroken ? "broken" : "ok",
      level,
      volDesc,
      labelTag: tag,
      desc: sub || name,
    };
  };
  // 结构线与图表 100% 同源：正常/破位（含错误侧）路径直接走 mk（rl.price 与 ensureStructLine
  // 同值）；簇缺失时与图表一样兜底「最近摆动点 → 窗口极值」（status=ref，弱级），
  // 杜绝「图表画了兜底线、报告却没有该价位」的不一致。
  const structMk = (
    role: "structSupport" | "structPressure",
    rl: RawLevel,
    tag: string, name: string
  ): PriceLevelItem | null => {
    const it = mk(role, rl, tag, name, "");
    if (it) return it;
    // 走到这里必然是簇缺失（rl.price == null，mk 已放行有效/破位路径），
    // ensureStructLine 非 null 即兜底价；数据不足与图表一致地缺省
    const ensureRole = role === "structSupport" ? "support" : "pressure";
    const sl = ensureStructLine(series, raw, ensureRole, guard);
    if (!sl) return null;
    return {
      price: sl.price, totalScore: 0, touchCount: 0,
      isBroken: false, status: "ref", level: "弱",
      volDesc: "", labelTag: tag, desc: "兜底（簇缺失）",
    };
  };
  let sS = structMk("structSupport", raw.structSupport, L.sS.tag, L.sS.name);
  let sP = structMk("structPressure", raw.structPressure, L.sP.tag, L.sP.name);
  // 跨角色同价位与图表同口径：支≈压时只保留现价正确侧那根
  [sS, sP] = pruneCrossRole(sS, sP, cur);
  // 交易参考线与图表 100% 同源同状态（ensureTradeLine：ok/broken/weak/ref 四级必出线），
  // 弱参考/兜底位不进任何买卖信号判定（analyzer 侧仅认 status==="ok"），只作价位展示。
  const tradeMk = (
    role: "tradeSupportS" | "tradePressureB",
    st: TradeLineState | null
  ): PriceLevelItem | null => {
    if (!st) return null;
    const tag = role === "tradeSupportS" ? L.tS.tag : L.tP.tag;
    if (st.status === "ref" || !st.sc) {
      return {
        price: st.price, totalScore: 0, touchCount: 0, isBroken: false,
        status: "ref", level: "弱", volDesc: "", labelTag: tag, desc: "兜底（簇缺失）",
      };
    }
    const finalScore = st.sc.score + (inBox ? 4 : 0);
    const level: "强" | "中" | "弱" =
      st.status === "ok" ? (finalScore >= 60 ? "强" : finalScore >= 40 ? "中" : "弱") : "弱";
    const volDesc = (st.sc.volBoost ?? 0) > 0
      ? "放量确认（量能配合，可靠性高）"
      : "缩量/无量触碰（可靠性一般）";
    const desc = st.status === "ok"
      ? (role === "tradeSupportS" ? L.tS.sub : L.tP.sub)
      : st.status === "broken" ? "已破位" : "弱参考（触碰/反转证据不足）";
    return {
      price: st.price, totalScore: Math.round(finalScore), touchCount: st.sc.touches,
      isBroken: st.status === "broken", status: st.status, level, volDesc,
      labelTag: tag, desc,
    };
  };
  let tS = tradeMk("tradeSupportS", ensureTradeLine(series, raw, "support", guard));
  let tP = tradeMk("tradePressureB", ensureTradeLine(series, raw, "pressure", guard));
  // 结构/交易同价位不再隐藏交易线：图表侧同价时合并为一根线 + 双角色标签栈；
  // 报告侧两个价位条目并存（pickMainLevels/信号判定只取 status==="ok"）。跨角色同价位仍只留正确侧。
  [tS, tP] = pruneCrossRole(tS, tP, cur);
  return {
    band: raw.band,
    breakDown: raw.breakDown,
    boxBottom: raw.boxBottom,
    boxTop: raw.boxTop,
    structSupport: sS,
    structPressure: sP,
    tradeSupportS: tS,
    tradePressureB: tP,
  };
}
