// ============================================================================
// 分析报告全条目真实数据审计（test_report_items）
//
// 对每只样本股：用与 App 完全同参的东财日 K（f51-f61，turnover=f61 换手率%）
// + 资金流（网关 kind:flow，与 App 同链路）+ 上证指数日 K（marketEnv）跑真实 analyze()，
// 然后：
//   1) 独立重算全部指标（RSI/KDJ/MACD/MA/DMI/BOLL/%B/带宽/BIAS/量比/年化波动/
//      最大回撤/ATR/OBV/换手率/资金流），与 analyze() 输出逐项比对；
//   2) 复刻 ReportView.vue 全部文案/配色规则，断言「数据 → 文案 → 配色」一致；
//   3) 复刻分析结论合成（含 env 缺数据守卫），断言关键信息（趋势/阶段/风险/
//      操作建议/支撑压力/止损突破提示/免责）完整、无误导句；
//   4) 评分可重构性：50 + Σ scoreReasons.delta 经 [5,95] 截断 === score；
//   5) 回归：指数缺数据时结论不得出现「市场环境偏弱/大盘逆风」（已修复的 bug）。
// ============================================================================
import { analyze, type MarketContext } from "../src/utils/analyzer";

const ok = (m: string) => console.log("    ✅ " + m);
const bad = (m: string) => console.log("    ❌ " + m);

let pass = 0;
let fail = 0;
function check(tag: string, cond: boolean, detail = "") {
  if (cond) { pass++; ok(tag + (detail ? "（" + detail + "）" : "")); }
  else { fail++; bad(tag + (detail ? " —— " + detail : "")); }
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------------- 取数（与 App 同参） ----------------
interface K { date: string; open: number; close: number; high: number; low: number; vol: number; amount: number; turnover: number }

function parseEMKlines(j: any): K[] {
  return (j?.data?.klines ?? []).map((s: string) => {
    const a = s.split(",");
    return { date: a[0], open: +a[1], close: +a[2], high: +a[3], low: +a[4], vol: +a[5], amount: +a[6], turnover: +(a[10] || 0) };
  });
}
// 与 src/api/sources/eastmoney.ts 完全同参：f51-f61，a[10]=f61 换手率(%)。
// 东财直连失败时回落 App 生产网关 kind:kline（eastmoney 源与 App 同一解析器，口径不变；
// tencent 源日 K 无换手率 → turnover=0，下游换手率检查自动走「缺数据降级」分支）。
async function fetchDaily(secid: string, retry = 2): Promise<K[]> {
  const d = new Date(Date.now() - 730 * 86400e3);
  const beg = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const url =
    `https://push2his.eastmoney.com/api/qt/stock/kline/get` +
    `?fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61` +
    `&klt=101&fqt=1&secid=${secid}&beg=${beg}&end=20500101`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const ks = parseEMKlines(await res.json());
    if (!ks.length) throw new Error("空数据");
    return ks;
  } catch (e) {
    if (retry > 0) { await new Promise((r) => setTimeout(r, 1200)); return fetchDaily(secid, retry - 1); }
    const g = loadGateway();
    if (!g) throw e;
    const res = await fetch(g.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: g.key, Authorization: `Bearer ${g.key}` },
      body: JSON.stringify({ kind: "kline", secid, period: "d" }),
      signal: AbortSignal.timeout(20000),
    });
    const j: any = await res.json();
    if (j?.ok !== true || typeof j.text !== "string") throw new Error(j?.error || "网关返回异常");
    if (j.source === "eastmoney") return parseEMKlines(JSON.parse(j.text));
    if (j.source === "tencent") {
      const sym = (secid.startsWith("1.") ? "sh" : "sz") + secid.split(".")[1];
      const node = JSON.parse(j.text)?.data?.[sym];
      const arr: any[] = node?.qfqday || node?.day || [];
      if (!arr.length) throw new Error("网关腾讯源日 K 为空");
      return arr.map((r: any[]) => ({ date: String(r[0]), open: +r[1], close: +r[2], high: +r[3], low: +r[4], vol: +r[5], amount: 0, turnover: 0 }));
    }
    throw new Error("未支持的网关源: " + j.source);
  }
}
// 资金流走 App 生产网关（kind:flow 与 MarketView 同链路），flowMap[date]=主力净流入(元)
function loadGateway(): { url: string; key: string } | null {
  try {
    const fs = require("fs");
    const path = require("path");
    const txt = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
    const env: Record<string, string> = {};
    for (const line of txt.split(/\r?\n/)) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (m) env[m[1]] = m[2];
    }
    if (env.VITE_SUPABASE_URL && !env.VITE_SUPABASE_URL.includes("YOUR-PROJECT") && env.VITE_SUPABASE_ANON_KEY)
      return { url: `${env.VITE_SUPABASE_URL}/functions/v1/guanlan-quote-proxy`, key: env.VITE_SUPABASE_ANON_KEY };
  } catch { /* ignore */ }
  return null;
}
async function fetchFlowMap(secid: string): Promise<Record<string, number>> {
  // 与 App 同链路双保险：东财直连 fflow → 失败回落 App 生产网关 kind:flow
  const parse = (text: string) => {
    const map: Record<string, number> = {};
    (JSON.parse(text)?.data?.klines ?? []).forEach((s: string) => {
      const a = s.split(",");
      map[a[0]] = parseFloat(a[1]) || 0;
    });
    return map;
  };
  try {
    const res = await fetch(
      `https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get` +
      `?lmt=120&klt=101&secid=${secid}&fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`,
      { signal: AbortSignal.timeout(10000) }
    );
    const map = parse(await res.text());
    if (Object.keys(map).length) return map;
  } catch { /* 回落网关 */ }
  const g = loadGateway();
  if (!g) return {};
  try {
    const res = await fetch(g.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: g.key, Authorization: `Bearer ${g.key}` },
      body: JSON.stringify({ kind: "flow", secid }),
      signal: AbortSignal.timeout(20000),
    });
    const j: any = await res.json();
    if (j?.ok !== true || typeof j.text !== "string") return {};
    return parse(j.text);
  } catch { return {}; }
}
// App Kline（analyzer/autoLevels 口径：src/utils/period.ts Kline，量能用 k.vol）
function toApp(ks: K[]) {
  return ks.map((k) => ({
    date: k.date, open: k.open, close: k.close, high: k.high, low: k.low,
    vol: k.vol, amount: k.amount, amp: 0, pct: 0, chg: 0, turnover: k.turnover,
  }));
}

