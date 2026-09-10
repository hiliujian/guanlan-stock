/**
 * analyzer.ts 运行时冒烟测试（tsx 直跑，不参与 type-check / build）
 *
 * 覆盖：
 *  A. OBV 负值窗口「价创新高 + OBV 同步新高」不得误报顶背离（本会话修复回归）
 *  B. 真顶背离仍能识别（价创新高、OBV 因巨量下跌日掉坑）
 *  C. 周线视图 + 日K 传入时，盘中异动必须用日K口径（周线大涨不得误报「今日大涨」）
 *  D. 封涨停日：signal=持有，决策不得为 reduce
 *  E. 炸板日：signal=卖点，决策∈{reduce,wait}
 *  E2. 跌停开板日：signal=关注，决策不得为 add/build（催加仓）
 *  E3. 港股（5 位代码）单日暴跌 ≈-10%：禁止生成涨停/跌停/开板形态（A 股同形态对照应识别），
 *      仅保留「今日大跌」涨跌幅警示，且无「较板」幅度数据（02513 港股误判「跌停开板」回归）
 *  F. 400 种子随机游走 sweep：全局不变量
 *     - 不抛异常；score∈[5,95]
 *     - decision=reduce ⇒ signal=卖点；decision∈{add,build} ⇒ signal≠卖点
 *     - breakout ⇒ signal=买点（除非被涨跌停/炸板覆盖）
 *     - breakdown ⇒ signal=卖点（除非被涨停覆盖）
 *     - intraday 极端标志互斥
 *     - 买入带不深破支撑（02513 案例：支撑 807 却挂 723~755 回归）
 */
import { analyze } from "../src/utils/analyzer";
import type { Kline } from "../src/utils/period";

// ---------- 工具 ----------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let dateCursor = 0;
function nextDate(): string {
  // 从 2024-01-01 起生成连续自然日（flowMap key 只要求字典序可排）
  const d = new Date(Date.UTC(2024, 0, 1));
  d.setUTCDate(d.getUTCDate() + dateCursor++);
  return d.toISOString().slice(0, 10);
}

function mkKline(open: number, close: number, high: number, low: number, vol: number): Kline {
  const pre = open;
  return {
    date: nextDate(),
    open: +open.toFixed(2),
    close: +close.toFixed(2),
    high: +high.toFixed(2),
    low: +low.toFixed(2),
    vol,
    amount: vol * close,
    amp: +(((high - low) / pre) * 100).toFixed(2),
    pct: +(((close - pre) / pre) * 100).toFixed(2),
    chg: +(close - pre).toFixed(2),
    turnover: +(Math.random() * 3 + 0.5).toFixed(2),
  };
}

const failures: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  if (!cond) failures.push(`${name}${detail ? " | " + detail : ""}`);
}

function run(name: string, fn: () => void) {
  const before = failures.length;
  fn();
  console.log(`${failures.length === before ? "PASS" : "FAIL"}  ${name}`);
}

// ---------- 场景 A：OBV 负值窗口无背离 ----------
run("A. OBV 负窗口·价与 OBV 同步新高 → 不报顶背离", () => {
  const rnd = mulberry32(7);
  dateCursor = 0;
  const ks: Kline[] = [];
  let p = 20;
  for (let i = 0; i < 100; i++) { // 深跌段：量大
    const c = p * 0.995;
    ks.push(mkKline(p, c, p * 1.004, c * 0.996, 5e6 + rnd() * 1e6));
    p = c;
  }
  for (let i = 0; i < 60; i++) { // 反弹段：量更大且递增 → OBV 窗口内单调新高
    const c = p * 1.002;
    ks.push(mkKline(p, c, p * 1.004, c * 0.996, 1e7 + i * 1e5));
    p = c;
  }
  const r = analyze(ks, {}, null, ks, null, "600000");
  check("A1 divergence===null", r.divergence === null, `got ${r.divergence}, price=${r.price.toFixed(2)}`);
});

// ---------- 场景 B：真顶背离 ----------
run("B. 价创新高 + OBV 掉坑 → 报顶背离", () => {
  const rnd = mulberry32(11);
  dateCursor = 0;
  const ks: Kline[] = [];
  let p = 20;
  for (let i = 0; i < 120; i++) {
    let c = p * 1.004, v = 2e6 + rnd() * 5e5;
    if (i === 90) { c = p * 0.94; v = 2e8; } // 窗口内（末 60 根）巨量下跌日
    ks.push(mkKline(p, c, Math.max(p, c) * 1.002, Math.min(p, c) * 0.998, v));
    p = c;
  }
  const r = analyze(ks, {}, null, ks, null, "600000");
  check("B1 divergence===top", r.divergence === "top", `got ${r.divergence}`);
});

