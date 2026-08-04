// =====================================================================
// 解析器：东方财富（交易所授权行情门户，覆盖最全，作为首选源）
//   实时行情  push2.eastmoney.com/api/qt/stock/get
//   K 线      push2his.eastmoney.com/api/qt/stock/kline/get（日/周/月/年）
//   分时      push2his.eastmoney.com/api/qt/stock/trends2/get
//   资金流    push2his.eastmoney.com/api/qt/stock/fflow/kline/get
//   搜索      searchapi.eastmoney.com/api/suggest/get
//   市场宽度  push2delay.eastmoney.com/api/qt/ulist.np/get
//   行业列表  push2.eastmoney.com/api/qt/clist/get
//
// 本文件只负责「解析」，URL 构建与多源冗余全部由后端网关完成（见
// supabase/functions/guanlan-quote-proxy/index.ts）。
// =====================================================================
import type { PeriodKey, Kline, Trend } from "@/utils/period";
import { parseTrend } from "@/utils/period";
import type { RawRealtime, SearchHit } from "./types";

// 东方财富实时行情价格按精度缩放：A 股/指数 ×100，港股/美股 ×1000
function emPriceScale(secid: string): number {
  const m = secid.split(".")[0];
  if (m === "116" || m === "100" || m === "105") return 1000;
  return 100;
}

function fmtEMTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function parseEMKlineRow(s: string): Kline {
  const a = s.split(",");
  return {
    date: a[0],
    open: +a[1],
    close: +a[2],
    high: +a[3],
    low: +a[4],
    vol: +a[5],
    amount: +a[6],
    amp: +(a[7] || 0),
    pct: +(a[8] || 0),
    chg: +(a[9] || 0),
    turnover: +(a[10] || 0),
  };
}

// 东财 K 线原始文本 → Kline[]
export function parseEMKline(text: string): Kline[] {
  const data = JSON.parse(text)?.data;
  if (!data || !data.klines || !data.klines.length) throw new Error("未获取到 K 线数据");
  return data.klines.map(parseEMKlineRow);
}

// 东财实时行情原始文本 → RawRealtime
export function parseEMRealtime(text: string, secid: string): RawRealtime | null {
  const data = JSON.parse(text)?.data;
  if (!data) return null;
  const scale = emPriceScale(secid);
  const num = (k: string) => (data[k] != null && data[k] !== "" ? +data[k] : 0);
  return {
    name: data.f58 || "",
    code: data.f57 || secid,
    price: num("f43") / scale,
    preClose: num("f60") / scale,
    open: num("f46") / scale,
    high: num("f44") / scale,
    low: num("f45") / scale,
    vol: num("f47"),
    amount: num("f48"),
    time: fmtEMTime(num("f86")),
  };
}

// 东财分时原始文本 → { trends, preClose }
export function parseEMTrend(text: string): { trends: Trend[]; preClose: number } | null {
  const data = JSON.parse(text)?.data;
  if (!data || !data.trends) return null;
  const trends: Trend[] = data.trends
    .map((s: string) => parseTrend(s))
    .filter((t: Trend) => t && isFinite(t.price) && t.price > 0);
  if (!trends.length) return null;
  return { trends, preClose: data.preClose ?? (trends.length ? trends[0].price : 0) };
}

// 东财资金流原始文本 → {日期: 主力净流入(元)}
export function parseEMFlow(text: string): Record<string, number> | null {
  const data = JSON.parse(text)?.data;
  const map: Record<string, number> = {};
  if (data && data.klines) {
    data.klines.forEach((s: string) => {
      const a = s.split(",");
      map[a[0]] = parseFloat(a[1]) || 0; // f52 主力净流入(元)
    });
  }
  return Object.keys(map).length ? map : null;
}

// 东财搜索原始文本 → SearchHit[]
export function parseEMSearch(text: string): SearchHit[] | null {
  const json = JSON.parse(text);
  const rows: any[] = json?.QuotationCodeTable?.Data || [];
  const hits = rows
    .map((r) => ({ code: String(r.Code || ""), name: String(r.Name || "") }))
    .filter((h) => h.code);
  return hits.length ? hits : null;
}

// 指数市场宽度（涨跌家数）：push2delay ulist 的 f104/f105/f128/f136
export interface IndexBreadth {
  up: number;
  down: number;
  limitUp: number;
  limitDown: number;
}
export function parseEMBreadth(text: string): IndexBreadth | null {
  const diff = JSON.parse(text)?.data?.diff?.[0];
  if (!diff) return null;
  const num = (k: string) => (diff[k] != null && diff[k] !== "" ? Number(diff[k]) : 0);
  return { up: num("f104"), down: num("f105"), limitUp: num("f128"), limitDown: num("f136") };
}

// 个股所属行业（f100）：实时行情 fields 传 f100,f58 时，data.f100 即行业名。
export function parseEMIndustry(text: string): string | null {
  const data = JSON.parse(text)?.data;
  const name = data?.f100 || "";
  return name ? String(name).trim() : null;
}

export interface IndustryBoard {
  secid: string; // 如 90.BK1036
  name: string; // 如 半导体及元件
}
export function parseEMBoards(text: string): IndustryBoard[] {
  const rows: any[] = JSON.parse(text)?.data?.diff || [];
  const out: IndustryBoard[] = [];
  for (const r of rows) {
    const name = r.f14 ? String(r.f14).trim() : "";
    const code = r.f12 ? String(r.f12).trim() : "";
    const mkt = r.f13 != null ? String(r.f13) : "90";
    if (name && code) out.push({ secid: mkt + "." + code, name });
  }
  return out;
}
