// ============================================================================
// 分析报告算法·历史回测（walk-forward）
//
// 方法：对每只股票取约 2 年日 K（fetchAny 与 App 同链路），从第 80 根起每 5 根
// 设一个「切点 T」（保证 5 日前瞻窗口不重叠）：截断序列到 T，跑真实 analyze()
// 得到当时的分析报告，再用 T+1..T+H 的真实走势逐项核验报告的可检验断言：
//   1) 支撑位（mainSupport，仅统计报告认为有效 !breakdown 的切点）
//      · 失守率：H 日内出现实体收盘 < 支撑×0.998（与算法自身破位口径同源）
//      · 触碰反弹率：触碰支撑（low ≤ 支撑×1.01）后 H 日收盘仍站在支撑上方
//   2) 压力位（mainResistance，仅 !breakout 切点）
//      · 突破率：H 日内实体收盘 > 压力×1.002
//      · 到达承压率：冲至压力（high ≥ 压力×0.995）后 H 日收盘未站稳其上
//   3) 操作信号（signal.level）：buy → H 日涨为命中；sell → H 日跌为命中
//   4) 技术评分前瞻性：score 分桶（≥65 / 45~65 / <45）的平均 H 日收益与胜率
//   5) 状态断言：breakdown / breakout 时刻的后验漂移是否与语义一致
// 资金流/资讯在历史切点不可回放，按空值输入（验证纯技术面核心）。
// ============================================================================
import { analyze } from "../src/utils/analyzer";
import { fetchAny, toSeries } from "./quote_fetch";

const CASES = [
  { secid: "1.600519", name: "贵州茅台" },
  { secid: "1.600036", name: "招商银行" },
  { secid: "1.601318", name: "中国平安" },
  { secid: "0.000001", name: "平安银行" },
  { secid: "1.688256", name: "寒武纪" },
  { secid: "1.601919", name: "中远海控" },
  { secid: "1.300750", name: "宁德时代" },
  { secid: "1.300059", name: "东方财富" },
];
const MIN_HIST = 80;   // 切点最少历史（覆盖 ma60/波段窗口/筹码分布）
const STEP = 5;        // 切点步长（与 H=5 对齐，前瞻窗口互不重叠）
const HS = [5, 10];    // 前瞻窗口（交易日）
const RATE = (x: number) => (x * 100).toFixed(1) + "%";
const AVG = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

// 简单 Pearson 相关（评分 vs 前瞻收益）
function corr(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const mx = AVG(xs.slice(0, n)), my = AVG(ys.slice(0, n));
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}

interface Cut {
  score: number; sig: string; sup: number; res: number;
  nearSup: boolean; nearRes: boolean; breakdown: boolean; breakout: boolean;
  add: boolean; reduce: boolean;
  fwd: Record<number, { ret: number }>;
}
interface Agg {
  n: number;
  supN: number; supBroken: number; supBroken2: number; supTouch: number; supTouchHold: number;
  resN: number; resBreak: number; resBreak2: number; resReach: number; resReachHold: number;
  buyN: number; buyHit: number; sellN: number; sellHit: number;
  addN: number; addHit: number; redN: number; redHit: number;
  bdN: number; bdRet: number[]; boN: number; boRet: number[];
  scoreRet: number[]; // 与 fwdRetH10 对齐，供相关性
  buckets: Record<string, { rets: number[]; wins: number }>;
}
const newAgg = (): Agg => ({
  n: 0, supN: 0, supBroken: 0, supBroken2: 0, supTouch: 0, supTouchHold: 0,
  resN: 0, resBreak: 0, resBreak2: 0, resReach: 0, resReachHold: 0,
  buyN: 0, buyHit: 0, sellN: 0, sellHit: 0, addN: 0, addHit: 0, redN: 0, redHit: 0,
  bdN: 0, bdRet: [], boN: 0, boRet: [], scoreRet: [],
  buckets: { ">=65": { rets: [], wins: 0 }, "45~65": { rets: [], wins: 0 }, "<45": { rets: [], wins: 0 } },
});

