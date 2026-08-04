// =====================================================================
// 解析器：腾讯证券（作为第二兜底源，覆盖实时 / K 线 / 分时 / 搜索）
//   实时行情  qt.gtimg.cn/q=sh600519            （返回 v_sh600519="..." 全局变量，GBK）
//   K 线      web.ifzq.gtimg.cn/appstock/app/fqkline/get（day/week/month/year，UTF-8 JSON）
//   分时      web.ifzq.gtimg.cn/appstock/app/minute/query（UTF-8 JSON）
//   搜索      smartbox.gtimg.cn/s3/             （返回 v_hint="..." 全局变量）
//
// 本文件只负责「解析」，URL 构建与多源冗余全部由后端网关完成。
// =====================================================================
import type { PeriodKey, Kline, Trend } from "@/utils/period";
import type { RawRealtime, SearchHit } from "./types";

// 全局变量式响应（v_sh600519="..." / v_hint="..."）→ 提取引号内的值
export function unwrapGlobalVar(text: string): string {
  const t = (text || "").trim();
  const i = t.indexOf("=");
  if (i < 0) return t;
  let v = t.slice(i + 1).trim();
  if (v.startsWith('"')) v = v.slice(1);
  if (v.endsWith('"')) v = v.slice(0, -1);
  if (v.endsWith(";")) v = v.slice(0, -1);
  return v;
}

// 腾讯 qt.gtimg.cn 返回的 ~ 分隔字段（v_sh600519="1~名称~代码~当前价~昨收~今开~..."）
export function parseTXRealtime(text: string): RawRealtime | null {
  const a = unwrapGlobalVar(text).split("~");
  if (a.length < 35) return null;
  const num = (x: string) => parseFloat(x) || 0;
  return {
    name: a[1] || "",
    code: a[2] || "",
    price: num(a[3]),
    preClose: num(a[4]),
    open: num(a[5]),
    high: num(a[33]),
    low: num(a[34]),
    vol: num(a[36]), // 成交量（手）
    amount: num(a[37]) * 10000, // 成交额（万元 -> 元）
    turnover: num(a[38]), // 换手率（%）
    time: a[30] || "",
  };
}

// 腾讯 K 线原始文本 → Kline[]
export function parseTXKline(text: string, sym: string, period: PeriodKey): Kline[] | null {
  const json = JSON.parse(text);
  const node = json?.data?.[sym];
  if (!node) return null;
  const keyMap: Record<string, string> = { d: "qfqday", w: "qfqweek", M: "qfqmonth", y: "qfqyear" };
  const arr: any[] = node[keyMap[period]] || node[period] || node.day || [];
  if (!arr.length) return null;
  return arr.map((r: any[], i: number) => {
    const date = String(r[0]);
    const open = +r[1];
    const close = +r[2];
    const high = +r[3];
    const low = +r[4];
    const vol = +r[5];
    const pre = i > 0 ? +arr[i - 1][2] : open;
    const chg = close - pre;
    const pct = pre ? (chg / pre) * 100 : 0;
    const amp = pre ? ((high - low) / pre) * 100 : 0;
    return {
      date,
      open,
      close,
      high,
      low,
      vol,
      amount: 0,
      amp,
      pct,
      chg,
      turnover: 0,
    };
  });
}

// 腾讯分时原始文本 → { trends, preClose }
export function parseTXTrend(text: string, sym: string): { trends: Trend[]; preClose: number } | null {
  const json = JSON.parse(text);
  const node = json?.data?.[sym]?.data;
  if (!node || !Array.isArray(node.data) || !node.data.length) return null;
  const dateRaw = String(node.date || "").replace(/[^\d]/g, "");
  const dateStr =
    dateRaw.length === 8
      ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
      : "";
  const rows: string[] = node.data;
  const preClose = +node.preClose || (rows.length ? parseFloat(rows[0].split(/\s+/)[1]) : 0);
  const trends: Trend[] = [];
  for (const r of rows) {
    const a = r.split(/\s+/).filter(Boolean);
    if (a.length < 4) continue;
    const price = +a[1];
    if (!isFinite(price) || price <= 0) continue;
    const cumVolHand = +a[2]; // 累计成交量（手）
    const cumAmount = +a[3]; // 累计成交额（元）
    const cumVol = cumVolHand * 100; // 手 → 股
    const avg = cumVol ? cumAmount / cumVol : price;
    const hh = a[0].slice(0, 2);
    const mm = a[0].slice(2, 4);
    const t = dateStr ? `${dateStr} ${hh}:${mm}` : `${hh}:${mm}`;
    trends.push({ t, open: price, price, high: price, low: price, vol: cumVol, amount: cumAmount, avg });
  }
  if (!trends.length) return null;
  return { trends, preClose };
}

// 腾讯搜索（smartbox）原始文本 → SearchHit[]
// 返回形如 v_hint="sh~600519~贵州茅台~gzmt~GP-A;...";（多条目以 ; 分隔）
export function parseTXSearch(text: string): SearchHit[] | null {
  const val = unwrapGlobalVar(text);
  if (!val || val === "N") return null;
  const hits: SearchHit[] = [];
  for (const entry of val.split(";")) {
    const parts = entry.split("~");
    const code = (parts[1] || "").replace(/[^0-9]/g, "");
    const name = parts[2] || "";
    if (code && name) hits.push({ code, name });
  }
  return hits.length ? hits : null;
}
