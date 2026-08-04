// =====================================================================
// UI 桥接 store（跨端）：用于视图间解耦通信
//  - openAuth：跳转到独立登录 / 注册页
//  - goTab：底部 Tab 切换（key 驱动，仅设置 navTab.currentKey）；
//           目标 Tab 被系统配置关闭时忽略（保持当前页）。
//           「自选 / 社区」未登录时由各页自身 onActivated 自动跳转登录页
//  - pendingCode / pendingMarket：从「自选」页点击某只股票跳转到「行情」页
// =====================================================================
import { reactive } from "vue";
import type { Market } from "@/utils/period";
import type { TabKey } from "@/config/app";
import { isTabEnabled } from "@/store/appConfig";

export const navState = reactive<{
  pendingCode: string;
  pendingMarket: Market;
}>({
  pendingCode: "",
  pendingMarket: "auto",
});

export const navTab = reactive<{ currentKey: TabKey }>({ currentKey: "market" });

/**
 * 切换底部 Tab（key 驱动，仅更新 navTab.currentKey，不做拦截）。
 * 「自选 / 社区」未登录的跳转登录页逻辑由各页自身的 onActivated 处理。
 * 目标 Tab 被远程配置关闭（menus.<key>=false）时忽略该次切换。
 */
export function goTab(key: TabKey) {
  if (!isTabEnabled(key)) return;
  navTab.currentKey = key;
}

export function openAuth(mode: "login" | "register" = "login") {
  uni.navigateTo({ url: `/pages/auth/${mode}` });
}

export function openInMarket(code: string, market: Market = "auto") {
  navState.pendingCode = code;
  navState.pendingMarket = market;
}
