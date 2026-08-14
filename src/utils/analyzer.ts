// =====================================================================
// 分析引擎（纯函数，跨端通用，无任何 DOM / 平台依赖）
// 指标计算 + 综合研判 + 白话报告所需的全部数据结构
// =====================================================================
import type { Kline, PeriodKey } from "./period";
import { UP, DOWN } from "./colors";
import { computePriceLevels, resolvePeriodGuard, type PriceLevelGroup, type LevelCtx } from "@/utils/autoLevels";
import type { NewsSignal } from "./newsSentiment";

// ---------------- 指标计算 ----------------
function ma(arr: number[], n: number): (number | null)[] {
  const r: (number | null)[] = new Array(arr.length).fill(null);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= n) sum -= arr[i - n];
    if (i >= n - 1) r[i] = sum / n;
  }
  return r;
}
function ema(arr: number[], n: number): number[] {
  const r = new Array(arr.length).fill(null);
  const k = 2 / (n + 1);
  let prev = 0;
  for (let i = 0; i < arr.length; i++) {
    if (i === 0) prev = arr[0];
    else prev = arr[i] * k + prev * (1 - k);
    r[i] = prev;
  }
  return r;
}
function macd(close: number[]) {
  const e12 = ema(close, 12);
  const e26 = ema(close, 26);
  const dif = close.map((_, i) => e12[i] - e26[i]);
  const dea = ema(dif, 9);
  const macdArr = dif.map((v, i) => (v - dea[i]) * 2);
  return { dif, dea, macd: macdArr };
}
function kdj(klines: Kline[]) {
  const n = 9;
  const K = new Array(klines.length).fill(50);
  const D = new Array(klines.length).fill(50);
  const J = new Array(klines.length).fill(50);
  for (let i = 0; i < klines.length; i++) {
    if (i < n - 1) continue;
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - n + 1; j <= i; j++) {
      hh = Math.max(hh, klines[j].high);
      ll = Math.min(ll, klines[j].low);
    }
    const rsv = hh === ll ? 50 : ((klines[i].close - ll) / (hh - ll)) * 100;
    const k = i === n - 1 ? 50 : K[i - 1];
    const d = i === n - 1 ? 50 : D[i - 1];
    K[i] = (2 / 3) * k + (1 / 3) * rsv;
    D[i] = (2 / 3) * d + (1 / 3) * K[i];
    J[i] = 3 * K[i] - 2 * D[i];
  }
  return { K, D, J };
}
function rsi(close: number[], n: number): (number | null)[] {
  const r: (number | null)[] = new Array(close.length).fill(null);
  let g = 0;
  let l = 0;
  for (let i = 1; i < close.length; i++) {
    const diff = close[i] - close[i - 1];
    if (i <= n) {
      if (diff > 0) g += diff;
      else l -= diff;
      if (i === n) {
        g /= n;
        l /= n;
        r[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
      }
    } else {
      const pg = g * (n - 1);
      const pl = l * (n - 1);
      if (diff > 0) {
        g = (pg + diff) / n;
        l = pl / n;
      } else {
        g = pg / n;
        l = (pl - diff) / n;
      }
      r[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
  }
  return r;
}
// pivots 已废弃：支撑/压力统一改用 autoLevels.ts 的分层引擎（与图表 StockChart 智能标注 100% 同源），
// 旧逻辑仅做窗口极值、无聚类/打分/破位验证/量价·筹码·趋势联动，且会导致报告与图表两套数值。
// Wilder 平滑 (RMA)：前 n 项用 SMA 初始化，之后递推。ATR/ADX 的标准算法（与 RSI 同源）。
function rma(arr: number[], n: number): number[] {
  const r = new Array(arr.length).fill(null);
  let prev = 0;
  for (let i = 0; i < arr.length; i++) {
    if (i < n) prev = (prev * i + arr[i]) / (i + 1);
    else prev = (prev * (n - 1) + arr[i]) / n;
    r[i] = prev;
  }
  return r;
}

// DMI / ADX（Wilder，默认 14）—— 趋势方向与强度的业界标准度量
//   · +DI / -DI ：多空方向力度
//   · ADX       ：趋势强度（与方向无关）：<20 无趋势/震荡，20-25 初现，25-40 明显，>40 强趋势
//   · ATR       ：平均真实波幅（波动率与止损位基准）
// 说明：用 RMA 递推，符合 Wilder 原始定义。
function dmi(high: number[], low: number[], close: number[], n = 14) {
  const len = close.length;
  const tr = new Array(len).fill(0);
  const pDM = new Array(len).fill(0);
  const mDM = new Array(len).fill(0);
  for (let i = 1; i < len; i++) {
    const hl = high[i] - low[i];
    const hc = Math.abs(high[i] - close[i - 1]);
    const lc = Math.abs(low[i] - close[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
    const up = high[i] - high[i - 1];
    const dn = low[i - 1] - low[i];
    pDM[i] = up > dn && up > 0 ? up : 0;
    mDM[i] = dn > up && dn > 0 ? dn : 0;
  }
  const atrR = rma(tr, n);
  const pDIR = rma(pDM, n);
  const mDIR = rma(mDM, n);
  const pDI = new Array(len).fill(0);
  const mDI = new Array(len).fill(0);
  const dx = new Array(len).fill(0);
  for (let i = 0; i < len; i++) {
    const a = atrR[i] || 0;
    pDI[i] = a ? (100 * pDIR[i]) / a : 0;
    mDI[i] = a ? (100 * mDIR[i]) / a : 0;
    const sum = pDI[i] + mDI[i];
    dx[i] = sum ? (100 * Math.abs(pDI[i] - mDI[i])) / sum : 0;
  }
  const adx = rma(dx, n);
  return { atr: atrR, pDI, mDI, adx };
}

// 布林带（BOLL，20,2）—— 波动率通道
//   · 中轨 = MA20；上/下轨 = 中轨 ± 2σ
//   · %B   = (收盘-下轨)/(上-下)，>1 触上轨(超买)，<0 触下轨(超卖)，0.5 在中轨
//   · 带宽 = (上-下)/中轨，骤降为「挤压(squeeze)」预示变盘；骤升为波动扩张
function boll(close: number[], n = 20, k = 2) {
  const mid = ma(close, n);
  const upper: (number | null)[] = new Array(close.length).fill(null);
  const lower: (number | null)[] = new Array(close.length).fill(null);
  const pctB: (number | null)[] = new Array(close.length).fill(null);
  const bandwidth: (number | null)[] = new Array(close.length).fill(null);
  for (let i = n - 1; i < close.length; i++) {
    const m = mid[i]!;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (close[j] - m) * (close[j] - m);
    const sd = Math.sqrt(s / n);
    const up = m + k * sd;
    const lo = m - k * sd;
    upper[i] = up;
    lower[i] = lo;
    const rng = up - lo;
    pctB[i] = rng ? (close[i] - lo) / rng : 0.5;
    bandwidth[i] = m ? rng / m : 0;
  }
  return { mid, upper, lower, pctB, bandwidth };
}

// 筹码/成本分布（成交量分布 VP 近似）：
// 真正的 CYQ 成本分布会把每个交易日的成交量按其 [low, high] 实际区间摊薄，而非压到
// 收盘价一个点。这里采用标准 Volume-Profile 近似——将每日成交量均匀摊入其高低区间
// 对应的价格桶，再平滑，得到「在哪些价格堆积了最多筹码」的分布。
//   · avgCost    = 分布加权均价（近期持仓成本重心，比收盘价均价更贴近真实成本）
//   · peakPrice  = 分布众数（筹码密集峰 / 主力成本区）
//   · profitRatio= 成本重心以下成交量占比（近似获利盘比例）
// 注意：这是基于成交量的近似，未纳入换手率加权的 TOTALV 口径，仅作技术参考。
function chip(klines: Kline[], winDays: number) {
  const n = Math.min(winDays, klines.length);
  const slice = klines.slice(klines.length - n);
  let minP = Infinity;
  let maxP = -Infinity;
  slice.forEach((k) => {
    minP = Math.min(minP, k.low);
    maxP = Math.max(maxP, k.high);
  });
  if (minP === maxP) maxP = minP + 1;
  const B = 60; // 桶数，提升价格分辨率
  const step = (maxP - minP) / B;
  const vb = new Array(B).fill(0);
  slice.forEach((k) => {
    // 当日成交量按其 [low, high] 区间均匀摊入对应价格桶（核心修正：不再只压收盘价）
    let b0 = Math.floor((k.low - minP) / step);
    let b1 = Math.floor((k.high - minP) / step);
    b0 = Math.max(0, Math.min(B - 1, b0));
    b1 = Math.max(0, Math.min(B - 1, b1));
    if (b1 < b0) b1 = b0;
    const span = b1 - b0 + 1;
    for (let b = b0; b <= b1; b++) vb[b] += k.vol / span;
  });
  const sm = vb.slice();
  for (let i = 1; i < B - 1; i++) sm[i] = (vb[i - 1] + vb[i] * 2 + vb[i + 1]) / 4;
  const smTotal = sm.reduce((a, b) => a + b, 0) || 1;
  let peak = 0;
  for (let i = 1; i < B; i++) if (sm[i] > sm[peak]) peak = i;
  const peakPrice = minP + (peak + 0.5) * step;
  // 成本重心 = 分布加权均价（替代原收盘价加权均价）
  let wsum = 0;
  let vsum = 0;
  for (let i = 0; i < B; i++) {
    const p = minP + (i + 0.5) * step;
    wsum += p * sm[i];
    vsum += sm[i];
  }
  const avgCost = vsum ? wsum / vsum : (minP + maxP) / 2;
  const cur = klines[klines.length - 1].close;
  let profitVol = 0;
  for (let i = 0; i < B; i++) {
    const p = minP + (i + 0.5) * step;
    if (p <= cur) profitVol += sm[i];
  }
  const profitRatio = profitVol / smTotal;
  const cats: string[] = [];
  const vals: number[] = [];
  const colors: string[] = [];
  for (let i = 0; i < B; i++) {
    const p = minP + (i + 0.5) * step;
    cats.push(p.toFixed(2));
    vals.push(+(sm[i] / smTotal * 100).toFixed(2));
    colors.push(p <= cur ? DOWN : UP);
  }
  // 成本分布分位数：累计成交量 5%/10%/25%/50%/75%/90%/95% 对应的价格位
  // 用于 UI 展示「90% 筹码区间」——即 5%~95% 分位，比 minP/maxP（极端值）更有实战意义。
  const percentiles: Record<string, number> = {};
  const targets = [5, 10, 25, 50, 75, 90, 95];
  let cumulative = 0;
  let ti = 0;
  for (let i = 0; i < B && ti < targets.length; i++) {
    const prevC = cumulative;
    cumulative += sm[i];
    while (ti < targets.length && cumulative / smTotal * 100 >= targets[ti]) {
      const t = targets[ti] / 100;
      const pLo = prevC / smTotal;
      const pHi = cumulative / smTotal;
      const f = pHi !== pLo ? (t - pLo) / (pHi - pLo) : 0;
      const p = minP + (i + f) * step;
      percentiles[String(targets[ti])] = +p.toFixed(2);
      ti++;
    }
  }
  return { cats, vals, colors, avgCost, peakPrice, profitRatio, cur, minP, maxP, percentiles };
}

// ---------------- 今日盘中走势（A 股特有：涨停/跌停/炸板）----------------
// A 股涨跌停是极强的短线信号：
//   · 封涨停：多头极强，次日溢价概率高
//   · 炸板（曾封涨停但打开）：多空分歧剧烈，短期波动风险大
//   · 封跌停：空头极强，次日继续下跌概率高
//   · 跌停开板：恐慌释放，可能迎来反弹
//
// 涨跌停阈值优先按「股票代码」精确判定（唯一可靠依据，避免把创业板/科创板当主板）：
//   · 沪深主板（60xxxx / 00xxxx）：±10%
//   · 科创板（688xxx / 689xxx）/ 创业板（300xxx / 301xxx）：±20%
//   · 北交所（8xxxxx / 4xxxxx）：±30%
//   · ST 主板股票为 ±5%：代码判定无法识别，此处按 10% 处理（边界场景，影响极小）
// 无代码时（如回测脚本）回退到「历史 K 线最大涨跌幅」推断板块。
function limitPctForCode(code?: string): number | null {
  if (!code) return null;
  const c = String(code).replace(/^[a-zA-Z]+/, ""); // 去掉可能的前缀（sh/sz/bj）
  if (/^(688|689)/.test(c)) return 0.2; // 科创板
  if (/^(300|301)/.test(c)) return 0.2; // 创业板
  if (/^(8|4)/.test(c)) return 0.3; // 北交所
  if (/^(6|0)/.test(c)) return 0.1; // 沪深主板
  return null; // 港股等无涨跌停，交由调用方按无特殊走势处理
}

function inferLimitPct(klines: Kline[]): number {
  const lookback = Math.min(60, klines.length);
  let maxAbsPct = 0;
  for (let i = Math.max(1, klines.length - lookback + 1); i < klines.length; i++) {
    const pre = klines[i - 1].close;
    if (!pre) continue;
    const pct = Math.abs((klines[i].close - pre) / pre);
    if (pct > maxAbsPct) maxAbsPct = pct;
  }
  if (maxAbsPct >= 0.25) return 0.30; // 北交所
  if (maxAbsPct >= 0.15) return 0.20; // 科创板/创业板
  return 0.10; // 主板
}

function detectLimitMove(klines: Kline[], code?: string) {
  const len = klines.length;
  const empty = { pct: 0, isLimitUp: false, isLimitDown: false, isBrokenLimitUp: false, isBrokenLimitDown: false, isBigUp: false, isBigDown: false, limitPct: 0.10 };
  if (len < 2) return empty;
  const last = klines[len - 1];
  const prev = klines[len - 2];
  const preClose = prev.close;
  if (!preClose) return empty;
  const pct = (last.close - preClose) / preClose;
  const limitPct = limitPctForCode(code) ?? inferLimitPct(klines);
  // 涨跌停价（A 股按 preClose × (1±limitPct) 四舍五入到分）
  const limitUpPrice = Math.round(preClose * (1 + limitPct) * 100) / 100;
  const limitDownPrice = Math.round(preClose * (1 - limitPct) * 100) / 100;
  // 封板判定：收盘价达到涨跌停价（允许 0.01 元误差，应对浮点精度）
  const isLimitUp = Math.abs(last.close - limitUpPrice) < 0.011 && pct > 0;
  const isLimitDown = Math.abs(last.close - limitDownPrice) < 0.011 && pct < 0;
  // 炸板：最高价触及涨停价但收盘未封住（阈值由代码精确判定，无需再叠加涨跌幅护栏；
  // 此前用「>5%」兜底会把创业板/科创板误判为炸板——如 300xxx 收涨 14% 并非涨停）
  const isBrokenLimitUp = !isLimitUp && last.high >= limitUpPrice - 0.011;
  // 跌停开板：最低价触及跌停价但收盘未封住
  const isBrokenLimitDown = !isLimitDown && last.low <= limitDownPrice + 0.011;
  // 非涨停/跌停的大幅异动：涨跌幅 ≥ 涨跌停阈值 60% 视为「今日大涨/大跌」。
  // 让「创业板 +14% 急涨」「主板 -8% 急跌」这类非极限行情也能进入实时警示，
  // 而不再被淹没在日线趋势里（阈值随板块自适应：主板 6%、创业板/科创板 12%）。
  const isBigUp = !isLimitUp && !isBrokenLimitUp && pct >= limitPct * 0.6;
  const isBigDown = !isLimitDown && !isBrokenLimitDown && pct <= -limitPct * 0.6;
  return { pct, isLimitUp, isLimitDown, isBrokenLimitUp, isBrokenLimitDown, isBigUp, isBigDown, limitPct };
}

// ---------------- 主分析 ----------------
interface FlowSummary {
  sum: number; // 亿元
  has: boolean;
}
export interface ChipResult {
  cats: string[];
  vals: number[];
  colors: string[];
  avgCost: number;
  peakPrice: number;
  profitRatio: number;
  cur: number;
  minP: number;
  maxP: number;
  percentiles: Record<string, number>; // 5/10/25/50/75/90/95 分位成本价
}
export interface AnalysisResult {
  price: number;
  last: Kline;
  ma5: (number | null)[];
  ma10: (number | null)[];
  ma20: (number | null)[];
  ma60: (number | null)[];
  vol: number[];
  vma5: (number | null)[];
  vma20: (number | null)[];
  macd: { dif: number[]; dea: number[]; macd: number[] };
  kd: { K: number[]; D: number[]; J: number[] };
  r6: (number | null)[];
  r12: (number | null)[];
  r24: (number | null)[];
  trend: string;
  trendText: string;
  strength: string;
  maState: string;
  support: number;
  resistance: number;
  priceLevels: PriceLevelGroup; // 分层价位（结构支撑 sS / 结构压力 sP / 交易支撑 S / 交易压力 B + 箱体上下沿），与图表智能标注 100% 同源
  mainSupport: number;   // 主支撑（最强有效支撑，箱体下沿兜底）
  mainResistance: number; // 主压力（最强有效压力，箱体上沿兜底）
  bottomZone: number;
  topZone: number;
  distSup: number;
  distRes: number;
  nearBottom: boolean;
  nearTop: boolean;
  nearSup: boolean;
  nearRes: boolean;
  f5: FlowSummary;
  f10: FlowSummary;
  f20: FlowSummary;
  volRatio: number;
  macdCross: "gold" | "dead" | null;
  kdjCross: "gold" | "dead" | null;
  kdjState: string;
  rNow: number;
  rsiValid: boolean; // RSI 是否有真实数据（K 线不足时为 false，UI 应显示"暂无数据"）
  scoreReasons: { label: string; delta: number }[];
  stage: string;
  stageText: string;
  stageDetail: string;
  score: number;
  riskLevel: string;
  watch: boolean;
  build: boolean;
  add: boolean;
  reduce: boolean;
  buyLow: number;
  buyHigh: number;
  risks: string[];
  banner: string;
  bannerCls: string;
  // ---- 专业指标（新增，提升研判严谨度）----
  adx: number[];
  pDI: number[];
  mDI: number[];
  atr: number[];
  adxState: string;
  bollMid: (number | null)[];
  bollUpper: (number | null)[];
  bollLower: (number | null)[];
  bollPctB: (number | null)[];
  bollBw: (number | null)[];
  bollBwNow: number;       // 当前带宽值（近 20 日中位数归一化后 0~1 相对位置，简化展示用）
  bollSqueeze: boolean;    // 带宽挤压：当前 < 近 120 日 15% 分位，预示即将变盘
  bias6: number;
  bias12: number;
  bias24: number;
  volAnn: number;
  maxDrawdown: number;
  atrPct: number;
  obvTrend: string;
  turnAvg: number;
  turnState: string;
  // ---- 筹码分布 · 成本结构（CYQ，成交量加权近似）：新增到分析主链路，
  //      之前仅 StockChart 图表叠加独立计算，评分/结论/风险完全没用到，严重遗漏 ----
  chip: ChipResult | null;
  // ---- 突破/跌破 + 直白买卖信号（支撑产品卖点：何时买卖 / 支撑压力突破）----
  breakout: boolean; // 已有效突破压力（仅当压力来自明确 pivot 拐点）
  breakdown: boolean; // 已有效跌破支撑（仅当支撑来自明确 pivot 拐点）
  sigType: string; // 走势预测：突破上攻 / 破位下行 / 承压回落 / 企稳反弹 / 震荡上行 / 震荡下行 / 区间震荡
  signal: {
    level: "buy" | "sell" | "hold" | "watch" | "wait";
    label: string; // 买点 / 卖点 / 持有 / 关注 / 观望
    text: string; // 一句话建议
    reason: string; // 触发条件
    confirm: string; // 确认信号（如何验证，避免绝对化）
  };
  // ---- 资讯情绪因子（量化新闻/行业/市场事件后协同参与研判）----
  newsScore: number; // -100 ~ 100
  newsLabel: string; // 利好偏多 / 中性 / 利空偏空
  newsBull: number; // 偏多条目数
  newsBear: number; // 偏空条目数
  newsCatalysts: string[]; // 命中利好关键词
  newsRisks: string[]; // 命中利空关键词
  // ---- 大盘 · 市场环境（beta 感知：个股信号胜率随大盘环境显著变化）----
  marketEnv: {
    indexName: string; // 大盘名称（上证/深证/创业板指，按板块匹配）
    indexTrend: string; // 大盘趋势文字（上涨趋势 / 震荡偏强 / 区间震荡 / 震荡偏弱 / 下跌趋势）
    indexTrendDisplay: string; // 合成唯一结论 = 今日动能定性(冲突时) 或 中期趋势(无冲突)；报告只展示此字段，禁止叠加方向矛盾表述
    indexTodayPct: number | null; // 大盘指数今日实时涨跌幅（%），实时感知「今天」的方向
    indexMoveJudge: string; // 今日动能定性结论（不简单陈列涨跌幅）：超跌反弹/修复企稳/反转信号/正常回踩/阶段调整/见顶信号；无显著冲突为 ""
    indexMoveBasis: string; // 定性结论的结构依据（站上20日线、放量、DMI转多 等，逗号连接）
    indexAdx: number; // 大盘 ADX（趋势强度）
    alignScore: number; // 与大盘方向协同得分：同向±6， 中性0（方向一致且同涨加分、同跌确认弱势扣分）
    alignText: string; // "顺大盘上涨" / "逆势回调" 等自然语言描述
    breadthScore: number; // 市场情绪（涨跌家数映射）±5
    breadthText: string; // "市场情绪偏多" / "普跌环境" 等
    mktVolText: string; // "大盘缩量" / "大盘放量" / "量能正常"
    idxVolRatio: number; // 大盘量比（VMA5/VMA20）：<0.7 缩量，>1.3 放量
    // 行业板块维度：让市场环境不止看宽基指数，还看个股所属行业 beta（如兆易创新→半导体）
    sectorName?: string; // 行业名，如「半导体及元件」
    sectorTrend?: string; // 行业趋势文字（同 indexTrend）
    sectorTrendDisplay?: string; // 行业合成唯一结论（同 indexTrendDisplay 逻辑）
    sectorMoveJudge?: string; // 行业今日动能定性结论（同 indexMoveJudge）
    sectorMoveBasis?: string; // 行业定性结论结构依据
    sectorAlignScore?: number; // 个股与行业方向协同得分：同向+4，反向-4，中性0
    sectorAlignText?: string; // "顺行业上涨" / "逆行业回调" 等自然语言
    // 仓位建议（由大盘环境 + 行业协同综合推导，服务于量化仓位调控）
    positionAdvice: string; // "建议轻仓避险（≤20%）" / "可积极配置（60%–80%）" / "暂无数据" 等
    positionPct: number; // 建议上限仓位百分比（0 = 暂无数据）
    positionBasis: string; // 推导依据自然语言
  };
  // ---- 今日盘中走势（A 股特有：涨停/跌停/炸板，实时反映当日异动）----
  intradayMove: {
    pct: number; // 今日涨跌幅
    isLimitUp: boolean; // 封涨停
    isLimitDown: boolean; // 封跌停
    isBrokenLimitUp: boolean; // 炸板（曾封涨停但打开）
    isBrokenLimitDown: boolean; // 跌停开板
    isBigUp: boolean; // 大幅放量上涨（≥60% 涨跌幅阈值，非涨停，如创业板 +14%）
    isBigDown: boolean; // 大幅下跌（≤-60% 阈值，非跌停）
    limitPct: number; // 涨跌停阈值（0.10/0.20/0.30）
    label: string; // "今日封涨停" / "今日炸板" / "今日大涨" / ""（无特殊走势）
  };
}

// 主力净流入（近 N 个交易日累计）：与图表周期解耦。
// 旧实现按 K 线索引取日期，周/月/年 K 的 bar 日期与日频资金流 key 不匹配，
// 会导致非日 K 视图下资金流永远"暂无数据"。现改为直接取 flowMap 中最近的 N 个
// 交易日（按日期排序），语义恒为「近 5/10/20 日主力净流入」，任何周期都正确。
function flowSumByDays(flowMap: Record<string, number>, n: number): FlowSummary {
  const dates = Object.keys(flowMap)
    .filter((d) => flowMap[d] != null)
    .sort()
    .slice(-n);
  let s = 0;
  for (const d of dates) s += flowMap[d];
  return { sum: s / 1e8, has: dates.length > 0 };
}

// 大盘 · 市场环境上下文：由调用方（行情页 / 报告页）获取相关指数日 K 后传入，
// 未提供时 analyze 会返回「暂无数据」占位对象（marketEnv 永不为 null），不影响个股分析本身。
export interface MarketContext {
  indexKlines: Kline[];    // 匹配该股票所在板块的大盘指数日 K（上证/深证/创业板）
  indexName: string;       // 大盘名称，例如"上证指数"、"创业板指"
  // 大盘指数当日实时快照（今日盘中涨跌幅）：让「大盘环境」不再只反映中期趋势，
  // 还能实时感知今天指数涨跌（如创业板指今日 +2%）。缺失时 indexTodayPct 为 null。
  indexRealtime?: { price: number; preClose: number } | null;
  upCount?: number;        // 当日上涨家数（市场宽度）
  downCount?: number;      // 当日下跌家数
  limitUp?: number;        // 当日涨停数
  limitDown?: number;      // 当日跌停数
  // 个股所属行业板块上下文：让市场环境分析纳入行业 beta（如兆易创新→半导体）
  sector?: {
    name: string;       // 行业名
    secid: string;      // 行业板块指数 secid
    klines: Kline[];    // 行业指数日 K
    realtime?: { price: number; preClose: number } | null; // 行业指数当日实时快照（结合今日实时判断板块走势）
  } | null;
}

export function analyze(
  klines: Kline[],
  flowMap: Record<string, number> = {},
  news?: NewsSignal | null,
  // 换手率按「日频」口径计算，与图表周期解耦：周/月 K 视图下若仍用当期 K 线平均，
  // 会拿周线/月线的区间换手率去平均，数字严重失真。传入日 K 序列即可恒为「近 20 日日均」。
  dailyKlines?: Kline[],
  market?: MarketContext | null,
  // 股票代码（如 "300394"）：用于精确判定涨跌停阈值（创业板/科创板 20%、北交所 30%），
  // 避免按历史波动推断把创业板当主板、误报「炸板」。缺失时回退 K 线推断。
  stockCode?: string,
  period?: PeriodKey // K 线周期（d/w/M/m）：决定智能标注周期隔离，与图表完全一致
): AnalysisResult {
  // 边界条件：样本过少时任何指标都无意义，直接抛清晰错误交由上层提示，
  // 避免后续 klines[len-1] 等越界访问产生 NaN/崩溃（此前空 K 线会静默崩在 Math.min 上）。
  if (!klines || klines.length < 2) {
    throw new Error("K线数据不足，暂无法生成分析（样本过少）");
  }
  const len = klines.length;
  const close = klines.map((k) => k.close);
  const ma5 = ma(close, 5);
  const ma10 = ma(close, 10);
  const ma20 = ma(close, 20);
  const ma60 = ma(close, 60);
  const vol = klines.map((k) => k.vol);
  const vma5 = ma(vol, 5);
  const vma20 = ma(vol, 20);
  const m = macd(close);
  const kd = kdj(klines);
  const r6 = rsi(close, 6);
  const r12 = rsi(close, 12);
  const r24 = rsi(close, 24);
  const last = klines[len - 1];
  const price = last.close;

  // ---------------- 专业指标：趋势强度 / 波动率 / 风险 / 量能 ----------------
  const high = klines.map((k) => k.high);
  const low = klines.map((k) => k.low);
  const { atr, pDI, mDI, adx } = dmi(high, low, close, 14);
  const bo = boll(close, 20, 2);
  const m6 = ma(close, 6);
  const m12 = ma(close, 12);
  const m24 = ma(close, 24);
  const bias6 = ((price - (m6[len - 1] || price)) / (m6[len - 1] || price)) * 100;
  const bias12 = ((price - (m12[len - 1] || price)) / (m12[len - 1] || price)) * 100;
  const bias24 = ((price - (m24[len - 1] || price)) / (m24[len - 1] || price)) * 100;
  // 年化波动率（近 120 日「简单日收益率」标准差 × √252 年化；√252 为交易日年化因子）
  const win = klines.slice(Math.max(0, len - 120));
  const rets: number[] = [];
  for (let i = 1; i < win.length; i++) rets.push(win[i].close / win[i - 1].close - 1);
  const mr = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const varr = rets.reduce((a, b) => a + (b - mr) * (b - mr), 0) / (rets.length || 1);
  const volAnn = Math.sqrt(varr) * Math.sqrt(252);
  // 最大回撤（近 120 日）
  let peak = -Infinity;
  let mdd = 0;
  const mddStart = Math.max(0, len - 120);
  for (let i = mddStart; i < len; i++) {
    peak = Math.max(peak, close[i]);
    if (peak > 0) mdd = Math.max(mdd, (peak - close[i]) / peak);
  }
  const atrPct = price ? (atr[len - 1] / price) * 100 : 0;
  // OBV 能量潮 + 20 日均线：量能趋势与背离确认
  const obvArr = new Array(len).fill(0);
  for (let i = 1; i < len; i++) {
    if (close[i] > close[i - 1]) obvArr[i] = obvArr[i - 1] + vol[i];
    else if (close[i] < close[i - 1]) obvArr[i] = obvArr[i - 1] - vol[i];
    else obvArr[i] = obvArr[i - 1];
  }
  const obvMa = ma(obvArr, 20);
  const obvUp = obvArr[len - 1] > (obvMa[len - 1] || obvArr[len - 1]);
  // 近 20 日平均换手率（A 股特有，反映活跃度 / 筹码松动）+ 相对 60 日状态。
  // 统一用日 K 序列（dailyKlines）计算，避免周/月 K 视图下口径错乱。
  const turnSrc = dailyKlines && dailyKlines.length >= 20 ? dailyKlines : klines;
  const tLen = turnSrc.length;
  const turnWin = turnSrc.slice(Math.max(0, tLen - 20));
  const turnAvg = turnWin.reduce((a, k) => a + (k.turnover || 0), 0) / (turnWin.length || 1);
  const turn60 = turnSrc.slice(Math.max(0, tLen - 60)).reduce((a, k) => a + (k.turnover || 0), 0) / Math.min(60, tLen);
  let turnState = "正常";
  if (turn60 > 0 && turnAvg > turn60 * 1.8) turnState = "显著放量换手";
  else if (turn60 > 0 && turnAvg < turn60 * 0.6) turnState = "交投清淡";
  // OBV 与自身 20 日均线比较：上行=量能配合价格，下行=量能走弱（注意：并非严格「背离」，
  // 背离需价格与 OBV 反向，这里仅表达 OBV 相对自身均线的强弱）。
  const obvTrend = obvUp ? "量能配合(OBV上行)" : "量能走弱(OBV下行)";

  // 筹码分布 · 成本结构（CYQ）：用近 120 交易日的成交量做 Volume-Profile 近似，
  // 得到平均成本、密集峰、获利盘比例三个核心维度，是支撑/压力和主力行为的重要参考。
  // 样本不足时返回 null，由 UI 显示「暂无数据」。
  const chipR = klines.length >= 20 ? chip(klines, 120) : null;

  // 布林带宽挤压（Squeeze）检测：带宽收缩到近 120 日的 15% 分位以下，
  // 是布林带最有价值的信号之一——波动率压缩到极限后必然扩张，预示即将变盘。
  let bollSqueeze = false;
  let bollBwNow = 0;
  {
    const bw = bo.bandwidth;
    const lo = Math.max(0, bw.length - 120);
    const vals: number[] = [];
    for (let i = lo; i < bw.length; i++) {
      const v = bw[i];
      if (typeof v === "number" && isFinite(v)) vals.push(v);
    }
    if (vals.length >= 20) {
      const sorted = vals.slice().sort((a, b) => a - b);
      const p15 = sorted[Math.max(0, Math.floor(sorted.length * 0.15))];
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const last = vals[vals.length - 1];
      bollBwNow = p50 ? last / p50 : 1; // 相对中值位置：<0.6 偏窄, >1.6 偏宽
      bollSqueeze = last <= p15; // 处于近 120 日最窄 15%
    }
  }

  // ADX 趋势强度分级（业界通用阈值）
  const adxNow = adx[len - 1];
  const pdiNow = pDI[len - 1];
  const mdiNow = mDI[len - 1];
  let adxState = "";
  if (adxNow < 20) adxState = "无趋势";
  else if (adxNow < 25) adxState = "趋势初现";
  else if (adxNow < 40) adxState = "明显趋势";
  else adxState = "强趋势";

  const ma20_now = ma20[len - 1] as number;
  const ma20_prev = (ma20[len - 20] as number) || ma20_now;
  const slope = (ma20_now - ma20_prev) / ma20_prev;
  // ma60 仅在样本 >=60 时非空；样本不足时（如月/年 K 视图）其值为 null，
  // 若直接 `ma20 > ma60*1.5` 会因 JS 中 null*1.5===0 而误判（price>0 恒真）。
  // 故统一以「ma60 非空」为前置条件，样本不足时该配对不参与多空计数与减仓判定。
  const ma60Last = ma60[len - 1];
  const upCount =
    (ma5[len - 1]! > ma10[len - 1]! ? 1 : 0) +
    (ma10[len - 1]! > ma20[len - 1]! ? 1 : 0) +
    (ma60Last != null && ma20[len - 1]! > ma60Last ? 1 : 0);
  const downCount =
    (ma5[len - 1]! < ma10[len - 1]! ? 1 : 0) +
    (ma10[len - 1]! < ma20[len - 1]! ? 1 : 0) +
    (ma60Last != null && ma20[len - 1]! < ma60Last ? 1 : 0);
  const aboveMa20 = price > ma20[len - 1]!;
  const belowMa20 = price < ma20[len - 1]!;
  // 趋势判定统一走 judgeTrend（与宽基指数 / 行业板块同口径），避免三处各写一份、阈值与术语漂移。
  // 个股额外以「站上 MA20 且短均多头(extraUp) / 跌破 MA20 且短均空头(extraDown)」做次级确认，
  // 保留原 low-ADX regime 下对均线排列的敏感性；指数/板块不传该参数，仅看斜率。
  // judgeTrend 返回 { trend, text, strength }，这里把 text 重命名为 trendText 透传给上层（ReportView「趋势方向」）。
  const { trend, text: trendText, strength } = judgeTrend(
    adxNow, pdiNow, mdiNow, slope,
    aboveMa20 && upCount >= 1,
    belowMa20 && downCount >= 1
  );

  // 多头排列/空头排列取严格定义：MA5 > MA10 > MA20 > MA60（三个相邻配对同时满足），
  // 避免仅满足 2/3 时把「中长期仍为空头」误判为多头排列。
  const maState = upCount === 3 ? "多头排列" : downCount === 3 ? "空头排列" : "均线纠缠";

  // 分层支撑/压力引擎（与图表 StockChart 智能标注 100% 同源：同一套 findSwings/clusterSwings/scoreCluster/detectBandType/BAND_LABELS）。
  // 四维权重修正：量能 VMA20 / 筹码密集峰·成本重心 / DMI 趋势强度；箱体区间内统一 +4。
  const guard = resolvePeriodGuard(period ?? "d");
  const levelCtx: LevelCtx = {
    vma20Last: vma20[len - 1] ?? undefined,
    chipPeak: chipR?.peakPrice,
    chipAvg: chipR?.avgCost,
    adx: adx[len - 1] ?? undefined,
    pdi: pDI[len - 1] ?? undefined,
    mdi: mDI[len - 1] ?? undefined,
  };
  const priceLevels = computePriceLevels(klines, guard, levelCtx);

  // 主支撑/主压力：从分层结果中挑选「最强、未破位、位于现价同侧」的价位；缺失时回退近 60 日极值 + 箱体弱兜底。
  const supportCands = [priceLevels.structSupport, priceLevels.tradeSupportS]
    .filter((x): x is NonNullable<typeof x> => !!x && !x.isBroken)
    .filter((x) => x.price < price);
  const mainSupport = supportCands.length
    ? supportCands.slice().sort((a, b) => b.totalScore - a.totalScore || b.price - a.price)[0].price
    : priceLevels.boxBottom != null && priceLevels.boxBottom < price
      ? priceLevels.boxBottom
      : Math.min(...klines.slice(-60).map((k) => k.low));
  const resistCands = [priceLevels.structPressure, priceLevels.tradePressureB]
    .filter((x): x is NonNullable<typeof x> => !!x && !x.isBroken)
    .filter((x) => x.price > price);
  const mainResistance = resistCands.length
    ? resistCands.slice().sort((a, b) => b.totalScore - a.totalScore || a.price - b.price)[0].price
    : priceLevels.boxTop != null && priceLevels.boxTop > price
      ? priceLevels.boxTop
      : Math.max(...klines.slice(-60).map((k) => k.high));

  // 兼容旧字段：报告页 ReportView 仍读 a.support / a.resistance
  const support = mainSupport;
  const resistance = mainResistance;
  // 阶段高低区：以主支撑/主压力为锚（箱体区间内即取箱体上下沿）
  const bottomZone = mainSupport;
  const topZone = mainResistance;
  const distSup = (price - support) / price;
  const distRes = (resistance - price) / price;
  // nearTop 阈值 7%（原 4%）：A 股强势股常沿 5 日线运行，距高点 2-3% 是正常状态，
  // 4% 阈值导致主升浪中 reduce 恒为 true，过早提示减仓错过后续涨幅。放宽至 7%
  // 仅在真正接近阶段顶部时才预警。
  const nearBottom = price <= bottomZone * 1.05;
  const nearTop = price >= topZone * 0.93;
  const nearSup = distSup < 0.05;
  const nearRes = distRes < 0.05;

  const f5 = flowSumByDays(flowMap, 5);
  const f10 = flowSumByDays(flowMap, 10);
  const f20 = flowSumByDays(flowMap, 20);

  const volRatio = vma5[len - 1] && vma20[len - 1] ? (vma5[len - 1] as number) / (vma20[len - 1] as number) : 1;

  function cross(arrA: (number | null)[], arrB: (number | null)[], recent: number): "gold" | "dead" | null {
    for (let i = len - 1; i >= Math.max(1, len - recent); i--) {
      if (arrA[i - 1]! <= arrB[i - 1]! && arrA[i]! > arrB[i]!) return "gold";
      if (arrA[i - 1]! >= arrB[i - 1]! && arrA[i]! < arrB[i]!) return "dead";
    }
    return null;
  }
  const macdCross = cross(m.dif, m.dea, 8);
  const kdjCross = cross(kd.K, kd.D, 8);

  const kLast = kd.K[len - 1] as number;
  const jLast = kd.J[len - 1] as number;
  let kdjState = "中性";
  if (jLast > 100 || kLast > 80) kdjState = "超买";
  else if (jLast < 0 || kLast < 20) kdjState = "超卖";

  // rNow 兜底：若 K 线长度不足以计算 RSI(12)，r12[len-1] 为 null。
  // 用 50 (中性) 兜底，避免后续 toFixed / 数值比较报错；rsiValid 标记让 UI 显示"暂无数据"。
  const rNowRaw = r12[len - 1];
  const rsiValid = typeof rNowRaw === "number" && isFinite(rNowRaw);
  const rNow = rsiValid ? (rNowRaw as number) : 50;

  let stage: string;
  let stageText: string;
  let stageDetail: string;
  // 注：阶段判断基于价/量/资金的技术形态识别，仅描述「当前形态特征」，
  // 不确认背后是否存在真实的主力吸筹/派发行为（后者无法仅凭价量序列证明）。
  if (nearTop && (rNow > 72 || f10.sum < 0)) {
    stage = "dist";
    stageText = "高位滞涨";
    stageDetail = "价格接近阶段高位，且RSI偏高或近10日主力资金转为净流出，呈现量价背离的滞涨特征，需警惕回调。";
  } else if (nearBottom && f5.sum > 0 && rNow < 55 && volRatio > 0.85) {
    stage = "acc";
    stageText = "低位蓄势";
    stageDetail = "股价处于相对低位、近5日主力资金净流入、成交温和，呈现低位企稳蓄势的技术特征。";
  } else if (trend === "up" && volRatio > 1.1 && f5.sum > 0) {
    stage = "pull";
    stageText = "多头加速";
    stageDetail = "均线多头排列、放量上行、近5日主力净流入，处于趋势加速段，动能偏强。";
  } else if (trend === "down" && volRatio < 0.95) {
    stage = "wash";
    stageText = "弱势整理";
    stageDetail = "趋势偏弱、缩量调整，处于阴跌/弱势整理格局，建议观望等待企稳。";
  } else if (trend === "shake" || trend === "shake_up" || trend === "shake_down") {
    stage = "range";
    stageText = "区间震荡";
    stageDetail = "多空僵持、方向尚不明朗，建议等待放量突破或跌破关键位后再确认。";
  } else {
    stage = "mid";
    stageText = "趋势运行";
    stageDetail = "处于趋势中途，跟随均线持有、关注关键价位得失。";
  }

  // 综合评分 + 评分依据（结构化，便于报告展示「为什么这个分数」）
  const scoreReasons: { label: string; delta: number }[] = [];
  const addReason = (label: string, delta: number) => {
    if (delta !== 0) scoreReasons.push({ label, delta });
  };
  let score = 50;
  const trendDelta =
    trend === "up" ? 18 : trend === "shake_up" ? 8 : trend === "shake_down" ? -8 : trend === "down" ? -18 : 0;
  score += trendDelta;
  addReason(
    trend === "up" ? "多头趋势" : trend === "shake_up" ? "震荡偏强" : trend === "shake_down" ? "震荡偏弱" : trend === "down" ? "空头趋势" : "横向整理",
    trendDelta
  );
  // 位置因子：「价格相对 20 周期均线的偏离」做均值回归倾斜。
  // A 股主板有 ±10% 涨跌停（科创板 ±20%），15% 偏离在主板永远达不到，
  // 改为 8% 触发：偏离 >8% 视为超买回撤风险（轻微扣），<-8% 视为超卖反弹机会（轻微加）。
  const distMa20 = ma20_now ? (price - ma20_now) / ma20_now : 0;
  const posDelta = distMa20 > 0.08 ? -6 : distMa20 < -0.08 ? 6 : 0;
  score += posDelta;
  addReason(
    distMa20 > 0.08 ? "偏离均线偏高" : distMa20 < -0.08 ? "偏离均线偏低" : "均线附近",
    posDelta
  );
  // 资金流：从二元改进为分档——避免 0.01 亿与 50 亿同得 10 分。
  // 按 A 股主力净流入量级分 4 档（中小板到大盘股的日常成交规模覆盖）。
  let flowDelta = 0;
  let flowLabel = "资金无数据";
  if (f5.has) {
    const s = f5.sum;
    if (s > 5) { flowDelta = 12; flowLabel = "主力大幅净流入"; }
    else if (s > 0.5) { flowDelta = 8; flowLabel = "主力净流入"; }
    else if (s > 0) { flowDelta = 4; flowLabel = "主力微量流入"; }
    else if (s > -0.5) { flowDelta = -4; flowLabel = "主力微量流出"; }
    else if (s > -5) { flowDelta = -8; flowLabel = "主力净流出"; }
    else { flowDelta = -12; flowLabel = "主力大幅净流出"; }
  }
  score += flowDelta;
  addReason(flowLabel, flowDelta);
  // RSI：50 为多空平衡。原 30-55 给 +5 (含 30-50 偏弱区间) 过于乐观。
  // 拆成 4 档：<35 超卖反弹 +6, 35-50 中性偏弱 +2, 50-70 中性 0, 70-80 偏高 -6, >80 严重超买 -14。
  const rsiDelta = rNow < 35 ? 6 : rNow < 50 ? 2 : rNow <= 70 ? 0 : rNow <= 80 ? -6 : -14;
  score += rsiDelta;
  addReason(rNow > 80 ? "RSI超买" : rNow > 70 ? "RSI偏高" : rNow < 35 ? "RSI超卖" : rNow < 50 ? "RSI偏弱" : "RSI中性", rsiDelta);
  // MACD：除金叉/死叉（近期动量转折）外，加上 DIF 与 DEA 的静态状态（柱状图正负），
  // 避免一只强势股 MACD 红柱持续放大，只因金叉发生在 9 天前就得 0 分。
  const dif = m.dif[len - 1] as number;
  const dea = m.dea[len - 1] as number;
  const macdBar = dif - dea; // 柱状图值（注意：原始 MACD 定义是 (dif-dea)×2，这里符号判断即可）
  let macdDelta = 0;
  let macdReasonLabel = "MACD持平";
  if (macdCross === "gold") { macdDelta = 6; macdReasonLabel = "MACD金叉"; }
  else if (macdCross === "dead") { macdDelta = -6; macdReasonLabel = "MACD死叉"; }
  else if (dif > dea && macdBar > 0) { macdDelta = 3; macdReasonLabel = "MACD红柱放大"; }
  else if (dif > dea) { macdDelta = 2; macdReasonLabel = "MACD多头排列"; }
  else if (dif < dea && macdBar < 0) { macdDelta = -3; macdReasonLabel = "MACD绿柱放大"; }
  else if (dif < dea) { macdDelta = -2; macdReasonLabel = "MACD空头排列"; }
  score += macdDelta;
  addReason(macdReasonLabel, macdDelta);

  // ---------------- 乖离率 BIAS 评分（均值回归因子：价格偏离均线过远必然回归） ----------------
  // A 股有涨跌停限制，偏离度阈值与成熟市场不同；按三周期分档：
  //   · BIAS(12)  > 12% → 短期超买回撤压力（扣 3）
  //   · BIAS(12)  < -12% → 短期超卖反弹机会（加 3）
  //   · BIAS(24)  > 20% → 中期超买，主升浪末端风险（扣 5）
  //   · BIAS(24)  < -20% → 中期超卖，恐慌见底信号（加 5）
  {
    let biasDelta = 0;
    if (bias24 > 20) biasDelta = -5;
    else if (bias24 < -20) biasDelta = 5;
    else if (bias12 > 12) biasDelta = -3;
    else if (bias12 < -12) biasDelta = 3;
    const biasLabel =
      bias24 > 20 ? "BIAS(24)超买" :
      bias24 < -20 ? "BIAS(24)超卖" :
      bias12 > 12 ? "BIAS(12)超买" :
      bias12 < -12 ? "BIAS(12)超卖" : "乖离正常";
    score += biasDelta;
    addReason(biasLabel, biasDelta);
  }

  // ---------------- 筹码结构（CYQ）评分：成本分布是 A 股主力行为与支撑压力的核心参考 ----------------
  // 三大独立维度叠加，每项上限 ±5：
  //   · 获利盘：>85% 多数人浮盈易获利回吐（扣 5）；<20% 割肉盘出清抛压轻（加 5）
  //   · 相对密集峰：现价低于密集峰 >8% → 下方是成本密集区强支撑（加 3）；
  //                 现价高于密集峰 >8% → 上方是套牢密集区强压力（扣 3）；
  //   · 相对成本重心：高于成本重心（+8% 以上）扣 2；低于（-8% 以上）加 2
  if (chipR) {
    let chipDelta = 0;
    const chipLabels: string[] = [];
    const pr = chipR.profitRatio;
    if (pr > 0.85) { chipDelta -= 5; chipLabels.push("获利盘过高"); }
    else if (pr < 0.20) { chipDelta += 5; chipLabels.push("获利盘稀少"); }
    const distPeak = chipR.peakPrice ? (price - chipR.peakPrice) / chipR.peakPrice : 0;
    if (distPeak < -0.08) { chipDelta += 3; chipLabels.push("密集峰强支撑"); }
    else if (distPeak > 0.08) { chipDelta -= 3; chipLabels.push("密集峰强压力"); }
    const distAvg = chipR.avgCost ? (price - chipR.avgCost) / chipR.avgCost : 0;
    if (distAvg < -0.08) { chipDelta += 2; chipLabels.push("低于成本重心"); }
    else if (distAvg > 0.08) { chipDelta -= 2; chipLabels.push("高于成本重心"); }
    score += chipDelta;
    if (chipDelta !== 0) addReason(chipLabels.join("+") || "筹码结构中性", chipDelta);
  }

  // ---------------- 布林带宽挤压（Squeeze）：收缩极限后必扩张，提示变盘风险 ----------------
  // 挤压本身无方向性（既可能向上变盘也可能向下），不作为多空评分的加减项，
  // 但它是非常有价值的"即将波动"信号，直接加入 risks 和阶段描述。
  // 带宽极度扩张（bollBwNow > 2.2）意味着近期波动已经剧烈放大，后续收敛概率高，扣 2 分。
  if (bollBwNow > 2.2) {
    score -= 2;
    addReason("布林带宽极度扩张", -2);
  }
  score = Math.max(5, Math.min(95, Math.round(score)));

  // ---------------- 资讯情绪因子（协同参与综合评分） ----------------
  // 情绪分 -100~100 映射到 ±12 分：与趋势(±18)、资金(±10) 同量级，作为「协同因子」
  // 而非主导项，避免单条新闻左右结论；权重经词库分级 + 时效衰减已在 scoreNews 完成。
  let newsScore = 0;
  let newsLabel = "—";
  let newsBull = 0;
  let newsBear = 0;
  let newsCatalysts: string[] = [];
  let newsRisks: string[] = [];
  if (news && news.items.length) {
    newsScore = news.score;
    newsLabel = news.label;
    newsBull = news.bullItems;
    newsBear = news.bearItems;
    newsCatalysts = news.catalysts;
    newsRisks = news.risks;
    const newsDelta = Math.max(-12, Math.min(12, Math.round((news.score / 100) * 12)));
    score += newsDelta;
    addReason(
      news.label === "利好偏多" ? "资讯偏多" : news.label === "利空偏空" ? "资讯偏空" : "资讯中性",
      newsDelta
    );
  }

  score = Math.max(5, Math.min(95, Math.round(score)));
  scoreReasons.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  // 风险等级：综合技术评分、波动率(ATR%)、最大回撤与高位
  let riskLevel = score >= 70 ? "低" : score >= 45 ? "中" : "高";
  const elevatedVol = atrPct > 4; // 单日波动幅度偏大
  const deepDd = mdd > 0.35; // 近 120 日回撤超 35%
  if (elevatedVol || deepDd || nearTop) riskLevel = riskLevel === "低" ? "中" : riskLevel;
  if ((elevatedVol && deepDd) || (deepDd && nearTop)) riskLevel = riskLevel === "中" ? "高" : riskLevel;

  const watch = !(nearTop && rNow > 75) && trend !== "down";
  const build = (nearBottom || (trend === "up" && price <= ma20[len - 1]! * 1.02)) && rNow < 70 && !nearTop;
  const reduce = nearTop || rNow > 78 || (ma60Last != null && price > ma60Last * 1.5 && f10.sum < 0);
  // add 必须排除 reduce 条件（nearTop / RSI超买 / 远离MA60+资金流出），
  // 否则「可加仓」与「建议减仓」同时亮起，给用户矛盾信号。
  const add = !reduce && trend === "up" && Math.abs(price - ma20[len - 1]!) / ma20[len - 1]! < 0.03 && f5.sum > 0 && rNow < 75;

  // 买入区间仅在价格接近支撑（或距支撑 8% 内）时有意义；远离支撑的上涨趋势中
  // 给出围绕支撑的买点会误导，故置 NaN，由 UI 显示「—」。
  const nearBuyZone = nearSup || distSup < 0.08;
  const buyLow = nearBuyZone ? +(support * 0.985).toFixed(2) : NaN;
  const buyHigh = nearBuyZone
    ? +Math.max(buyLow + 0.01, Math.min(support * 1.03, resistance)).toFixed(2)
    : NaN;

  const risks: string[] = [];
  if (nearTop) risks.push(`当前价格接近阶段高位（约 ${topZone.toFixed(2)}），短期回调风险较大。`);
  if (rNow > 78) risks.push(`RSI(12) 已达 ${rNow.toFixed(2)}，进入超买区，追高需谨慎。`);
  if (macdCross === "dead") risks.push("MACD 近期出现死叉，短线动能转弱。");
  if (nearRes) risks.push(`上方压力位在 ${resistance.toFixed(2)} 附近，若无量能配合可能遇阻。`);
  if (trend === "down") risks.push("均线空头排列，整体处于下跌趋势，抄底需严格控制仓位。");
  if (Math.abs(bias6) > 10) risks.push(`短期乖离率 BIAS(6) 达 ${bias6.toFixed(2)}%，价格偏离短期均线过远，存在均值回归压力。`);
  if (elevatedVol) risks.push(`平均真实波幅(ATR)约 ${atrPct.toFixed(2)}%，日内波动偏大，需放宽止损空间。`);
  if (deepDd) risks.push(`近 120 日最大回撤达 ${(mdd * 100).toFixed(2)}%，历史持股体验波动剧烈。`);
  // 资讯面风险：把量化出的利空关键词作为消息面风险提示（最多取 2 条，避免淹没技术风险）
  for (const r of newsRisks.slice(0, 2)) risks.push("资讯面：" + r);
  // 筹码结构风险：获利盘过高 → 获利回吐压力；现价远高于密集峰 → 套牢盘密集抛压
  if (chipR) {
    if (chipR.profitRatio > 0.9) risks.push(`筹码获利盘高达 ${(chipR.profitRatio * 100).toFixed(0)}%，浮盈盘集中易引发获利回吐。`);
    if (chipR.peakPrice && price > chipR.peakPrice * 1.1) risks.push(`现价已远离筹码密集峰（${chipR.peakPrice.toFixed(2)}），上方套牢盘抛压逐步显现。`);
  }
  // 智能标注联动风险（与图表同源）：破位支撑 / 弱势支撑 / 放量压力
  if (priceLevels.structSupport?.isBroken || priceLevels.tradeSupportS?.isBroken) {
    risks.push("近期关键支撑位已被有效跌破（连续实体收盘击穿），原支撑转为压力，注意下行风险。");
  }
  if ((priceLevels.structSupport?.level === "弱" || priceLevels.tradeSupportS?.level === "弱") && trend === "down") {
    risks.push("当前支撑有效性偏弱且处于下跌趋势，反弹力度或有限，抄底需严格控制仓位。");
  }
  const volPressureDesc = (priceLevels.structPressure?.volDesc ?? "") + (priceLevels.tradePressureB?.volDesc ?? "");
  if (volPressureDesc.includes("放量")) {
    risks.push("上方压力位伴随放量，遇阻回落概率较高，突破需放量确认。");
  }
  // 中期乖离率超买：BIAS24 > 20% 已经是主升浪末端、非理性追涨区间，属于高风险信号
  if (bias24 > 20) risks.push(`中期乖离率 BIAS(24) 达 ${bias24.toFixed(2)}%，价格已严重偏离中长期均线，追高风险极大。`);
  // 布林带挤压：波动率压缩到极限，「即将变盘」本身是独立的风险（方向不明朗）
  if (bollSqueeze) risks.push("布林带进入极度收敛区间，波动率将向中枢回归，近期可能出现方向性选择，注意变盘风险。");
  if (reduce && risks.length === 0) risks.push("综合指标偏谨慎，建议以观望为主。");
  if (risks.length === 0) risks.push("暂无显著风险信号，但仍需关注量能与大盘环境。");

  let banner: string;
  let bannerCls = "";
  if (nearTop && rNow > 75) {
    banner = "⚠️ 近期涨幅较大，已进入高风险区域，注意回调风险。";
    bannerCls = "bad";
  } else if (nearBottom && f5.sum > 0) {
    banner = "✅ 当前价格接近阶段支撑区域，风险较低，可重点关注。";
  } else if (trend === "up" && f5.sum > 0) {
    banner = "🚀 近5日主力资金净流入，趋势偏强，可逢回调关注。";
  } else if (trend === "shake_up") {
    banner = "📈 价格震荡偏强，可逢回调（支撑位附近）关注。";
  } else if (trend === "shake_down") {
    banner = "📉 震荡偏弱，建议观望，等企稳再说。";
    bannerCls = "warn";
  } else if (trend === "shake") {
    banner = "⏸️ 当前处于震荡阶段，建议等待方向确认再动手。";
    bannerCls = "warn";
  } else if (trend === "down") {
    banner = "📉 当前处于下跌趋势，建议观望，不急于抄底。";
    bannerCls = "bad";
  } else {
    banner = "📈 价格站上短期均线，处于偏强运行阶段。";
  }
  // 布林带挤压（收敛）：波动率压缩到近 120 日 15% 分位以下，是独立的「即将变盘」信号，
  // 优先级高于常规趋势描述，直接覆盖 banner（若当前不是更高优先级的 bad）。
  if (bollSqueeze && bannerCls !== "bad") {
    banner = "⚡ 布林带极度收敛，近期将选择方向，关注量能配合再决定加减仓。";
    bannerCls = "warn";
  }
  // 资讯偏空（情绪分 ≤ -30）且当前横幅尚未标红时，以警示色提示消息面风险，
  // 让「重大利空新闻」能直接反映在顶部横幅，与技术风险形成合力提醒。
  if (news && news.score <= -30 && bannerCls !== "bad") {
    banner = "⚠️ 近期相关资讯偏空，注意消息面风险。";
    bannerCls = "warn";
  }

  // ---------------- 突破 / 跌破 判定 ----------------
  // 仅当支撑/压力来自明确的 pivot 拐点（非近60日极值兜底）才判定，
  // 避免创阶段新高/新低时把"极值"误判为被突破/跌破。
  // 量能确认：A 股假突破/假跌破频发，无量突破可靠性极低。
  //   · 突破要求 VMA5/VMA20 > 1.0（近期放量，确认资金真实参与）
  //   · 跌破要求 VMA5/VMA20 > 0.9（至少接近均量，排除无量假跌破）
  // 支撑/压力是否来自明确的 pivot 拐点（非近60日极值兜底 / 箱体兜底）。
  // 原 below/above（pivots() 产出）已随旧算法移除，改用同源 priceLevels 判定：
  // 仅当存在有效（未破位、同侧）的结构/交易线时，才视为来自真实拐点。
  const supportFromPivot = !!(
    (priceLevels.structSupport && !priceLevels.structSupport.isBroken && priceLevels.structSupport.price < price) ||
    (priceLevels.tradeSupportS && !priceLevels.tradeSupportS.isBroken && priceLevels.tradeSupportS.price < price)
  );
  const resistanceFromPivot = !!(
    (priceLevels.structPressure && !priceLevels.structPressure.isBroken && priceLevels.structPressure.price > price) ||
    (priceLevels.tradePressureB && !priceLevels.tradePressureB.isBroken && priceLevels.tradePressureB.price > price)
  );
  const breakdown = supportFromPivot && price < support * 0.985 && volRatio > 0.9;
  const breakout = resistanceFromPivot && price > resistance * 1.015 && volRatio > 1.0;

  // 走势预测（基于当前位置 + 趋势 + 量能的形态判断，非确定性预测）
  let sigType = "区间震荡";
  if (breakout) sigType = "突破上攻";
  else if (breakdown) sigType = "破位下行";
  else if (nearRes) sigType = "承压回落";
  else if (nearSup) sigType = "企稳反弹";
  else if (trend === "up") sigType = "震荡上行";
  else if (trend === "down") sigType = "震荡下行";

  // ---------------- 直白买卖信号（5 档）----------------
  // 整合：突破/跌破 + 临近关键位 + 趋势/动能/资金，给普通人一句话买卖参考。
  // 注意：这是技术形态信号，带「确认条件」，非保证、非投资建议。
  let signal: AnalysisResult["signal"];
  if (breakdown) {
    signal = {
      level: "sell",
      label: "卖点",
      text: "已跌破关键支撑，建议减仓回避",
      reason: `现价 ${price.toFixed(2)} 已跌破支撑 ${support.toFixed(2)}，技术形态转弱`,
      confirm: "若 3 日内不能收回支撑上方，下行空间进一步打开，应果断降低仓位",
    };
  } else if (breakout) {
    signal = {
      level: "buy",
      label: "买点",
      text: "已放量突破关键压力，可积极关注",
      reason: `现价 ${price.toFixed(2)} 已站上压力 ${resistance.toFixed(2)}，打开上行空间`,
      confirm: "回踩不破该压力位且量能维持，则确认有效突破，可顺势加仓",
    };
  } else if (nearRes && (rNow > 72 || macdCross === "dead" || reduce || (f10.has && f10.sum < 0))) {
    signal = {
      level: "sell",
      label: "卖点",
      text: "临近压力且动能转弱，注意逢高减仓",
      reason: `价格接近压力 ${resistance.toFixed(2)}，且出现${rNow > 72 ? "RSI超买" : macdCross === "dead" ? "MACD死叉" : "资金净流出"}等滞涨信号`,
      confirm: "若放量强势突破压力则转强可持有；否则易遇阻回落，应减仓",
    };
  } else if (nearSup && (rNow < 40 || macdCross === "gold" || build || (f5.has && f5.sum > 0))) {
    signal = {
      level: "buy",
      label: "买点",
      text: "临近支撑且出现企稳信号，可逢低关注",
      reason: `价格接近支撑 ${support.toFixed(2)}，且出现${rNow < 40 ? "RSI超卖" : macdCross === "gold" ? "MACD金叉" : "资金净流入"}等企稳信号`,
      confirm: "若放量站上支撑则确认止跌，可在买入区间内建仓；跌破则转弱观望",
    };
  } else if (trend === "up" && add) {
    signal = {
      level: "hold",
      label: "持有",
      text: "趋势向上，可持有跟随，回调即加仓点",
      reason: "均线多头排列 + 主力资金流入，动能未衰减",
      confirm: "跌破 MA20 或放量大阴线则警惕转弱，考虑减仓",
    };
  } else if (trend === "up" || trend === "shake_up") {
    signal = {
      level: "watch",
      label: "关注",
      text: "偏强运行，等待回调至支撑的更好买点",
      reason: "趋势偏强但尚未到理想介入位，追高性价比低",
      confirm: "回踩支撑企稳时介入更稳妥，避免追涨",
    };
  } else if (trend === "down") {
    signal = {
      level: "wait",
      label: "观望",
      text: "处于下跌趋势，暂不参与",
      reason: "均线空头排列，弱势未改",
      confirm: "放量站上 MA20 并企稳后再考虑介入",
    };
  } else {
    signal = {
      level: "wait",
      label: "观望",
      text: "多空僵持，等待方向明朗",
      reason: "区间震荡，支撑与压力均未有效突破",
      confirm: "放量突破压力或跌破支撑后，再顺势而为",
    };
  }

  // ---------------- 今日盘中走势（A 股特有：涨停/跌停/炸板实时反映当日异动）----------------
  // 涨跌停是 A 股最强的短线方向信号：封涨停=多头极强、封跌停=空头极强、
  // 炸板=多空分歧剧烈、跌停开板=恐慌释放。这些当日异动应直接覆盖短线操作建议。
  const intraday = detectLimitMove(klines, stockCode);
  let moveLabel = "";
  if (intraday.isLimitUp) moveLabel = "今日封涨停";
  else if (intraday.isBrokenLimitUp) moveLabel = "今日炸板";
  else if (intraday.isLimitDown) moveLabel = "今日封跌停";
  else if (intraday.isBrokenLimitDown) moveLabel = "今日跌停开板";
  else if (intraday.isBigUp) moveLabel = "今日大涨";
  else if (intraday.isBigDown) moveLabel = "今日大跌";

  // 涨跌停对综合评分的影响（短线极强的方向信号）：
  //   · 封涨停：多头极强，次日溢价概率高 → +10
  //   · 炸板：多空分歧剧烈，短期波动风险大 → -8
  //   · 封跌停：空头极强，次日继续下跌概率高 → -10
  //   · 跌停开板：恐慌释放，可能迎来反弹 → +4
  let intradayDelta = 0;
  let intradayReasonLabel = "";
  if (intraday.isLimitUp) { intradayDelta = 10; intradayReasonLabel = "封涨停（多头极强）"; }
  else if (intraday.isBrokenLimitUp) { intradayDelta = -8; intradayReasonLabel = "炸板（多空分歧）"; }
  else if (intraday.isLimitDown) { intradayDelta = -10; intradayReasonLabel = "封跌停（空头极强）"; }
  else if (intraday.isBrokenLimitDown) { intradayDelta = 4; intradayReasonLabel = "跌停开板（恐慌释放）"; }
  // 非极限的大幅异动：今日大涨/大跌是「当日实时动能」，中等权重计入评分
  // （不改变中期趋势判定，只对短线情绪做 ±3 微调）。
  if (intradayDelta === 0 && intraday.isBigUp) { intradayDelta = 3; intradayReasonLabel = "今日大涨（短线动能）"; }
  else if (intradayDelta === 0 && intraday.isBigDown) { intradayDelta = -3; intradayReasonLabel = "今日大跌（短线风险）"; }
  if (intradayDelta !== 0) {
    score = Math.max(5, Math.min(95, score + intradayDelta));
    addReason(intradayReasonLabel, intradayDelta);
  }

  // 涨跌停信号覆盖：极端盘中走势直接决定短线操作建议
  if (intraday.isLimitUp) {
    signal = {
      level: "hold",
      label: "持有",
      text: "今日封涨停，多头情绪极强，已持有者持有为主",
      reason: `收盘封涨停（+${(intraday.pct * 100).toFixed(2)}%），买盘远超卖盘`,
      confirm: "次日高开不破今日收盘价则强势延续；低开破板则及时止盈",
    };
  } else if (intraday.isLimitDown) {
    signal = {
      level: "sell",
      label: "卖点",
      text: "今日封跌停，空头情绪极强，建议减仓回避",
      reason: `收盘封跌停（${(intraday.pct * 100).toFixed(2)}%），卖盘远超买盘`,
      confirm: "次日撬板放量可考虑短线博反弹；继续一字跌停则观望",
    };
  } else if (intraday.isBrokenLimitUp) {
    signal = {
      level: "sell",
      label: "卖点",
      text: "今日炸板，多空分歧剧烈，注意波动风险",
      reason: `盘中触及涨停但未封住，收涨 ${(intraday.pct * 100).toFixed(2)}%，高位抛压显现`,
      confirm: "次日不能反包今日高点则转弱减仓；放量反包则重新走强",
    };
    risks.push("今日炸板（曾封涨停但打开），多空分歧剧烈，短期波动风险大。");
  } else if (intraday.isBrokenLimitDown) {
    signal = {
      level: "watch",
      label: "关注",
      text: "今日跌停开板，恐慌有所释放，关注是否企稳",
      reason: `盘中触及跌停但打开，收跌 ${(intraday.pct * 100).toFixed(2)}%，恐慌盘释放`,
      confirm: "次日缩量企稳可短线关注反弹；继续放量下跌则仍需回避",
    };
  }

  const intradayMove: AnalysisResult["intradayMove"] = {
    pct: intraday.pct,
    isLimitUp: intraday.isLimitUp,
    isLimitDown: intraday.isLimitDown,
    isBrokenLimitUp: intraday.isBrokenLimitUp,
    isBrokenLimitDown: intraday.isBrokenLimitDown,
    isBigUp: intraday.isBigUp,
    isBigDown: intraday.isBigDown,
    limitPct: intraday.limitPct,
    label: moveLabel,
  };

  // 把「中期趋势方向 × 今日异动 × 价格结构 × 量能 × DMI」合成为唯一定性结论。
  // 今日异动显著（≥±1%）且与中期趋势反向时才给定性（超跌反弹/修复企稳/反转信号/正常回踩/阶段调整/见顶信号），
  // 同向异动或小幅波动返回 ""（无歧义，不贴标签）。指数与行业板块共用，避免重复实现。
  // 趋势定性（共用）：个股 / 宽基指数 / 行业板块三处趋势判定原本各写一份，阈值与用词易漂移
  // （个股中性称「震荡整理」、指数/板块称「区间震荡」）。抽成单一 judgeTrend，确保同样的
  // ADX/DI/斜率永远得到同样的结论与术语，杜绝重复实现与术语不一致。
  //   · ADX<20             → 无趋势（方向看 MA20 斜率；可选 extraUp/extraDown 用均线多空做次级确认）
  //   · ADX≥25 且 +DI>-DI  → 有效上涨趋势；20≤ADX<25 → 震荡偏强（Wilder 标准，原 40 阈值过高会系统性低估动能）
  //   · ADX≥25 且 -DI>+DI  → 有效下跌趋势；20≤ADX<25 → 震荡偏弱
  type TrendKey = "up" | "down" | "shake_up" | "shake_down" | "shake";
  function judgeTrend(
    adx: number, pdi: number, mdi: number, slope: number,
    extraUp = false, extraDown = false
  ): { trend: TrendKey; text: string; strength: string } {
    if (adx < 20) {
      if (slope > 0.004 || extraUp) return { trend: "shake_up", text: "震荡偏强", strength: "中" };
      if (slope < -0.004 || extraDown) return { trend: "shake_down", text: "震荡偏弱", strength: "中" };
      return { trend: "shake", text: "区间震荡", strength: "中" };
    }
    if (pdi > mdi) {
      if (adx >= 25) return { trend: "up", text: "上涨趋势", strength: adx >= 40 ? "强" : "中" };
      return { trend: "shake_up", text: "震荡偏强", strength: "偏强" };
    }
    if (adx >= 25) return { trend: "down", text: "下跌趋势", strength: adx >= 40 ? "弱" : "中" };
    return { trend: "shake_down", text: "震荡偏弱", strength: "偏弱" };
  }

  function judgeTodayMove(opts: {
    closeNow: number; ma20Now: number; ma5Now: number; slope: number;
    volRatio: number; pdi: number; mdi: number; todayPct: number; dir: "up" | "down";
  }): { judge: string; basis: string } {
    if (Math.abs(opts.todayPct) < 1) return { judge: "", basis: "" };
    // 同向异动无歧义，不贴标签（今日涨且中期涨 / 今日跌且中期跌 → 直接用中期趋势结论）
    if ((opts.dir === "up" && opts.todayPct > 0) || (opts.dir === "down" && opts.todayPct < 0)) {
      return { judge: "", basis: "" };
    }
    let struct = 0;
    const basis: string[] = [];
    if (opts.ma20Now && opts.closeNow >= opts.ma20Now) { struct += 2; basis.push("站上20日线"); }
    else { struct -= 2; basis.push("20日线下方"); }
    if (opts.ma5Now && opts.closeNow >= opts.ma5Now) struct += 1; else struct -= 1;
    if (opts.slope > 0.001) { struct += 2; basis.push("MA20走平上拐"); }
    else if (opts.slope < -0.004) { struct -= 2; basis.push("MA20仍下行"); }
    if (opts.volRatio >= 1.3) { struct += 1; basis.push("放量"); }
    else if (opts.volRatio < 0.7) { struct -= 1; basis.push("缩量"); }
    if (opts.pdi > opts.mdi) { struct += 2; basis.push("DMI转多"); }
    else if (opts.mdi > opts.pdi) { struct -= 2; basis.push("DMI偏空"); }
    const judge = opts.dir === "down"
      ? (struct >= 4 ? "反转信号" : struct >= 1 ? "修复企稳" : "超跌反弹")
      : (struct <= -4 ? "见顶信号" : struct <= -1 ? "阶段调整" : "正常回踩");
    return { judge, basis: basis.join("，") };
  }

  // ---------------- 大盘 · 市场环境（beta 感知：同向协同/逆势过滤） ----------------
  // A 股个股与大盘相关性极高：大盘下跌中任何个股买入信号胜率显著下降。
  // 提供接口则叠加协同分（±6）+ 市场情绪分（±5）；未提供时走「暂无数据」占位对象，不影响既有评分。
  let marketEnv: AnalysisResult["marketEnv"];
  if (market && market.indexKlines && market.indexKlines.length >= 30) {
    // 大盘指数「今日」实时涨跌幅（与中期趋势配合）：日K/MA20/DMI 给出「中期趋势」，
    // 今天实际涨跌是「实时动能」。两者结合由 judgeTodayMove + indexTrendDisplay 合成单一清晰结论，
    // 既不因单日波动推翻趋势，也不无视今日动能，且报告只输出唯一方向、不叠加矛盾表述。
    const idxTodayPct =
      market.indexRealtime && market.indexRealtime.preClose > 0
        ? ((market.indexRealtime.price - market.indexRealtime.preClose) / market.indexRealtime.preClose) * 100
        : null;
    // 今日实时动能 → 文字 + 评分微调：指数单日 ±1% 视为有意义波动，±2% 以上视为大涨/大跌。
    // 只做短线情绪微调（±2），不覆盖中期趋势，避免单日噪声推倒 DMI 趋势判定。
    let idxTodayScore = 0;
    let indexTodayText = "今日暂无";
    if (idxTodayPct != null) {
      // 标签只输出结论性文字，不展示涨跌幅数值（该数值为指数口径、非个股数据）
      indexTodayText = idxTodayPct >= 0 ? "大盘今日走强" : "大盘今日走弱";
      if (idxTodayPct >= 2) idxTodayScore = 2;
      else if (idxTodayPct >= 1) idxTodayScore = 1;
      else if (idxTodayPct <= -2) idxTodayScore = -2;
      else if (idxTodayPct <= -1) idxTodayScore = -1;
    }
    const idxClose = market.indexKlines.map((k) => k.close);
    const idxMa20 = ma(idxClose, 20);
    const idxMa5 = ma(idxClose, 5);
    const idxLen = market.indexKlines.length;
    const idxMa20Now = idxMa20[idxLen - 1] as number;
    const idxMa20Prev = (idxMa20[Math.max(0, idxLen - 21)] as number) || idxMa20Now;
    const idxSlope = idxMa20Now ? (idxMa20Now - idxMa20Prev) / idxMa20Prev : 0;
    const idxHigh = market.indexKlines.map((k) => k.high);
    const idxLow = market.indexKlines.map((k) => k.low);
    const idx = dmi(idxHigh, idxLow, idxClose, 14);
    const idxAdx = idx.adx[idxLen - 1];
    const idxPdi = idx.pDI[idxLen - 1];
    const idxMdi = idx.mDI[idxLen - 1];
    const idxTrend = judgeTrend(idxAdx, idxPdi, idxMdi, idxSlope).text;
    // 同向协同（方向一致的确认关系，作用于「多空方向的可靠度」）：
    // 个股 up + 大盘上涨 → 多头得到环境确认 +6；个股 up + 大盘下跌 → 逆势 -6。
    // 个股 down + 大盘下跌 → 弱势得到环境确认，进一步压低买点评分 -6（此前错加 +6，
    // 会把「弱市中的弱势股」评分抬高，与「不抄底」的警示自相矛盾）；个股 down + 大盘
    // 上涨 → 相对弱势 -4。
    let alignScore = 0;
    let alignText = "与大盘方向一致";
    const stockUp = trend === "up" || trend === "shake_up";
    const stockDown = trend === "down" || trend === "shake_down";
    const marketUp = idxTrend === "上涨趋势" || idxTrend === "震荡偏强";
    const marketDown = idxTrend === "下跌趋势" || idxTrend === "震荡偏弱";
    if (stockUp && marketUp) { alignScore = 6; alignText = "顺大盘上涨，氛围支撑做多"; }
    else if (stockUp && marketDown) { alignScore = -6; alignText = "逆势上涨，需警惕补跌风险"; }
    else if (stockDown && marketDown) { alignScore = -6; alignText = "顺大盘下跌，弱势确认，不宜抄底"; }
    else if (stockDown && marketUp) { alignScore = -4; alignText = "大盘偏强而个股走弱，属相对弱势"; }
    // 市场情绪（涨跌家数 + 涨停/跌停比）映射 ±5 分
    let breadthScore = 0;
    let breadthText = "暂无数据";
    if (market.upCount != null && market.downCount != null) {
      const total = market.upCount + market.downCount || 1;
      const upRatio = market.upCount / total;
      if (upRatio > 0.7) { breadthScore = 5; breadthText = "普涨行情，情绪偏多"; }
      else if (upRatio > 0.55) { breadthScore = 3; breadthText = "涨多跌少，情绪尚可"; }
      else if (upRatio < 0.3) { breadthScore = -5; breadthText = "普跌行情，情绪低迷"; }
      else if (upRatio < 0.45) { breadthScore = -3; breadthText = "跌多跌少，情绪偏弱"; }
      else { breadthScore = 0; breadthText = "涨跌参半，情绪中性"; }
    }
    // 大盘量能：VMA5/VMA20。<0.7 缩量（上涨无量存疑/下跌抛压减弱），
    // >1.3 放量（上涨量价配合/下跌恐慌蔓延）。结合大盘趋势方向打分。
    const idxVol = market.indexKlines.map((k) => k.vol);
    const idxVma5 = ma(idxVol, 5);
    const idxVma20 = ma(idxVol, 20);
    const idxVolRatio =
      idxVma5[idxLen - 1] && idxVma20[idxLen - 1]
        ? (idxVma5[idxLen - 1] as number) / (idxVma20[idxLen - 1] as number)
        : 1;
    let mktVolText = "量能正常";
    let volScore = 0;
    if (idxVolRatio < 0.7) {
      mktVolText = "大盘缩量";
      // 缩量 + 上涨：量价背离，上涨持续性存疑 → 扣分
      // 缩量 + 下跌：抛压减弱，下跌动能衰减 → 轻微加分
      if (marketUp) volScore = -3;
      else if (marketDown) volScore = 2;
    } else if (idxVolRatio > 1.3) {
      mktVolText = "大盘放量";
      // 放量 + 上涨：量价配合，资金真实参与 → 加分
      // 放量 + 下跌：恐慌蔓延，跌势加速 → 扣分
      if (marketUp) volScore = 3;
      else if (marketDown) volScore = -3;
    }

    // 大盘「今日实时动能」定性判定：把「中期趋势 × 今日异动 × 价格结构 × 量能 × DMI」
    // 合成为唯一定性结论（judgeTodayMove），再与中期趋势合并为 indexTrendDisplay——
    // 报告只展示 indexTrendDisplay（如「超跌反弹」「反转信号」），不再叠加「下跌趋势」造成歧义。
    let indexMoveJudge = "";
    let indexMoveBasis = "";
    const idxCloseNow = idxClose[idxLen - 1];
    const idxMa5Now = (idxMa5[idxLen - 1] as number) || idxCloseNow;
    const idxDir: "up" | "down" | "" = marketUp ? "up" : marketDown ? "down" : "";
    if (idxTodayPct != null && idxDir) {
      const r = judgeTodayMove({
        closeNow: idxCloseNow, ma20Now: idxMa20Now, ma5Now: idxMa5Now, slope: idxSlope,
        volRatio: idxVolRatio, pdi: idxPdi, mdi: idxMdi, todayPct: idxTodayPct, dir: idxDir,
      });
      indexMoveJudge = r.judge;
      indexMoveBasis = r.basis;
    }
    // 合成唯一结论：有冲突定性时用定性结论，否则用中期趋势（杜绝「下跌趋势 · 超跌反弹」方向矛盾叠加）
    const indexTrendDisplay = indexMoveJudge || idxTrend;

    // 行业板块维度：个股所属行业指数趋势 + 个股与行业协同（±4）。
    // 与宽基指数同理，但更贴近个股自身 beta——兆易创新涨而半导体板块跌，说明是个股独立行情，
    // 结论与量化依据需把「行业逆风」考虑进去，避免只看大盘误判。
    let sectorName: string | undefined;
    let sectorTrend: string | undefined;
    let sectorTrendDisplay: string | undefined;
    let sectorMoveJudge = "";
    let sectorMoveBasis = "";
    let sectorAlignScore = 0;
    let sectorAlignText = "";
    const sector = market.sector;
    if (sector && sector.klines && sector.klines.length >= 30) {
      sectorName = sector.name;
      const sClose = sector.klines.map((k) => k.close);
      const sMa20 = ma(sClose, 20);
      const sMa5 = ma(sClose, 5);
      const sLen = sClose.length;
      const sMaNow = sMa20[sLen - 1] as number;
      const sMaPrev = (sMa20[Math.max(0, sLen - 21)] as number) || sMaNow;
      const sSlope = sMaNow ? (sMaNow - sMaPrev) / sMaNow : 0;
      const sHigh = sector.klines.map((k) => k.high);
      const sLow = sector.klines.map((k) => k.low);
      const s = dmi(sHigh, sLow, sClose, 14);
      const sAdx = s.adx[sLen - 1];
      const sPdi = s.pDI[sLen - 1];
      const sMdi = s.mDI[sLen - 1];
      sectorTrend = judgeTrend(sAdx, sPdi, sMdi, sSlope).text;
      const sUp = sectorTrend === "上涨趋势" || sectorTrend === "震荡偏强";
      const sDown = sectorTrend === "下跌趋势" || sectorTrend === "震荡偏弱";
      // 行业今日实时动能定性（与宽基指数同口径 judgeTodayMove）：结合行业指数今日涨跌幅 + 中期趋势
      // 合成唯一结论 sectorTrendDisplay，报告只展示该结论，避免方向与大盘同样的矛盾叠加。
      const sVol = sector.klines.map((k) => k.vol);
      const sVma5 = ma(sVol, 5);
      const sVma20 = ma(sVol, 20);
      const sVolRatio =
        sVma5[sLen - 1] && sVma20[sLen - 1]
          ? (sVma5[sLen - 1] as number) / (sVma20[sLen - 1] as number)
          : 1;
      const sCloseNow = sClose[sLen - 1];
      const sMa5Now = (sMa5[sLen - 1] as number) || sCloseNow;
      const sTodayPct = sector.realtime && sector.realtime.preClose > 0
        ? ((sector.realtime.price - sector.realtime.preClose) / sector.realtime.preClose) * 100
        : null;
      const sDir: "up" | "down" | "" = sUp ? "up" : sDown ? "down" : "";
      if (sTodayPct != null && sDir) {
        const r = judgeTodayMove({
          closeNow: sCloseNow, ma20Now: sMaNow, ma5Now: sMa5Now, slope: sSlope,
          volRatio: sVolRatio, pdi: sPdi, mdi: sMdi, todayPct: sTodayPct, dir: sDir,
        });
        sectorMoveJudge = r.judge;
        sectorMoveBasis = r.basis;
      }
      sectorTrendDisplay = sectorMoveJudge || sectorTrend;
      if (stockUp && sUp) { sectorAlignScore = 4; sectorAlignText = "顺行业上涨，板块共振做多"; }
      else if (stockDown && sDown) { sectorAlignScore = -4; sectorAlignText = "顺行业下跌，板块弱势确认"; }
      else if (stockUp && sDown) { sectorAlignScore = -4; sectorAlignText = "逆行业上涨，板块逆风需警惕"; }
      else if (stockDown && sUp) { sectorAlignScore = -4; sectorAlignText = "逆行业回调，板块企稳或率先反弹"; }
    }

    // 仓位建议：由大盘趋势 + 市场情绪 + 行业协同综合推导，服务于量化仓位调控。
    // 大盘/行业环境决定可承担的风险敞口——这是「大盘趋势对仓位调控的影响」的落地点。
    let positionAdvice = "";
    let positionPct = 0;
    let positionBasis = "";
    if (idxTrend === "下跌趋势" || breadthScore <= -3) {
      positionPct = 20;
      positionAdvice = "建议轻仓避险（≤20%）";
      positionBasis = "大盘下跌趋势 / 市场情绪低迷，系统性风险偏高";
    } else if (sectorAlignScore <= -4) {
      positionPct = 30;
      positionAdvice = "建议控仓（≤30%）";
      positionBasis = "个股与所属行业逆风，板块 beta 不利";
    } else if (idxTrend === "上涨趋势" && breadthScore >= 3 && sectorAlignScore >= 4) {
      positionPct = 70;
      positionAdvice = "可积极配置（60%–80%）";
      positionBasis = "大盘上行 + 情绪偏多 + 行业共振，顺势环境";
    } else if (idxTrend === "上涨趋势" || (breadthScore >= 3 && sectorAlignScore >= 0)) {
      positionPct = 55;
      positionAdvice = "可适度加仓（50%–60%）";
      positionBasis = "大盘偏强、情绪尚可，顺势但需留有余地";
    } else {
      positionPct = 40;
      positionAdvice = "建议中性仓位（30%–50%）";
      positionBasis = "大盘区间震荡、情绪中性，等待方向确认";
      // 中性环境下用「今日实时动能」微调风险敞口：今日大涨可稍积极、今日大跌应更谨慎
      if (idxTodayScore >= 2) {
        positionPct = 45;
        positionAdvice = "建议中性偏积极（40%–50%）";
        positionBasis = "大盘区间震荡，但今日走强，可稍偏积极";
      } else if (idxTodayScore <= -2) {
        positionPct = 30;
        positionAdvice = "建议谨慎控仓（≤30%）";
        positionBasis = "大盘区间震荡，今日走弱，短线宜谨慎";
      }
    }

    score = Math.max(5, Math.min(95, score + alignScore + breadthScore + volScore + sectorAlignScore + idxTodayScore));
    if (alignScore !== 0) addReason("大盘" + idxTrend + (alignScore > 0 ? "：协同加分" : "：逆势扣分"), alignScore);
    if (idxTodayScore !== 0) addReason(indexTodayText + (indexMoveJudge ? "（" + indexMoveJudge + "）" : ""), idxTodayScore);
    if (breadthScore !== 0) addReason(breadthText, breadthScore);
    if (volScore !== 0) addReason(mktVolText + (volScore > 0 ? "：量能配合" : "：量能背离"), volScore);
    if (sectorAlignScore !== 0) addReason((sectorName || "行业") + sectorAlignText, sectorAlignScore);
    marketEnv = {
      indexName: market.indexName,
      indexTrend: idxTrend,
      indexTrendDisplay,
      indexTodayPct: idxTodayPct,
      indexMoveJudge,
      indexMoveBasis,
      indexAdx: idxAdx,
      alignScore,
      alignText,
      breadthScore,
      breadthText,
      mktVolText,
      idxVolRatio,
      sectorName,
      sectorTrend,
      sectorTrendDisplay,
      sectorMoveJudge,
      sectorMoveBasis,
      sectorAlignScore,
      sectorAlignText,
      positionAdvice,
      positionPct,
      positionBasis,
    };
    // 市场环境极差时直接升级风险等级（大盘下跌趋势 或 市场情绪低迷 或 行业逆风）
    if (idxTrend === "下跌趋势" || breadthScore <= -3 || sectorAlignScore <= -4) riskLevel = riskLevel === "低" ? "中" : riskLevel === "中" ? "高" : riskLevel;
  } else {
    // 指数K线缺失（取数失败/不足30根/港股等跳过）：优雅降级，整张卡片仍渲染，
    // 缺失维度显示「暂无数据」，不再因上游一次取数失败就把整个板块被 v-if 抹掉（request B-2 暂无数据统一）。
    marketEnv = {
      indexName: market?.indexName || "大盘",
      indexTrend: "暂无数据",
      indexTrendDisplay: "暂无数据",
      indexTodayPct: null,
      indexMoveJudge: "",
      indexMoveBasis: "",
      indexAdx: 0,
      alignScore: 0,
      alignText: "暂无数据",
      breadthScore: 0,
      breadthText: "暂无数据",
      mktVolText: "暂无数据",
      idxVolRatio: 0,
      sectorName: undefined,
      sectorTrend: undefined,
      sectorTrendDisplay: undefined,
      sectorMoveJudge: "",
      sectorMoveBasis: "",
      sectorAlignScore: 0,
      sectorAlignText: "",
      positionAdvice: "暂无数据",
      positionPct: 0,
      positionBasis: "",
    };
  }

  return {
    price,
    last,
    ma5,
    ma10,
    ma20,
    ma60,
    vol,
    vma5,
    vma20,
    macd: m,
    kd,
    r6,
    r12,
    r24,
    trend,
    trendText,
    strength,
    maState,
    support,
    resistance,
    priceLevels,
    mainSupport,
    mainResistance,
    bottomZone,
    topZone,
    distSup,
    distRes,
    nearBottom,
    nearTop,
    nearSup,
    nearRes,
    f5,
    f10,
    f20,
    volRatio,
    macdCross,
    kdjCross,
    kdjState,
    rNow,
    rsiValid,
    scoreReasons,
    stage,
    stageText,
    stageDetail,
    score,
    riskLevel,
    watch,
    build,
    add,
    reduce,
    buyLow,
    buyHigh,
    risks,
    banner,
    bannerCls,
    adx,
    pDI,
    mDI,
    atr,
    adxState,
    bollMid: bo.mid,
    bollUpper: bo.upper,
    bollLower: bo.lower,
    bollPctB: bo.pctB,
    bollBw: bo.bandwidth,
    bollBwNow,
    bollSqueeze,
    bias6,
    bias12,
    bias24,
    volAnn,
    maxDrawdown: mdd,
    atrPct,
    obvTrend,
    turnAvg,
    turnState,
    chip: chipR,
    breakout,
    breakdown,
    sigType,
    signal,
    newsScore,
    newsLabel,
    newsBull,
    newsBear,
    newsCatalysts,
    newsRisks,
    marketEnv,
    intradayMove,
  };
}

export function computeChip(klines: Kline[], winDays = 120): ChipResult {
  return chip(klines, winDays);
}
