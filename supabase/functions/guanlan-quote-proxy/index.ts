// =====================================================================
// Supabase Edge Function：观澜行情数据网关（guanlan-quote-proxy）
//
// 统一后端架构：前端不再直连任何行情源，也不再在浏览器里做 JSONP / 直连 /
// 公共代理等通道兜底。所有行情请求统一经本函数转发，多数据源冗余也收拢到
// 后端完成（第一级东财 → 第二级腾讯 → 第三级新浪，某级不可用自动切下级）。
//
// 协议：POST { supabase_url }/functions/v1/guanlan-quote-proxy
//   请求体（语义化，前端不关心具体源）：
//     { kind: "realtime"|"kline"|"trend"|"flow"|"search"|"news"|"ulist"|"clist"|"futures"|"cffex",
//       secid?, period?, keyword?, secids?, fields?, query?, forceSource?, date?, product? }
//   响应体：
//     成功 { ok: true,  source: "eastmoney"|"tencent"|"sina", text: "<上游原始响应>" }
//     失败 { ok: false, error: "..." }
//   说明：text 为上游原始文本，解析仍由前端各源解析器完成（两端结构不漂移）；
//         source 告知前端该用哪家的解析器。
//
// 配置（数据源顺序，即「配置文件」）：
//   ① 环境变量 SOURCES_JSON（supabase secrets set SOURCES_JSON='{"kline":[...],...}'）
//   ② 未设置则用下方 DEFAULT_SOURCES 内置默认（东财 → 腾讯 → 新浪）
//
// 安全：只允许转发到预置白名单域名（防御纵深），杜绝 SSRF。
// =====================================================================

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

type Kind = "realtime" | "kline" | "trend" | "flow" | "search" | "news" | "ulist" | "clist" | "futures" | "cffex";
type SourceId = "eastmoney" | "tencent" | "sina" | "cffex";

// ---- 数据源顺序（配置文件）：默认东财 → 腾讯 → 新浪，三级冗余，用不了自动切下级 ----
const DEFAULT_SOURCES: Record<Kind, SourceId[]> = {
  realtime: ["eastmoney", "tencent", "sina"],
  kline: ["eastmoney", "tencent", "sina"],
  trend: ["eastmoney", "tencent", "sina"],
  flow: ["eastmoney", "sina"], // 资金流免费接口仅东财 / 新浪提供
  search: ["eastmoney", "tencent", "sina"],
  news: ["eastmoney"],
  ulist: ["eastmoney"],
  clist: ["eastmoney"],
  futures: ["sina"], // 商品期货 Eastmoney 不提供，统一走新浪期货接口
  cffex: ["cffex"], // 中金所官方持仓排名 CSV，单一官方源，无冗余可切
};

let SOURCES: Record<Kind, SourceId[]> = JSON.parse(JSON.stringify(DEFAULT_SOURCES));
try {
  const raw = Deno.env.get("SOURCES_JSON");
  if (raw) {
    const parsed = JSON.parse(raw);
    for (const k of Object.keys(DEFAULT_SOURCES) as Kind[]) {
      if (Array.isArray(parsed[k])) {
        SOURCES[k] = (parsed[k] as unknown[]).filter(
          (x): x is SourceId => typeof x === "string" && x in DEFAULT_SOURCES[k]
        );
      }
    }
  }
} catch {
  /* SOURCES_JSON 非法 → 沿用默认 */
}

// ---- 防御纵深：每家源只允许访问其白名单域名 ----
const SOURCE_HOSTS: Record<SourceId, string[]> = {
  eastmoney: [
    "push2.eastmoney.com",
    "push2his.eastmoney.com",
    "push2delay.eastmoney.com",
    "searchapi.eastmoney.com",
    "search-api-web.eastmoney.com",
  ],
  tencent: ["qt.gtimg.cn", "web.ifzq.gtimg.cn", "smartbox.gtimg.cn"],
  sina: [
    "hq.sinajs.cn",
    "money.finance.sina.com.cn",
    "suggest3.sinajs.cn",
    "vip.stock.finance.sina.com.cn",
    "finance.sina.com.cn",
  ],
  cffex: ["www.cffex.com.cn"],
};

