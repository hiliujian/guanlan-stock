// ============================================================================
// 行情图 MACD 绘制准确性审计（test_macd_chart）
//
// 验证三件事：
//   1) klinecharts 内置 MACD（日K/周K/月K 面板用）= 标准 A 股 MACD 公式
//      （EMA 用前 N 根 SMA 做种子；DIF=EMA12-EMA26；DEA=EMA(DIF,9)；柱=2×(DIF-DEA)）
//      —— 用一份独立改写实现的公式逐股逐周期比对末根值（1e-6）；
//   2) 分时面板自定义 MACDFS（StockChart.vue 复刻版）与内置 MACD 全序列完全相等；
//   3) 预热行为：dif 从第 26 根、dea/柱从第 33 根才有值（图表前段不画假值）；
//   4) 图↔报告口径量化：analyzer.ts macd()（首值种子 EMA）与图表内置 MACD 的
//      末根差异、柱符号一致性、近 8 根金叉/死叉判定一致性。
// 数据：东财真实 K（klt=101/102/103，与 App period.ts 映射一致）× 3 只样本股。
// ============================================================================
interface K { date: string; close: number }

let pass = 0;
let fail = 0;
function check(tag: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log("  ✅ " + tag + (detail ? "（" + detail + "）" : "")); }
  else { fail++; console.log("  ❌ " + tag + (detail ? " —— " + detail : "")); }
}

// ---------------- 取数（与 App period.ts 同参：klt 101/102/103） ----------------
function parseEMKlines(j: any): K[] {
  return (j?.data?.klines ?? []).map((s: string) => {
    const a = s.split(",");
    return { date: a[0], close: +a[2] };
  });
}
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
async function fetchK(secid: string, klt: number, beg: number, retry = 2): Promise<K[]> {
  const periodKey = klt === 101 ? "d" : klt === 102 ? "w" : "M";
  const url =
    `https://push2his.eastmoney.com/api/qt/stock/kline/get` +
    `?fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61` +
    `&klt=${klt}&fqt=1&secid=${secid}&beg=${beg}&end=20500101`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const ks = parseEMKlines(await res.json());
    if (!ks.length) throw new Error("空数据");
    return ks;
  } catch (e) {
    // 东财直连失败（本机 IPv6 环境）：回落 App 生产网关 kind:kline（eastmoney 源同一解析器，口径不变；
    // 腾讯源周/月 K 同样可解析 day/qfqday 数组，close 字段一致）。
    if (retry > 0) { await new Promise((r) => setTimeout(r, 1200)); return fetchK(secid, klt, beg, retry - 1); }
    const g = loadGateway();
    if (!g) throw e;
    const res = await fetch(g.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: g.key, Authorization: `Bearer ${g.key}` },
      body: JSON.stringify({ kind: "kline", secid, period: periodKey }),
      signal: AbortSignal.timeout(20000),
    });
    const j: any = await res.json();
    if (j?.ok !== true || typeof j.text !== "string") throw new Error(j?.error || "网关返回异常");
    if (j.source === "eastmoney") return parseEMKlines(JSON.parse(j.text));
    if (j.source === "tencent") {
      const sym = (secid.startsWith("1.") ? "sh" : "sz") + secid.split(".")[1];
      const node = JSON.parse(j.text)?.data?.[sym];
      const arr: any[] = node?.qfqweek || node?.week || node?.qfqmonth || node?.month || node?.qfqday || node?.day || [];
      if (!arr.length) throw new Error(`网关腾讯源 ${periodKey}K 为空`);
      return arr.map((r: any[]) => ({ date: String(r[0]), close: +r[2] }));
    }
    throw new Error("未支持的网关源: " + j.source);
  }
}

// ---------------- ① klinecharts 内置 MACD calc（node_modules/klinecharts/dist/index.esm.js 3227-3269 逐行复刻） ----------------
function builtinMacd(dataList: { close: number }[], params = [12, 26, 9]) {
  const closeSum0 = 0;
  let closeSum = closeSum0;
  let emaShort: number | undefined;
  let emaLong: number | undefined;
  let dif = 0;
  let difSum = 0;
  let dea = 0;
  const maxPeriod = Math.max(params[0], params[1]);
  return dataList.map((kLineData, i) => {
    const macd: any = {};
    const close = kLineData.close;
    closeSum += close;
    if (i >= params[0] - 1) {
      if (i > params[0] - 1) emaShort = (2 * close + (params[0] - 1) * emaShort!) / (params[0] + 1);
      else emaShort = closeSum / params[0];
    }
    if (i >= params[1] - 1) {
      if (i > params[1] - 1) emaLong = (2 * close + (params[1] - 1) * emaLong!) / (params[1] + 1);
      else emaLong = closeSum / params[1];
    }
    if (i >= maxPeriod - 1) {
      dif = emaShort! - emaLong!;
      macd.dif = dif;
      difSum += dif;
      if (i >= maxPeriod + params[2] - 2) {
        if (i > maxPeriod + params[2] - 2) dea = (dif * 2 + dea * (params[2] - 1)) / (params[2] + 1);
        else dea = difSum / params[2];
        macd.macd = (dif - dea) * 2;
        macd.dea = dea;
      }
    }
    return macd;
  });
}

