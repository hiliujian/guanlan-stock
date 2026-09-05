// =====================================================================
// 行情数据 API（统一后端网关驱动）
//
// 统一后端架构：前端所有行情取数统一走 Edge Function 网关（guanlan-quote-proxy），
// 多数据源冗余（东财 → 腾讯 → 新浪，用不了自动切下级）由后端按配置完成。
// 前端只负责：按 kind 发起语义化请求 → 用返回的 source 对应解析器解析原始文本。
//
// 数据源顺序（配置文件）在后端：
//   supabase functions 的 SOURCES_JSON 环境变量（supabase secrets set SOURCES_JSON='{...}'）
//   或内置默认 DEFAULT_SOURCES（东财 → 腾讯 → 新浪）。前端无需再配置 / 感知源。
//
// 数据出口统一做清洗（cleanRealtime / normalizeKlines），保证任意来源数据
// 满足「low ≤ open,close ≤ high」等铁律，有效数据原样透传、绝不臆造。
// =====================================================================
import type { PeriodKey, Kline, Trend } from "@/utils/period";
import type { RawRealtime, FlowMap, SearchHit } from "./types";
import { requestGateway } from "@/api/transport";
import { toMarketSymbol } from "./symbol";
import {
  parseEMKline,
  parseEMRealtime,
  parseEMTrend,
  parseEMFlow,
  parseEMSearch,
  parseEMBreadth,
  parseEMIndustry,
  parseEMBoards,
  type IndexBreadth,
  type IndustryBoard,
} from "./eastmoney";
import { parseTXRealtime, parseTXKline, parseTXTrend, parseTXSearch } from "./tencent";
import {
  parseSinaRealtime,
  parseSinaKline,
  parseSinaTrend,
  parseSinaSearch,
  parseSinaFlow,
  parseSinaFutures,
} from "./sina";
import { searchByKeyword } from "./news";
import { codeFromSecid } from "@/utils/period";
import type { NewsItem } from "@/utils/newsSentiment";

// ---------------- K 线 / 实时行情 数据清洗 ----------------
// 上游源偶发会返回「坏棒」：字段缺失、离群、OHLC 不自洽。这里在数据出口统一修复：
//   1) 字段缺失 / 非有限 / ≤0 → 用同棒其余有效字段的中位数补齐（只补缺口，不动有效值）；
//   2) 单字段相对中位数偏离 >2× → 整根棒不可信，直接丢弃（不把真实值篡改成中位数）；
//   3) 仅当 OHLC 不自洽（high<low 或 high<open/close、low>open/close）时，才做最小修正
//      high=max(o,c,h)、low=min(o,c,l)。
// 有效真实数据 100% 保留。
function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function cleanKline(k: Kline): Kline | null {
  const raw: number[] = [k.open, k.close, k.high, k.low];
  const valid = raw.filter((x) => Number.isFinite(x) && x > 0);
  if (valid.length < 3) return null;
  const med = median(valid);
  for (const v of raw) {
    if (Number.isFinite(v) && v > 0 && (v < med / 2 || v > med * 2)) return null;
  }
  const fill = (v: number) => (Number.isFinite(v) && v > 0 ? v : med);
  const o = fill(k.open), c = fill(k.close), h = fill(k.high), l = fill(k.low);
  const hi = Math.max(o, c, h);
  const lo = Math.min(o, c, l);
  return { ...k, open: o, close: c, high: hi, low: lo };
}
function normalizeKlines(arr: any): Kline[] {
  if (!Array.isArray(arr) || !arr.length) return [];
  const out: Kline[] = [];
  for (const k of arr) {
    if (!k) continue;
    const c = cleanKline(k as Kline);
    if (!c || !(c.close > 0)) continue;
    out.push(c);
  }
  return out;
}

// 实时快照护栏：仅做高低一致性（high ≥ 现价/今开，low ≤ 现价/今开），不改动有效数据。
function cleanRealtime(rt: RawRealtime): RawRealtime {
  const cand = [rt.price, rt.open, rt.high, rt.low].filter((v) => Number.isFinite(v) && v > 0);
  if (!cand.length) return rt;
  const hi = Math.max(...cand);
  const lo = Math.min(...cand);
  return {
    ...rt,
    high: Number.isFinite(rt.high) && rt.high > 0 ? Math.max(rt.high, hi) : hi,
    low: Number.isFinite(rt.low) && rt.low > 0 ? Math.min(rt.low, lo) : lo,
  };
}

