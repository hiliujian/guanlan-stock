// =====================================================================
// 数据源：东方财富「资讯搜索」（股票关联新闻 / 行业动态 / 市场事件）
//
//   端点：https://search-api-web.eastmoney.com/search/jsonp（后端网关转发）
//   该接口原生 JSONP（需 cb 参数），后端网关已附加 cb=cb 并原样透传；
//   前端解析时先剥掉 cb(...) 包装，再取 data.cmsArticleWebOld（多结构兜底）。
//
//   取数策略（按作用域构造关键词）：
//     · stock   ：用 6 位股票代码 / 公司名 / 简称作关键词，返回相关新闻；
//     · industry：用所属行业名（东财 f100，如「半导体」）作关键词，返回板块动态——
//                 板块行情联动个股（与主流平台一致）。
//   任何字段缺漏都不抛错，最坏返回 []（上层 graceful 处理，不阻断行情主流程）。
// =====================================================================
import { requestGateway } from "@/api/transport";
import type { NewsItem, NewsScope } from "@/utils/newsSentiment";

interface RawHit {
  id?: string | number;
  title?: string;
  url?: string;
  mediaName?: string;
  source?: string;
  date?: number | string;
  datetime?: number | string;
  time?: number | string;
  content?: string;
  summary?: string;
  abstract?: string;
}

// 剥掉 JSONP 包装（cb({...}); → {...}），兼容无包装的纯 JSON。
function unwrapJsonp(text: string): string {
  const t = (text || "").trim();
  const i = t.indexOf("(");
  const j = t.lastIndexOf(")");
  if (i > 0 && j > i) return t.slice(i + 1, j);
  return t;
}

function parseTime(t: number | string | undefined): { time: string; ts: number } {
  if (t == null) return { time: "", ts: 0 };
  if (typeof t === "number") {
    const ms = t > 1e12 ? t : t * 1000;
    const d = new Date(ms);
    if (!isFinite(d.getTime())) return { time: String(t), ts: 0 };
    const p = (x: number) => String(x).padStart(2, "0");
    return {
      time: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`,
      ts: d.getTime(),
    };
  }
  const s = String(t).trim();
  const d = new Date(s.replace(/-/g, "/"));
  return isFinite(d.getTime()) ? { time: s, ts: d.getTime() } : { time: s, ts: 0 };
}

function normUrl(u: string | undefined): string {
  if (!u) return "";
  if (u.startsWith("http")) return u;
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("/")) return "https://so.eastmoney.com" + u;
  return u;
}

function mapItem(r: RawHit, scope: NewsScope): NewsItem | null {
  const title = (r.title || "").trim();
  if (!title) return null;
  const { time, ts } = parseTime((r.date ?? r.datetime ?? r.time) as number | string | undefined);
  const source = (r.mediaName || r.source || "").trim() || "东方财富";
  return {
    // 底层文章 id 天然唯一：不加批次内序号后缀，保证跨关键词批次（代码/公司名）
    // 取到同一篇时能被 getNews 的 id 去重正确合并（否则同文重复展示且情绪双计）。
    id: String(r.id ?? r.url ?? title),
    title,
    summary: (r.content || r.summary || r.abstract || "").trim(),
    time,
    ts,
    source,
    url: normUrl(r.url),
    scope,
  };
}

// 多结构兼容：东财搜索返回 result.cmsArticleWebOld；其它形态一并兜底。
function parseSearch(text: string, scope: NewsScope): NewsItem[] {
  try {
    const json = JSON.parse(unwrapJsonp(text));
    const arr: RawHit[] =
      json?.result?.cmsArticleWebOld ??
      json?.data?.cmsArticleWebOld ??
      json?.list ??
      (Array.isArray(json?.data) ? json.data : []);
    if (!Array.isArray(arr) || !arr.length) return [];
    const out: NewsItem[] = [];
    arr.forEach((r) => {
      const it = mapItem(r, scope);
      if (it) out.push(it);
    });
    return out;
  } catch {
    return [];
  }
}

// 按任意关键词搜索东财资讯。始终返回数组，便于上层直接展开合并。
// 东财搜索索引基于标题/摘要文本，纯数字代码命中极低；公司名/简称才是高频词，
// 故上层应优先用公司名/简称作为关键词抓取个股资讯；所属行业名用于板块资讯。
export async function searchByKeyword(keyword: string, scope: NewsScope = "stock"): Promise<NewsItem[]> {
  const kw = (keyword || "").trim();
  if (kw.length < 2) return [];
  try {
    const { text } = await requestGateway("news", { keyword: kw });
    return parseSearch(text, scope);
  } catch {
    return [];
  }
}
