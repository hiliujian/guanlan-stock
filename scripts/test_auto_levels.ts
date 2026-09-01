// ============================================================================
// 智能标注（结构线/交易参考线/趋势线）画法规则验证脚本
// 运行：npx tsx scripts/test_auto_levels.ts
//
// 三层验证：
//   A. 真实行情（东财公开接口，与 App 同源）：22 只不同风格个股/指数（大盘股/成长/周期/
//      科创/银行/券商/医药/指数），日/周/月三周期 + 历史滚动多截面，核验画线硬规则与交易合理性。
//   B. 合成场景（已知答案 Ground-Truth）：上升/下降趋势线、回调禁画、
//      破位降级、单脉冲过滤、数据不足空态、dedupe。
//   C. 规则不变量：S/B 准入门槛、周期隔离、报告/图表一致性（dedupe 感知）。
// ============================================================================
import {
  computeAutoLevelsFromSeries,
  computePriceLevels,
  resolvePeriodGuard,
  MIN_TOTAL_SCORE,
  TOL_PCT,
  type AutoLevel,
} from "../src/utils/autoLevels";
import { fetchAny, toSeries, type K } from "./quote_fetch";

// ---------- 结果收集 ----------
let pass = 0, fail = 0, warn = 0;
const findings: string[] = [];
function ok(name: string, detail = "") { pass++; console.log(`  ✅ ${name}${detail ? "  " + detail : ""}`); }
function bad(name: string, detail = "") {
  fail++; findings.push(`❌ ${name} ${detail}`);
  console.log(`  ❌ ${name}  ${detail}`);
}
function caution(name: string, detail = "") {
  warn++; findings.push(`⚠️ ${name} ${detail}`);
  console.log(`  ⚠️ ${name}  ${detail}`);
}

// ---------- 合成数据构造（显式 OHLC，服务 Ground-Truth） ----------
let seq = 0;
function bar(open: number, close: number, high: number, low: number): any {
  return { timestamp: ++seq, open, close, high, low, volume: 1e6, turnover: 1e8, date: `s${seq}` };
}
// 阶梯单边：每根涨/跌 step%，波动 wiggle%
function stair(n: number, base: number, step: number, wiggle = 0.5): any[] {
  const out = []; let p = base;
  for (let i = 0; i < n; i++) {
    const o = p, c = p * (1 + step / 100);
    out.push(bar(o, c, Math.max(o, c) * (1 + wiggle / 100), Math.min(o, c) * (1 - wiggle / 100)));
    p = c;
  }
  return out;
}
const up = (n: number, base: number, step = 1.2) => stair(n, base, step, 0.5);
const dn = (n: number, base: number, step = -1.2) => stair(n, base, step, 0.5);
// 4 根一循环的窄幅 zigzag（ trough 严格低于邻根，供破位/支撑簇场景）
function zigzag(cycles: number, mid = 10): any[] {
  const out = []; let o = mid;
  for (let k = 0; k < cycles; k++) {
    out.push(bar(o, mid * 1.01, mid * 1.012, mid * 0.998));                                  // 上行
    out.push(bar(mid * 1.01, mid * 0.99, mid * 1.012, mid * 0.988));                         // 回落到槽(严格低点)
    out.push(bar(mid * 0.99, mid * 1.005, mid * 1.007, mid * 0.989));                        // 反抽
    out.push(bar(mid * 1.005, mid, mid * 1.007, mid * 0.998));                               // 回中
    o = mid;
  }
  return out;
}

