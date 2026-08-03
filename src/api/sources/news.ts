// =====================================================================
// 数据源：东方财富「资讯搜索」JSONP 接口（股票关联新闻 / 行业动态 / 市场事件）
//
//   端点：https://search-api-web.eastmoney.com/search/jsonp
//   该接口原生支持 JSONP（cb 回调），浏览器 <script> 直连即可跨域取数，
//   无需代理，是 H5 场景下最稳可用的个股/市场新闻源。
//
//   取数策略（按作用域构造关键词）：
//     · stock  ：用 6 位股票代码作关键词，返回该只股票的相关新闻；
//     · market ：用「A股」作关键词，返回市场/行业层面的宏观动态。
//
//   复用 transport 的 requestEmJson（JSONP 优先 → 代理/直连兜底），与实时/
//   K线同源。解析做足防御，任何字段缺漏都不抛错，最坏返回 []（上层 graceful
//   处理，不阻断行情主流程）。
// =====================================================================
import { requestEmJson } from "@/api/transport";
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

function parseTime(t: number | string | undefined): { time: string; ts: number } {
  if (t == null) return { time: "", ts: 0 };
  if (typeof t === "number") {
    // 秒级时间戳（如 1701396301）转毫秒；毫秒级（>1e12）直接用
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

function mapItem(r: RawHit, scope: NewsScope, idx: number): NewsItem | null {
  const title = (r.title || "").trim();
  if (!title) return null;
  const { time, ts } = parseTime((r.date ?? r.datetime ?? r.time) as number | string | undefined);
  const source = (r.mediaName || r.source || "").trim() || "东方财富";
  return {
    id: String(r.id ?? r.url ?? title) + "_" + idx,
    title,
    summary: (r.content || r.summary || r.abstract || "").trim(),
    time,
    ts,
    source,
    url: normUrl(r.url),
    scope,
  };
}

// 多结构兼容：东财搜索返回 data.cmsArticleWebOld；其它形态（data.list /
// result.cmsArticleWebOld / 直接数组）一并兜底，任一命中即可取数。
function parseSearch(text: string, scope: NewsScope): NewsItem[] {
  try {
    const json = JSON.parse(text);
    const arr: RawHit[] =
      json?.data?.cmsArticleWebOld ??
      json?.result?.cmsArticleWebOld ??
      json?.data?.list ??
      json?.list ??
      (Array.isArray(json?.data) ? json.data : []);
    if (!Array.isArray(arr) || !arr.length) return [];
    const out: NewsItem[] = [];
    arr.forEach((r, i) => {
      const it = mapItem(r, scope, i);
      if (it) out.push(it);
    });
    return out;
  } catch {
    return [];
  }
}

// 搜索接口的参数体（关键词 + 分页 + 排序），整体 JSON 后 URL 编码。
function buildUrl(keyword: string, pageSize = 20): string {
  const param = {
    uid: "",
    keyword,
    type: ["cmsArticleWebOld"],
    client: "web",
    clientType: "web",
    clientVersion: "curr",
    param: {
      cmsArticleWebOld: {
        searchScope: "default",
        sort: "default",
        pageIndex: 1,
        pageSize,
        preTag: "",
        postTag: "",
      },
    },
  };
  const p = encodeURIComponent(JSON.stringify(param));
  return "https://search-api-web.eastmoney.com/search/jsonp?param=" + p;
}

// 按任意关键词搜索东财资讯（个股代码 / 公司名 / 简称 均可用）。始终返回数组，
// 便于上层直接展开合并。搜索结果统一标 scope="stock"，由下游 filterNews 做严格关联过滤。
// 东财搜索索引基于标题/摘要文本，纯数字代码在新闻中极少出现、命中极低；公司名/简称
// 才是新闻高频词，故上层应优先用公司名/简称作为关键词抓取个股资讯。
export async function searchByKeyword(keyword: string): Promise<NewsItem[]> {
  const kw = (keyword || "").trim();
  if (kw.length < 2) return [];
  try {
    const text = await requestEmJson(buildUrl(kw));
    return parseSearch(text, "stock");
  } catch {
    return [];
  }
}
