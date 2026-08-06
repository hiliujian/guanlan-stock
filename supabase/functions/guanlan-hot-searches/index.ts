// =====================================================================
// Supabase Edge Function：观澜今日热搜（guanlan-hot-searches）
//
// 独立接口，支撑行情页空态的「热门股票快速入口」：
//   · 榜单只统计「当日」搜索次数，不叠加历史；
//   · 每日零点自动重置 —— 底层 hot_search_daily 以「日期 + 代码」为主键按日分桶，
//     榜单仅查当日，旧日记录自然失效，因此「重置」由新的一天自动完成。
//   数据读写都经 Postgres RPC（security definer），底层表 RLS 全拒，客户端无法伪造。
//
// 协议：
//   GET  {base}/functions/v1/guanlan-hot-searches          → 今日热榜
//        查询参数可选 limit（默认 10，上限 200）
//   POST {base}/functions/v1/guanlan-hot-searches  {code,name}  → 记录一次搜索
//
// 依赖内置环境变量 SUPABASE_URL / SUPABASE_ANON_KEY（Supabase Edge Runtime 自动注入，
// 无需 secrets set）。公开可调用，无需登录。
// =====================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// 调用 Postgres RPC（REST 端点），返回解析结果或 null
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  const url = `${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/${fn}`;
  const key = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc(${fn}) ${res.status}: ${text}`);
  return text ? (JSON.parse(text) as T) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    if (req.method === "GET") {
      const raw = Number(url.searchParams.get("limit") || "");
      const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 50) : 10;
      const list = await rpc<{ code: string; name: string; count: number }[]>(
        "get_hot_searches",
        { p_limit: limit }
      );
      return json({ ok: true, list: Array.isArray(list) ? list : [] });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const code = String((body as { code?: unknown }).code || "").trim();
      const name = String((body as { name?: unknown }).name || "").trim();
      if (!code) return json({ ok: false, error: "缺少股票代码" }, 400);
      await rpc("log_stock_search", { p_code: code, p_name: name });
      return json({ ok: true });
    }

    return json({ ok: false, error: "method not allowed" }, 405);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "服务异常" }, 500);
  }
});