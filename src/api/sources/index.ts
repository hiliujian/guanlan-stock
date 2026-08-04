// =====================================================================
// 数据源注册表：按「数据接口」装配多个相互独立的上游源，并交 raceProviders
// 做并发首胜 + 自动降级（熔断阈值 3 次 / 冷却 60s 自愈）。
//
// 每类数据的优先级顺序由系统配置（app_config.sources）驱动：
//   · 实时行情：东财 → 腾讯 → 新浪   · 分时：东财 → 腾讯 → 新浪
//   · K 线    ：东财 → 腾讯 → 新浪(仅日K)
//   · 资金流  ：东财（含换手率口径）→ 代理（新浪逐日主力净流入）
//   · 搜索    ：东财 → 腾讯 → 新浪   · 资讯：东财（结构化资讯独一家）
// 改顺序 / 停用某源 → 直接改数据库 app_config 的 sources 字段，无需发版。
//
// 各数据源内部的取值动作通过 transport 层再做「通道降级」（同源/直连/JSONP/Edge
// Function/代理），两层叠加，确保「单家源挂」或「某通道不通」都不会导致整页取数失败。
// =====================================================================
import type { PeriodKey, Kline } from "@/utils/period";
import type { RawRealtime } from "./types";
import { raceProviders, type Attempt } from "./types";
import { withTimeout } from "@/api/transport";
import { sourceOrder } from "@/store/appConfig";
import type { DataKind, SourceId } from "@/config/app";
import { proxyFlow } from "./proxy";
import {
  emRealtime,
  emKline,
  emTrend,
  emFlow,
  emSearch,
  fetchEMBreadth,
  fetchEMIndustry,
  fetchEMIndustryBoards,
  type IndexBreadth,
  type IndustryBoard,
} from "./eastmoney";
import { txRealtime, txKline, txTrend, txSearch } from "./tencent";
import { sinaRealtime, sinaKline, sinaTrend, sinaSearch } from "./sina";
import { searchByKeyword } from "./news";
import { codeFromSecid } from "@/utils/period";
import type { NewsItem } from "@/utils/newsSentiment";

// ---------------- 数据源注册表 ----------------
// 所有 provider 按「数据接口」分组、以 SourceId 为键注册。每类数据的优先级顺序由系统
// 配置（app_config.sources）的 sourceOrder(kind) 读取；默认东财 → 腾讯 → 新浪三级冗余。
// 新增数据源只需在此注册 + 在 app_config 配置顺序，无需改动取数链路。
// 注：资讯(News)为东财搜索索引的内联实现（getNews / searchByKeyword），不走注册表。
// ProviderLike 刻意宽松（与历史 Attempt<any> 风格一致）：真实返回类型由各 provider
// 各自契约保证，注册表只约束「有 id（熔断标识）+ 有 fetch」的结构。
type ProviderLike = { id: string; fetch(...args: any[]): Promise<any> };
const PROVIDERS: Record<DataKind, Partial<Record<SourceId, ProviderLike>>> = {
  realtime: { eastmoney: emRealtime, tencent: txRealtime, sina: sinaRealtime },
  kline: { eastmoney: emKline, tencent: txKline, sina: sinaKline },
  trend: { eastmoney: emTrend, tencent: txTrend, sina: sinaTrend },
  flow: { eastmoney: emFlow, proxy: proxyFlow },
  search: { eastmoney: emSearch, tencent: txSearch, sina: sinaSearch },
  news: {},
};

// 按系统配置取出某类数据的有序 provider 列表（已过滤未注册/被配置禁用的源）
function orderedProviders(kind: DataKind): ProviderLike[] {
  return sourceOrder(kind)
    .map((id) => PROVIDERS[kind][id])
    .filter((p): p is ProviderLike => !!p);
}

// 将 provider 链包装为 raceProviders 的尝试列表（id 用于熔断计数与日志）
function chainFor(providers: ProviderLike[], run: (p: ProviderLike) => Promise<any>): Attempt<any>[] {
  return providers.map((p) => ({ id: p.id, run: () => run(p) }));
}