// ---------- 场景 C：周线 + 日K → 盘中异动用日K口径 ----------
run("C. 周线末周大涨 + 日K平盘 → 不报「今日大涨」", () => {
  const rnd = mulberry32(23);
  dateCursor = 0;
  const wk: Kline[] = [];
  let p = 20;
  for (let i = 0; i < 79; i++) { const c = p * 1.005; wk.push(mkKline(p, c, c * 1.01, c * 0.99, 5e6)); p = c; }
  const c = p * 1.08; // 末周 +8%
  wk.push(mkKline(p, c, c * 1.01, p * 0.995, 8e6));
  const daily: Kline[] = [];
  let dp = 20;
  for (let i = 0; i < 240; i++) { const dc = dp * (1 + (rnd() - 0.5) * 0.004); daily.push(mkKline(dp, dc, Math.max(dp, dc) * 1.002, Math.min(dp, dc) * 0.998, 5e6)); dp = dc; }
  const r = analyze(wk, {}, null, daily, null, "600000");
  check("C1 label===''", r.intradayMove.label === "", `got "${r.intradayMove.label}"`);
  check("C2 !isBigUp", !r.intradayMove.isBigUp, `pct=${r.intradayMove.pct}`);
  check("C3 !isLimitUp", !r.intradayMove.isLimitUp);
});

// ---------- 场景 D：封涨停 ----------
run("D. 封涨停 → 持有，决策≠reduce", () => {
  const rnd = mulberry32(31);
  dateCursor = 0;
  const ks: Kline[] = [];
  let p = 20;
  for (let i = 0; i < 99; i++) { const c = p * 1.01; ks.push(mkKline(p, c, c * 1.003, c * 0.997, 4e6 + rnd() * 1e6)); p = c; }
  const limit = Math.round(p * 1.10 * 100) / 100;
  ks.push(mkKline(p, limit, limit, limit * 0.995, 6e6));
  const r = analyze(ks, {}, null, ks, null, "600000");
  check("D1 isLimitUp", r.intradayMove.isLimitUp, `close=${r.price.toFixed(2)} label="${r.intradayMove.label}"`);
  check("D2 signal=hold", r.signal.level === "hold", `got ${r.signal.level}`);
  check("D3 decision≠reduce", r.decision !== "reduce", `got ${r.decision}`);
});

// ---------- 场景 E：炸板 ----------
run("E. 炸板 → 卖点，决策∈{reduce,wait}", () => {
  const rnd = mulberry32(37);
  dateCursor = 0;
  const ks: Kline[] = [];
  let p = 20;
  for (let i = 0; i < 99; i++) { const c = p * 1.01; ks.push(mkKline(p, c, c * 1.003, c * 0.997, 4e6 + rnd() * 1e6)); p = c; }
  const limit = Math.round(p * 1.10 * 100) / 100;
  const close = Math.round(p * 1.05 * 100) / 100;
  ks.push(mkKline(p, close, limit, close * 0.99, 9e6)); // 触板未封住
  const r = analyze(ks, {}, null, ks, null, "600000");
  check("E1 isBrokenLimitUp", r.intradayMove.isBrokenLimitUp, `label="${r.intradayMove.label}"`);
  check("E2 !isLimitUp", !r.intradayMove.isLimitUp);
  check("E3 signal=sell", r.signal.level === "sell", `got ${r.signal.level}`);
  check("E4 decision∈{reduce,wait}", r.decision === "reduce" || r.decision === "wait", `got ${r.decision}`);
});

// ---------- 场景 E2：跌停开板 ----------
run("E2. 跌停开板 → 关注，决策∉{add,build}", () => {
  const rnd = mulberry32(41);
  dateCursor = 0;
  const ks: Kline[] = [];
  let p = 20;
  for (let i = 0; i < 99; i++) { const c = p * 0.99; ks.push(mkKline(p, c, c * 1.003, c * 0.997, 4e6 + rnd() * 1e6)); p = c; }
  const limitDn = Math.round(p * 0.90 * 100) / 100;
  const close = Math.round(p * 0.93 * 100) / 100;
  ks.push(mkKline(p, close, close * 1.002, limitDn, 9e6)); // 触跌停后开板
  const r = analyze(ks, {}, null, ks, null, "600000");
  check("E2.1 isBrokenLimitDown", r.intradayMove.isBrokenLimitDown, `label="${r.intradayMove.label}"`);
  check("E2.2 !isLimitDown", !r.intradayMove.isLimitDown);
  check("E2.3 signal=watch", r.signal.level === "watch", `got ${r.signal.level}`);
  check("E2.4 decision∉{add,build}", r.decision !== "add" && r.decision !== "build", `got ${r.decision}`);
});

