// =====================================================================
// 市场交易状态（用于行情页顶部状态标识 + 自动刷新调度判定）
// 根据当前本地时间 + 市场，判断「开盘中 / 午间休市 / 未开盘 / 已收市 / 周末休市 / 节假日休市 / 临时休市」
// A 股（沪/深/京）与 港股 交易时段不同，分别处理。
//
// 关键字段：open —— 是否处于可交易时段。自动刷新调度（行情页心跳、自选页轮询）
// 在 open=false 时跳过拉取，避免休市期间重复请求无变化的数据。
// =====================================================================

export type MarketKind = "sh" | "sz" | "hk" | "bj" | "auto" | string;

export type MarketState = "open" | "lunch" | "closed" | "weekend" | "holiday" | "temp";

export interface MarketStatus {
  state: MarketState;
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

function ymd(d: Date): string {
  const p = (n: number) => (n < 10 ? "0" + n : "" + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// =====================================================================
// 休市日表（静态、可维护）
// 需与国务院办公厅每年公布的放假安排保持同步；调休补班的周末需加入 WORKDAY，
// 否则会被误判为「周末休市」而错误地暂停交易日的刷新。
// 临时休市（如突发事件、技术故障）加入 TEMP，无需发版即可由运营维护。
// 注意：港股休市日与 A 股不同，此处仅预留，按需补充。
// =====================================================================
// A 股 2026 年法定休市日（含调休连休，均为实际休市的自然日）
const A_HOLIDAYS_2026 = [
  "2026-01-01", // 元旦
  "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23", // 春节
  "2026-04-04", "2026-04-05", "2026-04-06", // 清明
  "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05", // 劳动节
  "2026-06-19", "2026-06-20", "2026-06-21", // 端午
  "2026-09-25", "2026-09-26", "2026-09-27", // 中秋
  "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", // 国庆
];
// A 股 2026 年调休补班日（日历周末但实际开市，须排除在「周末休市」之外）
const A_WORKDAYS_2026 = [
  "2026-02-14", "2026-02-28", // 春节调休
  "2026-04-26", "2026-05-09", // 劳动节调休
  "2026-09-26", "2026-10-10", // 国庆调休
];
// 临时休市（默认空；运营可在此追加紧急休市日，如 "2026-08-10"）
const A_TEMP_CLOSED: string[] = [];

interface ClosedCfg {
  holidays: Set<string>;
  workdays: Set<string>;
  temp: Set<string>;
}
const CLOSED: Record<"a" | "hk", ClosedCfg> = {
  a: {
    holidays: new Set(A_HOLIDAYS_2026),
    workdays: new Set(A_WORKDAYS_2026),
    temp: new Set(A_TEMP_CLOSED),
  },
  hk: {
    holidays: new Set<string>(),
    workdays: new Set<string>(),
    temp: new Set<string>(),
  },
};

export function getMarketStatus(market?: MarketKind): MarketStatus {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const day = now.getDay();

  const kind: "a" | "hk" = market === "hk" ? "hk" : "a";
  const s = SESSION[kind];
  const cfg = CLOSED[kind];
  const today = ymd(now);

  // 1) 临时休市（优先级最高，任何一天都可能）
  if (cfg.temp.has(today)) {
    return { state: "temp", label: "临时休市", open: false, cls: "ms-closed" };
  }
  // 2) 法定节假日（含落在周末的节假日，统一标「节假日休市」）
  if (cfg.holidays.has(today)) {
    return { state: "holiday", label: "节假日休市", open: false, cls: "ms-closed" };
  }
  // 3) 周末（调休补班日已排除，视为交易日，进入下方时段判断）
  if (WEEKEND.includes(day) && !cfg.workdays.has(today)) {
    return { state: "weekend", label: "周末休市", open: false, cls: "ms-closed" };
  }
  // 4) 午间休市
  if (inRange(h, m, s.lunch, [13, 0])) {
    return { state: "lunch", label: "午间休市", open: false, cls: "ms-lunch" };
  }
  // 5) 上午 / 下午开盘时段
  if (inRange(h, m, s.open, s.lunch) || inRange(h, m, [13, 0], s.close)) {
    return { state: "open", label: "开盘中", open: true, cls: "ms-open" };
  }
  // 6) 非交易时段：盘前 / 盘后
  const beforeOpen = h * 60 + m < s.open[0] * 60 + s.open[1];
  return {
    state: "closed",
    label: beforeOpen ? "未开盘" : "已收市",
    open: false,
    cls: "ms-closed",
  };
}
