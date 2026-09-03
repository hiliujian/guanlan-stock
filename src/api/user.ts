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

/** 将 profiles 行映射为用户名片所需字段（精确查询与模糊搜索复用，避免重复映射逻辑）。 */
function toUsernameLookup(d: any): UsernameLookup {
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

const USER_LOOKUP_COLS = "id, display_name, username, avatar_url, avatar_frame, signature, vip, vip_expires_at, level";

/**
 * 模糊搜索用户名：输入子串（如 "Li"）匹配所有包含该子串的用户名，不区分大小写（Postgres ilike）。
 * 用于社区搜索框实时展示多个匹配的用户名片（如搜索 "Li" 同时命中 Liu、Li1 等）。
 * - 最多返回 limit 条（默认 20），按用户名升序，避免超长结果拖慢渲染；
 * - profiles 公开读，游客亦可调用。
 */
export async function searchUsersByUsername(q: string, limit = 20): Promise<UsernameLookup[]> {
  const sb = getSupabase();
  const term = (q || "").trim();
  if (!sb || !term) return [];
  const { data, error } = await sb
    .from("profiles")
    .select(USER_LOOKUP_COLS)
    .ilike("username", `%${term}%`)
    .order("username", { ascending: true })
    .limit(limit);
  if (error || !data) return [];
  return data.map(toUsernameLookup);
}
