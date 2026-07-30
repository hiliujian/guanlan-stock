// =====================================================================
// 市场交易状态（用于行情页顶部状态标识）
// 根据当前本地时间 + 市场，判断「开盘中 / 午间休市 / 未开盘 / 已收市 / 周末休市」
// A 股（沪/深/京）与 港股 交易时段不同，分别处理。
// =====================================================================

export type MarketKind = "sh" | "sz" | "hk" | "bj" | "auto" | string;

export interface MarketStatus {
  state: "open" | "lunch" | "closed" | "weekend";
  label: string;
  open: boolean; // 是否处于可交易时段（用于决定是否轮询实时行情）
  cls: string; // 对应 CSS 颜色类
}

const WEEKEND = [0, 6]; // 周日、周六

// 各市场开收盘（本地时间，24h 制）；午休区间单独列出
const SESSION: Record<"a" | "hk", { open: [number, number]; lunch: [number, number]; close: [number, number] }> = {
  a: { open: [9, 30], lunch: [11, 30], close: [15, 0] }, // 沪/深/京：9:30-11:30, 13:00-15:00
  hk: { open: [9, 30], lunch: [12, 0], close: [16, 0] }, // 港：9:30-12:00, 13:00-16:00
};

function inRange(h: number, m: number, start: [number, number], end: [number, number]): boolean {
  const t = h * 60 + m;
  return t >= start[0] * 60 + start[1] && t < end[0] * 60 + end[1];
}

export function getMarketStatus(market?: MarketKind): MarketStatus {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const day = now.getDay();
  const isWeekend = WEEKEND.includes(day);

  const kind: "a" | "hk" = market === "hk" ? "hk" : "a";
  const s = SESSION[kind];

  if (isWeekend) {
    return { state: "weekend", label: "周末休市", open: false, cls: "ms-closed" };
  }
  // 午间休市
  if (inRange(h, m, s.lunch, [13, 0])) {
    return { state: "lunch", label: "午间休市", open: false, cls: "ms-lunch" };
  }
  // 上午 / 下午开盘时段
  if (inRange(h, m, s.open, s.lunch) || inRange(h, m, [13, 0], s.close)) {
    return { state: "open", label: "开盘中", open: true, cls: "ms-open" };
  }
  // 非交易时段：盘前 / 盘后
  const beforeOpen = h * 60 + m < s.open[0] * 60 + s.open[1];
  return {
    state: "closed",
    label: beforeOpen ? "未开盘" : "已收市",
    open: false,
    cls: "ms-closed",
  };
}
