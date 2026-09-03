// =====================================================================
// 信号回测准确性审计：独立复算 src/utils/analyzer.ts 的 backtest 结果
// ---------------------------------------------------------------------
// 两套实现互相验证：
//   A（同义复刻）：与 analyzer.ts 的滑窗 ma() + 交叉判定逐行同义；
//   B（暴力直算）：每个点直接 slice 求均值、显式比较，不复用任何滑窗代码。
// 两套结果（次数/胜率/均收/逐笔信号）必须完全一致，否则 FAIL。
// 数据：腾讯日 K（web.ifzq.gtimg.cn，param=sym,day,,,320,qfq，与网关 tencent 分支一致，前复权；
// 320 根上限 ≈ 报告面板 bars≈321 的实际样本口径）。
// 用法：node scripts/backtest-audit.mjs
// =====================================================================
const STOCKS = [
  ["sh600519", "贵州茅台"],
  ["sz000001", "平安银行"],
  ["sh601899", "紫金矿业"],
  ["sz300750", "宁德时代"],
  ["sh600036", "招商银行"],
  ["sz300308", "中际旭创"],
];

async function fetchDaily(sym) {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${sym},day,,,320,qfq`;
  const j = await (await fetch(url)).json();
  const d = j?.data?.[sym];
  const rows = d?.qfqday || d?.day;
  if (!rows?.length) throw new Error("no klines " + sym);
  return rows.map((r) => ({ date: r[0], close: +r[2], high: +r[3], low: +r[4], vol: +r[5] }));
}

// 与 analyzer.ts ma() 同义：滑窗均值，i>=n-1 才有值
function ma(arr, n) {
  const r = new Array(arr.length).fill(null);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= n) sum -= arr[i - n];
    if (i >= n - 1) r[i] = sum / n;
  }
  return r;
}

const H = 20;

// 实现 A：与 analyzer.ts backtest 逐行同义
function backtestA(ks) {
  const c = ks.map((k) => k.close);
  const v = ks.map((k) => k.vol);
  const m5 = ma(c, 5);
  const m20 = ma(c, 20);
  const v5 = ma(v, 5);
  let bN = 0, bW = 0, bR = 0, sN = 0, sW = 0, sR = 0;
  const log = [];
  for (let i = 20; i < c.length - H; i++) {
    if (m5[i] == null || m5[i - 1] == null || m20[i] == null || m20[i - 1] == null || v5[i] == null) continue;
    const fwd = c[i + H] / c[i] - 1;
    if (m5[i - 1] <= m20[i - 1] && m5[i] > m20[i] && v[i] > v5[i]) {
      bN++; bR += fwd; if (fwd > 0) bW++;
      log.push({ dir: "buy", date: ks[i].date, fwd: +(fwd * 100).toFixed(2) });
    } else if (m5[i - 1] >= m20[i - 1] && m5[i] < m20[i]) {
      sN++; sR += fwd; if (fwd < 0) sW++;
      log.push({ dir: "sell", date: ks[i].date, fwd: +(fwd * 100).toFixed(2) });
    }
  }
  return { bars: c.length, bN, bWin: bN ? bW / bN : 0, bAvg: bN ? bR / bN : 0, sN, sWin: sN ? sW / sN : 0, sAvg: sN ? sR / sN : 0, log };
}

// 实现 B：暴力直算，均值每次独立求和，不使用滑窗
function backtestB(ks) {
  const c = ks.map((k) => k.close);
  const v = ks.map((k) => k.vol);
  const avg = (arr, i, n) => {
    if (i < n - 1) return null;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += arr[j];
    return s / n;
  };
  let bN = 0, bW = 0, bR = 0, sN = 0, sW = 0, sR = 0;
  const log = [];
  for (let i = 20; i < c.length - H; i++) {
    const m5 = avg(c, i, 5), m5p = avg(c, i - 1, 5), m20 = avg(c, i, 20), m20p = avg(c, i - 1, 20), v5 = avg(v, i, 5);
    if (m5 == null || m5p == null || m20 == null || m20p == null || v5 == null) continue;
    const fwd = c[i + H] / c[i] - 1;
    if (m5p <= m20p && m5 > m20 && v[i] > v5) {
      bN++; bR += fwd; if (fwd > 0) bW++;
      log.push({ dir: "buy", date: ks[i].date, fwd: +(fwd * 100).toFixed(2) });
    } else if (m5p >= m20p && m5 < m20) {
      sN++; sR += fwd; if (fwd < 0) sW++;
      log.push({ dir: "sell", date: ks[i].date, fwd: +(fwd * 100).toFixed(2) });
    }
  }
  return { bars: c.length, bN, bWin: bN ? bW / bN : 0, bAvg: bN ? bR / bN : 0, sN, sWin: sN ? sW / sN : 0, sAvg: sN ? sR / sN : 0, log };
}

const pct = (x) => (x * 100).toFixed(2) + "%";
let fail = 0;
for (const [secid, name] of STOCKS) {
  const ks = await fetchDaily(secid);
  const A = backtestA(ks);
  const B = backtestB(ks);
  const same =
    A.bars === B.bars && A.bN === B.bN && A.sN === B.sN &&
    Math.abs(A.bWin - B.bWin) < 1e-12 && Math.abs(A.bAvg - B.bAvg) < 1e-12 &&
    Math.abs(A.sWin - B.sWin) < 1e-12 && Math.abs(A.sAvg - B.sAvg) < 1e-12 &&
    A.log.length === B.log.length &&
    A.log.every((e, i) => e.dir === B.log[i].dir && e.date === B.log[i].date && e.fwd === B.log[i].fwd);
  if (!same) fail++;
  console.log(`\n【${name} ${secid}】bars=${A.bars}  ${same ? "PASS(双实现一致)" : "FAIL(两实现不一致!)"}`);
  console.log(`  买入信号 ${A.bN}次 · 20日胜率 ${(A.bWin * 100).toFixed(0)}% · 均收 ${A.bAvg >= 0 ? "+" : ""}${pct(A.bAvg)}`);
  console.log(`  卖出信号 ${A.sN}次 · 20日胜率 ${(A.sWin * 100).toFixed(0)}% · 均收 ${(A.sAvg >= 0 ? "+" : "") + pct(A.sAvg)}`);
  for (const e of A.log) console.log(`    ${e.date} ${e.dir === "buy" ? "买" : "卖"} → 20日后 ${e.fwd >= 0 ? "+" : ""}${e.fwd}%`);
}
console.log(fail === 0 ? "\n全部通过" : `\n${fail} 只股票双实现不一致`);
process.exit(fail === 0 ? 0 : 1);
