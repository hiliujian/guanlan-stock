// 全球重要市场指数目录 + 批量实时报价。
//
// 取数统一走 Eastmoney ulist 网关（fltt=2 返回真实价格，单次请求覆盖全部标的，
// 零后端改动、前端并发降为 0）。详见 src/api/sources/index.ts 的 getUlistQuotes。
//
// 数据可用性（实测）：A股主要指数、恒生/恒生科技/韩国/日经、美股三大、欧洲四大，
// 均经 Eastmoney ulist（实时主机）返回真实点位；商品期货（沪金/沪银/沪铜/原油主连、
// COMEX 金/银/铜、WTI/布伦特原油）Eastmoney 不提供，改走新浪期货接口返回真实价格。
import { getUlistQuotes, getFuturesQuotes, getTencentFallbackQuotes, FUTURES_SECIDS, type UlistQuote } from "@/api/sources";

export interface GlobalIndexItem {
  secid: string;
  name: string;
  /** 国旗 ISO 3166-1 alpha-2 码（用于列表前的小国旗图标）；商品期货等非国家标的留空改用 icon */
  flag?: string;
  /** 非国家标的（商品期货等）改用本地 PNG 图片图标（gold / silver / copper / oil），与 flag 二选一 */
  icon?: string;
}
export interface GlobalIndexGroup {
  title: string; // 分组标题：A股指数 / 亚太市场 / 美股市场 / 欧洲市场 / 商品期货
  items: GlobalIndexItem[];
}
export interface GlobalIndexQuote {
  secid: string;
  name: string;
  price: number | null; // 最新点位
  pct: number | null; // 涨跌幅(%)，带符号
  chg: number | null; // 涨跌额，带符号
}

// 全球重要市场指数目录（按地区/品种分组）。国家/地区标的用 flag（列表前小国旗）；
// 商品期货等非国家标的改用 icon（本地 PNG 图片图标，如 gold / silver / copper / oil），与 flag 二选一。
export const GLOBAL_INDEX_GROUPS: GlobalIndexGroup[] = [
  {
    title: "A股指数",
    items: [
      { secid: "1.000001", name: "上证指数", flag: "cn" },
      { secid: "0.399001", name: "深证成指", flag: "cn" },
      { secid: "0.399006", name: "创业板指", flag: "cn" },
      { secid: "1.000688", name: "科创50", flag: "cn" },
      { secid: "1.000300", name: "沪深300", flag: "cn" },
      { secid: "1.000905", name: "中证500", flag: "cn" },
      { secid: "1.000852", name: "中证1000", flag: "cn" },
      { secid: "1.000016", name: "上证50", flag: "cn" },
    ],
  },
  {
    title: "亚太市场",
    items: [
      { secid: "100.HSI", name: "恒生指数", flag: "hk" },
      { secid: "100.HSTECH", name: "恒生科技指数", flag: "hk" },
      { secid: "100.KS11", name: "韩国KOSPI", flag: "kr" },
      { secid: "100.N225", name: "日经225", flag: "jp" },
    ],
  },
  {
    title: "美股市场",
    items: [
      { secid: "100.DJIA", name: "道琼斯", flag: "us" },
      { secid: "100.NDX", name: "纳斯达克", flag: "us" },
      { secid: "100.SPX", name: "标普500", flag: "us" },
    ],
  },
  {
    title: "欧洲市场",
    items: [
      { secid: "100.FTSE", name: "英国富时100", flag: "gb" },
      { secid: "100.GDAXI", name: "德国DAX", flag: "de" },
      { secid: "100.FCHI", name: "法国CAC40", flag: "fr" },
      { secid: "100.SX5E", name: "欧洲斯托克50", flag: "eu" },
    ],
  },
  {
    title: "商品期货",
    items: [
      { secid: "114.AU0", name: "沪金主连", icon: "gold" },
      { secid: "114.AG0", name: "沪银主连", icon: "silver" },
      { secid: "114.CU0", name: "沪铜主连", icon: "copper" },
      { secid: "114.SC0", name: "原油主连", icon: "oil" },
      { secid: "112.GC00Y", name: "纽约金", icon: "gold" },
      { secid: "112.SI00Y", name: "纽约银", icon: "silver" },
      { secid: "112.HG00Y", name: "美铜", icon: "copper" },
      { secid: "112.CL00Y", name: "美原油", icon: "oil" },
      { secid: "112.BR00Y", name: "布伦特原油", icon: "oil" },
    ],
  },
];

// secid → 国旗 ISO 码（折叠卡匹配指数时快速查国旗，避免逐项遍历）。
// 仅收录带 flag 的国家/地区标的；商品期货等用 icon 的标的跳过（flag 为 undefined）。
export const SECID_FLAG: Record<string, string> = Object.fromEntries(
  GLOBAL_INDEX_GROUPS.flatMap((g) =>
    g.items.filter((i) => i.flag).map((i) => [i.secid, i.flag as string])
  )
);

// 全部待取 secid（去重），供批量请求一次拿全。
const ALL_SECIDS: string[] = Array.from(
  new Set(GLOBAL_INDEX_GROUPS.flatMap((g) => g.items.map((i) => i.secid)))
);

// 批量拉取全球重要指数 + 商品期货实时报价。
// 指数走 Eastmoney ulist（实时主机）；商品期货 Eastmoney 不提供，改走新浪期货接口。
// 两者并行拉取后合并：目录中所有标的先填入「暂无」骨架，再覆盖真实数据；
// 任一源失败仅该部分缺数据，由上层降级为「暂无数据」。
export async function fetchGlobalIndices(): Promise<Map<string, GlobalIndexQuote>> {
  const map = new Map<string, GlobalIndexQuote>();
  for (const g of GLOBAL_INDEX_GROUPS) {
    for (const it of g.items) {
      map.set(it.secid, { secid: it.secid, name: it.name, price: null, pct: null, chg: null });
    }
  }
  const indexSecids = ALL_SECIDS.filter((s) => !FUTURES_SECIDS.includes(s));
  const futuresSecids = ALL_SECIDS.filter((s) => FUTURES_SECIDS.includes(s));
  const [idxQuotes, futQuotes, hkQuotes] = await Promise.all([
    getUlistQuotes(indexSecids).catch(() => [] as UlistQuote[]),
    getFuturesQuotes(futuresSecids).catch(() => [] as UlistQuote[]),
    getTencentFallbackQuotes(ALL_SECIDS).catch(() => [] as UlistQuote[]),
  ]);
  for (const q of [...idxQuotes, ...futQuotes, ...hkQuotes]) {
    if (!q.secid) continue;
    map.set(q.secid, {
      secid: q.secid,
      name: q.name || map.get(q.secid)?.name || q.secid,
      price: q.price,
      pct: q.pct,
      chg: q.chg,
    });
  }
  return map;
}
