// =====================================================================
// 行情数据层（对外统一门面）
//
// 本文件只负责「对外 API 契约」，真正的取数逻辑已下沉到：
//   · src/api/sources/*  —— 多数据源（东财 / 腾讯 / 新浪）自动降级
//   · src/api/transport  —— 多传输通道（同源 / 直连 / JSONP / 代理）降级
//
// 这样「数据源」与「传输通道」彻底解耦：单家数据源挂掉会自动换一家；
// 某家数据源的默认通道不通也会自动换通道，保证程序稳定运行。
//
// 对外公开函数：
//   fetchSnapshot / fetchBundle / searchStocks / localSuggest
// =====================================================================
import type { Kline, Trend, PeriodKey } from "@/utils/period";
import type { RawRealtime, SearchHit, FlowMap } from "@/api/sources/types";
import { getRealtime, getKline, getTrend, getFlow, getSearch, getNews } from "@/api/sources";
import { withTimeout } from "@/api/transport";
import type { NewsItem } from "@/utils/newsSentiment";

export type { SearchHit } from "@/api/sources/types";
export type { NewsItem } from "@/utils/newsSentiment";

// ---------------- 内存缓存（按 key + TTL） ----------------
// 解决「每次分析都重新联网」的性能浪费：同一标的在短时间内（实时 20s、K线/资讯 数分钟）
// 直接命中缓存，切换周期 / 切换股票往返 / 自动刷新都不会重复打上游接口。
interface CacheEntry<T> {
  ts: number;
  data: T;
}
const _cache = new Map<string, CacheEntry<any>>();
function cget<T>(key: string, ttl: number): T | null {
  const e = _cache.get(key);
  if (e && Date.now() - e.ts < ttl) return e.data as T;
  return null;
}
function cset<T>(key: string, data: T): void {
  _cache.set(key, { ts: Date.now(), data });
}

// 本地内置常用股票池：网络不可用 / 搜索接口失败时，输入仍能即时给出联想列表。
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

// 搜索（东财 → 腾讯 → 新浪 自动降级；失败返回 []，由上层回退到本地联想）
export async function searchStocks(keyword: string): Promise<SearchHit[]> {
  const kw = (keyword || "").trim();
  if (!kw) return [];
  try {
    const hits = await getSearch(kw);
    return hits || [];
  } catch {
    return [];
  }
}

// 批量预取结果：一次联网拿到全部 K线周期 + 分时 + 资金流，供「切换周期不重新联网」缓存用。
export interface QuoteBundle {
  klines: Record<PeriodKey, Kline[]>; // d/w/M/y 四周期；m 为空（分时视图复用 d 做分析）
  trends: Trend[]; // 分时（m 周期用）
  flowMap: FlowMap; // 资金流（按日期累计，与图表周期解耦，全周期展示）
  name: string;
  preClose: number;
  realtime: {
    price: number;
    preClose: number;
    open: number;
    high: number;
    low: number;
    time: string;
  } | null;
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
  const ck = "snap:" + secid;
  const hit = cget<SnapResult>(ck, 20_000); // 实时价 20s 内复用，避免列表页反复打接口
  if (hit) return hit;
  const rt: RawRealtime = await getRealtime(secid);
  const chg = rt.price - rt.preClose;
  const pct = rt.preClose ? (chg / rt.preClose) * 100 : 0;
  const snap: SnapResult = { ...rt, chg, pct };
  cset(ck, snap);
  return snap;
}

// 批量预取：并行拿到实时 + 四个 K线周期 + 分时 + 资金流，单次联网即可支撑
// 所有周期的瞬间切换（缓存于 MarketView）。任一家源失败由 sources 层自动降级。
//
// 性能要点（解决「分析时间过长」）：
//   1) 实时行情纳入 Promise.all 与 K线/分时/资金流「全并行」，不再先 await 实时再开并行；
//   2) 资金流仅东财一家、最坏 40s 且无兜底，会拖挂整条 Promise.all —— 用 withTimeout
//      给它 3.5s 硬上限（非关键路径，超时即返回空，绝不阻塞主行情）；
//   3) 整包按 secid 缓存 30s：切换股票往返、自动刷新、周期切换均不再重复联网。
export async function fetchBundle(secid: string): Promise<QuoteBundle> {
  const ck = "bundle:" + secid;
  const hit = cget<QuoteBundle>(ck, 30_000);
  if (hit) return hit;

  const [rt, d, w, M, y, trend, flow] = await Promise.all([
    getRealtime(secid).catch(() => null),
    getKline(secid, "d").catch(() => [] as Kline[]),
    getKline(secid, "w").catch(() => [] as Kline[]),
    getKline(secid, "M").catch(() => [] as Kline[]),
    getKline(secid, "y").catch(() => [] as Kline[]),
    getTrend(secid).catch(() => ({ trends: [] as Trend[] })),
    withTimeout(getFlow(secid).catch(() => ({}) as FlowMap), 3500, {} as FlowMap),
  ]);
  if (!rt) throw new Error("实时行情获取失败，请稍后重试");

  const klines: Record<PeriodKey, Kline[]> = {
    d: d || [],
    w: w || [],
    M: M || [],
    y: y || [],
    m: [], // 分时视图复用日 K 做分析，见 MarketView.applyPeriod
  };
  const bundle: QuoteBundle = {
    klines,
    trends: trend.trends || [],
    flowMap: flow || {},
    name: rt.name || secid,
    preClose: rt.preClose || (klines.d.length ? klines.d[klines.d.length - 1].close : 0),
    realtime: {
      price: rt.price,
      preClose: rt.preClose,
      open: rt.open,
      high: rt.high,
      low: rt.low,
      time: rt.time,
    },
  };
  cset(ck, bundle);
  return bundle;
}

// 关联资讯：按 secid + 公司名 缓存 10 分钟（资讯时效性弱于行情，长缓存既省流量又避免刷新抖动）。
// 公司名纳入缓存键：首屏 name 可能为空、行情包返回后才拿到确切公司名，避免空名结果被缓存后污染。
export async function fetchNews(secid: string, name?: string): Promise<NewsItem[]> {
  const ck = "news:" + secid + ":" + (name || "");
  const hit = cget<NewsItem[]>(ck, 10 * 60_000);
  if (hit) return hit;
  const items = await getNews(secid, name).catch(() => [] as NewsItem[]);
  cset(ck, items);
  return items;
}
