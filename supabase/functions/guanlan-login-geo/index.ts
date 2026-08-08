// =====================================================================
// Supabase Edge Function：登录地点解析（guanlan-login-geo）
//
// 客户端 SDK / 浏览器直连第三方 IP 地理定位接口不稳定（CORS、偶发 404 等），
// 故将「登录地点」改为服务端解析：函数从网关注入的请求头读取真实客户端 IP，
// 再向可靠的地理定位服务查询，返回可读地点串。全程最佳努力，失败返回 null，
// 绝不抛出，避免影响登录主流程。
//
// 协议：POST { supabase_url }/functions/v1/guanlan-login-geo
//   响应体：成功 { ok: true, location: "City, Country" | null }
//
// 实现说明：零外部依赖，仅用 Deno 内置 fetch。运行环境自动注入 SUPABASE_URL。
// 客户端真实 IP 由 Supabase 网关通过 x-forwarded-for 注入（首项即客户端 IP）。
// =====================================================================

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// 从请求头提取真实客户端 IP（客户端直连时 x-forwarded-for 首项即客户端 IP）
function clientIp(req: Request): string {
  const xff = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (xff) return xff;
  return (req.headers.get("x-real-ip") || "").trim();
}

// 把原始地理定位响应整理成「City, Country」式可读串；缺字段则降级拼接。
function formatLocation(d: any): string | null {
  if (!d) return null;

  // ip-api.com：{ status:"success", city, regionName, country }
  if (d.status === "success") {
    const parts = [d.city, d.regionName, d.country].filter(Boolean);
    if (parts.length) return parts.join(", ");
  }
  // ipwho.is：{ success:true, city, region, country }
  if (d.success) {
    const parts = [d.city, d.region, d.country].filter(Boolean);
    if (parts.length) return parts.join(", ");
  }
  return null;
}

// 依次尝试多个地理定位服务，任一成功即返回；全部失败返回 null。
async function resolveLocation(ip: string): Promise<string | null> {
  if (!ip) return null; // 无客户端 IP 时无法定位（勿用服务端出口 IP 冒充）
  const services = [
    // lang=zh-CN：ip-api 直接返回中文城市/省份（如「广州市」「广东省」「中国」），避免前端再做翻译。
    `https://ip-api.com/json/${ip}?fields=status,message,city,regionName,country&lang=zh-CN`,
    `https://ipwho.is/${ip}`,
  ];
  for (const url of services) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3500);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      const loc = formatLocation(data);
      if (loc) return loc;
    } catch {
      // 该服务失败，尝试下一个
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  // 预检：必须返回 200 + CORS 头，否则浏览器拦截真实请求。
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const ip = clientIp(req);
    const location = await resolveLocation(ip);
    return json(200, { ok: true, location });
  } catch {
    // 最佳努力：任何异常都返回 null，不影响调用方
    return json(200, { ok: true, location: null });
  }
});