// ---------------- K 线 / 实时行情 数据清洗 ----------------
// 上游源偶发会返回「坏棒」：如开/收/高/低错位、或某字段为离群值（例如某根 open 比
// low 还低、high<low 互换）。这类数据会让蜡烛图画出穿帮的怪棒。这里在数据出口统一
// 做一致性修复，保证任意来源进来的 K 线都满足「low ≤ open,close ≤ high」铁律。
//
// 修复策略（单根棒内，无需相邻上下文）：
//   1. 非有限 / 非正值 → 用同棒其余可取值的中值兜底；
//   2. 任一分量相对中值偏离 > 2× 或 < 0.5×（极端离群）→ 视为损坏，对齐到中值；
//      （日线单根 open 与 close 通常仅差几个百分点，2× 阈值对真实缺口足够安全）
//   3. 最终锁定 high = max(o,c,h,l)、low = min(o,c,l)。
// K线清洗原则（重要）：真实有效数据原样透传，绝不改写「有效棒」的任一字段。
// 仅对「源数据损坏 / 字段缺失」做最小处理，且绝不臆造数值：
//   1) 字段缺失 / 非有限 / ≤0 → 用同棒其余有效字段的中位数补齐（只补缺口，不动有效值）；
//   2) 单字段相对中位数偏离 >2× → 整根棒不可信，直接丢弃（不把真实值篡改成中位数）；
//   3) 仅当 OHLC 不自洽（high<low 或 high<open/close、low>open/close，源明显错乱）时，
//      才做最小修正 high=max(o,c,h)、low=min(o,c,l)。
// 这样有效真实数据 100% 保留，预测段与真实段在绘制层严格分离、互不污染。
function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function cleanKline(k: Kline): Kline | null {
  const raw: number[] = [k.open, k.close, k.high, k.low];
  const valid = raw.filter((x) => Number.isFinite(x) && x > 0);
  if (valid.length < 3) return null; // 有效字段不足，无法重建 → 丢弃（不臆造）
  const med = median(valid);
  // 单字段极端离群（>2× 中位数）→ 整根棒损坏，丢弃而非篡改真实值
  for (const v of raw) {
    if (Number.isFinite(v) && v > 0 && (v < med / 2 || v > med * 2)) return null;
  }
  // 仅补齐缺失 / 非有限 / ≤0 的字段（中位数回填），有效值原样保留
  const fill = (v: number) => (Number.isFinite(v) && v > 0 ? v : med);
  const o = fill(k.open), c = fill(k.close), h = fill(k.high), l = fill(k.low);
  // 仅当 OHLC 不自洽（源损坏）时做最小修正，保证 high≥low、high≥o,c、low≤o,c
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
    if (!c || !(c.close > 0)) continue; // 丢弃完全无效 / 损坏的棒
    out.push(c);
  }
  return out;
}

// 实时快照护栏：仅做高低一致性（high ≥ 现价/今开，low ≤ 现价/今开），不改动有效数据。
// 仅在取数成功时调用（入参必为非空实时对象），维持 getRealtime 返回非空契约。
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

export function getRealtime(secid: string) {
  return raceProviders(
    chainFor(orderedProviders("realtime"), (p) => p.fetch(secid)),
    "实时行情"
  ).then((r) => cleanRealtime(r as RawRealtime));
}

// 换手率锚定：实时换手率仅东财(f168) / 腾讯(a[38]) 提供，新浪无此字段。当竞速胜出的
// 实时源不含换手率（如东财被阻断时新浪抢先胜出），上层可用此函数单独向腾讯取一次
// 含换手率的实时快照，用于反推流通股本、估算缺失的日 K 换手率。
export async function fetchTurnoverAnchor(secid: string): Promise<RawRealtime | null> {
  try {
    const rt = await txRealtime.fetch(secid);
    return rt && (rt.turnover || 0) > 0 && (rt.vol || 0) > 0 ? rt : null;
  } catch {
    return null;
  }
}

