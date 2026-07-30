// =====================================================================
// 行情数据层（跨端统一入口）—— 单一数据源：东方财富
//
// 为什么只用东方财富一家？
//   东方财富（交易所授权行情门户）一家即可覆盖全部所需数据：
//     · 实时行情  push2.eastmoney.com/api/qt/stock/get      （最新价/昨收/开/高/低/名称/时间）
//     · K 线      push2his.eastmoney.com/api/qt/stock/kline/get（日/周/月/年）
//     · 分时      push2his.eastmoney.com/api/qt/stock/trends2/get
//     · 资金流    push2his.eastmoney.com/api/qt/stock/fflow/kline/get
//   统一口径、不依赖多家接口，避免「到处取数」带来的不一致与维护成本。
//
// 请求通道（浏览器端，按优先级）：
//   · 首选 JSONP 直连东方财富：跨域 <script> 不受 CORS 限制，纯静态托管也能用，
//     无需任何代理，因此公网静态部署也能稳定取数（这是之前「行情获取失败」的根治）；
//   · 同源代理路径 /rt /em：Vite 代理 或 自带 Node 代理服务承接（本地 / 自有服务器）；
//   · VITE_API_PROXY 指向的代理承接；
//   · 若均失败，回退公共 CORS 代理（codetabs / allorigins）兜底（数据仍来自东方财富）；
//   · 每个请求带 8s 超时，避免「搜索中」卡死。
//
// 编码：东方财富返回 UTF-8，ArrayBuffer + TextDecoder 解码。
// 价格缩放：实时行情按精度缩放，A 股/指数 ×100、港股 ×1000（见 emPriceScale）。
// =====================================================================
import config from "@/config/app";
import type { Kline, Trend, PeriodKey } from "@/utils/period";
import { dateStr, parseTrend } from "@/utils/period";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const isH5 = () => typeof window !== "undefined" && typeof document !== "undefined";

// 上游 host -> 同源代理前缀
const HOST_PREFIX: Record<string, string> = {
  "https://push2.eastmoney.com": "/rt",
  "https://push2his.eastmoney.com": "/em",
  "https://searchapi.eastmoney.com": "/search",
};

function localPath(full: string): string {
  for (const h of Object.keys(HOST_PREFIX)) {
    if (full.startsWith(h)) return HOST_PREFIX[h] + full.slice(h.length);
  }
  return full;
}

// 公共 CORS 代理兜底：东方财富接口本身无 CORS，纯静态托管（无同源代理）时，
// 浏览器无法直接跨域访问，需借公共代理转发。只保留 codetabs / allorigins 两个
// 稳定源，且前面已有 8s 超时兜底，不会因此把请求挂死。
function publicProxyUrls(full: string): string[] {
  const q = encodeURIComponent(full);
  return [
    "https://api.codetabs.com/v1/proxy/?quest=" + q,
    "https://api.allorigins.win/raw?url=" + q,
  ];
}

// 同源静态托管（如 CloudStudio 纯静态）会把 /rt /em 等未知路径回退成 index.html，
// 识别到一次 HTML 响应后即标记同源不可用，后续请求直接跳过，省一次无谓往返。
let sameOriginDead = false;

// 取候选请求地址：同源优先，API_PROXY 次之，公共代理兜底（仅前端可用）
function candidates(full: string): string[] {
  const list: string[] = [];
  // 同源：Vite dev 代理 / 自带 Node 代理。静态托管回退 HTML 后会自动跳过。
  if (isH5() && !sameOriginDead) list.push(localPath(full));
  if (config.API_PROXY) list.push(config.API_PROXY.replace(/\/$/, "") + localPath(full));
  if (isH5()) list.push(...publicProxyUrls(full)); // 公共 CORS 代理（仅浏览器）
  else if (!config.API_PROXY) list.push(...publicProxyUrls(full));
  return list;
}

// 客户端请求硬超时：单个取数请求超过该时长即中断，避免「分析中」卡死。
const FETCH_TIMEOUT = 8000;