const REFERER: Record<SourceId, string> = {
  eastmoney: "https://quote.eastmoney.com/",
  tencent: "https://gu.qq.com/",
  sina: "https://finance.sina.com.cn/",
  cffex: "https://www.cffex.com.cn/",
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const dateStr = (offsetDays: number): string => {
  const d = new Date(Date.now() + offsetDays * 864e5);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
};

// 东财 secid → 腾讯 / 新浪带市场前缀符号：sh600519 / sz000001 / hk00700 / bj8xxxxx
// 逻辑与前端 src/utils/period.ts 的 marketFromSecid + symbol.ts 的 toMarketSymbol 完全一致。
function toMarketSymbol(secid: string): string {
  const [m, codeRaw] = secid.split(".");
  const c = codeRaw || secid;
  if (m === "116" || m === "100" || m === "105") return "hk" + c;
  if (m === "1") return "sh" + c;
  if (/^[489]/.test(c)) return "bj" + c;
  return "sz" + c;
}

// 每个 (kind, source) 返回 { url, enc }；不适用（如新浪仅日K）返回 null。
// URL 构造与 src/api/sources/*.ts 中的前端 URL 完全对齐，保证解析结构一致。
function buildUrl(
  kind: Kind,
  source: SourceId,
  p: Record<string, unknown>
): { url: string; enc: "utf-8" | "gbk" } | null {
  const secid = String(p.secid || "");
  const sym = secid ? toMarketSymbol(secid) : "";
  const period = String(p.period || "d");

  if (kind === "realtime") {
    if (source === "eastmoney") {
      const fields = String(p.fields || "f43,f44,f45,f46,f47,f48,f57,f58,f59,f60,f86");
      return {
        url: `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=${fields}`,
        enc: "utf-8",
      };
    }
    if (source === "tencent")
      return { url: `https://qt.gtimg.cn/q=${sym}`, enc: "gbk" };
    if (source === "sina")
      return { url: `https://hq.sinajs.cn/list=${sym}`, enc: "gbk" };
  }

  if (kind === "kline") {
    if (source === "eastmoney") {
      const klt: Record<string, number> = { d: 101, w: 102, M: 103, y: 106 };
      const beg: Record<string, number> = { d: -730, w: -2200, M: -3650, y: -7300 };
      return {
        url:
          `https://push2his.eastmoney.com/api/qt/stock/kline/get` +
          `?fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61` +
          `&klt=${klt[period]}&fqt=1&secid=${secid}&beg=${dateStr(beg[period])}&end=20500101`,
        enc: "utf-8",
      };
    }
    if (source === "tencent") {
      const pmap: Record<string, string> = { d: "day", w: "week", M: "month", y: "year" };
      return {
        url: `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${sym},${pmap[period]},,,320,qfq`,
        enc: "utf-8",
      };
    }
    if (source === "sina") {
      if (period !== "d") return null; // 新浪仅支持日 K
      return {
        url:
          `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData` +
          `?symbol=${sym}&scale=240&ma=5&datalen=730`,
        enc: "utf-8",
      };
    }
  }

  if (kind === "trend") {
    if (source === "eastmoney")
      return {
        url:
          `https://push2his.eastmoney.com/api/qt/stock/trends2/get` +
          `?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58&iscr=0`,
        enc: "utf-8",
      };
    if (source === "tencent")
      return {
        url: `https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=${sym}`,
        enc: "utf-8",
      };
    if (source === "sina")
      return {
        url:
          `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData` +
          `?symbol=${sym}&scale=1&ma=5&datalen=240`,
        enc: "utf-8",
      };
  }

  if (kind === "flow") {
    if (source === "eastmoney")
      return {
        url:
          `https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get` +
          `?lmt=120&klt=101&secid=${secid}&fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`,
        enc: "utf-8",
      };
    if (source === "sina")
      return {
        url:
          `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/MoneyFlow.ssl_qsfx_zjlrqs` +
          `?daima=${sym}&page=1&num=20&sort=opendate&asc=0`,
        enc: "gbk",
      };
  }

  if (kind === "search") {
    const kw = encodeURIComponent(String(p.keyword || ""));
    if (source === "eastmoney")
      return {
        url: `https://searchapi.eastmoney.com/api/suggest/get?input=${kw}&type=14&token=D43BF7224E8C6FA3AFPAY9&count=8`,
        enc: "utf-8",
      };
    if (source === "tencent")
      return { url: `https://smartbox.gtimg.cn/s3/?v=2&t=all&q=${kw}`, enc: "utf-8" };
    if (source === "sina")
      return { url: `https://suggest3.sinajs.cn/suggest/?key=${kw}`, enc: "gbk" };
  }

  if (kind === "news") {
    if (source === "eastmoney") {
      const keyword = String(p.keyword || "");
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
            pageSize: 20,
            preTag: "",
            postTag: "",
          },
        },
      };
      return {
        url: `https://search-api-web.eastmoney.com/search/jsonp?cb=cb&param=${encodeURIComponent(JSON.stringify(param))}`,
        enc: "utf-8",
      };
    }
  }

  if (kind === "ulist") {
    if (source === "eastmoney") {
      const secids = String(p.secids || "");
      const fields = String(p.fields || "f12,f13,f14");
      // 用实时主机 push2：延迟主机 push2delay 漏算恒生科技等新指数；push2 实时且指数覆盖更全。
      return {
        url: `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=${secids}&fields=${fields}`,
        enc: "utf-8",
      };
    }
  }

  if (kind === "futures") {
    if (source === "sina") {
      // p.secids 已由前端映射为新浪期货符号（如 nf_CU0 / hf_GC），单次批量请求取多合约。
      const secids = String(p.secids || "");
      return {
        url: `https://hq.sinajs.cn/list=${secids}`,
        enc: "gbk",
      };
    }
  }

  if (kind === "clist") {
    if (source === "eastmoney") {
      const q = p.query as Record<string, string | number> | undefined;
      const qs = q
        ? Object.entries(q)
            .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
            .join("&")
        : "";
      return { url: `https://push2.eastmoney.com/api/qt/clist/get?${qs}`, enc: "utf-8" };
    }
  }

  if (kind === "cffex") {
    if (source === "cffex") {
      // 中金所成交持仓排名日更 CSV（GBK）：/sj/ccpm/YYYYMM/DD/{IF|IH|IC|IM}_1.csv
      // date=YYYYMMDD，product 限定四品种白名单，杜绝路径注入
      const date = String(p.date || "");
      const product = String(p.product || "");
      if (!/^\d{8}$/.test(date) || !["IF", "IH", "IC", "IM"].includes(product)) return null;
      return {
        url: `http://www.cffex.com.cn/sj/ccpm/${date.slice(0, 6)}/${date.slice(6)}/${product}_1.csv`,
        enc: "gbk",
      };
    }
  }

  return null;
}