// K 线缓存：东方财富是唯一稳定提供「换手率(f61)」的源，且易被频控。缓存「含真实换手率」
// 的成功结果（TTL 内直接复用），避免 HMR 重编译 / 周期切换 / 60s 定时刷新反复打东财，
// 导致换手率间歇性丢失变成「暂无换手率数据」。若本次回源丢失换手率、但近期缓存可用，
// 则回退到缓存，保证换手率不闪烁消失。
const klineCache = new Map<string, { t: number; data: Kline[] }>();
const KLINE_TTL = 5 * 60 * 1000;

export function getKline(secid: string, period: PeriodKey) {
  // 东方财富是唯一稳定提供「换手率(f61) / 成交额」的源；腾讯、新浪的 K 线接口不含这两个
  // 字段（解析时硬编码为 0）。若按纯并发首胜，腾讯/新浪常因响应更快抢先胜出，导致换手率
  // 恒为 0、量能失真。因此：优先选用含真实换手率的东财结果；仅当东财不可用才退回降级组
  // （此时换手率本就无数据，由展示层标注「暂无」）。
  // 但绝不能再用 Promise.all 等「最慢者」——东财被封锁时其多通道重试可耗时数秒，会把外层
  // 对大盘指数K线的 3s 硬超时拖挂成空，导致「大盘·市场环境」整卡暂无数据。改为：降级组先
  // 胜出时，再给东财 ~700ms 短窗口（成功时东财通常 <500ms 返回），窗口内东财到货则优先
  // 采用（保换手率），否则立即用降级组，绝不让慢失败阻塞主链路。
  const key = secid + "|" + period;
  const now = Date.now();
  const cached = klineCache.get(key);
  if (cached && now - cached.t < KLINE_TTL && cached.data.some((k) => (k.turnover || 0) > 0)) {
    return Promise.resolve(cached.data);
  }
  // 东财是否仍被配置在 K 线链路：在则并行优先尝试（保换手率），并从降级组剔除；
  // 未配置则直接全链竞速（东财独占的换手率随之缺省，由展示层标注「暂无」）。
  const hasEM = sourceOrder("kline").includes("eastmoney");
  const emP = hasEM
    ? emKline
        .fetch(secid, period)
        .then((r) => (r && r.length ? r : null))
        .catch(() => null)
    : Promise.resolve(null);
  const fbP = raceProviders(
    chainFor(
      orderedProviders("kline").filter((p) => !hasEM || p.id !== emKline.id),
      (p) => p.fetch(secid, period)
    ),
    "K线"
  )
    .then((r) => (r && r.length ? r : null))
    .catch(() => null);
  const graceMs = 700;
  return new Promise<{ src: "em" | "fb"; k: Kline[] } | null>((resolve) => {
    let em: Kline[] | null | undefined; // undefined = 东财仍在途
    let fb: Kline[] | null | undefined;
    let ended = false;
    const end = (v: { src: "em" | "fb"; k: Kline[] } | null) => {
      if (!ended) {
        ended = true;
        resolve(v);
      }
    };
    emP.then((r) => {
      em = r;
      if (r && r.length) end({ src: "em", k: r });
      else if (fb !== undefined) end(fb && fb.length ? { src: "fb", k: fb } : null);
      // fb 仍在途：由 fbP 分支收尾，避免东财慢失败拖住整个链路
    });
    fbP.then((r) => {
      fb = r;
      if (r && r.length) {
        if (em == null) {
          // 降级组已胜出、东财仍在途 → 给短窗口优先（保换手率），超时即用降级组
          setTimeout(() => {
            if (em == null || !(em && em.length)) end({ src: "fb", k: r });
          }, graceMs);
        } else if (!(em && em.length)) end({ src: "fb", k: r });
      } else if (em != null && !(em && em.length)) end(null);
    });
  }).then((winner) => {
    const hasTurn = (a: Kline[] | null | undefined) => !!a && a.some((k) => (k.turnover || 0) > 0);
    if (!winner) return cached && hasTurn(cached.data) ? cached.data : ([] as Kline[]);
    const data = normalizeKlines(winner.k);
    if (hasTurn(data)) {
      klineCache.set(key, { t: now, data });
    } else if (cached && hasTurn(cached.data)) {
      // 回源丢失换手率（东财频控）→ 用近期缓存兜底，避免换手率闪烁消失
      return cached.data;
    }
    return data;
  });
}

