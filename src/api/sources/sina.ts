// =====================================================================
// 数据源：新浪财经（作为第三兜底源，覆盖实时 / K 线(仅日K) / 分时 / 搜索）
//   实时行情  hq.sinajs.cn/list=sh600519        （全局变量 hq_str_sh600519="..."）
//   K 线(日)  money.finance.sina.com.cn/.../CN_MarketData.getKLineData?scale=240
//   分时      money.finance.sina.com.cn/.../CN_MarketData.getKLineData?scale=1（1 分钟近似）
//   搜索      suggest.sinajs.cn/suggest.php
// 说明：新浪实时/搜索可能因 Referer 校验偶发 403，属于「尽力而为」的兜底源；
//       取不到时由上层自动切回东财/腾讯或本地联想，不影响主流程。
// =====================================================================
import { requestText, requestGlobalVar, looksLikeHtml } from "@/api/transport";
import type { PeriodKey, Kline, Trend } from "@/utils/period";
import type { RawRealtime, SearchHit } from "./types";
import { toMarketSymbol, normalizeCode } from "./symbol";

// 新浪 hq_str_sh600519="名称,今开,昨收,当前价,最高,最低,...,成交量(股),成交额(元),...,日期,时间"
function parseSinaRealtime(s: string, sym: string): RawRealtime | null {
  const a = s.split(",");
  if (a.length < 32) return null;
  const num = (x: string) => parseFloat(x) || 0;
  return {
    name: a[0] || "",
    code: sym,
    price: num(a[3]),
    preClose: num(a[2]),
    open: num(a[1]),
    high: num(a[4]),
    low: num(a[5]),
    vol: num(a[8]) / 100, // 新浪成交量单位为股 -> 手
    amount: num(a[9]),
    time: (a[30] || "") + " " + (a[31] || ""),
  };
}

export const sinaRealtime = {
  id: "sina-realtime",
  async fetch(secid: string): Promise<RawRealtime | null> {
    const sym = toMarketSymbol(secid);
    const key = "hq_str_" + sym;
    try {
      const text = await requestGlobalVar("https://hq.sinajs.cn/list=" + sym, key);
      if (!text) return null;
      return parseSinaRealtime(text, sym);
    } catch {
      return null;
    }
  },
};

// 新浪仅支持日 K（scale=240）与分钟 K，不支持周/月/年，故非日线周期直接返回 null。
export const sinaKline = {
  id: "sina-kline",
  async fetch(secid: string, period: PeriodKey): Promise<Kline[] | null> {
    if (period !== "d") return null;
    const sym = toMarketSymbol(secid);
    const url =
      "https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData" +
      "?symbol=" +
      sym +
      "&scale=240&ma=5&datalen=730";
    try {
      const text = await requestText(url);
      if (looksLikeHtml(text)) return null;
      const arr = JSON.parse(text);
      if (!Array.isArray(arr) || !arr.length) return null;
      return arr.map((r: any, i: number) => {
        const open = +r.open;
        const close = +r.close;
        const high = +r.high;
        const low = +r.low;
        const vol = +r.volume;
        const pre = i > 0 ? +arr[i - 1].close : open;
        const chg = close - pre;
        const pct = pre ? (chg / pre) * 100 : 0;
        const amp = pre ? ((high - low) / pre) * 100 : 0;
        const date = String(r.day).replace(/[^\d]/g, "").slice(0, 8);
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
    } catch {
      return null;
    }
  },
};

// 新浪分时：用 1 分钟 K 近似（scale=1），足以支撑分时走势展示。
export const sinaTrend = {
  id: "sina-trend",
  async fetch(secid: string): Promise<{ trends: Trend[]; preClose: number } | null> {
    const sym = toMarketSymbol(secid);
    const url =
      "https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData" +
      "?symbol=" +
      sym +
      "&scale=1&ma=5&datalen=240";
    try {
      const text = await requestText(url);
      if (looksLikeHtml(text)) return null;
      const arr = JSON.parse(text);
      if (!Array.isArray(arr) || !arr.length) return null;
      const trends: Trend[] = arr
        .map((r: any) => {
          const price = +r.close;
          if (!isFinite(price) || price <= 0) return null; // 非法数据丢弃
          const avg = (+r.open + +r.close + +r.high + +r.low) / 4;
          const vol = +r.volume;
          return {
            // 归一化为「YYYY-MM-DD HH:MM」，与东财/腾讯口径一致（分时图取 t.slice(11) 得 HH:MM）
            t: String(r.day).slice(0, 16),
            open: +r.open,
            price,
            high: +r.high,
            low: +r.low,
            vol,
            amount: 0,
            avg,
          } as Trend;
        })
        .filter((x: Trend | null): x is Trend => x !== null);
      if (!trends.length) return null;
      const preClose = trends.length ? trends[0].price : 0;
      return { trends, preClose };
    } catch {
      return null;
    }
  },
};

export const sinaSearch = {
  id: "sina-search",
  async fetch(keyword: string): Promise<SearchHit[] | null> {
    const kw = (keyword || "").trim();
    if (!kw) return null;
    try {
      // 新浪联想接口（全局变量式，<script> 注入无 CORS 限制）：
      //   https://suggest3.sinajs.cn/suggest/?key=KEY
      // 返回 var suggestvalue="名称,市场,代码,符号,名称,...;名称,...";
      const key = "suggestvalue";
      const text = await requestGlobalVar(
        "https://suggest3.sinajs.cn/suggest/?key=" + encodeURIComponent(kw),
        key
      );
      if (!text) return null;
      const hits: SearchHit[] = [];
      text
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((entry) => {
          const parts = entry.split(",");
          if (parts.length < 4) return;
          const code = normalizeCode(parts[2] || "");
          // 新浪格式：`符号,市场类型,代码,符号,名称,...`（如 "sz399006,11,399006,sz399006,创业板指,..."）。
          // parts[0] 有时是带前缀的代码（如 sh600009 / sz399006），直接当名称会显示成 secid；
          // 真正的中文名稳定位于 parts[4]（部分条目 parts[6] 也重复名称）。故优先取 parts[4]/[6]，
          // 仅在其为空时回退 parts[0]，避免联想列表出现「sz399006」这类怪名。
          const name = parts[4] || parts[6] || parts[0] || "";
          if (code) hits.push({ code, name });
        });
      return hits.length ? hits : null;
    } catch {
      return null;
    }
  },
};