// ---------- 检查器：一轮输出的规则不变量 ----------
function checkLevels(levels: AutoLevel[], cur: number, tag: string, series: any[]) {
  const sup = levels.filter((l) => l.kind === "support");
  const pres = levels.filter((l) => l.kind === "pressure");
  const trend = levels.filter((l) => l.kind === "trend");
  for (const l of [...sup, ...pres]) {
    if (!(typeof l.price === "number" && isFinite(l.price) && l.price > 0))
      bad(`${tag} 价格非法`, `price=${l.price}`);
  }
  // 降级识别对齐 f2bdf6d 设计：轴标签恒为 压/支/S/B，破位/兜底由小字 sub（已破位/参考位）承载。
  // 两者均为淡化参考线，不再按有效线做方位检查。
  const degraded = (l: AutoLevel) => l.sub === "已破位" || l.sub === "参考位" || l.tag?.includes("破") || l.tag?.includes("参");
  // 方位合理性：非降级支撑不得悬在现价上方 / 压力不得坠在现价下方
  // （与算法同口径：cur<=0 的深度前复权历史截面属数据级负价，方位判定无意义，跳过）
  for (const l of sup)
    if (cur > 0 && !degraded(l) && typeof l.price === "number" && l.price > cur * 1.001)
      caution(`${tag} 有效支撑高于现价`, `${l.tag} ${l.price.toFixed(2)} > 现价 ${cur.toFixed(2)}（画线基准=实体边缘 vs 判破基准=簇中枢不一致）`);
  for (const l of pres)
    if (cur > 0 && !degraded(l) && typeof l.price === "number" && l.price < cur * 0.999)
      caution(`${tag} 有效压力低于现价`, `${l.tag} ${l.price.toFixed(2)} < 现价 ${cur.toFixed(2)}（画线基准=实体边缘 vs 判破基准=簇中枢不一致）`);
  for (const l of sup)
    if (cur > 0 && l.role === "tradeSupport" && !degraded(l) && typeof l.price === "number" && l.price > cur * 1.001)
      caution(`${tag} S交易支撑高于现价（低吸参考失效）`, `tag=${l.tag} ${l.price.toFixed(2)} > ${cur.toFixed(2)}`);
  for (const l of pres)
    if (cur > 0 && l.role === "tradePressure" && !degraded(l) && typeof l.price === "number" && l.price < cur * 0.999)
      caution(`${tag} B交易压力低于现价（止盈参考失效）`, `tag=${l.tag} ${l.price.toFixed(2)} < ${cur.toFixed(2)}`);
  // 趋势线硬规则：3 点严格单调，且仅 uptrend/downtrend 波段出现
  for (const t of trend) {
    const pts = t.points ?? [];
    if (pts.length !== 3) bad(`${tag} 趋势线点数≠3`, `${pts.length}`);
    const mono = t.dir === "up"
      ? pts.every((p, i) => i === 0 || p.value > pts[i - 1].value)
      : pts.every((p, i) => i === 0 || p.value < pts[i - 1].value);
    if (!mono) bad(`${tag} 趋势线点非单调(${t.dir})`, JSON.stringify(pts.map((p) => p.value)));
    // 锚点必须钉在真实 K 线上：上升锚=该 bar.low、下降锚=该 bar.high（严格相等，findSwings 口径）
    const byTs = new Map(series.map((b) => [b.timestamp, b]));
    for (const p of pts) {
      const bar = byTs.get(p.timestamp);
      if (!bar) { bad(`${tag} 趋势线锚点无对应K线`, `ts=${p.timestamp}`); continue; }
      const expect = t.dir === "up" ? bar.low : bar.high;
      if (Math.abs(p.value - expect) > 1e-9)
        bad(`${tag} 趋势线锚点未钉在K线${t.dir === "up" ? "低点" : "高点"}`, `${p.value} ≠ ${expect}`);
    }
  }
  return { sup, pres, trend };
}