// ---------------- ② 标准 MACD（独立改写结构，防转录笔误；口径=国内主流行情软件） ----------------
function stdEma(xs: number[], n: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(xs.length);
  let seed = 0;
  for (let i = 0; i < xs.length; i++) {
    if (i < n - 1) { seed += xs[i]; continue; }
    if (i === n - 1) { seed += xs[i]; out[i] = seed / n; continue; }
    out[i] = (2 * xs[i] + (n - 1) * out[i - 1]!) / (n + 1);
  }
  return out;
}
function stdMacd(closes: number[]) {
  const e12 = stdEma(closes, 12);
  const e26 = stdEma(closes, 26);
  const dif: (number | undefined)[] = closes.map((_, i) =>
    e26[i] === undefined ? undefined : e12[i]! - e26[i]!
  );
  const difValid = dif.map((v) => v ?? 0);
  const deaRaw = stdEma(difValid, 9);
  return closes.map((_, i) => {
    const has = dif[i] !== undefined && deaRaw[i] !== undefined;
    return has
      ? { dif: dif[i]!, dea: deaRaw[i]!, macd: (dif[i]! - deaRaw[i]!) * 2 }
      : {} as any;
  });
}

// ---------------- ③ StockChart.vue MACDFS calc（源码 242-274 逐行复刻） ----------------
function macdfsCalc(dataList: { close: number }[], params = [12, 26, 9]) {
  const [p1, p2, p3] = params;
  const maxPeriod = Math.max(p1, p2);
  let closeSum = 0;
  let emaShort: number | undefined;
  let emaLong: number | undefined;
  let dif = 0;
  let difSum = 0;
  let dea = 0;
  return dataList.map((kLineData, i) => {
    const macd: any = {};
    const close = Number(kLineData.close) || 0;
    closeSum += close;
    if (i >= p1 - 1) {
      emaShort = i > p1 - 1 ? (2 * close + (p1 - 1) * (emaShort as number)) / (p1 + 1) : closeSum / p1;
    }
    if (i >= p2 - 1) {
      emaLong = i > p2 - 1 ? (2 * close + (p2 - 1) * (emaLong as number)) / (p2 + 1) : closeSum / p2;
    }
    if (i >= maxPeriod - 1) {
      dif = (emaShort as number) - (emaLong as number);
      macd.dif = dif;
      difSum += dif;
      if (i >= maxPeriod + p3 - 2) {
        dea = i > maxPeriod + p3 - 2 ? (dif * 2 + dea * (p3 - 1)) / (p3 + 1) : difSum / p3;
        macd.macd = (dif - dea) * 2;
        macd.dea = dea;
      }
    }
    return macd;
  });
}

// ---------------- ④ analyzer.ts macd()（报告口径：首值种子 EMA，源码 21-39 逐行复刻） ----------------
function anaEma(arr: number[], n: number): number[] {
  const r = new Array(arr.length).fill(0);
  const k = 2 / (n + 1);
  let prev = 0;
  for (let i = 0; i < arr.length; i++) {
    if (i === 0) prev = arr[0];
    else prev = arr[i] * k + prev * (1 - k);
    r[i] = prev;
  }
  return r;
}
function anaMacd(close: number[]) {
  const e12 = anaEma(close, 12);
  const e26 = anaEma(close, 26);
  const dif = close.map((_, i) => e12[i] - e26[i]);
  const dea = anaEma(dif, 9);
  const macdArr = dif.map((v, i) => (v - dea[i]) * 2);
  return { dif, dea, macd: macdArr };
}
// analyzer.ts 711-718 报告侧金叉/死叉判定（近 recent 根）
function anaCross(a: number[], b: number[], recent: number): "gold" | "dead" | null {
  const len = a.length;
  for (let i = len - 1; i >= Math.max(1, len - recent); i--) {
    if (a[i - 1] <= b[i - 1] && a[i] > b[i]) return "gold";
    if (a[i - 1] >= b[i - 1] && a[i] < b[i]) return "dead";
  }
  return null;
}
// 同一判定用于图表内置 MACD 序列（dif/dea 从暖机后才有值）
function chartCross(r: any[], recent: number): "gold" | "dead" | null {
  const len = r.length;
  for (let i = len - 1; i >= Math.max(1, len - recent); i--) {
    const p = r[i - 1], c = r[i];
    if (p?.dif == null || c?.dif == null) continue;
    if (p.dif <= p.dea && c.dif > c.dea) return "gold";
    if (p.dif >= p.dea && c.dif < c.dea) return "dead";
  }
  return null;
}

