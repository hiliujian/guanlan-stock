/// <reference types="vite/client" />
// =====================================================================
// 运行期配置（本地默认值）
// - 优先读取 Vite 环境变量（VITE_ 前缀，构建/托管平台注入）
// - 其次回退到下方占位值（本地开发直接改这里即可）
//
// 注意：业务级可配置项（菜单显隐 / 数据源顺序等）的「最终生效值」在
// src/store/appConfig.ts 中合并了 Supabase app_config 表的远程覆盖，
// 这里 DEFAULT_SETTINGS 仅作为本地兜底默认值。
// =====================================================================

// 底部 Tab 键（与 src/pages/index/index.vue / AppTabBar 对应）
export type TabKey = "market" | "watch" | "community" | "profile";

// 数据源唯一标识（与 src/api/sources/* 的实现一一对应）
export type SourceId = "eastmoney" | "tencent" | "sina" | "proxy";

// 数据接口类型
export type DataKind = "realtime" | "kline" | "trend" | "flow" | "search" | "news";

// 菜单配置：每类 Tab 是否启用（false = 底部导航隐藏、入口一并隐藏）
export type MenuConfig = Record<TabKey, boolean>;

// 数据源配置：每类数据接口的 provider 优先级列表（从左到右，首级失效自动切下级）
export type SourceConfig = Record<DataKind, SourceId[]>;

export interface AppSettings {
  menus: MenuConfig;
  sources: SourceConfig;
}

// 本地默认配置（无 Supabase 远程覆盖时生效）
export const DEFAULT_SETTINGS: AppSettings = {
  menus: {
    market: true,
    watch: true,
    community: true,
    profile: true,
  },
  // 三级冗余：第一级东财 → 第二级腾讯 → 第三级新浪；
  // 资金流仅东财一家免费提供，第二级为新浪（经 Edge Function 服务端转发）。
  sources: {
    realtime: ["eastmoney", "tencent", "sina"],
    kline: ["eastmoney", "tencent", "sina"],
    trend: ["eastmoney", "tencent", "sina"],
    flow: ["eastmoney", "proxy"],
    search: ["eastmoney", "tencent", "sina"],
    news: ["eastmoney"],
  },
};

export interface AppConfig {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  USE_EDGE_FUNCTIONS: boolean;
}

export const config: AppConfig = {
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || "YOUR-ANON-KEY",
  // 统一后端：行情 / 资金流经 Supabase Edge Function 服务端转发（东财已验证可访问）。
  // 失败时 transport 自动回退 JSONP / 直连 / 公共代理，业务无感知。
  USE_EDGE_FUNCTIONS: String(import.meta.env.VITE_USE_EDGE_FUNCTIONS ?? "true") !== "false",
};

export const isSupabaseConfigured = !!(
  config.SUPABASE_URL &&
  !config.SUPABASE_URL.includes("YOUR-PROJECT") &&
  config.SUPABASE_ANON_KEY &&
  !config.SUPABASE_ANON_KEY.includes("YOUR-ANON")
);

export default config;