// ---------- 一轮完整断言（周期隔离 + 结构必画 + 门槛复核 + 报告一致性） ----------
function runOnce(series: any[], period: "d" | "w" | "M", tag: string, dedupe = true) {
  const guard = resolvePeriodGuard(period);
  let levels = computeAutoLevelsFromSeries(series, guard, dedupe);
  // 模拟 StockChart 渲染层过滤（StockChart.vue:927）：guard.disableTrend 时趋势线不渲染
  if (guard.disableTrend) levels = levels.filter((l) => l.kind !== "trend");
  const cur = series[series.length - 1].close;
  const { sup, pres, trend } = checkLevels(levels, cur, tag, series);
  const pl = computePriceLevels(series, guard);

  // 周期隔离硬规则
  if (period !== "d" && (sup.some((l) => l.role === "tradeSupport") || pres.some((l) => l.role === "tradePressure")))
    bad(`${tag} ${period}K 不应出现 S/B 交易参考线`);
  if (period === "M" && trend.length) bad(`${tag} 月K不应出现趋势线`);

  // 结构线必须画出（series≥12 时）
  if (series.length >= 12) {
    if (!sup.some((l) => l.role === "structSupport")) bad(`${tag} 结构支撑缺失（必须画出规则）`);
    if (!pres.some((l) => l.role === "structPressure")) bad(`${tag} 结构压力缺失（必须画出规则）`);
  }

  // 交易线准入门槛复核
  for (const key of ["tradeSupportS", "tradePressureB"] as const) {
    const item = pl[key];
    if (item) {
      if (item.totalScore < MIN_TOTAL_SCORE) bad(`${tag} ${key} 总分${item.totalScore} < ${MIN_TOTAL_SCORE} 仍输出`);
      if (item.touchCount < 2) bad(`${tag} ${key} 单脉冲（触碰${item.touchCount}次）仍输出`);
      if (item.isBroken) bad(`${tag} ${key} 已破位仍在报告输出`);
    }
  }
  // 报告侧方位一致性观察：isBroken=false 的支撑/压力应位于现价正确侧（当前报告无外部消费者，仅观察）
  // status=ref（参考位·簇缺失兜底）为降级展示位，与图表淡化线同口径，允许位于任意一侧，不参与方位观察
  for (const key of ["structSupport", "tradeSupportS", "structPressure", "tradePressureB"] as const) {
    const it = pl[key];
    if (!it || it.isBroken || it.status === "ref") continue;
    const isSup = key.includes("Support");
    if (isSup && it.price > cur * 1.001)
      caution(`${tag} 报告·${key} 有效支撑高于现价`, `${it.price.toFixed(2)} > 现价 ${cur.toFixed(2)}`);
    if (!isSup && it.price < cur * 0.999)
      caution(`${tag} 报告·${key} 有效压力低于现价`, `${it.price.toFixed(2)} < 现价 ${cur.toFixed(2)}`);
  }
  // 趋势线与现价结构一致性观察：上行波段但现价已低于最近抬升低点（band 判定可能滞后）
  if (trend.length) {
    const t = trend[0];
    const lastVal = t.points?.[t.points.length - 1]?.value;
    if (lastVal != null) {
      if (t.dir === "up" && cur < lastVal)
        caution(`${tag} 上行趋势线但现价已低于最近抬升低点`, `${cur.toFixed(2)} < ${lastVal.toFixed(2)}`);
      if (t.dir === "down" && cur > lastVal)
        caution(`${tag} 下行趋势线但现价已高于最近递降高点`, `${cur.toFixed(2)} > ${lastVal.toFixed(2)}`);
    }
  }
  // 报告/图表一致性（dedupe 感知：图表 S/B 被 dedupe 隐藏属设计行为）
  for (const [key, role, structKey] of [
    ["tradeSupportS", "tradeSupport", "structSupport"],
    ["tradePressureB", "tradePressure", "structPressure"],
  ] as const) {
    const inChart = levels.some((l) => l.role === role);
    const item = pl[key];
    if (item && !inChart && dedupe && period === "d") {
      const sp = pl[structKey]?.price;
      const overlapped = sp != null && Math.abs(item.price - sp) / sp <= TOL_PCT;
      if (!overlapped) bad(`${tag} 图表无${role}且非 dedupe 重叠（报告价 ${item.price.toFixed(2)} vs 结构 ${sp?.toFixed(2)}）`);
    } else if (!!inChart !== !!item && !(item && !inChart)) {
      bad(`${tag} 图表有${role}但报告无（不同步）`);
    }
  }
  return { levels, cur, sup, pres, trend, pl };
}