async function rawBytes(url: string): Promise<ArrayBuffer> {
  if (isH5()) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.arrayBuffer();
    } finally {
      clearTimeout(timer);
    }
  }
  // 微信小程序：uni.request 支持 arraybuffer + timeout
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    uni.request({
      url,
      method: "GET",
      responseType: "arraybuffer",
      header: { "User-Agent": UA },
      timeout: FETCH_TIMEOUT,
      success: (res: any) => {
        if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode));
        resolve(res.data as ArrayBuffer);
      },
      fail: (err: any) => reject(err),
    });
  });
}

// 判断上游返回的字节是否为 HTML/XML（而非 JSON）。
// 静态托管会把未知路径回退成 <!DOCTYPE html>，公共 CORS 代理偶发返回 HTML 错误页，
// 这些都不能 JSON.parse，必须先识别并跳过，否则会抛 "Unexpected token '<'"。
function looksLikeHtml(text: string): boolean {
  const t = (text || "").replace(/^﻿/, "").trimStart();
  return (
    t.startsWith("<!DOCTYPE") ||
    t.startsWith("<html") ||
    t.startsWith("<?xml") ||
    (t.startsWith("<") && /^[a-zA-Z/!]/.test(t.slice(1, 2) || ""))
  );
}

// 浏览器 JSONP 直连东方财富：跨域 <script> 不受 CORS 限制，纯静态托管也能用，
// 不依赖任何代理。东财行情接口支持 cb 回调参数（返回 cbName({...})）。
function jsonpText(full: string, timeoutMs = FETCH_TIMEOUT): Promise<string> {
  if (!isH5()) return Promise.reject(new Error("非浏览器环境"));
  return new Promise((resolve, reject) => {
    const cb = "__emjp_" + Math.random().toString(36).slice(2, 10);
    const sep = full.includes("?") ? "&" : "?";
    const url = full + sep + "cb=" + cb + "&_=" + Date.now();
    let done = false;
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("JSONP 超时"));
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      try {
        delete (window as any)[cb];
      } catch {
        /* noop */
      }
      if (script.parentNode) script.parentNode.removeChild(script);
    }
    (window as any)[cb] = (data: any) => {
      if (done) return;
      done = true;
      cleanup();
      // 东财回填的是 JS 对象，直接 JSON.stringify 避免「;cb({...})」前导字符干扰解析
      resolve(JSON.stringify(data ?? null));
    };
    script.src = url;
    script.async = true;
    script.onerror = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("JSONP 加载失败"));
    };
    document.head.appendChild(script);
  });
}

