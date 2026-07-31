// =====================================================================
// 数据源：东方财富（交易所授权行情门户，覆盖最全，作为首选源）
//   实时行情  push2.eastmoney.com/api/qt/stock/get
//   K 线      push2his.eastmoney.com/api/qt/stock/kline/get（日/周/月/年）
//   分时      push2his.eastmoney.com/api/qt/stock/trends2/get
//   资金流    push2his.eastmoney.com/api/qt/stock/fflow/kline/get
//   搜索      searchapi.eastmoney.com/api/suggest/get
// =====================================================================
import { requestEmJson } from "@/api/transport";
import type { PeriodKey, Kline, Trend } from "@/utils/period";
import { dateStr, parseTrend } from "@/utils/period";
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

function parseEMKline(s: string): Kline {
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

const EM_KLT: Record<string, number> = { d: 101, w: 102, M: 103, y: 106 };
const EM_BEG: Record<string, number> = { d: -730, w: -2200, M: -3650, y: -7300 };

// 东方财富 K 线（被实时行情降级、以及 K 线接口本身复用）
export async function fetchEMKline(secid: string, period: PeriodKey): Promise<Kline[]> {
  const klt = EM_KLT[period];
  const beg = dateStr(EM_BEG[period]);
  const url =
    "https://push2his.eastmoney.com/api/qt/stock/kline/get" +
    "?fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61" +
    "&klt=" +
    klt +
    "&fqt=1&secid=" +
    secid +
    "&beg=" +
    beg +
    "&end=20500101";
  const text = await requestEmJson(url);
  const data = JSON.parse(text)?.data;
  if (!data || !data.klines || !data.klines.length) throw new Error("未获取到 K 线数据");
  return data.klines.map(parseEMKline);
}

// 实时行情：push2 接口，若挂掉则从最新日 K 推导近似快照兜底（push2his 不同主机）。
export const emRealtime = {
  id: "eastmoney-realtime",
  async fetch(secid: string): Promise<RawRealtime | null> {
    const url =
      "https://push2.eastmoney.com/api/qt/stock/get" +
      "?secid=" +
      secid +
      "&fields=f43,f44,f45,f46,f47,f48,f57,f58,f59,f60,f86";
    try {
      const text = await requestEmJson(url);
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
    } catch {
      // 实时接口(push2)不可达：降级到日 K 近似快照
      try {
        const klines = await fetchEMKline(secid, "d");
        const last = klines[klines.length - 1];
        const prev = klines[klines.length - 2];
        return {
          name: "",
          code: secid,
          price: last ? last.close : 0,
          preClose: prev ? prev.close : last ? last.close : 0,
          open: last ? last.open : 0,
          high: last ? last.high : 0,
          low: last ? last.low : 0,
          vol: last ? last.vol : 0,
          amount: last ? last.amount : 0,
          time: last ? last.date + " (日K近似)" : "",
        };
      } catch {
        return null;
      }
    }
  },
};

export const emKline = {
  id: "eastmoney-kline",
  async fetch(secid: string, period: PeriodKey): Promise<Kline[] | null> {
    try {
      return await fetchEMKline(secid, period);
    } catch {
      return null;
    }
  },
};

export const emTrend = {
  id: "eastmoney-trend",
  async fetch(secid: string): Promise<{ trends: Trend[]; preClose: number } | null> {
    const url =
      "https://push2his.eastmoney.com/api/qt/stock/trends2/get" +
      "?secid=" +
      secid +
      "&fields1=f1,f2,f3,f4,f5,f6,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0";
    try {
      const text = await requestEmJson(url);
      const data = JSON.parse(text)?.data;
      if (!data || !data.trends) return null;
      const trends: Trend[] = data.trends
        .map((s: string) => parseTrend(s))
        .filter((t: Trend) => t && isFinite(t.price) && t.price > 0); // 丢弃非法行，避免污染图表
      if (!trends.length) return null;
      return { trends, preClose: data.preClose ?? (trends.length ? trends[0].price : 0) };
    } catch {
      return null;
    }
  },
};

export const emFlow = {
  id: "eastmoney-flow",
  async fetch(secid: string): Promise<Record<string, number> | null> {
    const url =
      "https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get" +
      "?lmt=120&klt=101&secid=" +
      secid +
      "&fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61";
    try {
      const text = await requestEmJson(url);
      const data = JSON.parse(text)?.data;
      const map: Record<string, number> = {};
      if (data && data.klines) {
        data.klines.forEach((s: string) => {
          const a = s.split(",");
          map[a[0]] = parseFloat(a[1]) || 0; // f52 主力净流入(元)
        });
      }
      return map;
    } catch {
      return null;
    }
  },
};

export const emSearch = {
  id: "eastmoney-search",
  async fetch(keyword: string): Promise<SearchHit[] | null> {
    const url =
      "https://searchapi.eastmoney.com/api/suggest/get" +
      "?input=" +
      encodeURIComponent(keyword) +
      "&type=14&token=D43BF7224E8C6FA3AFPAY9&count=8";
    try {
      const text = await requestEmJson(url);
      const json = JSON.parse(text);
      const rows: any[] = json?.QuotationCodeTable?.Data || [];
      const hits = rows
        .map((r) => ({ code: String(r.Code || ""), name: String(r.Name || "") }))
        .filter((h) => h.code);
      return hits.length ? hits : null;
    } catch {
      return null;
    }
  },
};