// ---------- 场景 E3：港股暴跌禁止套用 A 股涨跌停形态 ----------
run("E3. 港股 02513 单日 -10.3% → 无涨跌停/开板形态，仅「今日大跌」", () => {
  const rnd = mulberry32(43);
  dateCursor = 0;
  const ks: Kline[] = [];
  let p = 30;
  for (let i = 0; i < 99; i++) { const c = p * 0.995; ks.push(mkKline(p, c, c * 1.004, c * 0.996, 3e6 + rnd() * 1e6)); p = c; }
  // 暴跌日：最低触到 preClose×0.89（A 股口径即「触及跌停」），收盘跌 10.33%
  const pre = p;
  const close = pre * 0.8967;
  const low = pre * 0.89;
  ks.push(mkKline(pre, close, pre * 1.002, low, 9e6));
  const hk = analyze(ks, {}, null, ks, null, "02513");
  const m = hk.intradayMove;
  check("E3.1 港股 !isLimitDown", !m.isLimitDown, `pct=${m.pct}`);
  check("E3.2 港股 !isBrokenLimitDown", !m.isBrokenLimitDown);
  check("E3.3 港股 !isLimitUp && !isBrokenLimitUp", !m.isLimitUp && !m.isBrokenLimitUp);
  check("E3.4 港股 label=今日大跌", m.label === "今日大跌", `got "${m.label}"`);
  check("E3.5 港股无较板幅度", m.offLimitPct == null, `got ${m.offLimitPct}`);
  check("E3.6 港股无异动加分形态", !hk.scoreReasons.some((x) => x.label.includes("跌停") || x.label.includes("涨停") || x.label.includes("恐慌")), JSON.stringify(hk.scoreReasons.map((x) => x.label)));
  // 对照组：完全相同的价格形态 + A 股主板代码 → 必须识别为跌停开板（证明分支由市场规则驱动）
  dateCursor = 0;
  const ks2: Kline[] = [];
  let q = 30;
  for (let i = 0; i < 99; i++) { const c = q * 0.995; ks2.push(mkKline(q, c, c * 1.004, c * 0.996, 3e6 + rnd() * 1e6)); q = c; }
  const pre2 = q;
  ks2.push(mkKline(pre2, pre2 * 0.8967, pre2 * 1.002, pre2 * 0.89, 9e6));
  const ashare = analyze(ks2, {}, null, ks2, null, "600000");
  check("E3.7 A股对照组 isBrokenLimitDown", ashare.intradayMove.isBrokenLimitDown, `label="${ashare.intradayMove.label}"`);
});

