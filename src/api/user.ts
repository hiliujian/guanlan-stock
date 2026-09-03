// =====================================================================
// 用户资料查询（公开可读：profiles 表 RLS 已对 anon/authenticated 开放 SELECT）
// =====================================================================
import { getSupabase } from "@/api/supabase";

/** 用户名片所需的用户资料字段（与全局视觉 / 关注按钮一致）。 */
export interface UsernameLookup {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string;
  avatar_frame: string;
  signature: string;
  vip: boolean;
  vip_expires_at: string | null;
  level: number;
}

/**
 * 按用户名（username）精确查询唯一用户。用于社区搜索「输入即匹配用户名」场景。
 * - username 在 profiles 上有非空唯一索引（deploy.sql），故精确 eq 至多返回 1 行；
 * - 用 maybeSingle() 避免 PGRST116（无匹配时报错）；查不到 / 出错返回 null。
 * - 游客亦可调用（profiles 公开读），用户名搜索对未登录用户同样可用。
 */
export async function lookupUserByUsername(name: string): Promise<UsernameLookup | null> {
  const sb = getSupabase();
  if (!sb || !name) return null;
  const { data, error } = await sb
    .from("profiles")
    .select("id, display_name, username, avatar_url, avatar_frame, signature, vip, vip_expires_at, level")
    .eq("username", name.trim())
    .maybeSingle();
  if (error || !data) return null;
  const d = data as any;
  return {
    id: d.id,
    display_name: d.display_name || "",
    username: d.username || "",
    avatar_url: d.avatar_url || "",
    avatar_frame: d.avatar_frame || "",
    signature: d.signature || "",
    vip: d.vip === true,
    vip_expires_at: typeof d.vip_expires_at === "string" ? d.vip_expires_at : null,
    level: typeof d.level === "number" ? d.level : 0,
  };
}
