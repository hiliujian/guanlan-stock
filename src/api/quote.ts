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
import { codeFromSecid } from "@/utils/period";
import type { Kline, Trend, PeriodKey } from "@/utils/period";
import type { RawRealtime, SearchHit, FlowMap } from "@/api/sources/types";
import { getRealtime, getKline, getTrend, getFlow, getSearch, getNews, getIndexBreadth, getStockIndustry, getIndustryBoards, fetchTurnoverAnchor, type IndustryBoard } from "@/api/sources";
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

// 本地内置常用股票池：仅用于「搜索联想」兜底（网络不可用 / 搜索接口失败时即时给出候选），
// 不参与任何榜单统计——人气榜 / 今日热榜均来自后端 get_stock_heat 真实聚合。
export const LOCAL_STOCKS: SearchHit[] = [
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

// 根据股票代码自动匹配对应大盘指数（行业/板块指数暂不细分，按市场主指数兜底）
//   688xxx/300xxx/301xxx → 创业板指(399006)（科创板与创业板共用创业板指，沿用现有口径）
//   沪A(6xxxxx)           → 上证指数(000001)
//   深A(0xxxxx 非创业板)  → 深证成指(399001)
//   北A(4/8/9xxxxx)       → 北证50(899050)
//   港股/兜底             → 沪深300(000300)
// 复用入口：行情页底部默认指数卡片据此展示「默认指数」，避免重复判定逻辑。
export function resolveIndexForStock(code: string): { secid: string; name: string } | null {
  const c = (code || "").trim();
  if (/^\d{5}$/.test(c)) return null; // 港股：主指数代码不匹配 getKline 口径，跳过避免报错
  if (/^(688|300|301)/.test(c)) return { secid: "0.399006", name: "创业板指" };
  if (/^6/.test(c)) return { secid: "1.000001", name: "上证指数" };
  if (/^0/.test(c)) return { secid: "0.399001", name: "深证成指" };
  if (/^[489]/.test(c)) return { secid: "0.899050", name: "北证50" };
  return { secid: "1.000300", name: "沪深300" }; // 兜底
}

// 把个股行业名（东财 f100，如「半导体及元件」）映射到行业板块指数。
// 东财行业板块名与 f100 不一定逐字相等（如 f100「半导体」对应板块「半导体及元件」），
// 故采用三级匹配：精确 → 板块名包含行业名 → 行业名包含板块名，命中即取首个。
function matchIndustryBoard(boards: IndustryBoard[], industry: string): IndustryBoard | null {
  if (!industry || !boards.length) return null;
  const ind = industry.trim();
  const exact = boards.find((b) => b.name === ind);
  if (exact) return exact;
  const a = boards.find((b) => b.name.includes(ind) && ind.length >= 2);
  if (a) return a;
  const b = boards.find((x) => ind.includes(x.name) && x.name.length >= 2);
  if (b) return b;
  return null;
}

// 批量预取结果：一次联网拿到全部 K线周期 + 分时 + 资金流 + 对应大盘指数K线，供「切换周期不重新联网」缓存用。
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
  // 对应大盘指数上下文：已按市场自动匹配，直接传给 analyze 的 market 参数即可生效 beta 感知
  marketCtx: {
    indexKlines: Kline[];
    indexName: string;
    // 大盘指数当日实时快照：区分「中期趋势（indexKlines 派生）」与「今日实际涨跌」，
    // 让大盘环境面板实时反映今天指数方向（如创业板指今日 +2%）。
    indexRealtime?: { price: number; preClose: number } | null;
    upCount?: number; // 大盘(匹配指数)当日上涨家数（市场宽度 / 市场情绪）
    downCount?: number; // 当日下跌家数
    // 个股所属行业板块上下文：让「大盘·市场环境」不止看宽基指数，还看行业 beta。
    // 任一环节失败均为 null，analyze 自动降级，行业维度缺省不影响其它评分。
    sector?: {
      name: string; // 行业名，如「半导体及元件」
      secid: string; // 行业板块指数 secid，如 90.BK1036
      klines: Kline[]; // 行业指数日 K（>=30 根才参与）
      realtime?: { price: number; preClose: number } | null; // 行业指数当日实时快照（结合今日实时合成板块唯一走势结论）
    } | null;
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

// 换手率补齐：东财 K 线自带 f61 换手率，无需处理；当东财不可达、日 K 降级到腾讯/新浪
// （turnover 恒为 0）时，用「实时换手率 + 当日成交量」反推流通股本（手），再按每日成交量
// 换算各日换手率，保证「近 N 日平均换手率」可正常展示，不再恒为「暂无数据」。
// 兜底仅发生在东财不可用且竞速实时源也不含换手率的场景，正常环境走真实换手率，零影响。
async function ensureDailyTurnover(
  daily: Kline[],
  rt: RawRealtime | null,
  secid: string
): Promise<Kline[]> {
  if (!daily || daily.length < 20) return daily;
  if (daily.some((k) => (k.turnover || 0) > 0)) return daily;
  let turnover = rt?.turnover || 0;
  let vol = rt?.vol || 0;
  if (!(turnover > 0) || !(vol > 0)) {
    // 竞速胜出的实时源不含换手率（如新浪）→ 单独向腾讯取一次做锚定
    const anchor = await fetchTurnoverAnchor(secid);
    if (anchor) {
      turnover = anchor.turnover || 0;
      vol = anchor.vol || 0;
    }
  }
  if (!(turnover > 0) || !(vol > 0)) return daily;
  const floatHands = (vol * 100) / turnover; // 流通股本（手）= 当日成交量(手) ÷ 当日换手率(%)
  if (!(floatHands > 0)) return daily;
  return daily.map((k) => ({ ...k, turnover: (k.vol * 100) / floatHands }));
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

  // 解析对应大盘指数（按代码自动匹配市场主指数，beta 感知前提）
  const pureCode = codeFromSecid(secid);
  const idx = resolveIndexForStock(pureCode);
  // 指数K线：与股票数据并行拉取，给 3s 硬超时兜底，失败不影响主流程（marketCtx 为 null 时 analyze 自动降级）
  const indexPromise = idx
    ? withTimeout(getKline(idx.secid, "d").catch(() => [] as Kline[]), 3000, [] as Kline[])
    : Promise.resolve([] as Kline[]);
  // 指数当日实时快照（今日涨跌幅）：与 K 线并行，失败/超时不影响大盘面板（显示暂无数据）
  const indexRealtimePromise = idx
    ? withTimeout(
        getRealtime(idx.secid)
          .then((rt) => (rt ? { price: rt.price, preClose: rt.preClose } : null))
          .catch(() => null),
        3000,
        null
      )
    : Promise.resolve(null);
  // 指数市场宽度（涨跌家数，用于市场情绪）：并行拉取，超时/失败返回 null
  const breadthPromise = idx
    ? withTimeout(getIndexBreadth(idx.secid).catch(() => null), 3000, null)
    : Promise.resolve(null);
  // 个股所属行业：并行拉取，超时/失败返回 null
  const industryPromise = withTimeout(getStockIndustry(secid).catch(() => null), 3000, null);
  // 行业板块列表（长期缓存，首拉后复用）：用于把行业名映射到板块指数 secid
  const boardsPromise = withTimeout(getIndustryBoards().catch(() => [] as IndustryBoard[]), 4000, [] as IndustryBoard[]);

  const [rt, d, w, M, trend, flow, idxKlines, idxRealtime, breadth, industry, boards] = await Promise.all([
    getRealtime(secid).catch(() => null),
    getKline(secid, "d").catch(() => [] as Kline[]),
    getKline(secid, "w").catch(() => [] as Kline[]),
    getKline(secid, "M").catch(() => [] as Kline[]),
    getTrend(secid).catch(() => ({ trends: [] as Trend[] })),
    withTimeout(getFlow(secid).catch(() => ({}) as FlowMap), 3500, {} as FlowMap),
    indexPromise,
    indexRealtimePromise,
    breadthPromise,
    industryPromise,
    boardsPromise,
  ]);
  if (!rt) throw new Error("实时行情获取失败，请稍后重试");
  // 东财不可达时日 K 无换手率 → 用实时换手率反推流通股本估算（见 ensureDailyTurnover）
  const daily = await ensureDailyTurnover(d || [], rt, secid);
  const klines: Record<PeriodKey, Kline[]> = {
    d: daily,
    w: w || [],
    M: M || [],
    m: [], // 分时视图复用日 K 做分析，见 MarketView.applyPeriod
  };
  // marketCtx：仅当成功拉到 >=30 根指数K线时才传入（analyzer 内部已有长度兜底，这里提前过滤掉明显空值）
  let marketCtx: QuoteBundle["marketCtx"] = null;
  if (idx && idxKlines && idxKlines.length >= 30) {
    marketCtx = {
      indexKlines: idxKlines,
      indexName: idx.name,
      indexRealtime: idxRealtime,
      upCount: breadth?.up,
      downCount: breadth?.down,
    };
    // 行业板块上下文：把行业名映射到板块指数 secid 并拉取其日 K（>=30 根才纳入）。
    // 任一环节失败/不匹配 → sector 为 null，analyze 自动降级，不影响宽基指数维度的评分。
    if (industry && boards.length) {
      const board = matchIndustryBoard(boards, industry);
      if (board) {
        const sk = await withTimeout(
          getKline(board.secid, "d").catch(() => [] as Kline[]),
          3000,
          [] as Kline[]
        );
        if (sk.length >= 30) {
          // 行业指数今日实时快照（与宽基指数同口径）：让板块也能结合「当日实时」合成唯一走势结论；
          // 取数失败/超时降级为 null，analyzer 自动回退到仅用中期趋势，不影响其它维度。
          const sRealtime = await withTimeout(
            getRealtime(board.secid)
              .then((rt) => (rt ? { price: rt.price, preClose: rt.preClose } : null))
              .catch(() => null),
            3000,
            null
          );
          marketCtx.sector = { name: industry, secid: board.secid, klines: sk, realtime: sRealtime };
        }
      }
    }
  }
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
    marketCtx,
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