// ---------------- 按返回源分发解析 ----------------
type ParserArgs = Record<string, unknown>;
function parseBySource(kind: string, source: string, text: string, params: ParserArgs): unknown {
  const sym = String(params.sym || "");
  if (kind === "realtime") {
    if (source === "eastmoney") return parseEMRealtime(text, String(params.secid || ""));
    if (source === "tencent") return parseTXRealtime(text);
    if (source === "sina") return parseSinaRealtime(text, sym);
    return null;
  }
  if (kind === "kline") {
    if (source === "eastmoney") return parseEMKline(text);
    if (source === "tencent") return parseTXKline(text, sym, params.period as PeriodKey);
    if (source === "sina") return parseSinaKline(text);
    return null;
  }
  if (kind === "trend") {
    if (source === "eastmoney") return parseEMTrend(text);
    if (source === "tencent") return parseTXTrend(text, sym);
    if (source === "sina") return parseSinaTrend(text);
    return null;
  }
  if (kind === "flow") {
    if (source === "eastmoney") return parseEMFlow(text);
    if (source === "sina") return parseSinaFlow(text);
    return null;
  }
  if (kind === "search") {
    if (source === "eastmoney") return parseEMSearch(text);
    if (source === "tencent") return parseTXSearch(text);
    if (source === "sina") return parseSinaSearch(text);
    return null;
  }
  if (kind === "ulist") {
    if (source === "eastmoney") return parseEMBreadth(text);
    return null;
  }
  if (kind === "clist") {
    if (source === "eastmoney") return parseEMBoards(text);
    return null;
  }
  return null;
}

// 请求网关并把返回文本按 source 解析成目标类型（解析失败 / 非目标源 → null）
async function gatewayParse<T>(kind: string, params: ParserArgs): Promise<T | null> {
  try {
    const { source, text } = await requestGateway(kind, params);
    return (parseBySource(kind, source, text, params) as T) ?? null;
  } catch {
    return null;
  }
}

const toSym = (secid: string): string => toMarketSymbol(secid);

export function getRealtime(secid: string): Promise<RawRealtime> {
  const sym = toSym(secid);
  return gatewayParse<RawRealtime>("realtime", { secid, sym }).then((r) => {
    if (!r) throw new Error("实时行情获取失败，请稍后重试");
    return cleanRealtime(r);
  });
}

// 换手率锚定：实时换手率仅东财(f168) / 腾讯(a[38]) 提供，新浪无此字段。当网关返回的
// 实时源不含换手率（如新浪胜出），上层用本函数单独向腾讯取一次含换手率的快照，
// 用于反推流通股本、估算缺失的日 K 换手率。
export async function fetchTurnoverAnchor(secid: string): Promise<RawRealtime | null> {
  try {
    const { text } = await requestGateway("realtime", { secid, forceSource: "tencent" });
    const rt = parseTXRealtime(text);
    return rt && (rt.turnover || 0) > 0 && (rt.vol || 0) > 0 ? rt : null;
  } catch {
    return null;
  }
}

// K 线缓存：腾讯 / 新浪 K 线不含换手率；只有东财（f61）稳定提供真实换手率。
// 网关正常按配置先试东财（保换手率），东财不可用才落到腾讯/新浪。缓存 TTL 内
// 含真实换手率的成功结果，避免周期切换 / 定时刷新反复回源导致换手率闪烁。
const klineCache = new Map<string, { t: number; data: Kline[] }>();
const KLINE_TTL = 5 * 60 * 1000;

// 5日K线已整体移除（东财无对应 klt，原由日K 客户端聚合），故无需专用分支。

export async function getKline(secid: string, period: PeriodKey): Promise<Kline[]> {
  const key = secid + "|" + period;
  const now = Date.now();
  const cached = klineCache.get(key);
  if (cached && now - cached.t < KLINE_TTL && cached.data.some((k) => (k.turnover || 0) > 0)) {
    return cached.data;
  }
  const sym = toSym(secid);
  const data = await gatewayParse<Kline[]>("kline", { secid, period, sym });
  if (!data || !data.length) return cached && cached.data.some((k) => (k.turnover || 0) > 0) ? cached.data : [];
  const clean = normalizeKlines(data);
  if (clean.some((k) => (k.turnover || 0) > 0)) {
    klineCache.set(key, { t: now, data: clean });
  } else if (cached && cached.data.some((k) => (k.turnover || 0) > 0)) {
    // 回源丢失换手率 → 用近期缓存兜底，避免换手率闪烁消失
    return cached.data;
  }
  return clean;
}

