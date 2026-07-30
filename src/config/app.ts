// =====================================================================
// 运行期配置（跨端统一）
// - 优先读取 Vite 环境变量（VITE_ 前缀，构建/托管平台注入）
// - 其次回退到下方占位值（本地开发直接改这里即可）
// =====================================================================

// 微信小程序端无法读取浏览器全局变量，因此统一使用环境变量/本文件常量。
const ENV = (import.meta as any)?.env || {};

export interface AppConfig {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  // 是否通过 Supabase Edge Function 代理行情（默认 false）
  USE_EDGE_FUNCTIONS: boolean;
  // 自带的行情代理服务地址（同源或独立域名）。留空则由前端自动回退到公共 CORS 代理。
  // 例如本地起 server/index.js 后设为 http://localhost:8787
  API_PROXY: string;
}

export const config: AppConfig = {
  SUPABASE_URL: ENV.VITE_SUPABASE_URL || "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: ENV.VITE_SUPABASE_ANON_KEY || "YOUR-ANON-KEY",
  USE_EDGE_FUNCTIONS:
    ENV.VITE_USE_EDGE_FUNCTIONS != null
      ? ENV.VITE_USE_EDGE_FUNCTIONS === "true" || ENV.VITE_USE_EDGE_FUNCTIONS === true
      : false,
  API_PROXY: ENV.VITE_API_PROXY || "",
};

export const isSupabaseConfigured = !!(
  config.SUPABASE_URL &&
  !config.SUPABASE_URL.includes("YOUR-PROJECT")
);

export default config;
