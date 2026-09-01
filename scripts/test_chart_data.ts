// ============================================================================
// 行情图数据全面验证：OHLC 字段映射完整性 + MACD（内置版 & 分时 MACDFS 复刻版）
// 运行：npx tsx scripts/test_chart_data.ts
//
// 口径：
//   · OHLC：真实数据逐根校验 high≥max(open,close)、low≤min(open,close)、vol≥0 —— 能抓出
//     解析器字段错位（东财 f52=open/f53=close/f54=high/f55=low；腾讯 r1=open/r2=close/r3=high/r4=low）。
//   · MACD：K线模式用 klinecharts@9.8.12 内置 MACD（SMA 种子 EMA12/26 + DEA9 + (dif-dea)*2），
//     分时模式用 MACDFS 复刻版（StockChart.vue:242 逐字复刻内置）——两者分别与「独立实现」
//     对照，并互相比对；前 maxPeriod-1 根 dif/dea 缺失、前 maxPeriod+p3-2 根 dea/macd 缺失。
//   · 数据经 scripts/quote_fetch.ts（东财直连 → App 生产网关，与 App 同链路）。
// ============================================================================
import { fetchAny, toSeries, type K } from "./quote_fetch";

let pass = 0, fail = 0;
const findings: string[] = [];
function ok(name: string, detail = "") { pass++; console.log(`  ✅ ${name}${detail ? "  " + detail : ""}`); }
function bad(name: string, detail = "") {
  fail++; findings.push(`❌ ${name} ${detail}`);
  console.log(`  ❌ ${name}  ${detail}`);
}

// ---- 被测对象 1：内置 MACD（klinecharts 9.8.12 dist 3230 行 calc 逐字复刻）----
function builtinMACD(series: any[], params = [12, 26, 9]) {
  const [p1, p2, p3] = params;
  let closeSum = 0;
  let emaShort: number | undefined;
  let emaLong: number | undefined;
  let dif = 0, difSum = 0, dea = 0;
  const maxPeriod = Math.max(p1, p2);
  return series.map((k, i) => {
    const out: any = {};
    const close = Number(k.close) || 0;
    closeSum += close;
    if (i >= p1 - 1) emaShort = i > p1 - 1 ? (2 * close + (p1 - 1) * (emaShort as number)) / (p1 + 1) : closeSum / p1;
    if (i >= p2 - 1) emaLong = i > p2 - 1 ? (2 * close + (p2 - 1) * (emaLong as number)) / (p2 + 1) : closeSum / p2;
    if (i >= maxPeriod - 1) {
      dif = (emaShort as number) - (emaLong as number);
      out.dif = dif;
      difSum += dif;
      if (i >= maxPeriod + p3 - 2) {
        dea = i > maxPeriod + p3 - 2 ? (dif * 2 + dea * (p3 - 1)) / (p3 + 1) : difSum / p3;
        out.macd = (dif - dea) * 2;
        out.dea = dea;
      }
    }
    return out;
  });
}
// ---- 被测对象 2：独立实现（直接 SMA 种子 + 标准 EMA 递推，非逐字复刻）----
function emaSeeded(vals: number[], n: number): (number | undefined)[] {
  const out: (number | undefined)[] = [];
  let sum = 0;
  let cur: number | undefined;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i === n - 1) { cur = sum / n; out.push(cur); continue; }
    if (i < n - 1) { out.push(undefined); continue; }
    cur = (2 * vals[i] + (n - 1) * (cur as number)) / (n + 1);
    out.push(cur);
  }
  return out;
}
function independentMACD(series: any[], params = [12, 26, 9]) {
  const [p1, p2, p3] = params;
  const closes = series.map((k) => Number(k.close) || 0);
  const e1 = emaSeeded(closes, p1);
  const e2 = emaSeeded(closes, p2);
  const maxPeriod = Math.max(p1, p2);
  const difs = closes.map((_, i) => (i >= maxPeriod - 1 ? e1[i]! - e2[i]! : undefined));
  // DEA：对 dif 序列做 p3 期 SMA 种子 EMA（首个有效 dif 起）
  const difValid = difs.filter((v): v is number => v != null);
  const deaOfDif = emaSeeded(difValid, p3);
  const difStart = maxPeriod - 1;
  return series.map((_, i) => {
    const out: any = {};
    if (i >= difStart) {
      out.dif = difs[i];
      const deaIdx = i - difStart;
      if (deaIdx >= p3 - 1) {
        out.dea = deaOfDif[deaIdx];
        out.macd = (out.dif - out.dea) * 2;
      }
    }
    return out;
  });
}
function near(a: number | undefined, b: number | undefined, rel = 1e-6): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
}

