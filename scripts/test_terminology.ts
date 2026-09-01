// ============================================================================
// 分析报告·术语准确性与后验有效性回测（walk-forward）
//
// 每个历史切点跑真实 analyze()，分两层验证报告中的术语：
//   A) 定义审核（术语 ↔ 其自身底层指标是否一致，应 0 错配）：
//      · 多头/空头排列 ⇔ MA5>MA10>MA20>MA60（严格 3/3 配对）
//      · MACD 金叉/死叉 ⇔ 最近 8 根内 DIF/DEA 实际发生交叉
//      · KDJ 超买/超卖 ⇔ J>100||K>80 / J<0||K<20
//      · RSI 超买/偏高/超卖/偏弱 ⇔ RSI12 阈值（>80/>70/<35/<50）
//      · MACD 红柱/绿柱放大/多头/空头排列 ⇔ dif-dea 符号
//      · 临近支撑/临近压力 ⇔ 距离 < 5%
//   B) 后验有效性（该术语在切点出现后 10 个交易日的真实走势）：
//      · 趋势方向 5 档 → 前瞻收益应单调（up 最好、down 最差）
//      · KDJ 超买 → 应回调（负漂移）；超卖 → 应反弹（正漂移）
//      · MACD 金叉 → 正漂移；死叉 → 负漂移
//      · 量价阶段/波段类型/临近支撑压力/风险等级 → 分桶统计
//      · 风险等级 高/中/低 → 后 10 日实现波动率与最深回撤应有排序
// 资金流/资讯不可回放按空值（低位蓄势/多头加速依赖 f5/f10，回测中不会出现，属预期）。
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
const stdev = (a: number[]) => {
  if (a.length < 2) return NaN;
  const m = AVG(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
};

// 与 analyzer 内部 cross() 同口径：最近 recent 根内 A 是否上/下穿 B
function crossDir(dif: (number | null)[], dea: (number | null)[], recent: number): "gold" | "dead" | null {
  const n = dif.length;
  for (let i = n - 1; i >= Math.max(1, n - recent); i--) {
    if (dif[i - 1]! <= dea[i - 1]! && dif[i]! > dea[i]!) return "gold";
    if (dif[i - 1]! >= dea[i - 1]! && dif[i]! < dea[i]!) return "dead";
  }
  return null;
}

// 分桶统计器：术语值 → 前瞻样本（同时记 10 日与 20 日）
class Buckets {
  m = new Map<string, { n: number; r10: number[]; r20: number[]; drets: number[][]; lows: number[] }>();
  add(term: string, ret10: number, ret20: number, dailyRets: number[], worstLow: number) {
    if (!term) return;
    let b = this.m.get(term);
    if (!b) { b = { n: 0, r10: [], r20: [], drets: [], lows: [] }; this.m.set(term, b); }
    b.n++; b.r10.push(ret10); b.r20.push(ret20); b.drets.push(dailyRets); b.lows.push(worstLow);
  }
  print(title: string) {
    const keys = [...this.m.keys()].filter((k) => this.m.get(k)!.n > 0);
    if (!keys.length) return;
    console.log(`  ${title}:`);
    for (const k of keys) {
      const b = this.m.get(k)!;
      const vols = b.drets.map(stdev).filter((x) => !isNaN(x));
      console.log(`    ${k}: n=${b.n}，10日 ${(AVG(b.r10) * 100).toFixed(2)}%（胜 ${RATE(b.r10.filter((r) => r > 0).length / b.n)}），20日 ${(AVG(b.r20) * 100).toFixed(2)}%（胜 ${RATE(b.r20.filter((r) => r > 0).length / b.n)}），10日最深回撤 ${(AVG(b.lows) * 100).toFixed(2)}%${vols.length ? `，日波动 ${(AVG(vols) * 100).toFixed(2)}%` : ""}`);
    }
  }
}
const B = {
  trend: new Buckets(), maState: new Buckets(), kdj: new Buckets(), macdX: new Buckets(),
  rsi: new Buckets(), stage: new Buckets(), band: new Buckets(), near: new Buckets(), risk: new Buckets(),
};
// 定义审核错配计数
const audit: Record<string, { ok: number; bad: number }> = {};
function chk(name: string, claim: boolean, truth: boolean) {
  const a = (audit[name] ??= { ok: 0, bad: 0 });
  if (claim === truth) a.ok++; else a.bad++;
}

const TREND_RANK: Record<string, number> = { up: 2, shake_up: 1, shake: 0, shake_down: -1, down: -2 };

async function backtestStock(secid: string, name: string) {
  const ks = await fetchAny(secid, "d");
  const data = toSeries(ks);
  const code = secid.split(".")[1];
  let cuts = 0;
  for (let T = MIN_HIST; T + 20 < data.length; T += STEP) {
    const cut = data.slice(0, T + 1);
    const a = analyze(cut, {}, null, cut, null, code, "d");
    cuts++;
    const base = a.price;
    const win = data.slice(T + 1, T + 21);
    const ret10 = win[9].close / base - 1;
    const ret20 = win[19].close / base - 1;
    const dailyRets = win.map((d: any, i: number) => d.close / (i === 0 ? base : win[i - 1].close) - 1);
    const worstLow = Math.min(...win.slice(0, 10).map((d: any) => d.low)) / base - 1;

    // ---- A) 定义审核（术语 vs 其自身底层指标）----
    const last = <T,>(arr: (T | null)[]): T | null => (arr.length ? (arr[arr.length - 1] ?? null) : null);
    const m5 = last(a.ma5), m10 = last(a.ma10), m20 = last(a.ma20), m60 = last(a.ma60);
    if (m5 != null && m10 != null && m20 != null && m60 != null) {
      const up = m5 > m10 && m10 > m20 && m20 > m60;
      const dn = m5 < m10 && m10 < m20 && m20 < m60;
      chk("均线术语", a.maState === "多头排列" ? up : a.maState === "空头排列" ? dn : !up && !dn, true);
      B.maState.add(a.maState, ret10, ret20, dailyRets, worstLow);
    }
    const dif = a.macd.dif, dea = a.macd.dea;
    const truthCross = crossDir(dif, dea, 8);
    chk("MACD金叉死叉", a.macdCross === truthCross, true);
    B.macdX.add(a.macdCross === "gold" ? "MACD金叉" : a.macdCross === "dead" ? "MACD死叉" : "无交叉", ret10, ret20, dailyRets, worstLow);
    const kL = a.kd.K[a.kd.K.length - 1], jL = a.kd.J[a.kd.J.length - 1];
    const truthKdj = jL > 100 || kL > 80 ? "超买" : jL < 0 || kL < 20 ? "超卖" : "中性";
    chk("KDJ超买超卖", a.kdjState === truthKdj, true);
    B.kdj.add(a.kdjState, ret10, ret20, dailyRets, worstLow);
    const rLabel = a.scoreReasons.find((r) => r.label.startsWith("RSI"))?.label ?? "";
    if (a.rsiValid) {
      const r = a.rNow;
      // 注意：addReason 仅在 delta≠0 时写入评分依据 → RSI 50~70（delta 0）不出现任何 RSI 术语，期望标签为空
      const truthR = r > 80 ? "RSI超买" : r > 70 ? "RSI偏高" : r < 35 ? "RSI超卖" : r < 50 ? "RSI偏弱" : "";
      chk("RSI术语", rLabel === truthR, true);
      B.rsi.add(rLabel, ret10, ret20, dailyRets, worstLow);
    }
    const difL = dif[dif.length - 1]!, deaL = dea[dea.length - 1]!;
    const barL = difL - deaL;
    const macdLabel = a.scoreReasons.find((r) => r.label.startsWith("MACD"))?.label ?? "";
    // MACD持平（dif==dea，delta 0）同样不写入评分依据
    const truthMacd = macdLabel === "MACD金叉" || macdLabel === "MACD死叉" ? macdLabel
      : difL === deaL ? ""
      : difL > deaL && barL > 0 ? "MACD红柱放大" : difL > deaL ? "MACD多头排列"
      : difL < deaL && barL < 0 ? "MACD绿柱放大" : "MACD空头排列";
    chk("MACD柱/排列术语", macdLabel === truthMacd, true);
    // 临近支撑：定义 dist < 5%；临近压力：定义 dist < 3%（压力侧收紧，避免半根涨停外误标「临近」）
    chk("临近支撑", a.nearSup === (a.support > 0 && (a.price - a.support) / a.price < 0.05), true);
    chk("临近压力", a.nearRes === (a.resistance > 0 && (a.resistance - a.price) / a.price < 0.03), true);

    // ---- B) 后验有效性分桶 ----
    B.trend.add(a.trendText || a.trend, ret10, ret20, dailyRets, worstLow);
    B.stage.add(a.stageText, ret10, ret20, dailyRets, worstLow);
    B.band.add(a.priceLevels.band, ret10, ret20, dailyRets, worstLow);
    if (a.nearSup) B.near.add("临近支撑", ret10, ret20, dailyRets, worstLow);
    if (a.nearRes) B.near.add("临近压力", ret10, ret20, dailyRets, worstLow);
    B.risk.add(`风险${a.riskLevel}`, ret10, ret20, dailyRets, worstLow);
  }
  console.log(`${name}: ${cuts} 切点`);
  return cuts;
}

async function main() {
  console.log(`===== 术语定义审核 + 后验有效性回测（每 5 交易日一切点，前瞻 10 日）=====`);
  let total = 0;
  for (const c of CASES) {
    try { total += await backtestStock(c.secid, c.name); await new Promise((r) => setTimeout(r, 300)); }
    catch (e: any) { console.log(`❌ ${c.name}：${e?.message || e}`); }
  }
  console.log(`\n—— A) 术语定义审核（术语 ↔ 自身底层指标，应 0 错配）——`);
  for (const [k, v] of Object.entries(audit)) console.log(`  ${k}: 核对 ${v.ok + v.bad}，错配 ${v.bad}`);
  console.log(`\n—— B) 术语后验有效性（出现该术语后 10 日真实走势）——`);
  B.trend.print("趋势方向");
  B.maState.print("均线排列");
  B.macdX.print("MACD 交叉");
  B.kdj.print("KDJ 状态");
  B.rsi.print("RSI 分档");
  B.stage.print("量价阶段");
  B.band.print("波段类型");
  B.near.print("关键位临近");
  B.risk.print("风险等级");
  console.log(`\n合计 ${total} 切点`);
}
main();
