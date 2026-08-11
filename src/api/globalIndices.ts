// 全球重要市场指数目录 + 批量实时报价。
//
// 取数统一走 Eastmoney ulist 网关（fltt=2 返回真实价格，单次请求覆盖全部标的，
// 零后端改动、前端并发降为 0）。详见 src/api/sources/index.ts 的 getUlistQuotes。
//
// 数据可用性（实测）：A股主要指数、恒生/韩国/日经、美股三大、欧洲四大、富时中国A50
// 均返回真实点位；沪铜/原油/黄金等期货主力合约 Eastmoney 透传网关不提供，取不到时
// 地图中对应项为 null，由上层统一降级为「暂无数据」。
import { getUlistQuotes, type UlistQuote } from "@/api/sources";

export interface GlobalIndexItem {
  secid: string;
  name: string;
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

// 全球重要市场指数目录（按地区/品种分组）。
export const GLOBAL_INDEX_GROUPS: GlobalIndexGroup[] = [
  {
    title: "A股指数",
    items: [
      { secid: "1.000001", name: "上证指数" },
      { secid: "0.399001", name: "深证成指" },
      { secid: "0.399006", name: "创业板指" },
      { secid: "1.000688", name: "科创50" },
      { secid: "1.000300", name: "沪深300" },
      { secid: "1.000905", name: "中证500" },
      { secid: "1.000852", name: "中证1000" },
      { secid: "1.000016", name: "上证50" },
    ],
  },
  {
    title: "亚太市场",
    items: [
      { secid: "100.HSI", name: "恒生指数" },
      { secid: "100.KS11", name: "韩国KOSPI" },
      { secid: "100.N225", name: "日经225" },
    ],
  },
  {
    title: "美股市场",
    items: [
      { secid: "100.DJIA", name: "道琼斯" },
      { secid: "100.NDX", name: "纳斯达克" },
      { secid: "100.SPX", name: "标普500" },
    ],
  },
  {
    title: "欧洲市场",
    items: [
      { secid: "100.FTSE", name: "英国富时100" },
      { secid: "100.GDAXI", name: "德国DAX" },
      { secid: "100.FCHI", name: "法国CAC40" },
      { secid: "100.SX5E", name: "欧洲斯托克50" },
    ],
  },
  {
    title: "商品期货",
    items: [
      { secid: "100.XIN9", name: "富时中国A50" },
      { secid: "114.CU0", name: "沪铜主力" },
      { secid: "114.SC0", name: "原油主力" },
      { secid: "114.AU0", name: "黄金主力" },
    ],
  },
];

// 全部待取 secid（去重），供批量请求一次拿全。
const ALL_SECIDS: string[] = Array.from(
  new Set(GLOBAL_INDEX_GROUPS.flatMap((g) => g.items.map((i) => i.secid)))
);

// 批量拉取全球重要指数实时报价（单次 ulist 网关请求）。
// 返回以 secid 为键的报价表：目录中所有标的都先填入「暂无」骨架，再覆盖真实数据；
// 取不到的标的（如部分期货主力合约）保持 null，由上层降级为「暂无数据」。
export async function fetchGlobalIndices(): Promise<Map<string, GlobalIndexQuote>> {
  const map = new Map<string, GlobalIndexQuote>();
  for (const g of GLOBAL_INDEX_GROUPS) {
    for (const it of g.items) {
      map.set(it.secid, { secid: it.secid, name: it.name, price: null, pct: null, chg: null });
    }
  }
  let quotes: UlistQuote[] = [];
  try {
    quotes = await getUlistQuotes(ALL_SECIDS);
  } catch {
    quotes = [];
  }
  for (const q of quotes) {
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
