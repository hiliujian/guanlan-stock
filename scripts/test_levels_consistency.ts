// ============================================================================
// 图表 vs 报告 支撑/压力一致性全链路审计
//
// 验证 autoLevels.ts 单一真源改造后，两侧输出严格一致：
//   A) ctx 不变性：computePriceLevels 传/不传 LevelCtx（量能/筹码/DMI 修正），
//      四个角色价位与选中簇必须完全相同（修正只影响展示评级，绝不影响选簇与门槛）；
//   B) 图表 → 报告：computeAutoLevelsFromSeries（图表画线，含周期/开关过滤）
//      的每根价格线，报告侧同角色条目存在且同价；sub「已破位」⇔ isBroken、
//      sub「参考位」⇔ status=ref；结构线在数据充足时必须存在；
//   C) 报告 → 图表：报告侧每个非空条目，图表侧同角色同价线存在（含同向去重口径）；
//   D) 离线合成数据回归（不依赖网络）。
// ============================================================================
import {
  computeAutoLevelsFromSeries, computePriceLevels, resolvePeriodGuard,
  TOL_PCT, type LevelCtx, type PriceLevelGroup,
} from "../src/utils/autoLevels";
import { fetchAny, toSeries } from "./quote_fetch";

const ok = (m: string) => console.log("  ✅ " + m);
const fail = (m: string) => console.log("  ❌ " + m);

const CASES: { secid: string; name: string }[] = [
  { secid: "1.600519", name: "贵州茅台" },
  { secid: "0.000001", name: "平安银行" },
  { secid: "1.601318", name: "中国平安" },
  { secid: "1.600036", name: "招商银行" },
  { secid: "1.688256", name: "寒武纪" },
  { secid: "1.601919", name: "中远海控" },
];
const PERIODS = ["d", "w", "M"] as const;

// 报告侧角色 → 名称映射（与 PriceLevelGroup 字段一一对应）
const ROLES = ["structSupport", "structPressure", "tradeSupportS", "tradePressureB"] as const;
const roleReport = (pl: PriceLevelGroup, r: typeof ROLES[number]) => (pl as any)[r] as PriceLevelGroup[typeof ROLES[number]] | null;

// 图表侧过滤（复刻 StockChart.drawAutoLevels：默认开关全开 → 仅受周期守卫约束）
function chartPriceLines(series: any[], period: "d" | "w" | "M") {
  const guard = resolvePeriodGuard(period);
  const levels = computeAutoLevelsFromSeries(series, guard, true);
  return levels.filter((lv) => {
    if (lv.kind === "trend") return false; // 趋势线无报告对应物（域不同），跳过
    if (guard.disableTrade && (lv.role === "tradeSupport" || lv.role === "tradePressure")) return false;
    return true;
  });
}
// 图表角色 → 报告角色名
const chartRoleToReport: Record<string, (typeof ROLES)[number]> = {
  structSupport: "structSupport",
  structPressure: "structPressure",
  tradeSupport: "tradeSupportS",
  tradePressure: "tradePressureB",
};

function fmtN(v: number | null | undefined): string {
  return v == null ? "—" : v.toFixed(2);
}