export function getTrend(secid: string): Promise<{ trends: Trend[] }> {
  const sym = toSym(secid);
  return gatewayParse<{ trends: Trend[]; preClose: number }>("trend", { secid, sym }).then(
    (r) => (r ? { trends: r.trends } : { trends: [] })
  );
}

export function getFlow(secid: string): Promise<FlowMap> {
  const sym = toSym(secid);
  return gatewayParse<FlowMap>("flow", { secid, sym }).then((r) => r ?? {});
}

export function getSearch(keyword: string): Promise<SearchHit[]> {
  return gatewayParse<SearchHit[]>("search", { keyword }).then((r) => r ?? []);
}

// 指数市场宽度（涨跌家数）：仅东财提供，失败返回 null，由 analyze 降级为「暂无数据」。
export function getIndexBreadth(secid: string): Promise<IndexBreadth | null> {
  return gatewayParse<IndexBreadth>("ulist", {
    secids: secid,
    fields: "f104,f105,f128,f136",
  });
}

// 批量指数/标的实时报价：单次 ulist 网关请求取多标的「最新点位 / 涨跌幅 / 涨跌额」。
// fltt=2 返回真实价格（无需按市场缩放），data.diff 为数组或对象两种形态都要兼容。
// 单项缺失不影响其余；整体失败返回 []。
export interface UlistQuote {
  secid: string;
  name: string;
  price: number | null;
  pct: number | null; // 涨跌幅(%)，带符号
  chg: number | null; // 涨跌额，带符号
  /** 上游最后更新时间（f124，Unix 秒）：用于校验「数据是实时盘中」还是「定格收盘」 */
  ts?: number | null;
}
export async function getUlistQuotes(secids: string[]): Promise<UlistQuote[]> {
  if (!secids.length) return [];
  try {
    const { source, text } = await requestGateway("ulist", {
      secids: secids.join(","),
      fields: "f2,f3,f4,f12,f13,f14,f124",
    });
    if (source !== "eastmoney") return [];
    const json = JSON.parse(text);
    const diff = json?.data?.diff;
    if (!diff) return [];
    const rows: any[] = Array.isArray(diff) ? diff : Object.values(diff);
    const out: UlistQuote[] = [];
    for (const r of rows) {
      if (!r) continue;
      const num = (k: string): number | null => {
        const v = r[k];
        return v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
      };
      const secid =
        r.f13 != null && r.f12 != null ? `${r.f13}.${r.f12}` : r.secid ? String(r.secid) : "";
      out.push({
        secid,
        name: r.f14 ? String(r.f14) : "",
        price: num("f2"),
        pct: num("f3"),
        chg: num("f4"),
        ts: num("f124"),
      });
    }
    return out;
  } catch {
    return [];
  }
}

// 商品期货：Eastmoney 网关不提供期货行情，统一映射至新浪期货符号（nf_ 国内 / hf_ 国际连续合约）。
const FUTURES_SINA: Record<string, string> = {
  "114.CU0": "nf_CU0",
  "114.AU0": "nf_AU0",
  "114.AG0": "nf_AG0", // 沪银主连(SHFE)
  "114.SC0": "nf_SC0",
  "112.GC00Y": "hf_GC", // 纽约金(COMEX)
  "112.SI00Y": "hf_SI", // 纽约银(COMEX)
  "112.HG00Y": "hf_HG", // 美铜(COMEX)
  "112.CL00Y": "hf_CL", // 美原油(WTI)
  "112.BR00Y": "hf_OIL", // 布伦特原油
};
export const FUTURES_SECIDS = Object.keys(FUTURES_SINA);

