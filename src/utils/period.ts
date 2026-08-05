// 周期配置 + 代码解析 + 行情行解析（纯函数，跨端通用）

export type PeriodKey = "m" | "d" | "w" | "M" | "y";

export interface PeriodMeta {
  key: PeriodKey;
  label: string;
  type: "trend" | "kline";
  klt: number | null; // 东方财富 klt 参数；分时无
  beg: number; // 回溯天数（用于 beg 日期）
}

export const PERIODS: Record<PeriodKey, PeriodMeta> = {
  m: { key: "m", label: "分时", type: "trend", klt: null, beg: 0 },
  d: { key: "d", label: "日K", type: "kline", klt: 101, beg: -730 },
  w: { key: "w", label: "周K", type: "kline", klt: 102, beg: -2200 },
  M: { key: "M", label: "月K", type: "kline", klt: 103, beg: -3650 },
  y: { key: "y", label: "年K", type: "kline", klt: 106, beg: -7300 },
};

export const PERIOD_ORDER: PeriodKey[] = ["m", "d", "w", "M", "y"];

export type Market = "sh" | "sz" | "bj" | "hk" | "auto";

// 将用户输入解析为东方财富 secid（如 "1.600519" / "0.000001" / "116.00700"）
export function resolveSecid(raw: string, market: Market): string {
  raw = (raw || "").trim().toUpperCase();
  raw = raw.replace(/\.(HK|SH|SZ|BJ)$/, "");
  let m = raw.match(/^(SH|SZ|BJ|HK)(\d+)$/);
  if (m) {
    const p = m[1];
    raw = m[2];
    if (p === "SH") market = "sh";
    else if (p === "SZ") market = "sz";
    else if (p === "BJ") market = "bj";
    else if (p === "HK") market = "hk";
  }
  raw = raw.replace(/[^0-9]/g, "");
  if (!raw) throw new Error("请输入有效的股票代码");
  if (market === "hk") return "116." + raw.padStart(5, "0");
  if (market === "sh") return "1." + raw;
  if (market === "sz") return "0." + raw;
  if (market === "bj") return "0." + raw;
  if (/^\d{5}$/.test(raw)) return "116." + raw; // 港股：5 位代码
  if (/^6/.test(raw)) return "1." + raw; // 沪市 / 科创板
  if (/^[03]/.test(raw)) return "0." + raw; // 深市 / 创业板
  if (/^[489]/.test(raw)) return "0." + raw; // 北交所
  return "1." + raw;
}

// 由 secid 反推市场标签（用于自选股存储 / 展示）
export function marketFromSecid(secid: string): Market {
  const [m, code] = secid.split(".");
  if (m === "116" || m === "100" || m === "105") return "hk";
  if (m === "1") return "sh";
  if (code && /^[489]/.test(code)) return "bj";
  return "sz";
}

// 由 secid 取出纯代码（如 "1.600519" -> "600519"，"116.00700" -> "00700"）
export function codeFromSecid(secid: string): string {
  return secid.split(".")[1] || secid;
}

// 由代码 + 可选市场推断中文市场标签（沪 / 深 / 港 / 北），供自选 / 热榜列表共用。
// market 明确时优先取市场；"auto" 或空则按代码规则推断。
export function marketCharFor(code: string, market?: string): string {
  const c = (code || "").trim();
  const m = market || "";
  if (m === "hk") return "港";
  if (m === "sh") return "沪";
  if (m === "sz") return "深";
  if (m === "bj") return "北";
  if (/^\d{5}$/.test(c)) return "港";
  if (/^6/.test(c)) return "沪";
  if (/^[03]/.test(c)) return "深";
  if (/^[489]/.test(c)) return "北";
  return "股";
}

export interface Kline {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  vol: number;
  amount: number;
  amp: number;
  pct: number;
  chg: number;
  turnover: number;
}

export interface Trend {
  t: string;
  open: number;
  price: number;
  high: number;
  low: number;
  vol: number;
  amount: number;
  avg: number;
}

export function parseTrend(s: string): Trend {
  const a = s.split(",");
  return {
    t: a[0],
    open: +a[1],
    price: +a[2],
    high: +a[3],
    low: +a[4],
    vol: +a[5],
    amount: +a[6],
    avg: +a[7],
  };
}

export function dateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return (
    "" +
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0")
  );
}
