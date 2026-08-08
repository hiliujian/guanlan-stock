// =====================================================================
// Supabase Edge Function：注销账号（guanlan-delete-account）
//
// 客户端 SDK 无权删除 auth.users，必须通过服务端（service_role）执行。
// 安全约束：函数仅在 verify_jwt=true 下运行，网关注入前已校验调用者 JWT
// 签名，函数直接解码 JWT 的 sub 取得用户 id，仅能删除自己，杜绝越权。
//
// 协议：POST { supabase_url }/functions/v1/guanlan-delete-account
//   请求头：Authorization: Bearer <用户会话 jwt>
//   响应体：成功 { ok: true } / 失败 { ok: false, error: "..." }
//
// 实现说明：零外部依赖，仅用 Deno 内置 fetch 调用 Supabase REST / Auth Admin
// API；运行环境自动注入 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY。
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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// 从已校验的 Bearer JWT 中解析 sub（用户 id）。verify_jwt=true 保证签名可信。
function jwtSub(token: string): string | null {
  try {
    const p = token.split(".")[1];
    if (!p) return null;
    const b = p.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b)) as { sub?: string };
    return payload.sub || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  // 预检：必须返回 200 + CORS 头，否则浏览器拦截真实请求。
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return json(401, { ok: false, error: "未授权，请先登录" });
  }
  const uid = jwtSub(auth.slice(7));
  if (!uid) return json(401, { ok: false, error: "登录已失效，请重新登录" });

  try {
    // 先清业务数据（避免孤儿记录）。community_posts 以作者名存储且无 FK，
    // 属用户公开贡献，保留不删；watchlists / profiles 按用户维度删除。
    const delHeaders = {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      Prefer: "return=minimal",
    };
    await fetch(`${SUPABASE_URL}/rest/v1/watchlists?user_id=eq.${uid}`, {
      method: "DELETE",
      headers: delHeaders,
    });
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${uid}`, {
      method: "DELETE",
      headers: delHeaders,
    });

    // 删除 auth 用户（含关联 identity）
    const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
    if (!delRes.ok) {
      const detail = await delRes.text();
      return json(500, { ok: false, error: "账号删除失败：" + detail.slice(0, 200) });
    }

    return json(200, { ok: true });
  } catch {
    return json(500, { ok: false, error: "注销失败，请稍后再试" });
  }
});
