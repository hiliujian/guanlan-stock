/// <reference types="vite/client" />
// =====================================================================
// 运行期配置（本地默认值）
// - 优先读取 Vite 环境变量（VITE_ 前缀，构建/托管平台注入）
// - 其次回退到下方占位值（本地开发直接改这里即可）
//
// 注意：菜单显隐的「最终生效值」在 src/store/appConfig.ts 中合并了 Supabase
// app_config 表的远程覆盖，这里 DEFAULT_SETTINGS 仅作为本地兜底默认值。
// 数据源顺序（东财 → 腾讯 → 新浪三级冗余）已收拢到后端 Edge Function 网关，
// 由 SOURCES_JSON 环境变量 / 内置默认控制，前端不再配置数据源。
// =====================================================================

// 底部 Tab 键（与 src/pages/index/index.vue / AppTabBar 对应）
export type TabKey = "market" | "watch" | "community" | "profile";

// 数据源唯一标识（与后端网关返回的 source 一致，用于前端解析分发）
export type SourceId = "eastmoney" | "tencent" | "sina";

// 菜单配置：每类 Tab 是否启用（false = 底部导航隐藏、入口一并隐藏）
export type MenuConfig = Record<TabKey, boolean>;

export interface AppSettings {
  menus: MenuConfig;
}

// 本地默认配置（无 Supabase 远程覆盖时生效）
export const DEFAULT_SETTINGS: AppSettings = {
  menus: {
    market: true,
    watch: true,
    community: false, // 社区暂关闭：菜单显隐由系统配置驱动，模块本身未移除（改回 true 即恢复）
    profile: true,
  },
};

export interface AppConfig {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

export const config: AppConfig = {
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || "YOUR-ANON-KEY",
};

export const isSupabaseConfigured = !!(
  config.SUPABASE_URL &&
  !config.SUPABASE_URL.includes("YOUR-PROJECT") &&
  config.SUPABASE_ANON_KEY &&
  !config.SUPABASE_ANON_KEY.includes("YOUR-ANON")
);

export default config;
