// ============================================================================
// 关键价位（支撑位/压力位/建议买入区间）算法专项回测（walk-forward）
//
// 每个历史切点跑真实 analyze()，验证算法的四个核心断言：
//   1) 方位健全性：主支撑恒低于现价、主压力恒高于现价、买入区间 low≤high；
//   2) 评分有效性：候选支撑/压力按 totalScore 分桶（强≥60/中40~60/弱<40），
//      失守率/突破率应随评分升高而下降——否则评分权重不合理；
//   3) 主支撑选中质量：同一切点被选中的 mainSupport 与落选候选对比持有率；
//   4) 买入区间：触及率（价格回到区间）、区间买入 vs 现价持有的增益、
//      区间下沿失守率（接刀风险）、区间上沿与现价关系。
// 失守/突破与算法自身口径同源：连续 2 根实体收盘击穿/站上。
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
const MIN_HIST = 80, STEP = 5;
const RATE = (x: number) => (x * 100).toFixed(1) + "%";
const AVG = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

// 连续 2 根收盘跌破/升穿（与 autoLevels BREAK_CONFIRM_CNT 口径一致）
function brokeDown(closes: number[], lv: number): boolean {
  for (let i = 0; i + 1 < closes.length; i++)
    if (closes[i] < lv * 0.998 && closes[i + 1] < lv * 0.998) return true;
  return false;
}
function brokeUp(closes: number[], lv: number): boolean {
  for (let i = 0; i + 1 < closes.length; i++)
    if (closes[i] > lv * 1.002 && closes[i + 1] > lv * 1.002) return true;
  return false;
}

interface SupStat { n: number; broken: number; touched: number; }
const supByScore: Record<string, SupStat> = { 强: { n: 0, broken: 0, touched: 0 }, 中: { n: 0, broken: 0, touched: 0 }, 弱: { n: 0, broken: 0, touched: 0 } };
const resByScore: Record<string, SupStat> = { 强: { n: 0, broken: 0, touched: 0 }, 中: { n: 0, broken: 0, touched: 0 }, 弱: { n: 0, broken: 0, touched: 0 } };
const supByDist: Record<string, SupStat> = { "<2%": { n: 0, broken: 0, touched: 0 }, "2~5%": { n: 0, broken: 0, touched: 0 }, ">5%": { n: 0, broken: 0, touched: 0 } };
const G = {
  n: 0, supOk: 0, resOk: 0, zoneOk: 0, zoneShown: 0,
  fallback: 0,                     // 主支撑来自箱体/60日极值兜底的切点数
  chosenN: 0, chosenHold: 0, altN: 0, altHold: 0, // 主支撑 vs 落选候选（10日不失守）
  buyTouch: 0, buyRet: [] as number[], holdRet: [] as number[], buyLowBreak: 0, zoneAbovePrice: 0,
};
const scoreBucket = (s: number) => (s >= 60 ? "强" : s >= 40 ? "中" : "弱");

async function backtestStock(secid: string, name: string) {
  const ks = await fetchAny(secid, "d");
  const data = toSeries(ks);
  const code = secid.split(".")[1];
  let cuts = 0;
  for (let T = MIN_HIST; T + 10 < data.length; T += STEP) {
    const cut = data.slice(0, T + 1);
    const a = analyze(cut, {}, null, cut, null, code, "d");
    cuts++; G.n++;
    const base = a.price;
    const win = data.slice(T + 1, T + 11);
    const closes = win.map((d: any) => d.close);
    const minLow = Math.min(...win.map((d: any) => d.low));
    const close10 = closes[closes.length - 1];

    // 1) 方位健全性
    if (a.support < base) G.supOk++;
    if (a.resistance > base) G.resOk++;
    if (isNaN(a.buyLow) || (a.buyLow < a.buyHigh && a.buyHigh > 0)) G.zoneOk++;

    // 兜底来源统计（主支撑是否来自 priceLevels 候选）
    const cands = [a.priceLevels.structSupport, a.priceLevels.tradeSupportS].filter((x): x is NonNullable<typeof x> => !!x && !x.isBroken && x.price < base);
    const fromCandidate = cands.some((c) => Math.abs(c.price - a.support) < 1e-9) || a.priceLevels.boxBottom === a.support;
    if (!fromCandidate) G.fallback++;

    // 2) 候选支撑按评分分桶
    for (const c of cands) {
      const b = supByScore[scoreBucket(c.totalScore)];
      b.n++;
      if (brokeDown(closes, c.price)) b.broken++;
      if (minLow <= c.price * 1.01) b.touched++;
      const dist = (base - c.price) / base;
      const db = dist < 0.02 ? "<2%" : dist < 0.05 ? "2~5%" : ">5%";
      supByDist[db].n++;
      if (brokeDown(closes, c.price)) supByDist[db].broken++;
      if (minLow <= c.price * 1.01) supByDist[db].touched++;
    }
    // 3) 主支撑选中 vs 落选（10 日不失守率）
    const chosen = cands.find((c) => Math.abs(c.price - a.support) < 1e-9);
    const alts = cands.filter((c) => c !== chosen);
    if (chosen) {
      G.chosenN++;
      if (!brokeDown(closes, chosen.price)) G.chosenHold++;
    }
    for (const c of alts) {
      G.altN++;
      if (!brokeDown(closes, c.price)) G.altHold++;
    }
    // 压力候选按评分分桶
    const resCands = [a.priceLevels.structPressure, a.priceLevels.tradePressureB].filter((x): x is NonNullable<typeof x> => !!x && !x.isBroken && x.price > base);
    for (const c of resCands) {
      const b = resByScore[scoreBucket(c.totalScore)];
      b.n++;
      if (brokeUp(closes, c.price)) b.broken++;
      if (Math.max(...win.map((d: any) => d.high)) >= c.price * 0.995) b.touched++;
    }

    // 4) 买入区间
    if (!isNaN(a.buyLow)) {
      G.zoneShown++;
      const buyHigh = a.buyHigh;
      if (buyHigh > base) G.zoneAbovePrice++;
      if (minLow <= buyHigh) {
        G.buyTouch++;
        G.buyRet.push(close10 / buyHigh - 1);
        G.holdRet.push(close10 / base - 1);
      }
      if (brokeDown(closes, a.buyLow)) G.buyLowBreak++;
    }
  }
  console.log(`${name}: ${cuts} 切点`);
}

