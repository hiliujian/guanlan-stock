// =====================================================================
// 运行时配置 store（本地默认 + 远程覆盖的合成结果）
// - runtimeConfig：响应式配置，组件 watch 后自动响应「远程改配置」后的变化；
// - initAppConfig：应用启动时拉取 Supabase app_config 并合并（幂等，只执行一次）；
// - isTabEnabled / enabledTabs：菜单显隐查询助手。
// 注：数据源顺序由后端 Edge Function 网关统一管理，前端不再持有。
// =====================================================================
import { reactive } from "vue";
import { DEFAULT_SETTINGS, type AppSettings, type TabKey } from "@/config/app";
import { fetchRemoteSettings } from "@/config/remote";

// 深拷贝本地默认值，避免被远程覆盖污染 DEFAULT_SETTINGS 常量
export const runtimeConfig = reactive<AppSettings>(
  JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as AppSettings
);

let initialized = false;

export async function initAppConfig(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    const remote = await fetchRemoteSettings();
    if (remote.menus) {
      for (const k of Object.keys(remote.menus) as TabKey[]) {
        runtimeConfig.menus[k] = remote.menus[k];
      }
    }
  } catch {
    // 远程配置不可用（未建表 / 网络异常）→ 维持本地默认，静默降级
  }
}

export function isTabEnabled(key: TabKey): boolean {
  return runtimeConfig.menus[key];
}

// 已启用的 Tab 列表（按固定顺序，过滤被关闭的模块）
export function enabledTabs(): TabKey[] {
  return (["market", "watch", "community", "profile"] as TabKey[]).filter(
    (k) => runtimeConfig.menus[k]
  );
}
