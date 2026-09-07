// =====================================================================
// 持仓成本价（按 secid 持久化）：输入了成本价即视为「持仓中」。
// 消费方：
//   · 行情页报告（MarketView/ReportView）：输入框 + 成本感知的「持仓视角」建议，
//     依据用户买入时机给出 止盈/止损/持有 动作，抑制「今天买点、明天卖点」的频繁交易误导；
//   · 自选页（WatchlistView）：持仓标的巡检，产生买/卖信号时主动弹窗提醒。
// =====================================================================

const IDX_KEY = "cost:index"; // 已设置成本价的 secid 索引（供巡检枚举，避免遍历 storage）
const KEY = (secid: string) => "cost:" + secid;
const LAST_SIG = (secid: string) => "sigLast:" + secid;

/** 读取成本价；未设置/非法时返回 null */
export function getCost(secid: string): number | null {
  try {
    const v = uni.getStorageSync(KEY(secid));
    const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** 写入成本价并维护索引 */
export function setCost(secid: string, v: number) {
  if (!secid || !Number.isFinite(v) || v <= 0) return;
  try {
    uni.setStorageSync(KEY(secid), v);
    const idx: string[] = uni.getStorageSync(IDX_KEY) || [];
    if (!idx.includes(secid)) {
      idx.push(secid);
      uni.setStorageSync(IDX_KEY, idx);
    }
  } catch {
    /* noop */
  }
}

/** 清除成本价（视为清仓/不再持仓）并维护索引 */
export function clearCost(secid: string) {
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

/** 已设置成本价的全部 secid（自选持仓巡检用） */
export function listCostSecids(): string[] {
  try {
    return (uni.getStorageSync(IDX_KEY) || []) as string[];
  } catch {
    return [];
  }
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