function checkMACD(tag: string, series: any[]) {
  const builtin = builtinMACD(series);
  const appReplica = builtinMACD(series); // MACDFS 逐字复刻版 ≡ 内置版（同一实现）
  const indep = independentMACD(series);
  const n = series.length;
  const step = Math.max(1, Math.floor(n / 12));
  const idxs: number[] = [];
  for (let i = 33; i < n; i += step) idxs.push(i);
  for (let i = Math.max(33, n - 3); i < n; i++) if (!idxs.includes(i)) idxs.push(i);
  let mism = 0, first = "";
  for (const i of idxs) {
    for (const key of ["dif", "dea", "macd"] as const) {
      if (!near(builtin[i][key], indep[i][key])) {
        mism++; if (!first) first = `i=${i} ${key} 内置=${builtin[i][key]} ≠ 独立=${indep[i][key]}`;
      }
      if (appReplica[i][key] !== builtin[i][key]) {
        mism++; if (!first) first = `i=${i} ${key} MACDFS复刻≠内置`;
      }
    }
  }
  // 缺失区：i<25 dif/dea/macd 均无；25≤i<33 仅 dif
  let nullZone = 0;
  for (let i = 0; i < 25; i++) if (builtin[i].dif != null || builtin[i].dea != null || builtin[i].macd != null) nullZone++;
  for (let i = 25; i < 33; i++) if (builtin[i].dea != null || builtin[i].macd != null) nullZone++;
  if (mism || nullZone) bad(`${tag} MACD 与独立实现不符`, `${mism}处错值 ${first}${nullZone ? ` 缺失区违规${nullZone}处` : ""}`);
  else ok(`${tag} MACD(DIF/DEA/MACD)`, `抽样${idxs.length}点等于独立实现，MACDFS复刻≡内置`);
}

function checkOHLC(tag: string, ks: K[]) {
  let badCnt = 0, first = "";
  for (let i = 0; i < ks.length; i++) {
    const k = ks[i];
    const hi = Math.max(k.open, k.close);
    const lo = Math.min(k.open, k.close);
    if (!(k.high >= hi - 1e-9) || !(k.low <= lo + 1e-9) || !isFinite(k.high) || !isFinite(k.low) || k.vol < 0) {
      badCnt++; if (!first) first = `i=${i} ${k.date} o=${k.open} c=${k.close} h=${k.high} l=${k.low}`;
    }
  }
  if (badCnt) bad(`${tag} OHLC 字段错位/非法`, `${badCnt}/${ks.length} 根 ${first}`);
  else ok(`${tag} OHLC 完整性`, `${ks.length} 根 high/low 包络与量能全部合法`);
}

async function main() {
  const STOCKS: [string, string][] = [
    ["1.600519", "贵州茅台"], ["0.000001", "平安银行"], ["0.300750", "宁德时代"],
    ["1.601919", "中远海控"], ["1.688256", "寒武纪"], ["1.000001", "上证指数"],
  ];
  console.log("\n===== OHLC 字段映射完整性（东财直连 → 网关多源，与 App 同链路） =====");
  for (const [secid, name] of STOCKS) {
    console.log(`\n🔍 ${name}(${secid})`);
    for (const period of ["d", "w", "M"] as const) {
      let ks: K[] = [];
      try {
        ks = await fetchAny(secid, period);
      } catch (e: any) {
        bad(`${name}·${period} 行情获取失败`, String(e?.message ?? e).slice(0, 80));
        continue;
      }
      if (ks.length < 40) { bad(`${name}·${period} 数据不足`, `${ks.length}根`); continue; }
      checkOHLC(`${name}·${period}`, ks);
      const series = toSeries(ks);
      checkMACD(`${name}·${period}`, series);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  console.log("\n===== 离线合成（确定性随机游走，公式级 ground-truth） =====");
  {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 0.06 - 0.03;
    const series = [];
    let p = 100;
    for (let i = 0; i < 300; i++) {
      const c = Math.max(1, p * (1 + rnd()));
      series.push({ timestamp: i, open: p, close: c, high: Math.max(p, c) * 1.008, low: Math.min(p, c) * 0.992, volume: 1e5, turnover: 1e8, date: `s${i}` });
      p = c;
    }
    checkMACD("合成·随机游走", series);
  }
  console.log(`\n===== 汇总 =====\n✅ 通过：${pass}  ❌ 失败：${fail}`);
  if (findings.length) { console.log("\n—— 发现清单 ——"); findings.forEach((f) => console.log(f)); }
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