function pctAgg(m: Record<string, SupStat>, label: string, failName: string) {
  console.log(`  ${label}:`);
  for (const [k, v] of Object.entries(m)) {
    if (!v.n) continue;
    console.log(`    ${k}: n=${v.n}，${failName} ${RATE(v.broken / v.n)}，触碰率 ${RATE(v.touched / v.n)}`);
  }
}

async function main() {
  console.log(`===== 关键价位算法专项回测（每 5 交易日一切点，前瞻 10 日，失守=连续2根实体收盘击穿）=====`);
  for (const c of CASES) {
    try { await backtestStock(c.secid, c.name); await new Promise((r) => setTimeout(r, 300)); }
    catch (e: any) { console.log(`❌ ${c.name}：${e?.message || e}`); }
  }
  console.log(`\n—— 1) 方位健全性（${G.n} 切点）——`);
  console.log(`主支撑低于现价 ${RATE(G.supOk / G.n)}，主压力高于现价 ${RATE(G.resOk / G.n)}，买入区间 low<high（含未展示）${RATE(G.zoneOk / G.n)}`);
  console.log(`主支撑来自兜底（箱体/60日极值，无候选）比例 ${RATE(G.fallback / G.n)}`);
  console.log(`\n—— 2) 支撑评分有效性（候选逐条统计）——`);
  pctAgg(supByScore, "按 totalScore 分桶", "失守率");
  pctAgg(supByDist, "按距现价距离分桶", "失守率");
  console.log(`\n—— 3) 主支撑选中质量 ——`);
  console.log(`选中者 10 日不失守率 ${G.chosenN ? RATE(G.chosenHold / G.chosenN) : "—"}（n=${G.chosenN}），落选者 ${G.altN ? RATE(G.altHold / G.altN) : "—"}（n=${G.altN}）`);
  console.log(`\n—— 4) 压力评分有效性（候选逐条统计）——`);
  pctAgg(resByScore, "按 totalScore 分桶", "突破率");
  console.log(`\n—— 5) 建议买入区间（展示 ${G.zoneShown} 切点）——`);
  if (G.zoneShown) {
    console.log(`10 日内触及区间 ${RATE(G.buyTouch / G.zoneShown)}，区间上沿高于现价占比 ${RATE(G.zoneAbovePrice / G.zoneShown)}`);
    if (G.buyRet.length) {
      console.log(`触及后：以区间上沿买入 10 日均值 ${(AVG(G.buyRet) * 100).toFixed(2)}%（胜率 ${RATE(G.buyRet.filter((r) => r > 0).length / G.buyRet.length)}），同期现价持有 ${(AVG(G.holdRet) * 100).toFixed(2)}%（胜率 ${RATE(G.holdRet.filter((r) => r > 0).length / G.holdRet.length)}）→ 低吸增益 ${(AVG(G.buyRet) - AVG(G.holdRet)) * 100 >= 0 ? "+" : ""}${((AVG(G.buyRet) - AVG(G.holdRet)) * 100).toFixed(2)}%`);
    }
    console.log(`区间下沿（支撑×0.985）失守率 ${RATE(G.buyLowBreak / G.zoneShown)}`);
  }
  console.log(`\n===== 回测完成 =====`);
}
main();
