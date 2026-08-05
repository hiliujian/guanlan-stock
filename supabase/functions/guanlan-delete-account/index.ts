// =====================================================================
// Supabase Edge Function：注销账号（guanlan-delete-account）
//
// 客户端 SDK 无权删除 auth.users，必须通过服务端（service_role）执行。
// 安全约束：函数以「调用者自身的 Bearer 会话」解析身份，仅能删除自己，
// 杜绝越权删除他人账号。
//
// 协议：POST { supabase_url }/functions/v1/guanlan-delete-account
//   请求头：Authorization: Bearer <用户会话 jwt>
//   响应体：
//     成功 { ok: true }
//     失败 { ok: false, error: "..." }
//
// 部署（需 Supabase CLI 登录或 Dashboard Functions 手动建）：
//   supabase functions deploy guanlan-delete-account
// （SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 由
//   Supabase 运行环境自动注入，无需手动设置）
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return json(401, { ok: false, error: "未授权，请先登录" });
  }

  try {
    // 1) 用调用者会话解析身份（仅能删自己）
    const sbUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: me, error: meErr } = await sbUser.auth.getUser();
    if (meErr || !me.user) {
      return json(401, { ok: false, error: "登录已失效，请重新登录" });
    }
    const uid = me.user.id;

    // 2) 管理员客户端（service_role）执行删除，绕过 RLS
    const sbAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 3) 先清业务数据（避免孤儿记录）。community_posts 以作者名存储且无 FK，
    //    属用户公开贡献，保留不删；watchlists / profiles 按用户维度删除。
    await sbAdmin.from("watchlists").delete().eq("user_id", uid);
    await sbAdmin.from("profiles").delete().eq("id", uid);

    // 4) 删除 auth 用户（含关联 identity）
    const { error: delErr } = await sbAdmin.auth.admin.deleteUser(uid);
    if (delErr) {
      return json(500, { ok: false, error: "账号删除失败：" + delErr.message });
    }

    return json(200, { ok: true });
  } catch {
    return json(500, { ok: false, error: "注销失败，请稍后再试" });
  }
});
