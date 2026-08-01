/// <reference types="vite/client" />
// =====================================================================
// 运行期配置（跨端统一）
// - 优先读取 Vite 环境变量（VITE_ 前缀，构建/托管平台注入）
// - 其次回退到下方占位值（本地开发直接改这里即可）
// =====================================================================

// 微信小程序端无法读取浏览器全局变量，因此统一使用环境变量/本文件常量。
// 重要：必须写成 import.meta.env.VITE_* 的「字面量」形式，Vite 才会在编译期
// 把真实值静态内联进产物；若先存进变量再访问（ENV.VITE_*），不会被替换，
// 只能依赖运行时 import.meta.env 对象，容易在个别构建/平台下取不到值。
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
  !config.SUPABASE_URL.includes("YOUR-PROJECT")
);

export default config;
