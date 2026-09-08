// =====================================================================
// 持仓信息（按 secid 持久化）：持仓成本 / 持仓数量。填了持仓成本即视为「持仓中」。
// 消费方：
//   · 行情页报告（MarketView/ReportView）：Tip 行 wallet 图标弹出录入（字段与社区
//     发帖持仓卡对齐：仅持仓成本+数量），成本驱动报告页持仓状态双视角建议，抑制频繁交易误导；
//   · 社区发帖（PostComposer）：持仓卡「一键填入」快速关联本地持仓（成本/数量预填）；
//   · 自选页（WatchlistView）：持仓标的巡检，产生买/卖信号时页内常驻卡片提醒。
// 兼容：旧版本 cost:<secid> 存的是纯数字（仅成本），读取时自动归一为 Position。
// =====================================================================

import { ref } from "vue";

// 持仓版本号：setPosition / clearPosition 时自增，供持仓视图（posRows 等）响应式重算。
// 底层存储是 uni.getStorageSync（非响应式），仅靠它无法触发 Vue computed 更新，
// 故用该计数器作为响应式依赖，避免「设置了持仓但持仓页不刷新」的问题。
export const positionsVersion = ref(0);

const IDX_KEY = "cost:index"; // 已设置持仓的 secid 索引（供巡检枚举，避免遍历 storage）
const KEY = (secid: string) => "cost:" + secid;
const LAST_SIG = (secid: string) => "sigLast:" + secid;

export interface Position {
  cost: number; // 持仓成本（元/股）
  qty?: number; // 持仓数量（股，选填）
}

function normalize(raw: unknown): Position | null {
  let c = NaN;
  let q: number | undefined;
  if (typeof raw === "number") c = raw;
  else if (typeof raw === "string") c = parseFloat(raw);
  else if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    c = typeof o.c === "number" ? o.c : typeof o.cost === "number" ? (o.cost as number) : NaN;
    if (typeof o.q === "number" && o.q > 0) q = o.q;
    else if (typeof o.qty === "number" && o.qty > 0) q = o.qty as number;
  }
  return Number.isFinite(c) && c > 0 ? { cost: c, qty: q } : null;
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
    uni.setStorageSync(KEY(secid), { c: pos.cost, q: pos.qty });
    const idx: string[] = uni.getStorageSync(IDX_KEY) || [];
    if (!idx.includes(secid)) {
      idx.push(secid);
      uni.setStorageSync(IDX_KEY, idx);
    }
    positionsVersion.value++;
  } catch {
    /* noop */
  }
}

/** 清除持仓并维护索引（同步清掉信号提醒去重基线，避免下次再持仓时漏提醒） */
export function clearPosition(secid: string) {
  if (!secid) return;
  try {
    uni.removeStorageSync(KEY(secid));
    uni.removeStorageSync(LAST_SIG(secid));
    const idx: string[] = uni.getStorageSync(IDX_KEY) || [];
    const next = idx.filter((s) => s !== secid);
    if (next.length !== idx.length) uni.setStorageSync(IDX_KEY, next);
    positionsVersion.value++;
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

/** 上次巡检时该持仓的信号档（自选提醒去重：仅信号变化才提醒） */
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
