// ============================================================================
// 测试脚本共享取数层：东财直连 → 失败时切 App 生产网关（guanlan-quote-proxy，
// 服务端多源冗余 东财→腾讯，参数与 App 完全一致），按返回 source 分流解析。
// 供 test_auto_levels.ts / test_ma_lines.ts 复用，保证两套验证同一数据口径。
// ============================================================================
export type K = { date: string; open: number; close: number; high: number; low: number; vol: number; amount: number };

export function toSeries(ks: K[]) {
  return ks.map((k) => ({
    timestamp: Date.parse(k.date),
    open: k.open, high: k.high, low: k.low, close: k.close,
    volume: k.vol, turnover: k.amount, date: k.date,
  }));
}

function parseKlines(j: any): K[] {
  return (j?.data?.klines ?? []).map((s: string) => {
    const a = s.split(",");
    return { date: a[0], open: +a[1], close: +a[2], high: +a[3], low: +a[4], vol: +a[5], amount: +a[6] };
  });
}

// 腾讯 K 线解析（与 src/api/sources/tencent.ts parseTXKline 同口径：qfqday/week/month，无 amount）
function parseTXKline(text: string, sym: string, period: "d" | "w" | "M"): K[] {
  const node = JSON.parse(text)?.data?.[sym];
  if (!node) throw new Error("tencent: 无节点 " + sym);
  const keyMap = { d: "qfqday", w: "qfqweek", M: "qfqmonth" };
  // 指数无除权除息，腾讯不返回 qfq* 键，只有原始键 day/week/month（与 tencent.ts rawMap 同口径）
  const rawMap = { d: "day", w: "week", M: "month" };
  const arr: any[] = node[keyMap[period]] || node[rawMap[period]] || node.day || [];
  if (!arr.length) throw new Error("tencent: " + keyMap[period] + " 为空");
  return arr.map((r: any[]) => ({
    date: String(r[0]), open: +r[1], close: +r[2], high: +r[3], low: +r[4], vol: +r[5], amount: 0,
  }));
}

// 东财 secid → 腾讯带市场前缀符号（与网关 toMarketSymbol 同口径，覆盖 sh/sz 即可）
function toMarketSymbol(secid: string): string {
  const [m, c] = secid.split(".");
  return (m === "1" ? "sh" : "sz") + (c || secid);
}

async function fetchEM(secid: string, klt: number, begDays: number, retry = 2): Promise<K[]> {
  const d = new Date(Date.now() + begDays * 86400e3);
  const beg = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const url =
    `https://push2his.eastmoney.com/api/qt/stock/kline/get` +
    `?fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61` +
    `&klt=${klt}&fqt=1&secid=${secid}&beg=${beg}&end=20500101`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const j: any = await res.json();
    const ks = parseKlines(j);
    if (!ks.length) throw new Error("直连空数据");
    return ks;
  } catch (e) {
    if (retry > 0) {
      await new Promise((r) => setTimeout(r, 1200));
      return fetchEM(secid, klt, begDays, retry - 1);
    }
    throw e;
  }
}

let gw: { url: string; key: string } | null | undefined;
function loadGateway(): { url: string; key: string } | null {
  if (gw !== undefined) return gw;
  try {
    const txt = require("fs").readFileSync(require("path").join(__dirname, "..", ".env"), "utf8");
    const env: Record<string, string> = {};
    for (const line of txt.split(/\r?\n/)) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (m) env[m[1]] = m[2];
    }
    if (env.VITE_SUPABASE_URL && !env.VITE_SUPABASE_URL.includes("YOUR-PROJECT") && env.VITE_SUPABASE_ANON_KEY)
      gw = { url: `${env.VITE_SUPABASE_URL}/functions/v1/guanlan-quote-proxy`, key: env.VITE_SUPABASE_ANON_KEY };
    else gw = null;
  } catch {
    gw = null;
  }
  return gw;
}

async function fetchViaGateway(secid: string, period: "d" | "w" | "M"): Promise<K[]> {
  const g = loadGateway();
  if (!g) throw new Error("直连失败且无网关配置");
  const res = await fetch(g.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: g.key, Authorization: `Bearer ${g.key}` },
    body: JSON.stringify({ kind: "kline", secid, period }),
    signal: AbortSignal.timeout(20000),
  });
  const j: any = await res.json();
  if (j?.ok !== true || typeof j.text !== "string") throw new Error(j?.error || "网关返回异常");
  if (j.source === "eastmoney") return parseKlines(JSON.parse(j.text));
  if (j.source === "tencent") return parseTXKline(j.text, toMarketSymbol(secid), period);
  throw new Error("未支持的网关源: " + j.source);
}

// 统一入口：东财直连 → App 生产网关
export async function fetchAny(secid: string, period: "d" | "w" | "M"): Promise<K[]> {
  const klt = { d: 101, w: 102, M: 103 }[period];
  const begDays = { d: -730, w: -2200, M: -3650 }[period];
  try {
    return await fetchEM(secid, klt, begDays);
  } catch {
    return await fetchViaGateway(secid, period);
  }
}

// ============================================================================
// 资讯取数（与 App 同链路：网关 kind:"news" → 东财搜索 JSONP → parseSearch 复刻）。
// 解析逻辑与 src/api/sources/news.ts 逐字同口径，另附 _kw/_idx 供跨批审计。
// ============================================================================
export interface N {
  id: string; title: string; summary: string; time: string; ts: number;
  source: string; url: string; scope: "stock" | "industry"; _kw: string; _idx: number;
}

// 剥掉 JSONP 包装（与 news.ts unwrapJsonp 同口径）
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

function parseSearch(text: string, kw: string, scope: "stock" | "industry" = "stock"): N[] {
  try {
    const json = JSON.parse(unwrapJsonp(text));
    const arr: any[] =
      json?.result?.cmsArticleWebOld ??
      json?.data?.cmsArticleWebOld ??
      json?.list ??
      (Array.isArray(json?.data) ? json.data : []);
    if (!Array.isArray(arr)) return [];
    const out: N[] = [];
    arr.forEach((r: any, i: number) => {
      const title = (r.title || "").trim();
      if (!title) return;
      const { time, ts } = parseTime((r.date ?? r.datetime ?? r.time) as number | string | undefined);
      out.push({
        // 与 news.ts mapItem 同口径：底层 id 不加序号后缀（跨批去重依赖底层 id 相同）
        id: String(r.id ?? r.url ?? title),
        title,
        summary: (r.content || r.summary || r.abstract || "").trim(),
        time,
        ts,
        source: (r.mediaName || r.source || "").trim() || "东方财富",
        url: r.url ? (r.url.startsWith("http") ? r.url : r.url.startsWith("//") ? "https:" + r.url : r.url.startsWith("/") ? "https://so.eastmoney.com" + r.url : r.url) : "",
        scope,
        _kw: kw,
        _idx: i,
      });
    });
    return out;
  } catch {
    return [];
  }
}

// 按关键词经 App 生产网关抓东财资讯（App searchByKeyword 同参：kind:"news" + keyword）
export async function fetchNewsKeyword(kw: string, scope: "stock" | "industry" = "stock"): Promise<N[]> {
  const g = loadGateway();
  if (!g) throw new Error("无网关配置");
  const res = await fetch(g.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: g.key, Authorization: `Bearer ${g.key}` },
    body: JSON.stringify({ kind: "news", keyword: kw }),
    signal: AbortSignal.timeout(20000),
  });
  const j: any = await res.json();
  if (j?.ok !== true || typeof j.text !== "string") throw new Error(j?.error || "网关返回异常");
  return parseSearch(j.text, kw, scope);
}