export function getTrend(secid: string) {
  return raceProviders(chainFor(orderedProviders("trend"), (p) => p.fetch(secid)), "分时");
}

export function getFlow(secid: string) {
  // 资金流：按配置顺序竞速（默认东财主站 → 代理通道）。东财不可达时落到代理
  // （Edge Function 转发新浪逐日主力净流入，规避浏览器 CORS），主力净流入不再恒为暂无。
  return raceProviders(chainFor(orderedProviders("flow"), (p) => p.fetch(secid)), "资金流");
}

export function getSearch(keyword: string) {
  return raceProviders(chainFor(orderedProviders("search"), (p) => p.fetch(keyword)), "搜索");
}

// 指数市场宽度（涨跌家数）：仅东财提供，超时/失败返回 null，由 analyze 降级为「暂无数据」。
export function getIndexBreadth(secid: string): Promise<IndexBreadth | null> {
  return withTimeout(fetchEMBreadth(secid).catch(() => null), 3000, null);
}

// 个股所属行业（f100）：仅东财提供，超时/失败返回 null，sector 维度自动缺省。
export function getStockIndustry(secid: string): Promise<string | null> {
  return withTimeout(fetchEMIndustry(secid).catch(() => null), 3000, null);
}

// 行业板块列表（长期缓存，整包只拉一次）：把行业名映射到板块指数 secid。
let _boardCache: { t: number; data: IndustryBoard[] } | null = null;
const BOARD_TTL = 60 * 60 * 1000;
export function getIndustryBoards(): Promise<IndustryBoard[]> {
  if (_boardCache && Date.now() - _boardCache.t < BOARD_TTL) {
    return Promise.resolve(_boardCache.data);
  }
  return withTimeout(fetchEMIndustryBoards().catch(() => [] as IndustryBoard[]), 4000, [] as IndustryBoard[]).then(
    (boards: IndustryBoard[]) => {
      if (boards && boards.length) {
        // 模块级缓存（非 TTL Map，避免与行情缓存混用）
        (_boardCache as any) = { t: Date.now(), data: boards };
      }
      return boards || [];
    }
  );
}

export type { NewsItem } from "@/utils/newsSentiment";
export type { IndexBreadth, IndustryBoard } from "./eastmoney";

// 关联资讯：并行取「个股关联」与「全市场/行业」，合并去重并按时间倒序。
// 仅东方财富一家稳定提供结构化资讯列表（腾讯/新浪无同等免费接口），
// 若东财资讯接口不可达，返回 []，由上层 graceful 处理，不阻断行情主流程。
export async function getNews(secid: string, name?: string): Promise<NewsItem[]> {
  // 个股维度用「代码 + 公司名/简称」双关键词并行搜索：东财搜索索引基于标题/摘要文本，
  // 纯数字代码在新闻中极少出现、命中极低（此前只搜代码导致普遍 0 条）；而公司名/简称
  // 才是新闻高频词，能真正抓到该股票的相关资讯。两者均标 scope="stock"，下游 filterNews
  // 仍以代码/全称/核心词/简称多维严格过滤兜底，避免简称子串（如「平安夜」）带来的少量噪声。
  const code = codeFromSecid(secid);
  const keys = Array.from(
    new Set([code, name].filter((k): k is string => !!k && k.trim().length >= 2))
  );
  const batches = await Promise.all(
    keys.map((k) => searchByKeyword(k).catch(() => [] as NewsItem[]))
  );
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
