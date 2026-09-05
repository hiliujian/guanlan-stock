// =====================================================================
// 市场交易状态（用于行情页顶部状态标识 + 自动刷新调度判定）
// 根据当前本地时间 + 市场，判断「开盘中 / 午间休市 / 未开盘 / 已收市 / 周末休市 / 节假日休市」
// A 股（沪/深/京）与 港股 交易时段不同，分别处理。
//
// 节假日判定已自动化（见 tradingCalendar.ts）：以基准指数日 K 是否包含今天为准，
// 无需每年人工维护休市表。日历不可用时降级为「周末 + 交易时段」判断——只可能
// 在节假日多拉几次快照，不会在交易日漏拉。
//
// 关键字段：open —— 是否处于可交易时段。自动刷新调度（行情页心跳、自选页轮询）
// 在 open=false 时跳过拉取，避免休市期间重复请求无变化的数据。
// =====================================================================

import { ensureTradingCalendar, tradingDayInfo } from "@/utils/tradingCalendar";

type MarketKind = "sh" | "sz" | "hk" | "bj" | "auto" | string;

type MarketState = "open" | "lunch" | "closed" | "weekend" | "holiday";

interface MarketStatus {
  state: MarketState;
  label: string;
  open: boolean; // 是否处于可交易时段（用于决定是否轮询实时行情）
  cls: string; // 对应 CSS 颜色类
}

// 各市场开收盘（本地时间，24h 制）；午休区间单独列出
const SESSION: Record<"a" | "hk", { open: [number, number]; lunch: [number, number]; close: [number, number] }> = {
  a: { open: [9, 30], lunch: [11, 30], close: [15, 0] }, // 沪/深/京：9:30-11:30, 13:00-15:00
  hk: { open: [9, 30], lunch: [12, 0], close: [16, 0] }, // 港：9:30-12:00, 13:00-16:00
};

// 节假日自动判定的基准指数 + 当天 bar 的可信时刻（集合竞价出价后日 K 才含今天）
const BENCH: Record<"a" | "hk", { secid: string; cutoff: number }> = {
  a: { secid: "1.000001", cutoff: 9 * 60 + 26 },
  hk: { secid: "100.HSI", cutoff: 9 * 60 + 30 },
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

  const kind: "a" | "hk" = market === "hk" ? "hk" : "a";
  const s = SESSION[kind];

  // 1) 周末恒休市：调休补班只针对行政单位，交易所周末从不开市
  //    （旧版「补班周末视为交易日」会把补班周六误判为「开盘中」，已随静态表一并移除）
  if (day === 0 || day === 6) {
    return { state: "weekend", label: "周末休市", open: false, cls: "ms-closed" };
  }

  // 2) 交易日历自动判定：指数日 K 含今天 → 交易日；出价后仍无今天 bar → 节假日休市
  const bench = BENCH[kind];
  void ensureTradingCalendar(bench.secid, bench.cutoff); // 惰性刷新（60s 节流，异步不阻塞判定）
  const info = tradingDayInfo(bench.secid, bench.cutoff);
  if (info.known && !info.trading) {
    return { state: "holiday", label: "节假日休市", open: false, cls: "ms-closed" };
  }

  // 3) 时段判断（日历 unknown 时降级为纯时段判断：周末已单独处理，节假日可能短暂
  //    误显示交易状态并多拉几次快照，日历拉到后下一拍心跳自动校正）
  if (inRange(h, m, s.lunch, [13, 0])) {
    return { state: "lunch", label: "午间休市", open: false, cls: "ms-lunch" };
  }
  if (inRange(h, m, s.open, s.lunch) || inRange(h, m, [13, 0], s.close)) {
    return { state: "open", label: "开盘中", open: true, cls: "ms-open" };
  }
  const beforeOpen = h * 60 + m < s.open[0] * 60 + s.open[1];
  return {
    state: "closed",
    label: beforeOpen ? "未开盘" : "已收市",
    open: false,
    cls: "ms-closed",
  };
}

// 应用启动即预热一次 A 股基准日历（异步非阻塞，失败静默；港股按需在首次查看港股时拉取）
void ensureTradingCalendar(BENCH.a.secid, BENCH.a.cutoff);