// 对单条序列执行 A/B/C 三组断言，返回失败数
function auditSeries(tag: string, series: any[], period: "d" | "w" | "M"): number {
  let bad = 0;
  const guard = resolvePeriodGuard(period);
  const cur = series[series.length - 1]?.close ?? 0;

  // ---- A) ctx 不变性：传/不传 ctx 价位与选中状态必须一致 ----
  const noCtx = computePriceLevels(series, guard);
  const heavyCtx: LevelCtx = {
    vma20Last: (series[series.length - 1]?.volume ?? 1) * 1.5,
    chipPeak: cur, chipAvg: cur * 0.97,
    adx: 30, pdi: 28, mdi: 12,
  };
  const withCtx = computePriceLevels(series, guard, heavyCtx);
  for (const r of ROLES) {
    const a = roleReport(noCtx, r), b = roleReport(withCtx, r);
    if (fmtN(a?.price) !== fmtN(b?.price) || (a?.isBroken ?? false) !== (b?.isBroken ?? false)) {
      fail(`${tag} ctx 改变选簇/状态：${r} ${fmtN(a?.price)}/${a?.isBroken ? "破" : "有"} → ${fmtN(b?.price)}/${b?.isBroken ? "破" : "有"}`);
      bad++;
    }
  }
  if (bad === 0) ok(`${tag} ctx 不变性：四角色价位与破位状态与 ctx 无关`);

  // ---- B+C) 图表 ↔ 报告 双向逐价对照 ----
  const chartLines = chartPriceLines(series, period);
  const pl = noCtx; // 报告用无 ctx 版（analyzer 传 ctx 后价格不变，A 已证）
  let missing = 0, statusMismatch = 0;
  for (const lv of chartLines) {
    const roleName = lv.role ? chartRoleToReport[lv.role] : null;
    if (!roleName) continue;
    const it = roleReport(pl, roleName);
    if (!it) {
      fail(`${tag} 图表画了 ${lv.role}@${fmtN(lv.price)}（sub=${lv.sub || "无"}）但报告侧缺条目`);
      missing++; continue;
    }
    if (it.price !== lv.price) {
      fail(`${tag} ${roleName} 价位不一致：图 ${fmtN(lv.price)} vs 报告 ${fmtN(it.price)}`);
      missing++; continue;
    }
    // 状态一致性：已破位 ⇔ isBroken；参考位 ⇔ status=ref
    if (lv.sub === "已破位" !== it.isBroken) {
      fail(`${tag} ${roleName}@${fmtN(lv.price)} 破位状态不一致：图 sub=${lv.sub || "无"} vs 报告 isBroken=${it.isBroken}`);
      statusMismatch++;
    }
    if ((lv.sub === "参考位") !== (it.status === "ref")) {
      fail(`${tag} ${roleName}@${fmtN(lv.price)} 参考位状态不一致：图 sub=${lv.sub || "无"} vs 报告 status=${it.status}`);
      statusMismatch++;
    }
  }
  // C) 反向：报告每个非空条目，图表侧必须有同角色同价线
  for (const r of ROLES) {
    const it = roleReport(pl, r);
    if (!it) continue;
    const lv = chartLines.find((x) => x.role && chartRoleToReport[x.role] === r);
    if (!lv) {
      fail(`${tag} 报告侧有 ${r}@${fmtN(it.price)} 但图表未画（或被周期/开关过滤）`);
      missing++; continue;
    }
    if (lv.price !== it.price) {
      fail(`${tag} ${r} 反向价位不一致：报告 ${fmtN(it.price)} vs 图 ${fmtN(lv.price)}`);
      missing++;
    }
  }
  // 结构线必须存在（数据充足时 ensureStructLine 恒有输出）
  if (series.length >= 12) {
    if (!chartLines.some((x) => x.role === "structSupport") || !pl.structSupport) {
      fail(`${tag} 数据充足但结构支撑缺失（图/报告任一侧）`); missing++;
    }
    if (!chartLines.some((x) => x.role === "structPressure") || !pl.structPressure) {
      fail(`${tag} 数据充足但结构压力缺失（图/报告任一侧）`); missing++;
    }
  }
  // 周期守卫：禁交易周期两侧都不得有交易线
  if (guard.disableTrade) {
    const tChart = chartLines.filter((x) => x.role === "tradeSupport" || x.role === "tradePressure").length;
    const tReport = [pl.tradeSupportS, pl.tradePressureB].filter(Boolean).length;
    if (tChart || tReport) {
      fail(`${tag} 周期应禁交易线：图 ${tChart} 条 / 报告 ${tReport} 条`); missing++;
    }
  }
  const rows = ROLES.map((r) => `${r === "structSupport" ? "支" : r === "structPressure" ? "压" : r === "tradeSupportS" ? "S" : "B"}:${fmtN(roleReport(pl, r)?.price)}${roleReport(pl, r)?.isBroken ? "(破)" : roleReport(pl, r)?.status === "ref" ? "(参)" : ""}`).join(" ");
  if (missing === 0 && statusMismatch === 0) ok(`${tag} 图↔报告 ${chartLines.length} 根价格线全一致 [${rows}]`);
  else fail(`${tag} 缺失/异价 ${missing} 项，状态不符 ${statusMismatch} 项`);
  return bad + missing + statusMismatch;
}

// ---- D) 离线合成数据回归 ----
function synthSeries(n: number, seed: number): any[] {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out: any[] = [];
  let price = 10 + rnd() * 40;
  const t0 = Date.UTC(2026, 0, 1);
  for (let i = 0; i < n; i++) {
    const drift = Math.sin(i / 9) * 0.8 + (rnd() - 0.5) * 1.2;
    const open = price;
    const close = Math.max(1, open + drift);
    const high = Math.max(open, close) + rnd() * 0.6;
    const low = Math.min(open, close) - rnd() * 0.6;
    out.push({ timestamp: t0 + i * 86400e3, open, high: Math.max(0.01, high), low: Math.max(0.01, low), close, volume: 1e6 + rnd() * 5e5, turnover: 1e8 });
    price = close;
  }
  return out;
}

async function main() {
  let totalBad = 0;
  console.log("===== D) 离线合成数据回归 =====");
  for (const n of [12, 40, 120]) {
    totalBad += auditSeries(`合成 n=${n} seed=${n * 7}`, synthSeries(n, n * 7), "d");
  }
  // 边角：全程单边上行 / 单边下行（摆动点稀少，触发参考位兜底）
  const monotonic = (dir: 1 | -1) =>
    Array.from({ length: 60 }, (_, i) => {
      const c = 10 + dir * i * 0.3;
      return { timestamp: Date.UTC(2026, 0, 1) + i * 86400e3, open: c - dir * 0.1, high: Math.max(c, c - dir * 0.1) + 0.05, low: Math.min(c, c - dir * 0.1) - 0.05, close: c, volume: 1e6, turnover: 1e8 };
    });
  totalBad += auditSeries("合成·单边上行", monotonic(1), "d");
  totalBad += auditSeries("合成·单边下行", monotonic(-1), "d");

  console.log("\n===== A/B/C) 真实数据：6 股 × d/w/M =====");
  for (const c of CASES) {
    for (const p of PERIODS) {
      try {
        const ks = await fetchAny(c.secid, p);
        const series = toSeries(ks);
        totalBad += auditSeries(`${c.name} ${p}`, series, p);
        await new Promise((r) => setTimeout(r, 250));
      } catch (e: any) {
        fail(`${c.name} ${p} 取数失败：${e?.message || e}`);
        totalBad++;
      }
    }
  }
  console.log(`\n===== 结论：${totalBad === 0 ? "全部通过（图表与报告逐价一致）" : totalBad + " 项不一致，需修复"} =====`);
  if (totalBad > 0) process.exitCode = 1;
}
main();
