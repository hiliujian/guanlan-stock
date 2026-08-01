// =====================================================================
// Supabase Edge Function：观澜行情统一代理（guanlan-quote-proxy）
//
// 职责：前端「所有」行情请求统一经由本函数转发到东方财富，业务层无感知。
//   - 微信小程序端 wx.request 有域名白名单限制，必须走统一后端代理；
//   - 服务端取数可规避浏览器跨域，也便于集中管控与限流。
//
// 协议：POST { supabase_url }/functions/v1/guanlan-quote-proxy
//       请求体：{ "url": "<东方财富完整接口 URL>" }
//       响应体：原样透传东方财富返回的 JSON（不做二次结构转换，
//              前端按原有逻辑解析，避免两端结构漂移）。
//
// 安全：仅放行 *.eastmoney.com / *.eastmoney.com.cn 域名，杜绝 SSRF。
//
// 部署：supabase functions deploy guanlan-quote-proxy
// =====================================================================
import "https://deno.land/std@0.196.0/dotenv/mod.ts";

// 东方财富对服务端请求会做 UA / Referer 校验，缺失则直接掐断 TLS 连接。
// 这里伪装成浏览器，避免被反爬拦截。
const EM_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://quote.eastmoney.com/",
  "Accept": "*/*",
};

// 仅允许转发到东方财富官方域名，避免被当成开放代理（SSRF 防护）。
const ALLOWED_HOSTS = [
  "push2.eastmoney.com",
  "push2his.eastmoney.com",
  "searchapi.eastmoney.com",
  "search-api-web.eastmoney.com",
  "so.eastmoney.com",
  "quote.eastmoney.com",
  "datacenter.eastmoney.com",
  "push2delay.eastmoney.com",
];

function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    ALLOWED_HOSTS.includes(h) ||
    h.endsWith(".eastmoney.com") ||
    h.endsWith(".eastmoney.com.cn")
  );
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function bad(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors(), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return bad(400, "请求体必须为 JSON");
  }

  const target = payload?.url;
  if (!target || typeof target !== "string") {
    return bad(400, "缺少 url 参数");
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return bad(400, "url 非法");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return bad(403, "仅允许 http/https 协议");
  }
  if (!isAllowedHost(parsed.hostname)) {
    return bad(403, "仅允许转发到东方财富域名");
  }

  try {
    const upstream = await fetch(target, { headers: EM_HEADERS });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...cors(),
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch (e) {
    // 典型错误：东方财富对海外云 IP 在 TLS 握手阶段直接掐断连接。
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { ...cors(), "Content-Type": "application/json" },
    });
  }
});