// 判断上游返回的文本是否为 HTML（而非 JSON / 行情文本），识别后跳过该源。
function looksLikeHtml(text: string): boolean {
  const t = (text || "").replace(/^\uFEFF/, "").trimStart();
  return (
    t.startsWith("<!DOCTYPE") ||
    t.startsWith("<html") ||
    t.startsWith("<?xml") ||
    (t.startsWith("<") && /^[a-zA-Z/!]/.test(t.slice(1, 2) || ""))
  );
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(), "Content-Type": "application/json" },
  });
}

async function fetchUpstream(
  url: string,
  referer: string,
  enc: string,
  timeoutMs: number
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Referer: referer, Accept: "*/*" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const buf = await r.arrayBuffer();
    const text = new TextDecoder(enc).decode(buf);
    if (looksLikeHtml(text)) throw new Error("非 JSON 响应");
    if (!text || !text.length) throw new Error("空响应");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// 按配置顺序尝试数据源，首级失效自动切下级；forceSource 时只走指定源。
async function tryChain(
  kind: Kind,
  params: Record<string, unknown>
): Promise<{ ok: true; source: SourceId; text: string } | { ok: false; error: string }> {
  const chain: SourceId[] = params.forceSource
    ? ([String(params.forceSource)] as SourceId[])
    : SOURCES[kind] || [];
  if (!chain.length) return { ok: false, error: `「${kind}」未配置任何数据源` };

  let lastErr = "数据源均不可用";
  for (const source of chain) {
    try {
      const built = buildUrl(kind, source, params);
      if (!built) continue; // 该源不适用（如新浪非日K）
      const parsed = new URL(built.url);
      const allowed = SOURCE_HOSTS[source] || [];
      if (!allowed.includes(parsed.hostname)) continue; // 防御纵深：不在白名单直接跳过
      const text = await fetchUpstream(built.url, REFERER[source], built.enc, 8000);
      return { ok: true, source, text };
    } catch (e) {
      lastErr = `${source}: ${(e as Error)?.message || String(e)}`;
    }
  }
  return { ok: false, error: `行情数据获取失败（${lastErr}）` };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json(400, { ok: false, error: "请求体必须为 JSON" });
  }

  const kind: Kind = payload?.kind;
  const KINDS: Kind[] = ["realtime", "kline", "trend", "flow", "search", "news", "ulist", "clist", "futures", "cffex"];
  if (!KINDS.includes(kind)) {
    return json(400, { ok: false, error: "缺少或非法的 kind 参数" });
  }

  const { secid, period, keyword, secids, fields, query, forceSource, date, product } = payload || {};
  const params: Record<string, unknown> = {
    ...(secid ? { secid: String(secid) } : {}),
    ...(period ? { period: String(period) } : {}),
    ...(keyword ? { keyword: String(keyword) } : {}),
    ...(secids ? { secids: String(secids) } : {}),
    ...(fields ? { fields: String(fields) } : {}),
    ...(query ? { query } : {}),
    ...(forceSource ? { forceSource: String(forceSource) } : {}),
    ...(date ? { date: String(date) } : {}),
    ...(product ? { product: String(product) } : {}),
  };

  const result = await tryChain(kind, params);
  if (result.ok) {
    return json(200, { ok: true, source: result.source, text: result.text });
  }
  return json(502, { ok: false, error: result.error });
});