// ---------------- 美股盘前/盘后扩展行情（新浪 gb_ 批量接口） ----------------
// 新浪美股 gb_ 格式（逗号分隔，实测三样本交叉验证自洽）：
//   [1]正式收盘价 [2]正式涨跌幅% [21]扩展时段(盘前或盘后)最新价
//   [22]扩展涨跌幅%（相对正式收盘价，已验算 [22]=( [21]-[1] )/[1]*100）
//   [24]扩展时段最后成交时间（如 "Sep 03 08:01PM EDT"；盘前时段则为 AM）
//   [25]正式时段最后成交时间 [26]昨收
// 复用网关 futures kind（即 hq.sinajs.cn/list= 通用批量接口，仅 URL 语义复用），零后端改动。
export interface SinaUsExtQuote {
  secid: string;
  close: number | null; // [1] 正式收盘价（扩展涨跌幅基准 + chg 计算基准）
  extPrice: number | null; // [21] 盘前/盘后最新价
  extPct: number | null; // [22] 扩展涨跌幅%（相对正式收盘价）
  preClose: number | null; // [26] 昨收
  extTime: string; // [24] 扩展时段最后成交时间原始串（新鲜度校验用）
}

/** 解析新浪扩展时段成交时间（"Sep 03 08:01PM EDT"）→ ET 月/日/分钟/上下午；格式异常返回 null。 */
export function parseSinaUsExtTime(
  s: string
): { month: number; day: number; minutes: number; am: boolean } | null {
  const m = /^([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{1,2}):(\d{2})(AM|PM)\s+(?:EDT|EST)$/.exec(
    (s || "").trim()
  );
  if (!m) return null;
  const months: Record<string, number> = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
  };
  const month = months[m[1]];
  if (!month) return null;
  const h = parseInt(m[3], 10) % 12 + (m[5] === "PM" ? 12 : 0);
  return { month, day: parseInt(m[2], 10), minutes: h * 60 + parseInt(m[4], 10), am: m[5] === "AM" };
}

/** 批量拉取美股盘前/盘后扩展行情（东财 secid 105./106. 自动映射 gb_ 小写符号）。 */
export async function getSinaUsExtQuotes(secids: string[]): Promise<SinaUsExtQuote[]> {
  const symOf = (secid: string): string => {
    const [m, c] = secid.split(".");
    return m === "105" || m === "106" ? `gb_${(c || "").toLowerCase()}` : "";
  };
  const pairs = new Map<string, string>(); // gb_ 符号 → 原始 secid（天然去重）
  for (const s of secids) {
    const sym = symOf(s);
    if (sym) pairs.set(sym, s);
  }
  if (!pairs.size) return [];
  try {
    const { text } = await requestGateway("futures", { secids: [...pairs.keys()].join(",") });
    const rows = new Map<string, string[]>();
    for (const line of (text || "").split(/\r?\n/)) {
      const i = line.indexOf('"');
      const j = line.lastIndexOf('"');
      if (i < 0 || j <= i) continue;
      const sym = (line.slice(0, i).match(/hq_str_(gb_[a-z0-9.]+)/) || [])[1];
      if (sym && pairs.has(sym)) rows.set(sym, line.slice(i + 1, j).split(","));
    }
    const num = (x: string | undefined): number | null => {
      const v = parseFloat(x || "");
      return Number.isFinite(v) ? v : null;
    };
    const pos = (x: string | undefined): number | null => {
      const v = num(x);
      return v != null && v > 0 ? v : null;
    };
    const out: SinaUsExtQuote[] = [];
    for (const [sym, a] of rows) {
      out.push({
        secid: pairs.get(sym) as string,
        close: pos(a[1]),
        extPrice: pos(a[21]),
        extPct: num(a[22]),
        preClose: pos(a[26]),
        extTime: (a[24] || "").trim(),
      });
    }
    return out;
  } catch {
    return [];
  }
}

// 批量期货实时报价：单次网关 futures 请求（新浪）取多合约，返回与 UlistQuote 同构。
// 涨跌以「最新价 vs 昨结算价」计算（期货主流口径，昨结算缺失时由解析层回退今开）。
export async function getFuturesQuotes(secids: string[]): Promise<UlistQuote[]> {
  const wanted = secids.filter((s) => FUTURES_SINA[s]);
  if (!wanted.length) return [];
  const syms = wanted.map((s) => FUTURES_SINA[s]).join(",");
  try {
    const { text } = await requestGateway("futures", { secids: syms });
    const parsed = parseSinaFutures(text);
    return wanted.map((secid) => {
      const p = parsed[FUTURES_SINA[secid]];
      const price = p?.price ?? null;
      const base = p?.base ?? null;
      let pct: number | null = null;
      let chg: number | null = null;
      if (price != null && base != null && base !== 0) {
        chg = price - base;
        pct = (chg / base) * 100;
      }
      return { secid, name: "", price, pct, chg };
    });
  } catch {
    return [];
  }
}

