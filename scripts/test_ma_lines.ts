// ============================================================================
// 行情图均线（主图 MA5/10/20/60/250 + 量图 MA5/10/20）真实数据验证脚本
// 运行：npx tsx scripts/test_ma_lines.ts
//
// 口径：
//   · 主图 MA：StockChart.vue:305 自算滚动和 SMA（close，前 N-1 根为 null）逐根复刻，
//     与「独立直接求和 SMA」逐根对照——两种求和方式独立实现，能互抓窗口偏移/滚动减法错位。
//   · 量图 MA：K线模式用 klinecharts@9.8.12 内置 VOL（已读源码，滚动和 SMA over volume），
//     分时模式用 App 复刻版（StockChart.vue:179 与内置逐字一致）——同样与独立 SMA 对照。
//   · 数据：东财公开 K 线接口（与 App 同源同参），日/周/月三周期。
// ============================================================================
import { fetchAny, toSeries, type K } from "./quote_fetch";

let pass = 0, fail = 0;
const findings: string[] = [];
function ok(name: string, detail = "") { pass++; console.log(`  ✅ ${name}${detail ? "  " + detail : ""}`); }
function bad(name: string, detail = "") {
  fail++; findings.push(`❌ ${name} ${detail}`);
  console.log(`  ❌ ${name}  ${detail}`);
}

// ---- 被测对象 1：主图 MA（StockChart.vue:305-314 逐字复刻）----
function appMainMA(series: any[], period: number): (number | null)[] {
  const res: (number | null)[] = [];
  let sum = 0;
  for (let j = 0; j < series.length; j++) {
    const c = Number(series[j].close) || 0;
    sum += c;
    if (j >= period) sum -= Number(series[j - period].close) || 0;
    res.push(j >= period - 1 ? sum / period : null);
  }
  return res;
}
// ---- 被测对象 2：量图 MA（klinecharts 9.8.12 内置 VOL calc 逐字复刻）----
function appVolMA(series: any[], params: number[]): Record<string, (number | null)>[] {
  const volSums: number[] = [];
  return series.map((k, i) => {
    const volume = k.volume || 0;
    const vol: any = { volume };
    params.forEach((p, index) => {
      volSums[index] = (volSums[index] || 0) + volume;
      if (i >= p - 1) {
        vol[`ma${index + 1}`] = volSums[index] / p;
        volSums[index] -= series[i - (p - 1)]?.volume || 0;
      } else {
        vol[`ma${index + 1}`] = null;
      }
    });
    return vol;
  });
}
// ---- 参照实现：独立直接求和 SMA（非滚动）----
function directSMA(vals: number[], i: number, n: number): number {
  let s = 0;
  for (let j = i - n + 1; j <= i; j++) s += vals[j];
  return s / n;
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
}

function checkMa(tag: string, series: any[], periods: number[], src: "close" | "volume") {
  const vals = series.map((d) => (src === "close" ? Number(d.close) || 0 : d.volume || 0));
  for (const p of periods) {
    const app = src === "close" ? appMainMA(series, p) : null;
    const vol = src === "volume" ? appVolMA(series, periods) : null;
    const key = src === "volume" ? `ma${periods.indexOf(p) + 1}` : "";
    const get = (i: number): number | null =>
      src === "close" ? app![i] : (vol![i][key] ?? null);
    // 抽样对照：步进 + 末尾 3 根全覆盖
    const step = Math.max(1, Math.floor(series.length / 10));
    const idxs: number[] = [];
    for (let i = p - 1; i < series.length; i += step) idxs.push(i);
    for (let i = Math.max(p - 1, series.length - 3); i < series.length; i++) if (!idxs.includes(i)) idxs.push(i);
    let mismatch = 0, first = "";
    for (const i of idxs) {
      const got = get(i);
      if (got == null) { mismatch++; if (!first) first = `i=${i} 应有值却为 null`; continue; }
      const exp = directSMA(vals, i, p);
      if (!near(got, exp)) { mismatch++; if (!first) first = `i=${i} got=${got} ≠ SMA=${exp}`; }
    }
    // null 区（前 p-1 根必须为 null）
    let nullZone = 0;
    for (let i = 0; i < Math.min(p - 1, series.length); i++) if (get(i) != null) nullZone++;
    const lastOk = series.length >= p ? get(series.length - 1) != null : get(series.length - 1) == null;
    if (mismatch || nullZone || !lastOk)
      bad(`${tag} MA${p}(${src}) 与独立SMA不符`, `${mismatch}处错值 ${first}${nullZone ? ` null区违规${nullZone}处` : ""}${!lastOk ? " 末根存在性错误" : ""}`);
    else ok(`${tag} MA${p}(${src})`, `抽样${idxs.length}点逐点等于SMA`);
  }
}

async function main() {
  const STOCKS: [string, string][] = [
    ["1.600519", "贵州茅台"], ["0.000001", "平安银行"], ["0.300750", "宁德时代"],
    ["1.601919", "中远海控"], ["1.688256", "寒武纪"], ["1.000001", "上证指数"],
  ];
  console.log("\n===== A. 主图 MA5/10/20/60/250（自算滚动 SMA vs 独立直接 SMA）+ 量图 MA5/10/20 =====");
  for (const [secid, name] of STOCKS) {
    console.log(`\n🔍 ${name}(${secid})`);
    for (const period of ["d", "w", "M"] as const) {
      const klt = { d: 101, w: 102, M: 103 }[period];
      const begDays = { d: -730, w: -2200, M: -3650 }[period];
      let ks: K[] = [];
      try {
        ks = await fetchAny(secid, period);
      } catch (e: any) {
        bad(`${name}·${period} 行情获取失败`, String(e?.message ?? e).slice(0, 80));
        continue;
      }
      if (ks.length < 30) { bad(`${name}·${period} 数据不足`, `${ks.length}根`); continue; }
      const series = toSeries(ks);
      console.log(`     ${period}: ${ks.length} 根`);
      checkMa(`${name}·${period}`, series, [5, 10, 20, 60, 250], "close");
      checkMa(`${name}·${period}`, series, [5, 10, 20], "volume");
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  console.log("\n===== B. 离线合成（确定性随机游走，公式级 ground-truth，不依赖网络） =====");
  {
    // 线性同余伪随机（种子固定可复现），范围 ±3%
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 0.06 - 0.03;
    const series = [];
    let p = 100;
    for (let i = 0; i < 400; i++) {
      const c = Math.max(1, p * (1 + rnd()));
      series.push({ timestamp: i, open: p, close: c, high: c * 1.01, low: p * 0.99, volume: Math.floor(1e5 + rnd() * 1e5), turnover: 1e8, date: `s${i}` });
      p = c;
    }
    checkMa("合成·随机游走", series, [5, 10, 20, 60, 250], "close");
    checkMa("合成·随机游走", series, [5, 10, 20], "volume");
    // 短序列：长度 < 周期 → 末根应为 null（图例自动隐藏，不得出现假值）
    const short = series.slice(0, 40);
    const m250 = appMainMA(short, 250);
    if (m250[short.length - 1] === null) ok("合成·短序列 MA250 末根为 null（数据不足不输出假值）");
    else bad("合成·短序列 MA250 末根非 null", String(m250[short.length - 1]));
  }
  console.log(`\n===== 汇总 =====\n✅ 通过：${pass}  ❌ 失败：${fail}`);
  if (findings.length) { console.log("\n—— 发现清单 ——"); findings.forEach((f) => console.log(f)); }
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
