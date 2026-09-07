// =====================================================================
// 持仓信息（按 secid 持久化）：成本 / 数量 / 买入时间。填了持仓成本即视为「持仓中」。
// 消费方：
//   · 行情页报告（MarketView/ReportView）：Tip 行「持仓」按钮弹出录入（时间/成本/数量），
//     成本驱动「持仓视角」建议；买入时间驱动胜率改为「买入以来」口径（见 analyzer.computeSignalWinRate）；
//     抑制「今天买点、明天卖点」的频繁交易误导；
//   · 社区发帖（PostComposer）：持仓卡「一键填入」快速关联本地持仓（成本/数量预填）；
//   · 自选页（WatchlistView）：持仓标的巡检，产生买/卖信号时主动弹窗提醒。
// 兼容：旧版本 cost:<secid> 存的是纯数字（仅成本），读取时自动归一为 Position。
// =====================================================================

const IDX_KEY = "cost:index"; // 已设置持仓的 secid 索引（供巡检枚举，避免遍历 storage）
const KEY = (secid: string) => "cost:" + secid;
const LAST_SIG = (secid: string) => "sigLast:" + secid;

export interface Position {
  cost: number; // 持仓成本（元/股）
  qty?: number; // 持仓数量（股，选填）
  time?: string; // 买入日期（YYYY-MM-DD，选填）：胜率回测改为「买入以来」口径
}

function normalize(raw: unknown): Position | null {
  let c = NaN;
  let q: number | undefined;
  let t: string | undefined;
  if (typeof raw === "number") c = raw;
  else if (typeof raw === "string") c = parseFloat(raw);
  else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    c = typeof o.c === "number" ? o.c : typeof o.cost === "number" ? (o.cost as number) : NaN;
    if (typeof o.q === "number" && o.q > 0) q = o.q;
    else if (typeof o.qty === "number" && o.qty > 0) q = o.qty as number;
    if (typeof o.t === "string") t = o.t;
    else if (typeof o.time === "string") t = o.time as string;
  }
  return Number.isFinite(c) && c > 0 ? { cost: c, qty: q, time: t } : null;
}

/** 读取持仓；未设置/非法时返回 null */
export function getPosition(secid: string): Position | null {
  try {
    return normalize(uni.getStorageSync(KEY(secid)));
  } catch {
    return null;
  }
}

/** 写入持仓并维护索引 */
export function setPosition(secid: string, pos: Position) {
  if (!secid || !Number.isFinite(pos.cost) || pos.cost <= 0) return;
  try {
    uni.setStorageSync(KEY(secid), { c: pos.cost, q: pos.qty, t: pos.time });
    const idx: string[] = uni.getStorageSync(IDX_KEY) || [];
    if (!idx.includes(secid)) {
      idx.push(secid);
      uni.setStorageSync(IDX_KEY, idx);
    }
  } catch {
    /* noop */
  }
}

/** 仅更新成本（保留数量/时间）；无既有持仓时视为新建 */
export function setCost(secid: string, cost: number) {
  const p = getPosition(secid) || { cost };
  setPosition(secid, { ...p, cost });
}

/** 清除持仓并维护索引 */
export function clearPosition(secid: string) {
  if (!secid) return;
  try {
    uni.removeStorageSync(KEY(secid));
    const idx: string[] = uni.getStorageSync(IDX_KEY) || [];
    const next = idx.filter((s) => s !== secid);
    if (next.length !== idx.length) uni.setStorageSync(IDX_KEY, next);
  } catch {
    /* noop */
  }
}

/** 已设置持仓的全部 secid（自选持仓巡检用） */
export function listCostSecids(): string[] {
  try {
    return (uni.getStorageSync(IDX_KEY) || []) as string[];
  } catch {
    return [];
  }
}

/** 全部本地持仓（含 secid），供发帖「一键填入」快速关联 */
export function listPositions(): (Position & { secid: string })[] {
  return listCostSecids()
    .map((secid) => {
      const p = getPosition(secid);
      return p ? { secid, ...p } : null;
    })
    .filter((x): x is Position & { secid: string } => x !== null);
}

/** 上次巡检时该持仓的信号档（自选提醒去重：仅信号变化才弹窗） */
export function getLastSignal(secid: string): string {
  try {
    return (uni.getStorageSync(LAST_SIG(secid)) as string) || "";
  } catch {
    return "";
  }
}

export function setLastSignal(secid: string, level: string) {
  try {
    uni.setStorageSync(LAST_SIG(secid), level);
  } catch {
    /* noop */
  }
}