// ============================================================================
async function main() {
console.log("\n===== A. 真实行情验证（东财公开接口） =====");
const STOCKS: [string, string][] = [
  ["1.600519", "贵州茅台"], ["0.000001", "平安银行"], ["0.300750", "宁德时代"],
  ["1.601899", "紫金矿业"], ["0.002594", "比亚迪"], ["1.600036", "招商银行"],
  ["0.300059", "东方财富"], ["1.688981", "中芯国际"], ["1.000001", "上证指数"],
  ["1.600276", "恒瑞医药"], ["1.601318", "中国平安"], ["1.601012", "隆基绿能"],
  ["0.000858", "五粮液"], ["0.000725", "京东方A"], ["1.601919", "中远海控"],
  ["0.002466", "天齐锂业"], ["1.688256", "寒武纪"], ["1.601398", "工商银行"],
  ["0.300015", "爱尔眼科"], ["0.399001", "深证成指"], ["0.399006", "创业板指"],
  ["1.000688", "科创50"],
];
const realData: Record<string, K[]> = {};
for (const [secid, name] of STOCKS) {
  try {
    realData[secid] = await fetchAny(secid, "d");
    console.log(`  ${name}(${secid}) 日K ${realData[secid].length} 根`);
  } catch (e: any) {
    bad(`${name} 行情获取失败`, String(e?.message ?? e));
  }
  await new Promise((r) => setTimeout(r, 250)); // 请求间隔，避免触发接口限频
}

for (const [secid, name] of STOCKS) {
  const ks = realData[secid];
  if (!ks?.length) continue;
  console.log(`\n🔍 ${name}(${secid})`);
  for (const period of ["d", "w", "M"] as const) {
    let pk: K[] = [];
    try {
      pk = await fetchAny(secid, period);
    } catch (e: any) {
      caution(`${name} ${period} 行情获取失败跳过`, String(e?.message ?? e).slice(0, 80));
      continue;
    }
    if (pk.length < 30) { caution(`${name} ${period} 数据不足跳过`, `${pk.length}根`); continue; }
    const series = toSeries(pk);
    const r = runOnce(series, period, `${name}·${period}`);
    const desc = r.levels.map((l) =>
      l.kind === "trend" ? `趋势线(${l.dir})` : `${l.tag}@${l.price?.toFixed(2)}`
    ).join(" ");
    console.log(`     ${period}: band=${r.pl.band} breakDown=${r.pl.breakDown} → ${desc}`);
    // 历史滚动多截面：以 T-30/60/90/120/180/250 根为「当时」复核趋势线单调与方位合理性
    for (const cut of [30, 60, 90, 120, 180, 250]) {
      if (pk.length < cut + 40) continue;
      const hist = toSeries(pk.slice(0, pk.length - cut));
      checkLevels(computeAutoLevelsFromSeries(hist, resolvePeriodGuard(period), true), hist[hist.length - 1].close, `${name}·${period}·T-${cut}`, hist);
    }
  }
}

// ============================================================================
console.log("\n===== B. 合成场景 Ground-Truth =====");

// 场景1：三段抬升（7涨2跌×3 + 7涨）→ band=uptrend 且画上升趋势线
console.log("\n📈 场景1：阶梯抬升 → 上升趋势线");
{
  let p = 10; const series: any[] = [];
  for (let k = 0; k < 3; k++) { const a = up(7, p, 1.4); series.push(...a); p = dn(2, a[6].close, -1.6)[1].close; }
  series.push(...up(7, p, 1.4));
  const r = runOnce(series, "d", "合成·抬升");
  if (r.pl.band !== "uptrend") caution("合成·抬升 band 判定", `实际=${r.pl.band}`);
  if (!r.trend.length) caution("合成·抬升 未画上升趋势线", `band=${r.pl.band}（窗口内抬升低点不足 3 个时属正确行为）`);
  else if (r.trend[0].dir === "up") ok("合成·抬升 画出上升趋势线");
  else bad("合成·抬升 趋势线方向错误", r.trend[0].dir);
}

// 场景2：上涨后走弱回调（未破前低）→ 禁画上升趋势线（风控硬规则）
console.log("\n📉 场景2：上涨后走弱回调 → 禁画上升趋势线");
{
  const rise = up(20, 10, 1.5, 0.5);
  const series = [...rise, ...dn(8, rise[19].close, -2.2, 0.5)];
  const r = runOnce(series, "d", "合成·回调");
  const upTrend = r.trend.find((t) => t.dir === "up");
  if (upTrend) bad("合成·回调 仍画上升趋势线（违反风控硬规则）", `band=${r.pl.band}`);
  else ok("合成·回调 未画上升趋势线", `band=${r.pl.band}`);
}

// 场景3：窄幅震荡 → 趋势线仅允许出现在 uptrend/downtrend 波段
console.log("\n🔀 场景3：窄幅震荡趋势线约束");
{
  const series = zigzag(9, 15);
  const r = runOnce(series, "d", "合成·震荡");
  const illegal = r.trend.length > 0 && !["uptrend", "downtrend"].includes(r.pl.band);
  if (illegal) bad("合成·震荡 非趋势波段出现趋势线", `band=${r.pl.band}`);
  else ok("合成·震荡 趋势线约束满足", `band=${r.pl.band} trend=${r.trend.length}`);
  if (r.pl.band === "box") {
    if (r.pl.boxBottom != null && r.pl.boxTop != null) ok("合成·震荡 箱体上下沿识别", `${r.pl.boxBottom.toFixed(2)}~${r.pl.boxTop.toFixed(2)}`);
    else bad("合成·震荡 box 波段未识别箱体上下沿");
  }
}

// 场景4：三段回落（7跌2弹×3 + 3跌）→ band=downtrend 且画下降趋势线
console.log("\n📉 场景4：阶梯回落 → 下降趋势线");
{
  let p = 20; const series: any[] = [];
  for (let k = 0; k < 3; k++) { const a = dn(7, p, -1.4); series.push(...a); p = up(2, a[6].close, 1.6)[1].close; }
  series.push(...dn(3, p, -1.4));
  const r = runOnce(series, "d", "合成·回落");
  if (r.pl.band !== "downtrend") caution("合成·回落 band 判定", `实际=${r.pl.band}`);
  if (!r.trend.length) caution("合成·回落 未画下降趋势线", `band=${r.pl.band}（窗口内递降高点不足 3 个时属正确行为）`);
  else if (r.trend[0].dir === "down") ok("合成·回落 画出下降趋势线");
  else bad("合成·回落 趋势线方向错误", r.trend[0].dir);
}

// 场景5：支撑被连续多根实体击穿 → 图表仍画线但降级「破」
console.log("\n💥 场景5：支撑破位 → 淡化+破标注（不隐藏）");
{
  const series = [...zigzag(8, 10), ...dn(6, 10, -3.5, 0.5)];
  const guard = resolvePeriodGuard("d");
  const levels = computeAutoLevelsFromSeries(series, guard, true);
  const cur = series[series.length - 1].close;
  const sup = levels.find((l) => l.role === "structSupport");
  if (!sup) bad("合成·破位 结构支撑缺失");
  else if (sup.sub === "已破位") ok("合成·破位 支撑降级+破标注", `tag=${sup.tag} sub=${sup.sub} line=${sup.price?.toFixed(2)} 现价=${cur.toFixed(2)}`);
  else caution("合成·破位 支撑未标破", `tag=${sup.tag} line=${sup.price?.toFixed(2)} 现价=${cur.toFixed(2)}`);
}

// 场景6：单根深针脉冲（仅 1 个摆动低点）→ 不生成 S 线
console.log("\n📌 场景6：单脉冲插针 → 无 S/B");
{
  const base = up(15, 10, 0.8, 0.3);
  const p = base[14].close;
  const spike = bar(p, p * 0.985, p * 1.002, p * 0.92); // 单根 -8% 深针
  const recover = up(3, p * 0.985, 0.8, 0.3);
  const series = [...base, spike, ...recover];
  const levels = computeAutoLevelsFromSeries(series, resolvePeriodGuard("d"), true);
  const sLine = levels.find((l) => l.role === "tradeSupport");
  const bLine = levels.find((l) => l.role === "tradePressure");
  if (sLine) caution("合成·单脉冲 出现 S 线（若簇≥2 次触碰则合理）", `price=${sLine.price?.toFixed(2)}`);
  else ok("合成·单脉冲 无 S 线");
  if (bLine) caution("合成·单脉冲 出现 B 线", `price=${bLine.price?.toFixed(2)}`);
}

// 场景7：数据不足（<12 根）→ 空输出
console.log("\n🚫 场景7：数据不足 → 空输出");
{
  const levels = computeAutoLevelsFromSeries(up(8, 10), resolvePeriodGuard("d"), true);
  if (levels.length) bad("合成·短数据 仍输出画线", `${levels.length} 条`);
  else ok("合成·短数据 空输出");
}

// 场景8：dedupe 开关 — S 与结构支撑同价时仅留结构线；dedupe=false 时 S 保留
console.log("\n🎯 场景8：同价去重 dedupe");
{
  const series = zigzag(9, 15);
  const on = computeAutoLevelsFromSeries(series, resolvePeriodGuard("d"), true);
  const off = computeAutoLevelsFromSeries(series, resolvePeriodGuard("d"), false);
  const sOn = on.find((l) => l.role === "tradeSupport");
  const sOff = off.find((l) => l.role === "tradeSupport");
  const ss = on.find((l) => l.role === "structSupport");
  if (sOn && ss && Math.abs(sOn.price! - ss.price!) / ss.price! <= TOL_PCT)
    bad("合成·dedupe S 与结构支撑同价未去重");
  else ok("合成·dedupe 同价去重正确", `S(on)=${!!sOn} S(off)=${!!sOff} 结构=${!!ss}`);
}

// 场景9：单根击穿中枢（不足连续2根）→ 错误侧守卫：结构线与 S 降级「破」而非显示有效
console.log("\n💥 场景9：单根击穿中枢 → 错误侧降级（非连续2根破位）");
{
  const series = [...zigzag(8, 10), bar(9.95, 9.85, 9.98, 9.8)]; // 末根收盘 9.85 < 支撑中枢 9.88，仅 1 根
  const cur = series[series.length - 1].close;
  const levels = computeAutoLevelsFromSeries(series, resolvePeriodGuard("d"), false);
  const ss = levels.find((l) => l.role === "structSupport");
  const s = levels.find((l) => l.role === "tradeSupport");
  if (!ss) bad("合成·单根击穿 结构支撑缺失");
  else if (ss.sub === "已破位") ok("合成·单根击穿 结构支撑错误侧降级", `tag=${ss.tag} sub=${ss.sub} line=${ss.price?.toFixed(2)} 现价=${cur.toFixed(2)}`);
  else caution("合成·单根击穿 结构支撑未降级", `tag=${ss.tag} line=${ss.price?.toFixed(2)} 现价=${cur.toFixed(2)}`);
  if (s && s.sub === "已破位") ok("合成·单根击穿 S 交易支撑错误侧降级", `tag=${s.tag} sub=${s.sub} line=${s.price?.toFixed(2)}`);
  else if (s) caution("合成·单根击穿 S 未降级", `tag=${s.tag} line=${s.price?.toFixed(2)}`);
  else ok("合成·单根击穿 无 S（准入未过/失效）", "S 未输出亦满足不误导");
}

// 场景10：前复权负价（高分红股深度历史，如实测中远海控月/周K）→ 不输出非正价位线
console.log("\n🧯 场景10：前复权负价 → 无非正价位线");
{
  const good = up(20, 10, 0.6, 0.4);
  const neg: any[] = []; // 深度历史前复权后为负（open/close/high/low 均负）
  let p = -2;
  for (let i = 0; i < 14; i++) {
    const o = p, c = p + 0.1;
    neg.push({ timestamp: ++seq, open: o, close: c, high: c + 0.05, low: o - 0.08, volume: 1e6, turnover: 1e8, date: `n${seq}` });
    p = c;
  }
  const series = [...neg, ...good];
  const levels = computeAutoLevelsFromSeries(series, resolvePeriodGuard("d"), false);
  const badPrice = levels.filter((l) => l.kind !== "trend" && (l.price == null || l.price <= 0));
  if (badPrice.length) bad("合成·负价 输出非正价位线", badPrice.map((l) => `${l.tag}@${l.price}`).join(" "));
  else ok("合成·负价 图表无非正价位线", `${levels.filter((l) => l.kind !== "trend").length} 条价位线全部为正`);
  const pl = computePriceLevels(series, resolvePeriodGuard("d"));
  const negRep = (["structSupport", "structPressure", "tradeSupportS", "tradePressureB"] as const)
    .filter((k) => pl[k] && pl[k]!.price <= 0);
  if (negRep.length) bad("合成·负价 报告侧非正价位", negRep.join(" "));
  else ok("合成·负价 报告侧无非正价位");
}

console.log("\n===== 汇总 =====");
console.log(`✅ 通过：${pass}  ⚠️ 提示：${warn}  ❌ 失败：${fail}`);
if (findings.length) {
  console.log("\n—— 发现清单 ——");
  findings.forEach((f) => console.log(f));
}
if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
