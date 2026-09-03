// =====================================================================
// 单股端到端验证：300308 中际旭创
// 用真实 analyze() 引擎跑腾讯日 K，把 result.backtest 与独立的暴力直算
// 实现（不复用引擎代码）逐字段对拍，同时输出横幅/信号卡等报告要素做人工核对。
// 运行：npx tsx scripts/verify-300308.ts
// =====================================================================
import { analyze } from "../src/utils/analyzer";

interface Kline {
  date: string; open: number; close: number; high: number; low: number;
  vol: number; amount: number; amp: number; pct: number; chg: number; turnover: number;
}

async function fetchDaily(sym: string): Promise<Kline[]> {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${sym},day,,,320,qfq`;
  const j = await (await fetch(url)).json();
  const d = j?.data?.[sym];
  const rows = d?.qfqday || d?.day;
  if (!rows?.length) throw new Error("no klines " + sym);
  return rows.map((r: any[], i: number) => {
    const open = +r[1], close = +r[2], high = +r[3], low = +r[4];
    const prev = i > 0 ? +rows[i - 1][2] : open;
    return {
      date: r[0], open, close, high, low, vol: +r[5],
      amount: close * +r[5],
      amp: ((high - low) / prev) * 100,
      pct: ((close - prev) / prev) * 100,
      chg: close - prev,
      turnover: 0,
    };
  });
}

// 独立暴力直算（与引擎无共享代码），复刻同一规则：MA5 上穿 MA20 且 vol>VMA5 → 买入；
// MA5 下穿 MA20 → 卖出；统计 20 日前瞻收益。
function bruteForce(ks: Kline[]) {
  const c = ks.map((k) => k.close);
  const v = ks.map((k) => k.vol);
  const avg = (arr: number[], i: number, n: number) => {
    if (i < n - 1) return null;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += arr[j];
    return s / n;
  };
  const H = 20;
  let bN = 0, bW = 0, bR = 0, sN = 0, sW = 0, sR = 0;
  const log: string[] = [];
  for (let i = 20; i < c.length - H; i++) {
    const m5 = avg(c, i, 5), m5p = avg(c, i - 1, 5), m20 = avg(c, i, 20), m20p = avg(c, i - 1, 20), v5 = avg(v, i, 5);
    if (m5 == null || m5p == null || m20 == null || m20p == null || v5 == null) continue;
    const fwd = c[i + H] / c[i] - 1;
    if (m5p <= m20p && m5 > m20 && v[i] > v5) {
      bN++; bR += fwd; if (fwd > 0) bW++;
      log.push(`${ks[i].date} 买 → +${(fwd * 100).toFixed(2)}%`);
    } else if (m5p >= m20p && m5 < m20) {
      sN++; sR += fwd; if (fwd < 0) sW++;
      log.push(`${ks[i].date} 卖 → ${(fwd * 100).toFixed(2)}%`);
    }
  }
  return {
    bars: c.length, buyCount: bN, buyWinRate: bN ? bW / bN : 0, buyAvgRet: bN ? bR / bN : 0,
    sellCount: sN, sellWinRate: sN ? sW / sN : 0, sellAvgRet: sN ? sR / sN : 0, log,
  };
}

async function main() {
const kl = await fetchDaily("sz300308");
const r = analyze(kl, {}, null, kl, null, "300308", "d");
const bt = r.backtest;
const bf = bruteForce(kl);

console.log(`【300308 中际旭创】bars=${bt.bars}（独立直算 bars=${bf.bars}）`);
console.log(
  `引擎回测: 买入 ${bt.buyCount}次 · ${bt.horizon}日胜率 ${(bt.buyWinRate * 100).toFixed(0)}% · 均收 ${(bt.buyAvgRet * 100).toFixed(2)}% | ` +
  `卖出 ${bt.sellCount}次 · 胜率 ${(bt.sellWinRate * 100).toFixed(0)}% · 均收 ${(bt.sellAvgRet * 100).toFixed(2)}%`
);
console.log(
  `独立复算: 买入 ${bf.buyCount}次 · 胜率 ${(bf.buyWinRate * 100).toFixed(0)}% · 均收 ${(bf.buyAvgRet * 100).toFixed(2)}% | ` +
  `卖出 ${bf.sellCount}次 · 胜率 ${(bf.sellWinRate * 100).toFixed(0)}% · 均收 ${(bf.sellAvgRet * 100).toFixed(2)}%`
);

const ok =
  bt.bars === bf.bars && bt.buyCount === bf.buyCount && bt.sellCount === bf.sellCount &&
  Math.abs(bt.buyWinRate - bf.buyWinRate) < 1e-12 && Math.abs(bt.buyAvgRet - bf.buyAvgRet) < 1e-12 &&
  Math.abs(bt.sellWinRate - bf.sellWinRate) < 1e-12 && Math.abs(bt.sellAvgRet - bf.sellAvgRet) < 1e-12;
console.log(ok ? "对拍 PASS：引擎与独立实现完全一致" : "对拍 FAIL：数值不一致！");
console.log("\n逐笔信号（独立实现）:");
for (const l of bf.log) console.log("  " + l);

console.log("\n报告要素抽查:");
console.log(`  score=${r.score} trend=${r.trendText} 支撑=${r.support?.toFixed(2)} 压力=${r.resistance?.toFixed(2)} nearSup=${r.nearSup} nearRes=${r.nearRes}`);
console.log(`  banner[${r.bannerCls}]: ${r.banner}`);
console.log(`  signal: ${r.signal.label} · ${r.signal.text}`);
console.log(`    触发: ${r.signal.reason}`);
console.log(`    确认: ${r.signal.confirm}`);

process.exit(ok ? 0 : 1);
}

main();