// 东财 ulist 漏算的标的（如恒生科技指数推送延迟/缺失），改用腾讯实时兜底，确保出真实数据。
const TENCENT_FALLBACK_SECIDS = new Set(["100.HSTECH"]);

export async function getTencentFallbackQuotes(secids: string[]): Promise<UlistQuote[]> {
  const wanted = secids.filter((s) => TENCENT_FALLBACK_SECIDS.has(s));
  if (!wanted.length) return [];
  const out: UlistQuote[] = [];
  await Promise.all(
    wanted.map(async (secid) => {
      try {
        const { text } = await requestGateway("realtime", { secid, forceSource: "tencent" });
        const rt = parseTXRealtime(text);
        if (rt && Number.isFinite(rt.price) && rt.price > 0) {
          const pre = rt.preClose || rt.open || 0;
          const chg = pre ? rt.price - pre : 0;
          out.push({
            secid,
            name: rt.name || "",
            price: rt.price,
            pct: pre ? (chg / pre) * 100 : null,
            chg: pre ? chg : null,
          });
        }
      } catch {
        /* 单个失败不影响其余 */
      }
    })
  );
  return out;
}

// 个股所属行业（f100）：仅东财提供，失败返回 null，sector 维度自动缺省。
export async function getStockIndustry(secid: string): Promise<string | null> {
  try {
    const { source, text } = await requestGateway("realtime", { secid, fields: "f100,f58" });
    return source === "eastmoney" ? parseEMIndustry(text) : null;
  } catch {
    return null;
  }
}

// 行业板块列表（长期缓存，整包只拉一次）：把行业名映射到板块指数 secid。
let _boardCache: { t: number; data: IndustryBoard[] } | null = null;
const BOARD_TTL = 60 * 60 * 1000;
export async function getIndustryBoards(): Promise<IndustryBoard[]> {
  if (_boardCache && Date.now() - _boardCache.t < BOARD_TTL) {
    return _boardCache.data;
  }
  const boards = await gatewayParse<IndustryBoard[]>("clist", {
    query: {
      pn: 1,
      pz: 500,
      po: 1,
      np: 1,
      fltt: 2,
      invt: 2,
      fid: "f3",
      fs: "m:90+t:2",
      fields: "f12,f13,f14",
    },
  });
  if (boards && boards.length) {
    _boardCache = { t: Date.now(), data: boards };
  }
  return boards || [];
}

// IndustryBoard 供 @/api/quote 消费；NewsItem/IndexBreadth 无 barrel 消费者（各自从
// newsSentiment/eastmoney 原始模块导入），不再经此 re-export。
export type { IndustryBoard } from "./eastmoney";

// 关联资讯：并行取「代码 / 公司名」（个股）与「所属行业名」（板块）三路关键词，
// 合并去重（按底层文章 id，同一篇经多路取回只保留首个——个股批优先）并按时间倒序。
// 若资讯接口不可达，返回 []，由上层 graceful 处理，不阻断行情主流程。
export async function getNews(secid: string, name?: string, industry?: string): Promise<NewsItem[]> {
  const code = codeFromSecid(secid);
  const keys = Array.from(
    new Set([code, name].filter((k): k is string => !!k && k.trim().length >= 2))
  );
  const ind = (industry || "").trim();
  const batches = await Promise.all([
    ...keys.map((k) => searchByKeyword(k, "stock").catch(() => [] as NewsItem[])),
    // 所属板块资讯：板块行情联动个股（如半导体整体上涨带动板块内个股），与主流平台一致
    ...(ind.length >= 2 && ind !== (name || "").trim()
      ? [searchByKeyword(ind, "industry").catch(() => [] as NewsItem[])]
      : []),
  ]);
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const arr of batches) {
    for (const it of arr) {
      if (it && it.id && !seen.has(it.id)) {
        seen.add(it.id);
        out.push(it);
      }
    }
  }
  out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return out;
}
