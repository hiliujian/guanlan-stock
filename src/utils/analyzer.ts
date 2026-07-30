// =====================================================================
// 分析引擎（纯函数，跨端通用，无任何 DOM / 平台依赖）
// 指标计算 + 综合研判 + 白话报告所需的全部数据结构
// =====================================================================
import type { Kline, Trend } from "./period";
import { UP, DOWN } from "./colors";

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
function pivots(klines: Kline[], win: number, lookback: number) {
  const n = klines.length;
  const start = Math.max(0, n - lookback);
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = start + win; i < n - win; i++) {
    let isH = true;
    let isL = true;
    for (let j = i - win; j <= i + win; j++) {
      if (klines[j].high > klines[i].high) isH = false;
      if (klines[j].low < klines[i].low) isL = false;
    }
    if (isH) highs.push(klines[i].high);
    if (isL) lows.push(klines[i].low);
  }
  return { highs, lows };
}
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
  return { cats, vals, colors, avgCost, peakPrice, profitRatio, cur, minP, maxP };
}

// ---------------- 主分析 ----------------
export interface FlowSummary {
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
  bias6: number;
  bias12: number;
  bias24: number;
  volAnn: number;
  maxDrawdown: number;
  atrPct: number;
  obvTrend: string;
  turnAvg: number;
  turnState: string;
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

export function analyze(klines: Kline[], flowMap: Record<string, number> = {}): AnalysisResult {
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
  // 年化波动率（近 120 日对数/简单收益 std × √252）
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
  // 近 20 日平均换手率（A 股特有，反映活跃度 / 筹码松动）+ 相对 60 日状态
  const turnWin = klines.slice(Math.max(0, len - 20));
  const turnAvg = turnWin.reduce((a, k) => a + (k.turnover || 0), 0) / (turnWin.length || 1);
  const turn60 = klines.slice(Math.max(0, len - 60)).reduce((a, k) => a + (k.turnover || 0), 0) / Math.min(60, len);
  let turnState = "正常";
  if (turn60 > 0 && turnAvg > turn60 * 1.8) turnState = "显著放量换手";
  else if (turn60 > 0 && turnAvg < turn60 * 0.6) turnState = "交投清淡";
  const obvTrend = obvUp ? "量能配合(OBV多头)" : "量能背离(OBV空头)";

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
  const upCount =
    (ma5[len - 1]! > ma10[len - 1]! ? 1 : 0) +
    (ma10[len - 1]! > ma20[len - 1]! ? 1 : 0) +
    (ma20[len - 1]! > ma60[len - 1]! ? 1 : 0);
  const downCount =
    (ma5[len - 1]! < ma10[len - 1]! ? 1 : 0) +
    (ma10[len - 1]! < ma20[len - 1]! ? 1 : 0) +
    (ma20[len - 1]! < ma60[len - 1]! ? 1 : 0);
  const aboveMa20 = price > ma20[len - 1]!;
  const belowMa20 = price < ma20[len - 1]!;
  let trend: string;
  let trendText: string;
  let strength: string;
  // 趋势判定以 ADX（趋势强度）为准：ADX<20 视为无趋势（震荡，方向仅看短均线斜率），
  // ADX≥25 视为有效趋势，方向由 +DI/-DI 决定；ADX≥40 为强趋势。
  if (adxNow < 20) {
    if (slope > 0.004 || (aboveMa20 && upCount >= 1)) {
      trend = "shake_up"; trendText = "震荡偏强"; strength = "中";
    } else if (slope < -0.004 || (belowMa20 && downCount >= 1)) {
      trend = "shake_down"; trendText = "震荡偏弱"; strength = "中";
    } else {
      trend = "shake"; trendText = "震荡整理"; strength = "中";
    }
  } else if (pdiNow > mdiNow) {
    if (adxNow >= 40) { trend = "up"; trendText = "上涨趋势"; strength = "强"; }
    else { trend = "shake_up"; trendText = "震荡偏强"; strength = "偏强"; }
  } else {
    if (adxNow >= 40) { trend = "down"; trendText = "下跌趋势"; strength = "弱"; }
    else { trend = "shake_down"; trendText = "震荡偏弱"; strength = "偏弱"; }
  }

  const maState = upCount >= 2 ? "多头排列" : downCount >= 2 ? "空头排列" : "均线纠缠";

  const pv = pivots(klines, 5, 90);
  const below = pv.lows.filter((p) => p < price).sort((a, b) => b - a);
  const above = pv.highs.filter((p) => p > price).sort((a, b) => a - b);
  const support = below.length ? below[0] : Math.min(...klines.slice(-60).map((k) => k.low));
  const resistance = above.length ? above[0] : Math.max(...klines.slice(-60).map((k) => k.high));
  const pv120 = pivots(klines, 6, 120);
  const bottomZone = pv120.lows.length ? Math.min(...pv120.lows) : support;
  const topZone = pv120.highs.length ? Math.max(...pv120.highs) : resistance;
  const distSup = (price - support) / price;
  const distRes = (resistance - price) / price;
  const nearBottom = price <= bottomZone * 1.05;
  const nearTop = price >= topZone * 0.96;
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

  const rNow = r12[len - 1] as number;

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
  // 位置因子：改用「价格相对 20 周期均线的偏离」做均值回归倾斜，
  // 取代旧逻辑用 120 日极点（nearTop/nearBottom）——后者会让创新高的强势股恒为
  // nearTop 而被固定扣分，对趋势跟随不公平。偏离 >15% 视为超买回撤风险（轻微扣），
  // <-15% 视为超卖反弹机会（轻微加），否则中性。
  const distMa20 = ma20_now ? (price - ma20_now) / ma20_now : 0;
  const posDelta = distMa20 > 0.15 ? -6 : distMa20 < -0.15 ? 6 : 0;
  score += posDelta;
  addReason(
    distMa20 > 0.15 ? "偏离均线偏高" : distMa20 < -0.15 ? "偏离均线偏低" : "均线附近",
    posDelta
  );
  const flowDelta = f5.sum > 0 ? 10 : f5.has && f5.sum < 0 ? -10 : 0;
  score += flowDelta;
  addReason(f5.has ? (f5.sum > 0 ? "主力净流入" : "主力净流出") : "资金无数据", flowDelta);
  const rsiDelta = rNow < 30 ? 8 : rNow >= 30 && rNow <= 55 ? 5 : rNow > 70 && rNow <= 80 ? -8 : rNow > 80 ? -15 : 0;
  score += rsiDelta;
  addReason(rNow > 80 ? "RSI超买" : rNow < 30 ? "RSI超卖" : rNow > 70 ? "RSI偏高" : "RSI中性", rsiDelta);
  const macdDelta = macdCross === "gold" ? 6 : macdCross === "dead" ? -6 : 0;
  score += macdDelta;
  addReason(macdCross === "gold" ? "MACD金叉" : macdCross === "dead" ? "MACD死叉" : "MACD持平", macdDelta);
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
  const add = trend === "up" && Math.abs(price - ma20[len - 1]!) / ma20[len - 1]! < 0.03 && f5.sum > 0 && rNow < 75;
  const reduce = nearTop || rNow > 78 || (price > ma60[len - 1]! * 1.5 && f10.sum < 0);

  // 买入区间仅在价格接近支撑（或距支撑 8% 内）时有意义；远离支撑的上涨趋势中
  // 给出围绕支撑的买点会误导，故置 NaN，由 UI 显示「—」。
  const nearBuyZone = nearSup || distSup < 0.08;
  const buyLow = nearBuyZone ? +(support * 0.985).toFixed(2) : NaN;
  const buyHigh = nearBuyZone
    ? +Math.max(buyLow + 0.01, Math.min(support * 1.03, resistance)).toFixed(2)
    : NaN;

  const risks: string[] = [];
  if (nearTop) risks.push(`当前价格接近阶段高位（约 ${topZone.toFixed(2)}），短期回调风险较大。`);
  if (rNow > 78) risks.push(`RSI(12) 已达 ${rNow.toFixed(0)}，进入超买区，追高需谨慎。`);
  if (macdCross === "dead") risks.push("MACD 近期出现死叉，短线动能转弱。");
  if (nearRes) risks.push(`上方压力位在 ${resistance.toFixed(2)} 附近，若无量能配合可能遇阻。`);
  if (trend === "down") risks.push("均线空头排列，整体处于下跌趋势，抄底需严格控制仓位。");
  if (Math.abs(bias6) > 10) risks.push(`短期乖离率 BIAS(6) 达 ${bias6.toFixed(1)}%，价格偏离短期均线过远，存在均值回归压力。`);
  if (elevatedVol) risks.push(`平均真实波幅(ATR)约 ${atrPct.toFixed(1)}%，日内波动偏大，需放宽止损空间。`);
  if (deepDd) risks.push(`近 120 日最大回撤达 ${(mdd * 100).toFixed(0)}%，历史持股体验波动剧烈。`);
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
    bias6,
    bias12,
    bias24,
    volAnn,
    maxDrawdown: mdd,
    atrPct,
    obvTrend,
    turnAvg,
    turnState,
  };
}

export function computeChip(klines: Kline[], winDays = 120): ChipResult {
  return chip(klines, winDays);
}