function accumulate(agg: Agg, c: Cut, base: number, win: { high: number; low: number; close: number }[], H: number) {
  agg.n++;
  const lastClose = win[win.length - 1].close;
  const fwdRet = lastClose / base - 1;
  const minLow = Math.min(...win.map((w) => w.low));
  const maxHigh = Math.max(...win.map((w) => w.high));
  const anyCloseBelowSup = win.some((w) => w.close < c.sup * 0.998);
  // 与算法自身破位口径同源：连续 2 根实体收盘击穿才算真失守（单日下穿仅为严格口径参考）
  const twoCloseBelowSup = win.some((w, i) => w.close < c.sup * 0.998 && !!win[i + 1] && win[i + 1].close < c.sup * 0.998);
  const anyCloseAboveRes = win.some((w) => w.close > c.res * 1.002);
  const twoCloseAboveRes = win.some((w, i) => w.close > c.res * 1.002 && !!win[i + 1] && win[i + 1].close > c.res * 1.002);
  if (H !== 10) return; // 价位/信号断言统一用 H=10 主口径（下方评分分桶同）
  // 1) 支撑（报告认为有效时才构成预测）
  if (!c.breakdown && c.sup > 0) {
    agg.supN++;
    if (anyCloseBelowSup) agg.supBroken++;
    if (twoCloseBelowSup) agg.supBroken2++;
    if (minLow <= c.sup * 1.01) { agg.supTouch++; if (lastClose > c.sup) agg.supTouchHold++; }
  }
  // 2) 压力
  if (!c.breakout && c.res > 0) {
    agg.resN++;
    if (anyCloseAboveRes) agg.resBreak++;
    if (twoCloseAboveRes) agg.resBreak2++;
    if (maxHigh >= c.res * 0.995) { agg.resReach++; if (lastClose < c.res * 1.005) agg.resReachHold++; }
  }
  // 3) 信号与动作
  if (c.sig === "buy") { agg.buyN++; if (fwdRet > 0) agg.buyHit++; }
  if (c.sig === "sell") { agg.sellN++; if (fwdRet < 0) agg.sellHit++; }
  if (c.add) { agg.addN++; if (fwdRet > 0) agg.addHit++; }
  if (c.reduce) { agg.redN++; if (fwdRet < 0) agg.redHit++; }
  // 4) 评分前瞻
  agg.scoreRet.push(c.score);
  const b = c.score >= 65 ? ">=65" : c.score >= 45 ? "45~65" : "<45";
  agg.buckets[b].rets.push(fwdRet);
  if (fwdRet > 0) agg.buckets[b].wins++;
  // 5) 状态断言后验漂移
  if (c.breakdown) { agg.bdN++; agg.bdRet.push(fwdRet); }
  if (c.breakout) { agg.boN++; agg.boRet.push(fwdRet); }
}

