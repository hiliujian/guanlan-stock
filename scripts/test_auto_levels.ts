// ============================================================================
// 智能标注（结构线/交易参考线/趋势线）画法规则验证脚本
// 运行：npx tsx scripts/test_auto_levels.ts
//
// 三层验证：
//   A. 真实行情（东财公开接口，与 App 同源）：22 只不同风格个股/指数（大盘股/成长/周期/
//      科创/银行/券商/医药/指数），日/周/月三周期 + 历史滚动多截面，核验画线硬规则与交易合理性。
//   B. 合成场景（已知答案 Ground-Truth）：上升/下降趋势线、回调禁画、
//      破位降级、单脉冲兜底、数据不足空态、同角色同价双出（绘制层合并标签）。
//   C. 规则不变量：S/B 合格门槛（仅 status=ok 可驱动信号）、周期隔离、报告/图表逐价一致、四线必出。
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
  // 降级识别：轴标签恒为 压/支/S/B，破位/弱参考/兜底由小字 sub（已破位/弱参考）或 src（含「兜底」）承载，
  // 均为淡化参考线，不做有效线方位检查。
  const degraded = (l: AutoLevel) => l.sub === "已破位" || l.sub === "弱参考" || (l.src ?? "").includes("兜底") || l.tag?.includes("破");
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