// 拉取上游文本，自动回退多个通道：
//   1) H5 浏览器：优先 JSONP 直连东财（无需代理 / CORS，静态托管可用）；
//   2) 同源 /rt /em（Vite 代理 或 自带 Node 代理）；
//   3) VITE_API_PROXY 指向的代理；
//   4) 公共 CORS 代理（codetabs / allorigins）兜底；
// 全部失败才抛友好错误，绝不直接把 HTML 交给 JSON.parse 导致崩溃。
async function requestText(full: string): Promise<string> {
  let lastErr: any;

  // H5 浏览器：优先「直连 fetch」（若东财带 CORS 头则零代理成功），
  // 失败则回退 JSONP 直连（跨域 <script> 不受 CORS 限制，任何静态托管都能用）
  if (isH5()) {
    // 1a) 直连 fetch 到东财官方域名
    try {
      const buf = await rawBytes(full);
      if (buf && buf.byteLength) {
        const t = decode(buf);
        if (!looksLikeHtml(t)) return t; // 拿到 JSON，直接返回
        lastErr = new Error("非 JSON 响应");
      } else {
        lastErr = new Error("空响应");
      }
    } catch (e) {
      lastErr = e;
    }
    // 1b) JSONP 直连（兜底，东财支持 cb 回调参数）
    try {
      return await jsonpText(full);
    } catch (e) {
      lastErr = e;
    }
  }

  // 2) 候选地址（同源 / API_PROXY / 公共 CORS 代理）
  const urls = candidates(full);
  for (let i = 0; i < urls.length; i++) {
    try {
      const buf = await rawBytes(urls[i]);
      if (!buf || !buf.byteLength) {
        lastErr = new Error("空响应");
        continue;
      }
      const text = decode(buf);
      if (looksLikeHtml(text)) {
        // 同源静态托管把 /rt 回退成 index.html：标记死，之后跳过；继续尝试公共代理
        if (i === 0) sameOriginDead = true;
        lastErr = new Error("非 JSON 响应");
        continue;
      }
      return text;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("行情数据获取失败，请稍后重试");
}

function decode(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8").decode(buf);
  } catch {
    return "";
  }
}

// 本地内置常用股票池：网络不可用 / 搜索接口失败时，输入仍能即时给出联想列表。
// 仅作「输入提示」，市场由 resolveSecid 按代码规则自动识别，不在此处硬编码。
const LOCAL_STOCKS: SearchHit[] = [
  { code: "600519", name: "贵州茅台" },
  { code: "601318", name: "中国平安" },
  { code: "600036", name: "招商银行" },
  { code: "000001", name: "平安银行" },
  { code: "000858", name: "五粮液" },
  { code: "600276", name: "恒瑞医药" },
  { code: "601899", name: "紫金矿业" },
  { code: "600900", name: "长江电力" },
  { code: "601166", name: "兴业银行" },
  { code: "000333", name: "美的集团" },
  { code: "000651", name: "格力电器" },
  { code: "002594", name: "比亚迪" },
  { code: "300750", name: "宁德时代" },
  { code: "600030", name: "中信证券" },
  { code: "601398", name: "工商银行" },
  { code: "601857", name: "中国石油" },
  { code: "600887", name: "伊利股份" },
  { code: "603288", name: "海天味业" },
  { code: "601012", name: "隆基绿能" },
  { code: "000725", name: "京东方A" },
  { code: "002415", name: "海康威视" },
  { code: "600009", name: "上海机场" },
  { code: "601888", name: "中国中免" },
  { code: "600585", name: "海螺水泥" },
  { code: "000002", name: "万科A" },
  { code: "300059", name: "东方财富" },
  { code: "00700", name: "腾讯控股" },
  { code: "09988", name: "阿里巴巴" },
  { code: "03690", name: "美团" },
  { code: "01810", name: "小米集团" },
  { code: "01299", name: "友邦保险" },
  { code: "00939", name: "建设银行" },
  { code: "00388", name: "香港交易所" },
  { code: "02318", name: "中国平安" },
  { code: "09618", name: "京东" },
  { code: "000300", name: "沪深300" },
  { code: "510300", name: "沪深300ETF" },
];

// 本地联想：按代码或名称包含关键字过滤（不区分大小写）
export function localSuggest(keyword: string): SearchHit[] {
  const kw = (keyword || "").trim().toLowerCase();
  if (!kw) return [];
  return LOCAL_STOCKS.filter(
    (h) => h.code.toLowerCase().includes(kw) || h.name.toLowerCase().includes(kw)
  );
}

// 东方财富搜索（代码 / 名称 -> 候选）。网络不可用时返回 []，由上层回退到规则识别。
export interface SearchHit {
  code: string;
  name: string;
}

export async function searchStocks(keyword: string): Promise<SearchHit[]> {
  const kw = (keyword || "").trim();
  if (!kw) return [];
  const url =
    "https://searchapi.eastmoney.com/api/suggest/get" +
    "?input=" +
    encodeURIComponent(kw) +
    "&type=14&token=D43BF7224E8C6FA3AFPAY9&count=8";
  try {
    const text = await requestText(url);
    const json = JSON.parse(text);
    const rows: any[] = json?.QuotationCodeTable?.Data || [];
    return rows
      .map((r) => ({ code: String(r.Code || ""), name: String(r.Name || "") }))
      .filter((h) => h.code);
  } catch {
    return [];
  }
}

// 公共：解析「官方接口」统一出口
export interface QuoteResult {
  klines: Kline[];
  name: string;
  code: string;
  flowMap: Record<string, number>; // 日期 -> 主力净流入(元)
  preClose: number;
  trends: Trend[]; // 分时（仅 m 周期有值）
  realtime: {
    price: number;
    preClose: number;
    open: number;
    high: number;
    low: number;
    time: string;
  } | null;
}

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

// ---------------- 东方财富 实时行情 ----------------
async function fetchRealtime(secid: string) {
  const url =
    "https://push2.eastmoney.com/api/qt/stock/get" +
    "?secid=" +
    secid +
    "&fields=f43,f44,f45,f46,f47,f48,f57,f58,f59,f60,f86";
  const text = await requestText(url);
  const data = JSON.parse(text)?.data;
  if (!data) throw new Error("实时行情解析失败");
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
    vol: num("f47"), // 成交量（手）
    amount: num("f48"), // 成交额（元）
    time: fmtEMTime(num("f86")),
  };
}

