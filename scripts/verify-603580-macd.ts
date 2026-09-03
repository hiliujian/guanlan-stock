// =====================================================================
// 单股 MACD 形态端到端验证：603580
// 用独立实现（不复用引擎指标代码）计算标准 MACD（EMA12/EMA26/DEA9），
// 列出近 30 根全部 DIF/DEA 交叉点，再与 analyze() 引擎的 macdCross 对拍，
// 验证报告「死叉·看空」形态识别是否属实、文案是否由状态动态驱动。
// 运行：npx tsx scripts/verify-603580-macd.ts
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

// 独立 MACD（标准定义，与引擎零共享代码）：DIF=EMA12-EMA26，DEA=EMA9(DIF)，柱=(DIF-DEA)×2
function stdMacd(closes: number[]) {
  const ema = (n: number) => {
    const k = 2 / (n + 1);
    const out: number[] = [];
    let e = closes[0];
    for (const c of closes) {
      e = c * k + e * (1 - k);
      out.push(e);
    }
    return out;
  };
  const e12 = ema(12), e26 = ema(26);
  const dif = e12.map((v, i) => v - e26[i]);
  const k9 = 2 / 10;
  const dea: number[] = [];
  let d = dif[0];
  for (const v of dif) {
    d = v * k9 + d * (1 - k9);
    dea.push(d);
  }
  const bar = dif.map((v, i) => (v - dea[i]) * 2);
  return { dif, dea, bar };
}

async function main() {
  const kl = await fetchDaily("sh603580");
  const closes = kl.map((k) => k.close);
  const { dif, dea, bar } = stdMacd(closes);

  // 近 30 根的全部交叉点（判定规则与引擎 cross() 相同，此处独立重写）
  const crosses: { i: number; type: "gold" | "dead" }[] = [];
  for (let i = Math.max(1, closes.length - 30); i < closes.length; i++) {
    if (dif[i - 1] <= dea[i - 1] && dif[i] > dea[i]) crosses.push({ i, type: "gold" });
    if (dif[i - 1] >= dea[i - 1] && dif[i] < dea[i]) crosses.push({ i, type: "dead" });
  }
  const lastCross = crosses[crosses.length - 1] ?? null;

  console.log(`【603580】日线 ${closes.length} 根（${kl[0].date} ~ ${kl[kl.length - 1].date}）`);
  console.log("\n近 10 根独立 MACD（DIF / DEA / 柱×2）:");
  for (let i = closes.length - 10; i < closes.length; i++) {
    console.log(`  ${kl[i].date}  DIF=${dif[i].toFixed(3)}  DEA=${dea[i].toFixed(3)}  柱=${bar[i].toFixed(3)}${crosses.some((c) => c.i === i) ? "  ← 交叉" : ""}`);
  }
  console.log("\n近 30 根交叉点:");
  if (!crosses.length) console.log("  （无）");
  for (const c of crosses) {
    console.log(`  ${kl[c.i].date}  ${c.type === "gold" ? "金叉（DIF 上穿 DEA）" : "死叉（DIF 下穿 DEA）"}`);
  }
  if (lastCross) {
    console.log(`\n独立实现结论：最近一次交叉 = ${lastCross.type === "gold" ? "金叉" : "死叉"} @ ${kl[lastCross.i].date}（距今 ${closes.length - 1 - lastCross.i} 根）`);
  }

  // 引擎对拍
  const r = analyze(kl, {}, null, kl, null, "603580", "d");
  const m = r.macd;
  const n = closes.length;
  let maxDif = 0, maxDea = 0;
  for (let i = Math.max(0, n - 10); i < n; i++) {
    maxDif = Math.max(maxDif, Math.abs((m.dif[i] as number) - dif[i]));
    maxDea = Math.max(maxDea, Math.abs((m.dea[i] as number) - dea[i]));
  }
  console.log(`\n引擎对拍（近 10 根逐点）：|ΔDIF|max=${maxDif.toExponential(2)}  |ΔDEA|max=${maxDea.toExponential(2)}`);
  const macdOk = maxDif < 1e-6 && maxDea < 1e-6;
  const expect = lastCross ? lastCross.type : null;
  const crossOk = r.macdCross === expect;
  console.log(`引擎 macdCross=${r.macdCross}  独立实现=${expect ?? "null"}  →  ${crossOk ? "一致" : "不一致！"}`);
  console.log(`前端文案映射：${r.macdCross === "gold" ? "金叉·看多" : r.macdCross === "dead" ? "死叉·看空" : (m.macd[n - 1] as number) > 0 ? "红柱·多头" : "绿柱·空头"}`);
  console.log(`  score=${r.score} trend=${r.trendText} 现价≈${closes[n - 1]}`);

  const ok = macdOk && crossOk;
  console.log(ok ? "\n验证 PASS：形态识别属实，指标与独立实现一致" : "\n验证 FAIL！");
  process.exit(ok ? 0 : 1);
}

main();
