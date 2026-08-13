// =====================================================================
// 远程配置拉取（Supabase app_config 表）
// 系统级配置（菜单显隐）由本地默认值 + 远程覆盖合成：
//   - app_config 表按 key 存 jsonb，key 为 "menus"；
//   - 公开可读（RLS select true），写入仅 service_role（控制台 / 脚本）；
//   - 返回「部分」配置，未提供的项由本地默认值兜底，结构永不缺字段。
// 注：数据源顺序已由后端 Edge Function 网关统一管理，不再经 app_config 下发。
// =====================================================================
import { getSupabase, isSupabaseConfigured } from "@/api/supabase";
import type { AppSettings, MenuConfig, TabKey } from "./app";

interface AppConfigRow {
  key: string;
  value: unknown;
}

// 页面白名单（page_access 表）单行结构
export interface PageAccessRow {
  path: string;
  open: boolean;
  show_in_menu: boolean;
  sort_weight: number;
  extra: Record<string, unknown> | null;
  is_tab: boolean;
}

export const TAB_KEYS: TabKey[] = ["market", "watch", "community", "profile"];

export async function fetchRemoteSettings(): Promise<Partial<AppSettings>> {
  if (!isSupabaseConfigured) return {};
  const sb = getSupabase();
  if (!sb) return {};
  const { data, error } = await sb.from("app_config").select("key, value");
  if (error || !Array.isArray(data)) return {};
  const rows = data as AppConfigRow[];
  const out: Partial<AppSettings> = {};

  for (const r of rows) {
    if (r.key === "menus" && r.value && typeof r.value === "object") {
      const menus = {} as MenuConfig;
      for (const k of TAB_KEYS) {
        const v = (r.value as Record<string, unknown>)[k];
        menus[k] = typeof v === "boolean" ? v : true;
      }
      out.menus = menus;
    }
  }
  return out;
}

/**
 * 拉取页面白名单配置（page_access 表）。
 * - path：路由标识（Tab 用 "market"/"watch"…；真实页面用 "pages/xxx/yyy"）。
 * - open：是否对游客开放（白名单开关）；closed + 未登录 → 拦截跳转登录页。
 * - show_in_menu：是否在导航 / 菜单中展示（用于底部 Tab 栏 / 各页菜单过滤）。
 * - sort_weight：排序权重（预留，未来排序用）。
 * - extra：扩展字段（jsonb，预留角色权限 / 时间段开放等未来维度，不破坏表结构）。
 * - is_tab：是否为底部 Tab 视图（与 TabKey 对应）。
 * 表未建立 / 网络异常 → 返回空数组，由 store 层回退到内置默认白名单。
 */
export async function fetchPageAccess(): Promise<PageAccessRow[]> {
  if (!isSupabaseConfigured) return [];
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("page_access")
    .select("path, open, show_in_menu, sort_weight, extra, is_tab");
  if (error || !Array.isArray(data)) return [];
  return (data as PageAccessRow[]).map((r) => ({
    path: r.path,
    open: !!r.open,
    show_in_menu: !!r.show_in_menu,
    sort_weight: Number(r.sort_weight) || 0,
    extra: r.extra && typeof r.extra === "object" ? (r.extra as Record<string, unknown>) : null,
    is_tab: !!r.is_tab,
  }));
}
