// =====================================================================
// 解析器：新浪财经（作为第三兜底源，覆盖实时 / K 线(仅日K) / 分时 / 搜索 / 资金流）
//   实时行情  hq.sinajs.cn/list=sh600519        （返回 hq_str_sh600519="..." 全局变量，GBK）
//   K 线(日)  money.finance.sina.com.cn/.../CN_MarketData.getKLineData?scale=240（UTF-8 JSON）
//   分时      money.finance.sina.com.cn/.../CN_MarketData.getKLineData?scale=1（1 分钟近似）
//   搜索      suggest3.sinajs.cn/suggest/       （返回 var suggestvalue="..." 全局变量，GBK）
//   资金流    vip.stock.finance.sina.com.cn/.../MoneyFlow.ssl_qsfx_zjlrqs（GBK JSON）
//
// 本文件只负责「解析」，URL 构建与多源冗余全部由后端网关完成。
// =====================================================================
import type { Kline, Trend } from "@/utils/period";
import type { RawRealtime, SearchHit } from "./types";
import { unwrapGlobalVar } from "./tencent";

// 新浪 hq_str_sh600519="名称,今开,昨收,当前价,最高,最低,...,成交量(股),成交额(元),...,日期,时间"
export function parseSinaRealtime(text: string, sym: string): RawRealtime | null {
  const a = unwrapGlobalVar(text).split(",");
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

// 新浪期货（商品）：var hq_str_<sym>="..." 全局变量，GBK（网关已解码为 UTF-8）。
// 字段布局（已按线上真实报文实测校准，并用「内外盘同品种涨跌方向/幅度一致」交叉验证）：
//   nf_（国内，如 nf_AU0）：
//     [0]名称 [1]时间 [2]今开 [3]最高 [4]最低 [5]昨收盘 [6]买价 [7]卖价 [8]最新价
//     [9]今结算 [10]昨结算 [11]买量 [12]卖量 [13]持仓量 [14]成交量 [15]交易所 [16]品种 [17]日期
//     ⚠️ [5]昨收盘 与 [9]今结算 在夜盘时段恒为 0.000——误取 [5] 当最新价会让价格显示 0.00。
//        最新价必须取 [8]（可用 买[6] < 最新[8] < 卖[7] 关系自证）。
//   hf_（国际，如 hf_GC）：
//     [0]最新价 [1]空 [2]买价 [3]卖价 [4]最高 [5]最低 [6]时间 [7]昨结算 [8]今开 …
//     ⚠️ 误取 [3] 当最新价、[2] 当基准价（买卖价相邻）会让涨跌幅恒≈0。
// 统一输出 最新价 + 涨跌基准价 base：优先昨结算（期货主流口径，与文华/同花顺期货一致），
// 昨结算缺失（如新合约首日）才回退今开。
export function parseSinaFutures(
  text: string
): Record<string, { price: number; base: number } | null> {
  const out: Record<string, { price: number; base: number } | null> = {};
  const re = /var hq_str_([A-Za-z0-9_]+)="([^"]*)";/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const sym = m[1];
    const csv = m[2];
    if (!csv) {
      out[sym] = null;
      continue;
    }
    const a = csv.split(",");
    // 期货报价字段常以 0.000 表示「该时段无值」（夜盘的昨收/今结算），故 0 一律视为无效
    const n = (i: number) => {
      const v = parseFloat(a[i]);
      return Number.isFinite(v) && v > 0 ? v : null;
    };
    const intl = sym.startsWith("hf");
    const price = intl ? n(0) ?? n(2) : n(8);
    const base = intl ? n(7) ?? n(8) : n(10) ?? n(2);
    out[sym] = price != null && base != null ? { price, base } : null;
  }
  return out;
}

// 新浪 K 线（日）原始文本 → Kline[]
export function parseSinaKline(text: string): Kline[] | null {
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
}

// 新浪分时（scale=1 近似）原始文本 → { trends, preClose }
export function parseSinaTrend(text: string): { trends: Trend[]; preClose: number } | null {
  const arr = JSON.parse(text);
  if (!Array.isArray(arr) || !arr.length) return null;
  const trends: Trend[] = arr
    .map((r: any) => {
      const price = +r.close;
      if (!isFinite(price) || price <= 0) return null;
      const avg = (+r.open + +r.close + +r.high + +r.low) / 4;
      const vol = +r.volume;
      return {
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
  return { trends, preClose: trends[0].price };
}

// 新浪搜索（suggest3）原始文本 → SearchHit[]
// 返回 var suggestvalue="符号,市场,代码,符号,名称,...;...";
export function parseSinaSearch(text: string): SearchHit[] | null {
  const val = unwrapGlobalVar(text);
  if (!val) return null;
  const hits: SearchHit[] = [];
  val
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const parts = entry.split(",");
      if (parts.length < 4) return;
      const code = (parts[2] || "").replace(/[^0-9]/g, "");
      const name = parts[4] || parts[6] || parts[0] || "";
      if (code && name) hits.push({ code, name });
    });
  return hits.length ? hits : null;
}

// 新浪资金流原始文本（GBK JSON 数组）→ {日期: 主力净流入(元)}
export function parseSinaFlow(text: string): Record<string, number> | null {
  const arr = JSON.parse(text);
  if (!Array.isArray(arr)) return null;
  const map: Record<string, number> = {};
  for (const it of arr) {
    const v = parseFloat(it?.r0_net);
    if (it?.opendate && Number.isFinite(v)) map[String(it.opendate)] = v;
  }
  return Object.keys(map).length ? map : null;
}