// ---------------- 主流程 ----------------
const STOCKS: { name: string; secid: string }[] = [
  { name: "贵州茅台", secid: "1.600519" },
  { name: "平安银行", secid: "0.000001" },
  { name: "宁德时代", secid: "0.300750" },
];
const PERIODS: { key: string; klt: number; beg: number }[] = [
  { key: "日K", klt: 101, beg: -730 },
  { key: "周K", klt: 102, beg: -2200 },
  { key: "月K", klt: 103, beg: -3650 },
];

async function main() {
  for (const s of STOCKS) {
    console.log("\n== " + s.name + " ==");
    for (const p of PERIODS) {
      const ks = await fetchK(s.secid, p.klt, p.beg);
      const closes = ks.map((k) => k.close);
      const bi = builtinMacd(ks);
      const st = stdMacd(closes);
      const fs = macdfsCalc(ks);
      const an = anaMacd(closes);
      const n = ks.length;
      const last = n - 1;

      // 1) 图表内置 vs 标准公式（末根 1e-6）
      const dDif = Math.abs(bi[last].dif - st[last].dif);
      const dDea = Math.abs(bi[last].dea - st[last].dea);
      const dBar = Math.abs(bi[last].macd - st[last].macd);
      check(`${p.key} 内置MACD=标准公式`, dDif < 1e-6 && dDea < 1e-6 && dBar < 1e-6,
        `|Δdif|=${dDif.toExponential(1)} |Δdea|=${dDea.toExponential(1)} |Δbar|=${dBar.toExponential(1)}`);

      // 2) MACDFS（分时复刻）vs 内置：全序列严格相等
      let exact = true;
      for (let i = 0; i < n; i++) {
        const a = fs[i], b = bi[i];
        if ((a.dif == null) !== (b.dif == null) ||
            (a.dif != null && (a.dif !== b.dif || a.dea !== b.dea || a.macd !== b.macd))) { exact = false; break; }
      }
      check(`${p.key} 分时MACDFS≡内置MACD`, exact, `${n} 根全序列比对`);

      // 3) 暖机行为：dif 从 i≥25（第26根）、dea/柱从 i≥33（第34根，26+9-2）才有值；末根必有值
      const warmOk = bi.slice(0, 25).every((v: any) => v.dif == null)
        && bi[25]?.dif != null
        && bi.slice(0, 33).every((v: any) => v.dea == null)
        && bi[33]?.dea != null
        && bi[last]?.dif != null;
      check(`${p.key} 暖机正确(26起DIF/34起DEA)`, warmOk, `${n} 根`);

      // 4) 图 vs 报告（analyzer 首值种子 EMA）
      const rel = (x: number, y: number) => (y === 0 ? Math.abs(x) : Math.abs(x - y) / Math.abs(y));
      const rDif = rel(an.dif[last], bi[last].dif) * 100;
      const rDea = rel(an.dea[last], bi[last].dea) * 100;
      const signSame = (an.macd[last] > 0) === (bi[last].macd > 0);
      const cCross = chartCross(bi, 8);
      const aCross = anaCross(an.dif, an.dea, 8);
      check(`${p.key} 图↔报告 末根相对差<0.5%`, rDif < 0.5 && rDea < 0.5,
        `dif ${rDif.toFixed(4)}% dea ${rDea.toFixed(4)}%`);
      check(`${p.key} 图↔报告 柱符号一致`, signSame, `报告${an.macd[last] > 0 ? "红柱" : "绿柱"}`);
      check(`${p.key} 图↔报告 金叉/死叉判定一致`, cCross === aCross, `图=${cCross ?? "无"} 报告=${aCross ?? "无"}`);

      console.log(`    末根(${ks[last].date}) DIF=${bi[last].dif.toFixed(3)} DEA=${bi[last].dea.toFixed(3)} 柱=${bi[last].macd.toFixed(3)} · 共${n}根`);
    }
  }
  console.log(`\n===== 结论：通过 ${pass} 项，失败 ${fail} 项 =====`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error("脚本异常:", e); process.exit(1); });
