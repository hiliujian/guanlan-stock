// =====================================================================
// 数据源：腾讯证券（作为第二兜底源，覆盖实时 / K 线 / 分时 / 搜索）
//   实时行情  qt.gtimg.cn/q=sh600519            （全局变量 v_sh600519="..."）
//   K 线      web.ifzq.gtimg.cn/appstock/app/fqkline/get（day/week/month/year）
//   分时      web.ifzq.gtimg.cn/appstock/app/minute/query
//   搜索      smartbox.gtimg.cn/s3/             （支持 cb 回调）
// 说明：腾讯实时接口走 <script> 全局变量（无 CORS 限制）；K 线 / 分时 / 搜索
//       为 JSON 接口，若浏览器直连被 CORS 拦截，由 transport 层公共代理兜底。
// =====================================================================
import { requestText, requestGlobalVar, jsonpText } from "@/api/transport";
import type { PeriodKey, Kline, Trend } from "@/utils/period";
import type { RawRealtime, SearchHit } from "./types";
import { toMarketSymbol, normalizeCode } from "./symbol";

// 腾讯 qt.gtimg.cn 返回的 ~ 分隔字段（v_sh600519="1~名称~代码~当前价~昨收~今开~..."）
function parseTencentRealtime(s: string): RawRealtime | null {
  const a = s.split("~");
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
    turnover: num(a[38]), // 换手率（%），如 0.29 表示 0.29%
    time: a[30] || "",
  };
}

export const txRealtime = {
  id: "tencent-realtime",
  async fetch(secid: string): Promise<RawRealtime | null> {
    const sym = toMarketSymbol(secid);
    const key = "v_" + sym;
    try {
      const text = await requestGlobalVar("https://qt.gtimg.cn/q=" + sym, key);
      if (!text) return null;
      return parseTencentRealtime(text);
    } catch {
      return null;
    }
  },
};

// 腾讯 K 线行：[date, open, close, high, low, volume]
function parseTencentKline(json: any, sym: string, period: PeriodKey): Kline[] | null {
  const node = json?.data?.[sym];
  if (!node) return null;
  const keyMap: Record<string, string> = {
    d: "qfqday",
    w: "qfqweek",
    M: "qfqmonth",
    y: "qfqyear",
  };
  const arr: any[] = node[keyMap[period]] || node[period] || node.day || [];
  if (!arr.length) return null;
  let prevClose = 0;
  return arr.map((r: any[], i: number) => {
    const date = String(r[0]);
    const open = +r[1];
    const close = +r[2];
    const high = +r[3];
    const low = +r[4];
    const vol = +r[5];
    const pre = i > 0 ? +arr[i - 1][2] : open;
    prevClose = pre;
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

export const txKline = {
  id: "tencent-kline",
  async fetch(secid: string, period: PeriodKey): Promise<Kline[] | null> {
    const sym = toMarketSymbol(secid);
    const pmap: Record<string, string> = { d: "day", w: "week", M: "month", y: "year" };
    const url =
      "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=" +
      sym +
      "," +
      pmap[period] +
      ",,,320,qfq";
    try {
      const text = await requestText(url);
      const json = JSON.parse(text);
      return parseTencentKline(json, sym, period);
    } catch {
      return null;
    }
  },
};

export const txTrend = {
  id: "tencent-trend",
  async fetch(secid: string): Promise<{ trends: Trend[]; preClose: number } | null> {
    const sym = toMarketSymbol(secid);
    const url = "https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=" + sym;
    try {
      const text = await requestText(url);
      const json = JSON.parse(text);
      const node = json?.data?.[sym]?.data;
      if (!node || !Array.isArray(node.data) || !node.data.length) return null;
      // 腾讯分钟数据：每行「HHMM 当前价 累计量(手) 累计额(元)」（空格分隔，无均价字段）
      const dateRaw = String(node.date || "").replace(/[^\d]/g, "");
      const dateStr =
        dateRaw.length === 8
          ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
          : "";
      const rows: string[] = node.data;
      const preClose =
        +node.preClose || (rows.length ? parseFloat(rows[0].split(/\s+/)[1]) : 0);
      const trends: Trend[] = [];
      for (const r of rows) {
        const a = r.split(/\s+/).filter(Boolean);
        if (a.length < 4) continue;
        const price = +a[1];
        if (!isFinite(price) || price <= 0) continue; // 非法数据直接丢弃，交由下一家源兜底
        const cumVolHand = +a[2]; // 累计成交量（手）
        const cumAmount = +a[3]; // 累计成交额（元）
        const cumVol = cumVolHand * 100; // 手 → 股（与东财口径一致）
        const avg = cumVol ? cumAmount / cumVol : price; // VWAP 均价
        const hh = a[0].slice(0, 2);
        const mm = a[0].slice(2, 4);
        const t = dateStr ? `${dateStr} ${hh}:${mm}` : `${hh}:${mm}`;
        trends.push({ t, open: price, price, high: price, low: price, vol: cumVol, amount: cumAmount, avg });
      }
      if (!trends.length) return null;
      return { trends, preClose };
    } catch {
      return null;
    }
  },
};

export const txSearch = {
  id: "tencent-search",
  async fetch(keyword: string): Promise<SearchHit[] | null> {
    const url = "https://smartbox.gtimg.cn/s3/?v=2&t=all&q=" + encodeURIComponent(keyword);
    try {
      const text = await jsonpText(url);
      const json = JSON.parse(text);
      const list: any[] = json?.data || [];
      const hits: SearchHit[] = [];
      list.forEach((it: any) => {
        const code = normalizeCode(String(it.code || ""));
        const name = String(it.name || "");
        if (code) hits.push({ code, name });
      });
      return hits.length ? hits : null;
    } catch {
      return null;
    }
  },
};
