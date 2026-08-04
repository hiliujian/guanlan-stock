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

const TAB_KEYS: TabKey[] = ["market", "watch", "community", "profile"];

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