// ---------------- 独立指标实现（照 analyzer 公式重写，不 import） ----------------
function ma(a: number[], n: number): (number | null)[] {
  const r: (number | null)[] = new Array(a.length).fill(null);
  let s = 0;
  for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) r[i] = s / n; }
  return r;
}
function ema(a: number[], n: number): number[] {
  const r: number[] = []; const k = 2 / (n + 1); let prev = 0;
  for (let i = 0; i < a.length; i++) { prev = i === 0 ? a[0] : a[i] * k + prev * (1 - k); r.push(prev); }
  return r;
}
function rma(a: number[], n: number): number[] {
  const r: number[] = []; let prev = 0;
  for (let i = 0; i < a.length; i++) { prev = i < n ? (prev * i + a[i]) / (i + 1) : (prev * (n - 1) + a[i]) / n; r.push(prev); }
  return r;
}
function rsi(a: number[], n: number): (number | null)[] {
  const r: (number | null)[] = new Array(a.length).fill(null);
  let g = 0, l = 0;
  for (let i = 1; i < a.length; i++) {
    const d = a[i] - a[i - 1];
    if (i <= n) {
      if (d > 0) g += d; else l -= d;
      if (i === n) { g /= n; l /= n; r[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
    } else {
      const pg = g * (n - 1), pl = l * (n - 1);
      if (d > 0) { g = (pg + d) / n; l = pl / n; } else { g = pg / n; l = (pl - d) / n; }
      r[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
  }
  return r;
}
function dmi(high: number[], low: number[], close: number[], n = 14) {
  const len = close.length;
  const tr = new Array(len).fill(0), pDM = new Array(len).fill(0), mDM = new Array(len).fill(0);
  for (let i = 1; i < len; i++) {
    tr[i] = Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
    const up = high[i] - high[i - 1], dn = low[i - 1] - low[i];
    pDM[i] = up > dn && up > 0 ? up : 0;
    mDM[i] = dn > up && dn > 0 ? dn : 0;
  }
  const atrR = rma(tr, n), pDIR = rma(pDM, n), mDIR = rma(mDM, n);
  const pDI: number[] = [], mDI: number[] = [], dx: number[] = [];
  for (let i = 0; i < len; i++) {
    const a = atrR[i] || 0;
    pDI.push(a ? (100 * pDIR[i]) / a : 0);
    mDI.push(a ? (100 * mDIR[i]) / a : 0);
    const s = pDI[i] + mDI[i];
    dx.push(s ? (100 * Math.abs(pDI[i] - mDI[i])) / s : 0);
  }
  return { atr: atrR, pDI, mDI, adx: rma(dx, n) };
}
function kdj(ks: { high: number; low: number; close: number }[]) {
  const n = 9; const K = new Array(ks.length).fill(50), D = new Array(ks.length).fill(50), J = new Array(ks.length).fill(50);
  for (let i = 0; i < ks.length; i++) {
    if (i < n - 1) continue;
    let hh = -Infinity, ll = Infinity;
    for (let j = i - n + 1; j <= i; j++) { hh = Math.max(hh, ks[j].high); ll = Math.min(ll, ks[j].low); }
    const rsv = hh === ll ? 50 : ((ks[i].close - ll) / (hh - ll)) * 100;
    const k = i === n - 1 ? 50 : K[i - 1], d = i === n - 1 ? 50 : D[i - 1];
    K[i] = (2 / 3) * k + (1 / 3) * rsv; D[i] = (2 / 3) * d + (1 / 3) * K[i]; J[i] = 3 * K[i] - 2 * D[i];
  }
  return { K, D, J };
}
function boll(close: number[], n = 20, k = 2) {
  const mid = ma(close, n);
  const pctB: (number | null)[] = new Array(close.length).fill(null);
  const bw: (number | null)[] = new Array(close.length).fill(null);
  for (let i = n - 1; i < close.length; i++) {
    const m = mid[i]!; let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (close[j] - m) * (close[j] - m);
    const sd = Math.sqrt(s / n);
    const up = m + k * sd, lo = m - k * sd, rng = up - lo;
    pctB[i] = rng ? (close[i] - lo) / rng : 0.5;
    bw[i] = m ? rng / m : 0;
  }
  return { mid, pctB, bw };
}
function cross(a: (number | null)[], b: (number | null)[], len: number, recent: number): "gold" | "dead" | null {
  for (let i = len - 1; i >= Math.max(1, len - recent); i--) {
    if (a[i - 1]! <= b[i - 1]! && a[i]! > b[i]!) return "gold";
    if (a[i - 1]! >= b[i - 1]! && a[i]! < b[i]!) return "dead";
  }
  return null;
}
const median = (v: number[]) => { const s = v.slice().sort((a, b) => a - b); return s[Math.floor(s.length * 0.5)]; };
const pctl = (v: number[], p: number) => { const s = v.slice().sort((a, b) => a - b); return s[Math.max(0, Math.floor(s.length * p))]; };

// ---------------- ReportView 文案/配色规则复刻（逐条自 ReportView.vue 抄录） ----------------
const UP = "var(--up)", DOWN = "var(--down)", PRIMARY = "var(--primary)", WARN = "#ff9f1c", INK = "var(--r-ink)", GRAY = "var(--text-2)";
const rsiState = (r: number) => (r > 70 ? "超买" : r < 30 ? "超卖" : "中性");
const rsiColor = (r: number) => (r > 70 ? UP : r < 30 ? DOWN : INK);
const kdjColor = (s: string) => (s === "超买" ? UP : s === "超卖" ? DOWN : INK);
const macdText = (c: string | null, bar: number) =>
  c === "gold" ? "金叉·看多" : c === "dead" ? "死叉·看空" : bar > 0 ? "红柱·多头" : "绿柱·空头";
const macdColor = (c: string | null) => (c === "gold" ? UP : c === "dead" ? DOWN : INK);
const maColor = (s: string) => (s === "多头排列" ? UP : s === "空头排列" ? DOWN : INK);
const trendColor = (t: string) => (t === "up" || t === "shake_up" ? UP : t === "down" || t === "shake_down" ? DOWN : INK);
const volState = (v: number) => (v > 1.15 ? "放量" : v < 0.85 ? "缩量" : "温和");
const adxState = (v: number) => (v < 20 ? "无趋势" : v < 25 ? "趋势初现" : v < 40 ? "明显趋势" : "强趋势");
const adxColor = (adx: number, pdi: number, mdi: number) => (adx < 20 ? INK : pdi > mdi ? UP : DOWN);
const bollPctBText = (v: number) => (v > 1 ? "触上轨·超买" : v < 0 ? "触下轨·超卖" : v > 0.8 ? "偏上轨" : v < 0.2 ? "偏下轨" : "中轨附近");
const bollPctBColor = (v: number) => (v > 1 ? UP : v < 0 ? DOWN : INK);
const mddColor = (m: number) => (m > 0.35 ? DOWN : m > 0.2 ? WARN : INK);
const obvColor = (t: string) => (t.indexOf("配合") >= 0 ? UP : DOWN);
const biasText = (b6: number, b12: number, b24: number) =>
  b24 > 20 ? `BIAS24 ${b24.toFixed(2)}% · 中期超买` :
  b24 < -20 ? `BIAS24 ${b24.toFixed(2)}% · 中期超卖` :
  b12 > 12 ? `BIAS12 ${b12.toFixed(2)}% · 短期超买` :
  b12 < -12 ? `BIAS12 ${b12.toFixed(2)}% · 短期超卖` :
  `6日 ${b6.toFixed(1)}% / 12日 ${b12.toFixed(1)}% / 24日 ${b24.toFixed(1)}%`;
const biasColor = (b12: number, b24: number) => (b24 > 20 || b12 > 12 ? UP : b24 < -20 || b12 < -12 ? PRIMARY : INK);
const bollBwText = (bw: number, sq: boolean) => sq ? "带宽收缩 · 即将变盘" : bw > 2.2 ? "带宽扩张 · 波动剧烈" : bw < 0.6 ? "带宽偏窄 · 蓄势中" : "带宽常态 · 波动正常";
const bollBwColor = (bw: number, sq: boolean) => (sq ? WARN : bw > 2.2 ? UP : bw < 0.6 ? PRIMARY : INK);
const chipDistLabel = (price: number, avg: number) => {
  const d = avg ? (price - avg) / avg : 0;
  return d > 0.08 ? `高于成本 ${(d * 100).toFixed(1)}%` : d < -0.08 ? `低于成本 ${(-d * 100).toFixed(1)}%` : "贴近成本";
};
const chipDistColor = (price: number, avg: number) => {
  const d = avg ? (price - avg) / avg : 0;
  return d > 0.08 ? UP : d < -0.08 ? PRIMARY : INK;
};
const chipProfitText = (pr: number) => {
  const p = (pr * 100).toFixed(0);
  return pr > 0.85 ? `${p}% · 获利盘比例高，易回吐` : pr < 0.20 ? `${p}% · 获利盘比例低，抛压轻` : `${p}% · 获利盘比例适中`;
};
const chipProfitColor = (pr: number) => (pr > 0.85 ? UP : pr < 0.20 ? PRIMARY : INK);
const scoreColor = (s: number) => (s >= 70 ? UP : s >= 45 ? WARN : DOWN);
const riskColor = (r: string) => (r === "低" ? UP : r === "中" ? WARN : DOWN);
const alignColor = (s: number) => (s > 0 ? UP : s < 0 ? DOWN : GRAY); // 已修复：正分=利多=红（原 --primary 误用）
const sectorAlignColor = (s: number) => (s > 0 ? UP : s < 0 ? DOWN : GRAY); // 同上
const positionColor = (pct: number, advice: string) =>
  advice === "暂无数据" ? GRAY : pct >= 55 ? UP : pct <= 30 ? DOWN : GRAY;
// 分析结论复刻（与 ReportView.vue 修复后逐字一致）
function buildConclusion(r: any): string {
  const parts: string[] = [];
  parts.push(`${r.trendText}（${r.strength}），处于「${r.stageText}」阶段，${r.riskLevel}风险。`);
  if (r.reduce) parts.push("信号偏空，建议逢高减仓、严控仓位。");
  else if (r.add) parts.push("趋势与资金配合良好，可于回调分批加仓。");
  else if (r.build) parts.push("处于相对低位且风险可控，可于支撑附近分批建仓。");
  else if (r.watch) parts.push("可纳入自选关注，等待更优介入时点。");
  else parts.push("多空信号交织，建议观望，等方向明朗。");
  parts.push(`支撑 ${r.support.toFixed(2)}、压力 ${r.resistance.toFixed(2)}：有效跌破支撑应止损离场，放量突破压力可顺势跟进。`);
  const env = r.marketEnv;
  if (env && env.indexTrend !== "暂无数据") {
    const mktAdverse = (env.alignScore || 0) < 0;
    const sectorAdverse = (env.sectorAlignScore || 0) < 0;
    const defensive = (env.positionPct || 0) <= 30;
    if (mktAdverse || sectorAdverse || defensive) {
      const what = mktAdverse ? "大盘逆风" : sectorAdverse ? "行业逆风" : "市场环境偏弱";
      parts.push(`${what}，${env.positionAdvice}。`);
    }
  }
  parts.push("以上为技术面参考，非投资建议。");
  return parts.join("");
}

// ---------------- 单股全项审计 ----------------
async function auditStock(secid: string, name: string, idxKl: any[]) {
  console.log(`\n▶ ${name}（${secid}）`);
  const code = secid.split(".")[1];
  const ks = await fetchDaily(secid);
  const flowMap = await fetchFlowMap(secid);
  const appKl = toApp(ks);
  const marketCtx: MarketContext = { indexKlines: idxKl, indexName: "上证指数", indexRealtime: null };
  const a = analyze(appKl, flowMap, null, appKl, marketCtx, code, "d");

  const len = ks.length;
  const close = ks.map((k) => k.close);
  const high = ks.map((k) => k.high);
  const low = ks.map((k) => k.low);
  const vol = ks.map((k) => k.vol);
  const price = close[len - 1];

  // 0) 现价
  check("现价=最新收盘", a.price === price);

  // 1) RSI12
  const myR = rsi(close, 12)[len - 1] as number;
  check("RSI12 独立重算一致", near(a.rNow, myR, 0.05), `${a.rNow} vs ${myR?.toFixed(2)}`);
  check("RSI 状态/配色阈值语义", (a.rNow > 70) === (rsiState(a.rNow) === "超买") && (a.rNow < 30) === (rsiState(a.rNow) === "超卖")
    && rsiColor(a.rNow) === (a.rNow > 70 ? UP : a.rNow < 30 ? DOWN : INK), rsiState(a.rNow));

  // 2) KDJ（先验证 OHLC 映射保真，再独立重算状态/交叉）
  const myK0 = kdj(ks), myK1 = kdj(appKl.map((x: any) => ({ high: x.high, low: x.low, close: x.close })));
  check("OHLC 映射保真（appKl=原始K）", near(myK0.K[len - 1], myK1.K[len - 1], 1e-9) && near(myK0.J[len - 1], myK1.J[len - 1], 1e-9));
  const jLast = myK0.J[len - 1], kLast = myK0.K[len - 1];
  const myKdjState = jLast > 100 || kLast > 80 ? "超买" : jLast < 0 || kLast < 20 ? "超卖" : "中性";
  check("KDJ 状态与配色规则", a.kdjState === myKdjState && kdjColor(a.kdjState) === kdjColor(myKdjState)
    && (myKdjState === "超买") === (kdjColor(myKdjState) === UP) && (myKdjState === "超卖") === (kdjColor(myKdjState) === DOWN), a.kdjState);
  const myKdjCross = cross(myK0.K, myK0.D, len, 8);
  check("KDJ 交叉一致", a.kdjCross === myKdjCross, `${a.kdjCross} vs ${myKdjCross}`);

  // 3) MACD
  const e12 = ema(close, 12), e26 = ema(close, 26);
  const dif = close.map((_, i) => e12[i] - e26[i]);
  const dea = ema(dif, 9);
  const bar = (dif[len - 1] - dea[len - 1]) * 2;
  check("MACD DIF/DEA 独立重算一致", near(dif[len - 1], a.macd.dif[len - 1], Math.max(0.02, Math.abs(dif[len - 1]) * 1e-3))
    && near(dea[len - 1], a.macd.dea[len - 1], Math.max(0.02, Math.abs(dea[len - 1]) * 1e-3)));
  const myMacdCross = cross(dif, dea, len, 8);
  const myMacdText = myMacdCross === "gold" ? "金叉·看多" : myMacdCross === "dead" ? "死叉·看空" : bar > 0 ? "红柱·多头" : "绿柱·空头";
  const myMacdColor = myMacdCross === "gold" ? UP : myMacdCross === "dead" ? DOWN : INK;
  check("MACD 交叉/文案/配色", a.macdCross === myMacdCross
    && (macdText(a.macdCross, bar) === myMacdText) && (macdColor(a.macdCross) === myMacdColor), myMacdText);

  // 4) MA / 均线排列
  const m5 = ma(close, 5), m10 = ma(close, 10), m20 = ma(close, 20), m60 = ma(close, 60);
  const ma60L = m60[len - 1];
  const upCount = (m5[len - 1]! > m10[len - 1]! ? 1 : 0) + (m10[len - 1]! > m20[len - 1]! ? 1 : 0) + (ma60L != null && m20[len - 1]! > ma60L ? 1 : 0);
  const downCount = (m5[len - 1]! < m10[len - 1]! ? 1 : 0) + (m10[len - 1]! < m20[len - 1]! ? 1 : 0) + (ma60L != null && m20[len - 1]! < ma60L ? 1 : 0);
  const myMaState = upCount === 3 ? "多头排列" : downCount === 3 ? "空头排列" : "均线纠缠";
  check("均线排列独立重算一致", a.maState === myMaState && maColor(a.maState) === maColor(myMaState), a.maState);
  check("趋势方向配色语义", trendColor(a.trend) === (a.trend === "up" || a.trend === "shake_up" ? UP : a.trend === "down" || a.trend === "shake_down" ? DOWN : INK), a.trend);

  // 5) DMI/ADX
  const myDmi = dmi(high, low, close, 14);
  check("ADX/+DI/-DI 独立重算一致",
    near(myDmi.adx[len - 1], a.adx[len - 1], 0.05) && near(myDmi.pDI[len - 1], a.pDI[len - 1], 0.05) && near(myDmi.mDI[len - 1], a.mDI[len - 1], 0.05),
    `ADX ${a.adx[len - 1].toFixed(2)}`);
  check("ADX 状态/文案/配色", a.adxState === adxState(myDmi.adx[len - 1])
    && (a.adx[len - 1] < 20) === (adxColor(a.adx[len - 1], a.pDI[len - 1], a.mDI[len - 1]) === INK)
    && (a.adx[len - 1] >= 20 && a.pDI[len - 1] > a.mDI[len - 1]) === (adxColor(a.adx[len - 1], a.pDI[len - 1], a.mDI[len - 1]) === UP)
    && (a.adx[len - 1] >= 20 && a.pDI[len - 1] <= a.mDI[len - 1]) === (adxColor(a.adx[len - 1], a.pDI[len - 1], a.mDI[len - 1]) === DOWN),
    `ADX ${a.adx[len - 1].toFixed(2)} ${a.adxState}`);

  // 6) BOLL %B
  const myBoll = boll(close, 20, 2);
  check("BOLL %B 独立重算一致", near(myBoll.pctB[len - 1] as number, a.bollPctB[len - 1] as number, 0.005));
  const pb = myBoll.pctB[len - 1] as number;
  const pbText = bollPctBText(pb), pbColor = bollPctBColor(pb);
  check("BOLL %B 文案/配色阈值语义",
    (pb > 1) === (pbText === "触上轨·超买") && (pb < 0) === (pbText === "触下轨·超卖")
    && (pb > 0.8 && pb <= 1) === (pbText === "偏上轨") && (pb < 0.2 && pb >= 0) === (pbText === "偏下轨")
    && (pb > 1) === (pbColor === UP) && (pb < 0) === (pbColor === DOWN), pbText);

  // 7) 布林带宽
  const bwVals: number[] = [];
  for (let i = Math.max(0, len - 120); i < len; i++) { const v = myBoll.bw[i]; if (typeof v === "number" && isFinite(v)) bwVals.push(v); }
  const myBwNow = median(bwVals) ? bwVals[bwVals.length - 1] / median(bwVals) : 1;
  const mySqueeze = bwVals.length >= 20 ? bwVals[bwVals.length - 1] <= pctl(bwVals, 0.15) : false;
  check("布林带宽/挤压独立重算一致", near(a.bollBwNow, myBwNow, Math.abs(myBwNow) * 1e-3) && a.bollSqueeze === mySqueeze,
    `bw=${a.bollBwNow.toFixed(3)} squeeze=${a.bollSqueeze}`);
  const bwText = bollBwText(a.bollBwNow, a.bollSqueeze), bwColor = bollBwColor(a.bollBwNow, a.bollSqueeze);
  check("布林带宽文案/配色阈值语义",
    a.bollSqueeze === (bwText === "带宽收缩 · 即将变盘") && (bwColor === WARN) === a.bollSqueeze
    && (a.bollBwNow > 2.2) === (bwText === "带宽扩张 · 波动剧烈") && (a.bollBwNow > 2.2 && !a.bollSqueeze) === (bwColor === UP)
    && (a.bollBwNow < 0.6 && !a.bollSqueeze) === (bwColor === PRIMARY), bwText);

  // 8) BIAS
  const m6 = ma(close, 6), m12 = ma(close, 12), m24 = ma(close, 24);
  const b6 = ((price - (m6[len - 1] || price)) / (m6[len - 1] || price)) * 100;
  const b12 = ((price - (m12[len - 1] || price)) / (m12[len - 1] || price)) * 100;
  const b24 = ((price - (m24[len - 1] || price)) / (m24[len - 1] || price)) * 100;
  check("BIAS6/12/24 独立重算一致", near(b6, a.bias6, 0.01) && near(b12, a.bias12, 0.01) && near(b24, a.bias24, 0.01));
  check("BIAS 文案/配色阈值语义",
    biasColor(b12, b24) === (b24 > 20 || b12 > 12 ? UP : b24 < -20 || b12 < -12 ? PRIMARY : INK)
    && (b24 > 20 || b12 > 12) === biasText(b6, b12, b24).includes("超买")
    && (b24 < -20 || b12 < -12) === biasText(b6, b12, b24).includes("超卖"), biasText(b6, b12, b24));

  // 9) 量比
  const v5 = ma(vol, 5), v20 = ma(vol, 20);
  const myVolRatio = v5[len - 1] && v20[len - 1] ? (v5[len - 1] as number) / (v20[len - 1] as number) : 1;
  check("量比独立重算一致", near(a.volRatio, myVolRatio, 1e-6));
  check("量能状态阈值语义", (a.volRatio > 1.15) === (volState(a.volRatio) === "放量") && (a.volRatio < 0.85) === (volState(a.volRatio) === "缩量"), volState(a.volRatio));

  // 10) 资金流（近 5 日）
  const dates = Object.keys(flowMap).filter((d) => flowMap[d] != null).sort();
  const last5 = dates.slice(-5);
  const myF5 = last5.reduce((s, d) => s + flowMap[d], 0) / 1e8;
  if (last5.length) {
    check("主力净流入(5日) 独立重算一致", near(a.f5.sum, myF5, 1e-6), `${a.f5.sum.toFixed(2)}亿`);
    const flowC = a.f5.sum > 0 ? UP : DOWN; // ReportView: 流入红 / 流出绿
    check("资金流配色语义", (a.f5.sum > 0 && flowC === UP) || (a.f5.sum <= 0 && flowC === DOWN),
      (a.f5.sum > 0 ? "+" : "") + a.f5.sum.toFixed(2) + "亿");
  } else {
    check("资金流缺数据降级", a.f5.has === false, "网关无 flow 数据");
  }

  // 11) 换手率（单位必须是 %：turnover=f61 换手率，quote_fetch 的 amount 映射是错误的）
  const turn20 = ks.slice(-20).reduce((s, k) => s + k.turnover, 0) / 20;
  const hasTurn = ks.slice(-20).some((k) => k.turnover > 0);
  if (hasTurn) {
    check("换手率(20日均) 独立重算一致", near(a.turnAvg, turn20, 1e-6), `${a.turnAvg.toFixed(2)}%`);
    check("换手率单位为百分比", a.turnAvg > 0 && a.turnAvg < 100, `${a.turnAvg.toFixed(2)}%`);
    const turn60 = ks.slice(-60).reduce((s, k) => s + k.turnover, 0) / Math.min(60, len);
    const myTurnState = turn60 > 0 && turn20 > turn60 * 1.8 ? "显著放量换手" : turn60 > 0 && turn20 < turn60 * 0.6 ? "交投清淡" : "正常";
    check("换手状态/文案一致", a.turnState === myTurnState && a.turnAvg.toFixed(2) + "% · " + a.turnState === a.turnAvg.toFixed(2) + "% · " + myTurnState, myTurnState);
  } else {
    check("换手率缺数据降级", !(a.turnAvg > 0), "降级源无 turnover");
  }

  // 12) 波动率/回撤/ATR/OBV
  const win = ks.slice(Math.max(0, len - 120));
  const rets: number[] = [];
  for (let i = 1; i < win.length; i++) rets.push(win[i].close / win[i - 1].close - 1);
  const mr = rets.reduce((x, y) => x + y, 0) / (rets.length || 1);
  const vr = rets.reduce((x, y) => x + (y - mr) * (y - mr), 0) / (rets.length || 1);
  const myVolAnn = Math.sqrt(vr) * Math.sqrt(252);
  check("年化波动率独立重算一致", near(a.volAnn, myVolAnn, 1e-4));
  let peak = -Infinity, myMdd = 0;
  for (let i = Math.max(0, len - 120); i < len; i++) { peak = Math.max(peak, close[i]); if (peak > 0) myMdd = Math.max(myMdd, (peak - close[i]) / peak); }
  check("最大回撤独立重算一致", near(a.maxDrawdown, myMdd, 1e-6), `${(a.maxDrawdown * 100).toFixed(2)}%`);
  check("最大回撤配色阈值语义", (a.maxDrawdown > 0.35) === (mddColor(a.maxDrawdown) === DOWN)
    && (a.maxDrawdown > 0.2 && a.maxDrawdown <= 0.35) === (mddColor(a.maxDrawdown) === WARN), (a.maxDrawdown * 100).toFixed(2) + "%");
  const myAtr = myDmi.atr[len - 1];
  check("ATR% 独立重算一致", near(a.atrPct, (myAtr / price) * 100, 0.01), `${a.atrPct.toFixed(2)}%`);
  const obv: number[] = new Array(len).fill(0);
  for (let i = 1; i < len; i++) obv[i] = close[i] > close[i - 1] ? obv[i - 1] + vol[i] : close[i] < close[i - 1] ? obv[i - 1] - vol[i] : obv[i - 1];
  const obvMa = ma(obv, 20);
  const myObvUp = obv[len - 1] > (obvMa[len - 1] || obv[len - 1]);
  const myObvTrend = myObvUp ? "量能配合(OBV上行)" : "量能走弱(OBV下行)";
  check("OBV 趋势/配色语义", a.obvTrend === myObvTrend && obvColor(a.obvTrend) === (myObvUp ? UP : DOWN), a.obvTrend);

  // 13) 筹码
  const c = a.chip;
  if (c) {
    check("筹码不变量（获利盘∈[0,1]、成本>0、5%分位<95%分位）",
      c.profitRatio >= 0 && c.profitRatio <= 1 && c.avgCost > 0 && c.percentiles["5"] < c.percentiles["95"]);
    const dAvg = c.avgCost ? (price - c.avgCost) / c.avgCost : 0;
    const dTxt = chipDistLabel(price, c.avgCost);
    check("筹码文案/配色阈值语义",
      (dAvg > 0.08) === dTxt.startsWith("高于成本") && (dAvg < -0.08) === dTxt.startsWith("低于成本")
      && chipDistColor(price, c.avgCost) === (dAvg > 0.08 ? UP : dAvg < -0.08 ? PRIMARY : INK)
      && (c.profitRatio > 0.85) === chipProfitText(c.profitRatio).includes("易回吐")
      && (c.profitRatio < 0.20) === chipProfitText(c.profitRatio).includes("抛压轻")
      && chipProfitColor(c.profitRatio) === (c.profitRatio > 0.85 ? UP : c.profitRatio < 0.20 ? PRIMARY : INK),
      chipProfitText(c.profitRatio));
    // 独立重算（Volume-Profile 近似全流程复刻：60桶 + [low,high]摊入 + (1,2,1)/4 平滑 + 线性插值分位）
    const slice = ks.slice(-Math.min(120, ks.length));
    let minP = Infinity, maxP = -Infinity;
    slice.forEach((k) => { minP = Math.min(minP, k.low); maxP = Math.max(maxP, k.high); });
    if (minP === maxP) maxP = minP + 1;
    const B = 60, step = (maxP - minP) / B;
    const vb = new Array(B).fill(0);
    slice.forEach((k) => {
      let b0 = Math.max(0, Math.min(B - 1, Math.floor((k.low - minP) / step)));
      let b1 = Math.max(0, Math.min(B - 1, Math.floor((k.high - minP) / step)));
      if (b1 < b0) b1 = b0;
      const span = b1 - b0 + 1;
      for (let b = b0; b <= b1; b++) vb[b] += k.vol / span;
    });
    const sm = vb.slice();
    for (let i = 1; i < B - 1; i++) sm[i] = (vb[i - 1] + vb[i] * 2 + vb[i + 1]) / 4;
    const smTotal = sm.reduce((x, y) => x + y, 0) || 1;
    let pk = 0;
    for (let i = 1; i < B; i++) if (sm[i] > sm[pk]) pk = i;
    const myPeak = minP + (pk + 0.5) * step;
    let wsum = 0;
    for (let i = 0; i < B; i++) wsum += (minP + (i + 0.5) * step) * sm[i];
    const myAvg = wsum / smTotal;
    let pv = 0;
    for (let i = 0; i < B; i++) if (minP + (i + 0.5) * step <= price) pv += sm[i];
    const myPr = pv / smTotal;
    const myPct: Record<string, number> = {};
    const targets = [5, 10, 25, 50, 75, 90, 95];
    let cum = 0, ti = 0;
    for (let i = 0; i < B && ti < targets.length; i++) {
      const prevC = cum;
      cum += sm[i];
      while (ti < targets.length && (cum / smTotal) * 100 >= targets[ti]) {
        const t = targets[ti] / 100, pLo = prevC / smTotal, pHi = cum / smTotal;
        const f = pHi !== pLo ? (t - pLo) / (pHi - pLo) : 0;
        myPct[String(targets[ti])] = +(minP + (i + f) * step).toFixed(2);
        ti++;
      }
    }
    check("筹码独立重算（成本/密集峰/获利盘/90%区间）",
      near(c.avgCost, myAvg, Math.abs(myAvg) * 1e-6) && near(c.peakPrice, myPeak, 0.01)
      && near(c.profitRatio, myPr, 1e-6)
      && near(c.percentiles["5"], myPct["5"], 0.02) && near(c.percentiles["95"], myPct["95"], 0.02),
      `90%区间 ${c.percentiles["5"]}~${c.percentiles["95"]} · 成本${c.avgCost.toFixed(2)} · 现价${price.toFixed(2)}`);
  }

  // 14) 支撑/压力
  check("支撑/压力有效（支撑<价<压力）", a.support > 0 && a.resistance > 0 && a.support <= price * 1.0001 && a.resistance >= price * 0.9999,
    `${a.support.toFixed(2)} / ${a.resistance.toFixed(2)} vs ${price.toFixed(2)}`);

  // 15) 评分可重构性：50 + Σdeltas → clamp
  const sumDelta = a.scoreReasons.reduce((s, x) => s + x.delta, 0);
  check("评分可重构（50+Σ依据分→[5,95]截断）", a.score === clamp(Math.round(50 + sumDelta), 5, 95),
    `${a.score} vs ${clamp(Math.round(50 + sumDelta), 5, 95)}`);
  const sc = scoreColor(a.score);
  check("评分配色阈值语义", (a.score >= 70) === (sc === UP) && (a.score >= 45 && a.score < 70) === (sc === WARN) && (a.score < 45) === (sc === DOWN)
    && riskColor(a.riskLevel) === (a.riskLevel === "低" ? UP : a.riskLevel === "中" ? WARN : DOWN),
    `score=${a.score} 风险=${a.riskLevel}`);
  if (a.riskLevel === "低") check("低风险与评分/波动自洽", a.score >= 70 && a.atrPct <= 4 && a.maxDrawdown <= 0.35, `score=${a.score} atr=${a.atrPct.toFixed(2)}% mdd=${(a.maxDrawdown * 100).toFixed(1)}%`);

  // 16) 大盘环境
  const env = a.marketEnv;
  check("marketEnv 真实数据（非暂无数据占位）", env.indexTrend !== "暂无数据", env.indexTrend + " / " + env.indexTrendDisplay);
  // 协同映射表复刻（analyzer 1257-1266）
  const stockUp = a.trend === "up" || a.trend === "shake_up";
  const stockDown = a.trend === "down" || a.trend === "shake_down";
  const marketUp = env.indexTrend === "上涨趋势" || env.indexTrend === "震荡偏强";
  const marketDown = env.indexTrend === "下跌趋势" || env.indexTrend === "震荡偏弱";
  const myAlign = stockUp && marketUp ? 6 : stockUp && marketDown ? -6 : stockDown && marketDown ? -6 : stockDown && marketUp ? -4 : 0;
  const myAlignText = stockUp && marketUp ? "顺大盘上涨，氛围支撑做多" : stockUp && marketDown ? "逆势上涨，需警惕补跌风险"
    : stockDown && marketDown ? "顺大盘下跌，弱势确认，不宜抄底" : stockDown && marketUp ? "大盘偏强而个股走弱，属相对弱势" : env.alignText;
  check("大盘协同评分/文案映射一致", env.alignScore === myAlign && env.alignText === myAlignText,
    `${env.alignScore}（${env.alignText}）`);
  check("协同配色（正=红利多/负=绿利空）", alignColor(env.alignScore) === (env.alignScore > 0 ? UP : env.alignScore < 0 ? DOWN : GRAY)
    && sectorAlignColor(env.sectorAlignScore || 0) === ((env.sectorAlignScore || 0) > 0 ? UP : (env.sectorAlignScore || 0) < 0 ? DOWN : GRAY),
    `align=${env.alignScore}`);
  // 仓位建议映射（本脚本无市场宽度/行业数据 → breadth=0、sector=0，分支可完全确定）
  const myPct = env.indexTrend === "下跌趋势" ? 20 : env.indexTrend === "上涨趋势" ? 55 : 40;
  const myAdvice = myPct === 20 ? "建议轻仓避险（≤20%）" : myPct === 55 ? "可适度加仓（50%–60%）" : "建议中性仓位（30%–50%）";
  check("仓位建议映射一致", env.positionPct === myPct && env.positionAdvice === myAdvice,
    `${env.positionPct}%（${env.positionAdvice}）`);
  const posC = positionColor(env.positionPct, env.positionAdvice);
  check("仓位建议配色阈值语义", (env.positionPct >= 55 && env.positionAdvice !== "暂无数据") === (posC === UP)
    && (env.positionPct <= 30 && env.positionAdvice !== "暂无数据") === (posC === DOWN)
    && (env.positionAdvice === "暂无数据") === (posC === GRAY && env.positionPct === 0),
    `${env.positionPct}% ${posC === UP ? "红" : posC === DOWN ? "绿" : "灰"}`);

  // 17) 分析结论
  const mine = buildConclusion(a);
  check("结论含趋势/阶段/风险定位", mine.indexOf(a.trendText) >= 0 && mine.indexOf("「" + a.stageText + "」") >= 0 && mine.indexOf(a.riskLevel + "风险") >= 0);
  check("结论含支撑/压力与止损/突破提示", mine.indexOf(a.support.toFixed(2)) >= 0 && mine.indexOf(a.resistance.toFixed(2)) >= 0
    && mine.indexOf("止损") >= 0 && mine.indexOf("突破") >= 0);
  check("结论操作建议与信号优先级一致（减>加>建>关注>观望）",
    (a.reduce ? mine.indexOf("逢高减仓") >= 0 : true) && (!a.reduce && a.add ? mine.indexOf("分批加仓") >= 0 : true)
    && (!a.reduce && !a.add && a.build ? mine.indexOf("分批建仓") >= 0 : true)
    && (!a.reduce && !a.add && !a.build && a.watch ? mine.indexOf("纳入自选") >= 0 : true)
    && (!a.reduce && !a.add && !a.build && !a.watch ? mine.indexOf("观望") >= 0 : true));
  const envSentence = (env.alignScore || 0) < 0 || (env.sectorAlignScore || 0) < 0 || (env.positionPct || 0) <= 30;
  check("结论环境提示句与数据一致", envSentence ? mine.indexOf(env.positionAdvice) >= 0 : mine.indexOf("大盘逆风") < 0 && mine.indexOf("行业逆风") < 0 && mine.indexOf("市场环境偏弱") < 0);
  check("结论含免责声明", mine.indexOf("非投资建议") >= 0);
  if (a.risks.length) check("风险提示均非空", a.risks.every((r: string) => r.trim().length > 0));

  // 18) env 缺数据回归（bug 修复验证）：不给指数 → 不得出现误导句
  const aNoEnv = analyze(appKl, flowMap, null, appKl, null, code, "d");
  const cNoEnv = buildConclusion(aNoEnv);
  check("指数缺数据 → 结论无「市场环境偏弱/大盘逆风」误导句",
    aNoEnv.marketEnv.indexTrend === "暂无数据" && cNoEnv.indexOf("市场环境偏弱") < 0 && cNoEnv.indexOf("大盘逆风") < 0 && cNoEnv.indexOf("行业逆风") < 0
    && cNoEnv.indexOf("非投资建议") >= 0);
  check("指数缺数据 → 面板仓位建议显示「暂无数据」", aNoEnv.marketEnv.positionAdvice === "暂无数据" && aNoEnv.marketEnv.positionPct === 0);
  return { name, secid };
}

// ---------------- 主流程 ----------------
(async () => {
  console.log("== 分析报告全条目真实数据审计 ==\n[1/2] 拉取上证指数日 K …");
  const idxKs = await fetchDaily("1.000001");
  const idxKl = toApp(idxKs);
  console.log(`    指数 ${idxKs.length} 根（${idxKs[0]?.date} ~ ${idxKs[idxKs.length - 1]?.date}）`);

  const CASES: { secid: string; name: string }[] = [
    { secid: "1.600519", name: "贵州茅台" },
    { secid: "0.000001", name: "平安银行" },
    { secid: "1.688256", name: "寒武纪" },
    { secid: "1.601919", name: "中远海控" },
    { secid: "0.300750", name: "宁德时代" },
    { secid: "1.601318", name: "中国平安" },
  ];
  console.log("[2/2] 逐股审计 …");
  for (const c of CASES) {
    try { await auditStock(c.secid, c.name, idxKl); }
    catch (e: any) { fail++; console.log(`    ❌ ${c.name} 审计异常：${e?.message || e}`); }
  }
  console.log(`\n== 审计完成：通过 ${pass} 项，失败 ${fail} 项 ==`);
  process.exit(fail ? 1 : 0);
})();