function reportAgg(tag: string, agg: Agg) {
  console.log(`\n—— ${tag}（切点 ${agg.n}）——`);
  if (agg.supN) {
    console.log(`支撑位: 有效切点 ${agg.supN}，10日失守（连续2根实体收盘击穿·算法同口径）${RATE(agg.supBroken2 / agg.supN)}，单日击穿（严格口径）${RATE(agg.supBroken / agg.supN)}，触碰后站稳率 ${agg.supTouch ? RATE(agg.supTouchHold / agg.supTouch) : "—"}（触碰 ${agg.supTouch}）`);
  }
  if (agg.resN) {
    console.log(`压力位: 有效切点 ${agg.resN}，10日有效突破（连续2根收盘站上·算法同口径）${RATE(agg.resBreak2 / agg.resN)}，单日上穿（严格口径）${RATE(agg.resBreak / agg.resN)}，到达后未站稳率 ${agg.resReach ? RATE(agg.resReachHold / agg.resReach) : "—"}（到达 ${agg.resReach}）`);
  }
  console.log(`信号: buy ${agg.buyN}（涨命中 ${agg.buyN ? RATE(agg.buyHit / agg.buyN) : "—"}），sell ${agg.sellN}（跌命中 ${agg.sellN ? RATE(agg.sellHit / agg.sellN) : "—"}）`);
  console.log(`动作: 可加仓 ${agg.addN}（后涨 ${agg.addN ? RATE(agg.addHit / agg.addN) : "—"}），建议减仓 ${agg.redN}（后跌 ${agg.redN ? RATE(agg.redHit / agg.redN) : "—"}）`);
  for (const k of Object.keys(agg.buckets)) {
    const b = agg.buckets[k];
    if (!b.rets.length) continue;
    console.log(`评分${k}: ${b.rets.length} 切点，10日均值 ${(AVG(b.rets) * 100).toFixed(2)}%，胜率 ${RATE(b.wins / b.rets.length)}`);
  }
  if (agg.bdN) console.log(`破位断言: ${agg.bdN} 次，后 10 日均值 ${(AVG(agg.bdRet) * 100).toFixed(2)}%`);
  if (agg.boN) console.log(`突破断言: ${agg.boN} 次，后 10 日均值 ${(AVG(agg.boRet) * 100).toFixed(2)}%`);
  return agg;
}

// 全局聚合（跨股票）
const GLOBAL = { scoreRet: [] as number[], ret10: [] as number[] };

async function backtestStock(secid: string, name: string): Promise<Agg> {
  const ks = await fetchAny(secid, "d");
  const data = toSeries(ks);
  const code = secid.split(".")[1];
  const agg = newAgg();
  const cuts: { base: number; win: { high: number; low: number; close: number }[]; ret10: number }[] = [];
  for (let T = MIN_HIST; T + 10 < data.length; T += STEP) {
    const cut = data.slice(0, T + 1);
    const a = analyze(cut, {}, null, cut, null, code, "d");
    const win = data.slice(T + 1, T + 11).map((d: any) => ({ high: d.high, low: d.low, close: d.close }));
    const base = a.price;
    const ret10 = win[win.length - 1].close / base - 1;
    cuts.push({ base, win, ret10 });
    accumulate(agg, {
      score: a.score, sig: a.signal.level, sup: a.mainSupport, res: a.mainResistance,
      nearSup: a.nearSup, nearRes: a.nearRes, breakdown: a.breakdown, breakout: a.breakout,
      add: a.add, reduce: a.reduce,
    }, base, win, 10);
    GLOBAL.scoreRet.push(a.score);
    GLOBAL.ret10.push(ret10);
  }
  reportAgg(name, agg);
  return agg;
}

async function main() {
  console.log(`===== 分析报告算法·历史回测（每 5 交易日一切点，前瞻 10 日主口径）=====`);
  let all = newAgg();
  for (const c of CASES) {
    try {
      const agg = await backtestStock(c.secid, c.name);
      // 粗合并：计数直接累加
      for (const k of Object.keys(agg) as (keyof Agg)[]) {
        if (k === "buckets" || k === "bdRet" || k === "boRet" || k === "scoreRet") continue;
        (all as any)[k] += (agg as any)[k];
      }
      all.bdRet.push(...agg.bdRet); all.boRet.push(...agg.boRet);
      for (const k of Object.keys(agg.buckets)) {
        all.buckets[k].rets.push(...agg.buckets[k].rets);
        all.buckets[k].wins += agg.buckets[k].wins;
      }
      await new Promise((r) => setTimeout(r, 300));
    } catch (e: any) {
      console.log(`❌ ${c.name} 回测失败：${e?.message || e}`);
    }
  }
  reportAgg("全部 8 股合计", all);
  const r = corr(GLOBAL.scoreRet, GLOBAL.ret10);
  console.log(`\n评分-10日前瞻收益 Pearson 相关（全样本 ${GLOBAL.scoreRet.length}）：${isNaN(r) ? "—" : r.toFixed(3)}`);
  console.log(`===== 回测完成 =====`);
}
main();