// 实时快照（轻量，用于自选股列表：涨跌幅 / 涨跌额 / 成交量 / 成交额）
export interface SnapResult {
  name: string;
  code: string;
  price: number;
  preClose: number;
  open: number;
  high: number;
  low: number;
  vol: number;
  amount: number;
  time: string;
  chg: number;
  pct: number;
}

export async function fetchSnapshot(secid: string): Promise<SnapResult> {
  const rt = await fetchRealtime(secid);
  const chg = rt.price - rt.preClose;
  const pct = rt.preClose ? (chg / rt.preClose) * 100 : 0;
  return { ...rt, chg, pct };
}

// ---------------- 东方财富 K 线（日/周/月/年） ----------------
const EM_KLT: Record<string, number> = { d: 101, w: 102, M: 103, y: 106 };
const EM_BEG: Record<string, number> = { d: -730, w: -2200, M: -3650, y: -7300 };

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

async function fetchEMKline(secid: string, period: PeriodKey): Promise<Kline[]> {
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
  const text = await requestText(url);
  const data = JSON.parse(text)?.data;
  if (!data || !data.klines || !data.klines.length) throw new Error("未获取到 K 线数据");
  return data.klines.map(parseEMKline);
}

// ---------------- 东方财富 分时 / 资金流 ----------------
async function fetchTrendRaw(secid: string) {
  const url =
    "https://push2his.eastmoney.com/api/qt/stock/trends2/get" +
    "?secid=" +
    secid +
    "&fields1=f1,f2,f3,f4,f5,f6,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0";
  const text = await requestText(url);
  const data = JSON.parse(text)?.data;
  if (!data || !data.trends) throw new Error("未获取到分时数据");
  // 复用时序解析器 parseTrend（已正确映射 f52开/f53最新价/f54高/f55低/f56量/f57额/f58均价），
  // 避免手写下标错位（曾误将 price 取成开盘、avg 取成最新价，导致均价线与股价线重合）。
  const trends: Trend[] = data.trends.map((s: string) => parseTrend(s));
  return { trends, preClose: data.preClose ?? (trends.length ? trends[0].price : 0) };
}

async function fetchFlow(secid: string): Promise<Record<string, number>> {
  const url =
    "https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get" +
    "?lmt=120&klt=101&secid=" +
    secid +
    "&fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61";
  const text = await requestText(url);
  const data = JSON.parse(text)?.data;
  const map: Record<string, number> = {};
  if (data && data.klines) {
    data.klines.forEach((s: string) => {
      const a = s.split(",");
      map[a[0]] = parseFloat(a[1]) || 0; // f52 主力净流入(元)
    });
  }
  return map;
}

// ---------------- 统一出口 ----------------
export async function fetchQuote(
  secid: string,
  period: PeriodKey
): Promise<QuoteResult> {
  // 实时行情（东方财富）
  const rt = await fetchRealtime(secid);

  let klines: Kline[] = [];
  let trends: Trend[] = [];
  let flowMap: Record<string, number> = {};

  if (period === "m") {
    // 分时视图：用日 K 做分析，分时序列单独取（失败不影响整体分析）
    klines = await fetchEMKline(secid, "d");
    try {
      const t = await fetchTrendRaw(secid);
      trends = t.trends;
    } catch {
      trends = [];
    }
  } else {
    klines = await fetchEMKline(secid, period);
    try {
      flowMap = await fetchFlow(secid);
    } catch {
      flowMap = {};
    }
  }

  return {
    klines,
    name: rt.name,
    code: secid,
    flowMap,
    preClose: rt.preClose || (klines.length ? klines[klines.length - 1].close : 0),
    trends,
    realtime: {
      price: rt.price,
      preClose: rt.preClose,
      open: rt.open,
      high: rt.high,
      low: rt.low,
      time: rt.time,
    },
  };
}

export async function fetchTrend(
  secid: string
): Promise<{ trends: Trend[]; preClose: number }> {
  return await fetchTrendRaw(secid);
}