// ---------- 场景 F：400 种子 sweep ----------
run("F. sweep 400 种子全局不变量", () => {
  const codes = ["600000", "000001", "300394", "688111", "830799", "02513"];
  let n = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const rnd = mulberry32(seed * 7919);
    dateCursor = 0;
    const drift = (rnd() - 0.5) * 0.016; // −0.8% ~ +0.8% 每日漂移
    const ks: Kline[] = [];
    let p = 10 + rnd() * 30;
    for (let i = 0; i < 260; i++) {
      const c = p * (1 + drift + (rnd() - 0.5) * 0.03);
      const h = Math.max(p, c) * (1 + rnd() * 0.01);
      const l = Math.min(p, c) * (1 - rnd() * 0.01);
      ks.push(mkKline(p, c, h, l, 2e6 + rnd() * 3e6));
      p = c;
    }
    let flow: Record<string, number> = {};
    if (rnd() < 0.3) {
      flow = {};
      for (const k of ks.slice(-120)) flow[k.date] = (rnd() - 0.35) * 3e8; // 元
    }
    const code = codes[seed % codes.length];
    let r: ReturnType<typeof analyze>;
    try {
      r = analyze(ks, flow, null, ks, null, code);
    } catch (e) {
      check(`F seed=${seed} 不抛异常`, false, String(e));
      continue;
    }
    const tag = `seed=${seed} code=${code}`;
    check(`F1 score∈[5,95] ${tag}`, Number.isFinite(r.score) && r.score >= 5 && r.score <= 95, `score=${r.score}`);
    if (r.decision === "reduce") check(`F2 reduce⇒sell ${tag}`, r.signal.level === "sell", `signal=${r.signal.level}`);
    if (r.decision === "add" || r.decision === "build") check(`F3 add/build⇒signal≠sell ${tag}`, r.signal.level !== "sell", `decision=${r.decision} signal=${r.signal.level} nearRes=${r.nearRes} rNow=${r.rNow.toFixed(1)} macd=${r.macdCross} f10=${r.f10.sum.toFixed(2)} breakdown=${r.breakout ? "" : ""}${r.breakdown} breakout=${r.breakout}`);
    if (r.breakout) {
      const covered = r.intradayMove.isLimitUp || r.intradayMove.isLimitDown || r.intradayMove.isBrokenLimitUp || r.intradayMove.isBrokenLimitDown;
      check(`F4 breakout⇒buy ${tag}`, covered || r.signal.level === "buy", `signal=${r.signal.level} decision=${r.decision}`);
    }
    if (r.breakdown) {
      const covered = r.intradayMove.isLimitUp;
      check(`F5 breakdown⇒sell ${tag}`, covered || r.signal.level === "sell", `signal=${r.signal.level} decision=${r.decision}`);
    }
    const m = r.intradayMove;
    check(`F6 互斥 ${tag}`, !(m.isLimitUp && m.isLimitDown) && !(m.isLimitUp && m.isBrokenLimitUp) && !(m.isLimitDown && m.isBrokenLimitDown) && !(m.isLimitUp && m.isBrokenLimitDown) && !(m.isLimitDown && m.isBrokenLimitUp));
    check(`F7 数值有限 ${tag}`, Number.isFinite(r.support) && Number.isFinite(r.resistance) && r.support <= r.resistance, `sup=${r.support} res=${r.resistance}`);
    // F8 买卖区间短波可执行性（本次审计核心）：
    //   · 买入带有效时：上沿须低于现价（挂回调单）、距现价 ≤3%（够得着）、下沿不深于 -12%（不深不见底）；
    //   · 卖出带有效时：下沿≤上沿、均为正、距现价不超过 +12%（不是远期压力位）；
    //   · 卖出语境（sell/破位）买入带必须缺失，买入语境（buy/hold/watch）卖出带必须缺失（引擎双边互斥输出）。
    const fin = (x: number) => Number.isFinite(x);
    if (fin(r.buyLow) && fin(r.buyHigh)) {
      check(`F8 买入带可触及 ${tag}`, r.buyHigh < r.price && r.price / r.buyHigh - 1 <= 0.03, `price=${r.price.toFixed(2)} hi=${r.buyHigh}`);
      check(`F8 买入带不深 ${tag}`, r.buyLow >= r.price * 0.88 && r.buyLow <= r.buyHigh, `lo=${r.buyLow} hi=${r.buyHigh}`);
    }
    if (fin(r.sellLow) && fin(r.sellHigh)) {
      check(`F8 卖出带合理 ${tag}`, r.sellLow > 0 && r.sellLow <= r.sellHigh && r.sellHigh <= r.price * 1.12, `lo=${r.sellLow} hi=${r.sellHigh} price=${r.price.toFixed(2)}`);
    }
    if (r.signal.level === "sell" || r.breakdown) {
      check(`F9 卖点无买入带 ${tag}`, !fin(r.buyLow), `buyLow=${r.buyLow}`);
    } else {
      check(`F9 非卖点无卖出带 ${tag}`, !fin(r.sellLow), `sellLow=${r.sellLow}`);
    }
    // F11 买入带不深破支撑（02513 案例：支撑 807 却挂 723~755）：
    // 引擎硬约束=区间下沿 ≥ 支撑缓冲带（支撑-0.25ATR）。ATR 极端时也禁止脱离支撑 10% 以上的深坑。
    if (fin(r.buyLow) && r.support < r.price) {
      check(`F11 买入带不深破支撑 ${tag}`, r.buyLow >= r.support * 0.9, `buyLow=${r.buyLow} support=${r.support.toFixed(2)}`);
    }
    // F10 走势预测与信号同向（单源派生不变量）：卖点不得配「突破上攻/企稳反弹/震荡上行」；
    // 买点不得配「破位下行/承压回落/震荡下行/反弹乏力」。
    const bullSig = ["突破上攻", "企稳反弹", "震荡上行", "超跌反弹"];
    const bearSig = ["破位下行", "承压回落", "震荡下行", "反弹乏力", "冲高回落"];
    if (r.signal.level === "sell") check(`F10 卖点走势非偏多 ${tag}`, !bullSig.includes(r.sigType), `sigType=${r.sigType}`);
    if (r.signal.level === "buy") check(`F10 买点走势非偏空 ${tag}`, !bearSig.includes(r.sigType), `sigType=${r.sigType}`);
    n++;
  }
  console.log(`    sweep 完成样本数: ${n}/400`);
});

console.log("");
if (failures.length === 0) {
  console.log("全部通过 ✓");
} else {
  console.log(`失败 ${failures.length} 项:`);
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