// ---------- 一轮完整断言（周期隔离 + 四线必出 + ok 门槛复核 + 报告一致性） ----------
function runOnce(series: any[], period: "d" | "w" | "M", tag: string) {
  const guard = resolvePeriodGuard(period);
  let levels = computeAutoLevelsFromSeries(series, guard);
  // 模拟 StockChart 渲染层过滤：guard.disableTrend 时趋势线不渲染
  if (guard.disableTrend) levels = levels.filter((l) => l.kind !== "trend");
  const cur = series[series.length - 1].close;
  const { sup, pres, trend } = checkLevels(levels, cur, tag, series);
  const pl = computePriceLevels(series, guard);

  // 周期隔离硬规则
  if (period !== "d" && (sup.some((l) => l.role === "tradeSupport") || pres.some((l) => l.role === "tradePressure")))
    bad(`${tag} ${period}K 不应出现 B/S 交易参考线`);
  if (period === "M" && trend.length) bad(`${tag} 月K不应出现趋势线`);

  // 结构线必须画出（series≥MIN_BARS=5 时）：跨角色同价去重允许成对缺一侧，但至少留一根，
  // 且图/报告逐角色有无必须同步（下方逐价一致循环 + 此处 presence 核对）
  if (series.length >= 5) {
    const chartSS = sup.some((l) => l.role === "structSupport");
    const chartSP = pres.some((l) => l.role === "structPressure");
    if (!chartSS && !chartSP) bad(`${tag} 结构线全缺（跨角色去重也至少留一根）`);
    if (chartSS !== !!pl.structSupport) bad(`${tag} 结构支撑 图/报告 presence 不一致（图${chartSS} 报告${!!pl.structSupport}）`);
    if (chartSP !== !!pl.structPressure) bad(`${tag} 结构压力 图/报告 presence 不一致（图${chartSP} 报告${!!pl.structPressure}）`);
  }
  // 日 K：交易参考 B/S 必须画出（仅 B≈S 跨角色同价去重可缺一侧，图/报告需同步）
  if (period === "d" && series.length >= 5) {
    const chartS = sup.some((l) => l.role === "tradeSupport");
    const chartB = pres.some((l) => l.role === "tradePressure");
    if (chartS !== !!pl.tradeSupportS) bad(`${tag} B 线（支撑） 图/报告 presence 不一致（图${chartS} 报告${!!pl.tradeSupportS}）`);
    if (chartB !== !!pl.tradePressureB) bad(`${tag} S 线（压力） 图/报告 presence 不一致（图${chartB} 报告${!!pl.tradePressureB}）`);
    if (!chartS && !chartB && !(pl.tradeSupportS == null && pl.tradePressureB == null))
      bad(`${tag} B/S 同时缺失且非跨角色去重（必须渲染规则）`);
  }

  // 交易线合格门槛复核：仅 status=ok 必须满足打分/触碰/未破位；降级态（broken/weak/ref）只核状态自洽
  for (const key of ["tradeSupportS", "tradePressureB"] as const) {
    const item = pl[key];
    if (!item) continue;
    if (item.status === "ok") {
      if (item.totalScore < MIN_TOTAL_SCORE) bad(`${tag} ${key} status=ok 但总分${item.totalScore} < ${MIN_TOTAL_SCORE}`);
      if (item.touchCount < 2) bad(`${tag} ${key} status=ok 但触碰${item.touchCount}<2（单脉冲）`);
      if (item.isBroken) bad(`${tag} ${key} status=ok 但 isBroken=true`);
    } else if (item.status === "broken") {
      if (!item.isBroken) bad(`${tag} ${key} status=broken 但 isBroken=false`);
    } else if (item.status === "weak") {
      if (item.isBroken) bad(`${tag} ${key} status=weak 不应 isBroken`);
      if (item.level !== "弱") bad(`${tag} ${key} status=weak 评级应为弱`);
    } else if (item.status === "ref") {
      if (item.touchCount !== 0 || item.totalScore !== 0) bad(`${tag} ${key} status=ref 应为零分零触碰`);
    }
  }
  // 报告侧方位一致性观察：仅 ok 态参与（broken/weak/ref 允许位于任意一侧）
  for (const key of ["structSupport", "tradeSupportS", "structPressure", "tradePressureB"] as const) {
    const it = pl[key];
    if (!it || it.status !== "ok") continue;
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
  // 报告/图表逐价一致：每根图表价格线必须在报告同角色找到同价条目（同角色同价不再互相隐藏）
  for (const [role, key] of [
    ["tradeSupport", "tradeSupportS"],
    ["tradePressure", "tradePressureB"],
    ["structSupport", "structSupport"],
    ["structPressure", "structPressure"],
  ] as const) {
    for (const lv of levels.filter((l) => l.role === role)) {
      const it = (pl as any)[key];
      if (!it || it.price !== lv.price)
        bad(`${tag} 图表${role}@${lv.price?.toFixed(2)} 与报告${key}@${it?.price?.toFixed(2)} 不一致`);
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
      checkLevels(computeAutoLevelsFromSeries(hist, resolvePeriodGuard(period)), hist[hist.length - 1].close, `${name}·${period}·T-${cut}`, hist);
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

// 场景4b：下跌结构上破近端前高 → band 反转为 uptrend（S/B 文案同步换多头语境，杜绝与报告 breakout 矛盾）
console.log("\n📈 场景4b：下跌结构上破前高 → 反转 uptrend");
{
  let p = 20; const series: any[] = [];
  for (let k = 0; k < 3; k++) { const a = dn(7, p, -1.4); series.push(...a); p = up(2, a[6].close, 1.6)[1].close; }
  series.push(...up(6, p, 2.5)); // 强力上破近端摆动前高
  const levels = computeAutoLevelsFromSeries(series, resolvePeriodGuard("d"));
  const pl = computePriceLevels(series, resolvePeriodGuard("d"));
  if (pl.band !== "uptrend") bad("合成·反转 band 未归 uptrend", `实际=${pl.band}`);
  else {
    ok("合成·反转 band 归 uptrend");
    const s = levels.find((l) => l.role === "tradeSupport");
    const b = levels.find((l) => l.role === "tradePressure");
    if (s && s.sub === "回调低吸") ok("合成·反转 B 子文案切多头语境", `sub=${s.sub}`);
    else caution("合成·反转 B 子文案非「回调低吸」", `sub=${s?.sub ?? "—"}（status 非 ok 时属正确降级）`);
    if (b && b.sub === "止盈减仓") ok("合成·反转 S 子文案切多头语境", `sub=${b.sub}`);
    else caution("合成·反转 S 子文案非「止盈减仓」", `sub=${b?.sub ?? "—"}（status 非 ok 时属正确降级）`);
    if (pl.tradeSupportS && pl.tradeSupportS.status === "ok" && pl.tradeSupportS.desc !== "回调低吸")
      bad("合成·反转 报告 B（支撑）desc 与图表不同源", pl.tradeSupportS.desc);
  }
}

// 场景5：支撑被连续多根实体击穿 → 图表仍画线但降级「破」
console.log("\n💥 场景5：支撑破位 → 淡化+破标注（不隐藏）");
{
  const series = [...zigzag(8, 10), ...dn(6, 10, -3.5, 0.5)];
  const levels = computeAutoLevelsFromSeries(series, resolvePeriodGuard("d"));
  const cur = series[series.length - 1].close;
  const sup = levels.find((l) => l.role === "structSupport");
  if (!sup) bad("合成·破位 结构支撑缺失");
  else if (sup.sub === "已破位") ok("合成·破位 支撑降级+破标注", `tag=${sup.tag} sub=${sup.sub} line=${sup.price?.toFixed(2)} 现价=${cur.toFixed(2)}`);
  else caution("合成·破位 支撑未标破", `tag=${sup.tag} line=${sup.price?.toFixed(2)} 现价=${cur.toFixed(2)}`);
}

// 场景6：单根深针脉冲（仅 1 个摆动低点）→ S 不隐藏，降级为兜底淡化线
console.log("\n📌 场景6：单脉冲插针 → S 降级兜底（必须渲染，不隐藏）");
{
  const base = up(15, 10, 0.8, 0.3);
  const p = base[14].close;
  const spike = bar(p, p * 0.985, p * 1.002, p * 0.92); // 单根 -8% 深针
  const recover = up(3, p * 0.985, 0.8, 0.3);
  const series = [...base, spike, ...recover];
  const levels = computeAutoLevelsFromSeries(series, resolvePeriodGuard("d"));
  const sLine = levels.find((l) => l.role === "tradeSupport");
  const bLine = levels.find((l) => l.role === "tradePressure");
  if (!sLine) bad("合成·单脉冲 B 线缺失（违反必须渲染规则）");
  else if ((sLine.src ?? "").includes("兜底")) ok("合成·单脉冲 B 降级兜底", `price=${sLine.price?.toFixed(2)}（深针摆动点兜底）`);
  else caution("合成·单脉冲 B 非兜底降级", `sub=${sLine.sub} src=${sLine.src} price=${sLine.price?.toFixed(2)}`);
  if (!bLine) bad("合成·单脉冲 S 线缺失（违反必须渲染规则）");
  else if ((bLine.src ?? "").includes("兜底") || bLine.sub === "弱参考") ok("合成·单脉冲 S 降级渲染", `sub=${bLine.sub} price=${bLine.price?.toFixed(2)}`);
  else caution("合成·单脉冲 S 非降级态", `sub=${bLine.sub} price=${bLine.price?.toFixed(2)}`);
}

// 场景7：数据不足（<MIN_BARS=5 根）→ 空输出
console.log("\n🚫 场景7：数据不足 → 空输出");
{
  const empty = computeAutoLevelsFromSeries(up(3, 10), resolvePeriodGuard("d"));
  if (empty.length) bad("合成·短数据(3根) 仍输出画线", `${empty.length} 条`);
  else ok("合成·短数据 空输出");
  const enough = computeAutoLevelsFromSeries(up(5, 10), resolvePeriodGuard("d"));
  if (enough.some((l) => l.kind !== "trend")) ok("合成·5根 触发兜底输出价格线");
  else caution("合成·5根 未输出任何价格线");
}

// 场景8：同角色同价 — 映射层 B 与结构支撑同价时两根线都输出（绘制层 StockChart 合并为双标签）
console.log("\n🎯 场景8：同角色同价双出（映射层不隐藏）");
{
  const series = zigzag(9, 15);
  const out = computeAutoLevelsFromSeries(series, resolvePeriodGuard("d"));
  const s = out.find((l) => l.role === "tradeSupport");
  const ss = out.find((l) => l.role === "structSupport");
  if (!s) bad("合成·同价 B 线缺失（映射层必须输出，合并由绘制层负责）");
  else if (ss && Math.abs(s.price! - ss.price!) / ss.price! <= TOL_PCT)
    ok("合成·同价 B 与结构支撑双出", `B=${s.price?.toFixed(2)} 支=${ss.price?.toFixed(2)}（绘制层合并标签）`);
  else ok("合成·同价 B 正常输出（本例未与结构线重合）", `B=${s.price?.toFixed(2)} 支=${ss?.price?.toFixed(2)}`);
}

// 场景9：单根击穿中枢（不足连续2根）→ 错误侧守卫：结构线与 B 不应显示为有效
console.log("\n💥 场景9：单根击穿中枢 → 错误侧降级（非连续2根破位）");
{
  const series = [...zigzag(8, 10), bar(9.95, 9.85, 9.98, 9.8)]; // 末根收盘 9.85 < 支撑中枢 9.88，仅 1 根
  const cur = series[series.length - 1].close;
  const levels = computeAutoLevelsFromSeries(series, resolvePeriodGuard("d"));
  const ss = levels.find((l) => l.role === "structSupport");
  const s = levels.find((l) => l.role === "tradeSupport");
  if (!ss) bad("合成·单根击穿 结构支撑缺失");
  else if (ss.sub === "已破位") ok("合成·单根击穿 结构支撑错误侧降级", `tag=${ss.tag} sub=${ss.sub} line=${ss.price?.toFixed(2)} 现价=${cur.toFixed(2)}`);
  else caution("合成·单根击穿 结构支撑未降级", `tag=${ss.tag} line=${ss.price?.toFixed(2)} 现价=${cur.toFixed(2)}`);
  if (!s) bad("合成·单根击穿 S 交易支撑缺失（必须渲染规则）");
  else if (s.sub === "已破位") ok("合成·单根击穿 S 交易支撑错误侧降级", `tag=${s.tag} sub=${s.sub} line=${s.price?.toFixed(2)}`);
  else if (s.sub === "弱参考" || (s.src ?? "").includes("兜底")) ok("合成·单根击穿 S 以降级态渲染", `tag=${s.tag} sub=${s.sub} line=${s.price?.toFixed(2)}`);
  else caution("合成·单根击穿 S 为有效态", `tag=${s.tag} line=${s.price?.toFixed(2)}（仅 1 根击穿需核实门槛）`);
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
  const levels = computeAutoLevelsFromSeries(series, resolvePeriodGuard("d"));
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
