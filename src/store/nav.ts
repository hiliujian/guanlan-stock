// =====================================================================
// UI 桥接 store（跨端）：用于视图间解耦通信
//  - openAuth：跳转到独立登录 / 注册页
//  - goTab：底部 Tab 切换（仅设置 navTab.current，不做拦截）；
//           「自选 / 社区」未登录时由各页自身 onActivated 自动跳转登录页
//  - pendingCode / pendingMarket：从「自选」页点击某只股票跳转到「行情」页
// =====================================================================
import { reactive } from "vue";
import type { Market } from "@/utils/period";

export const navState = reactive<{
  pendingCode: string;
  pendingMarket: Market;
}>({
  pendingCode: "",
  pendingMarket: "auto",
});

export const navTab = reactive({ current: 0 });

/**
 * 切换底部 Tab（仅更新 navTab.current，不做拦截）。
 * 「自选 / 社区」未登录的跳转登录页逻辑由各页自身的 onActivated 处理。
 */
export function goTab(i: number) {
  navTab.current = i;
}

export function openAuth(mode: "login" | "register" = "login") {
  uni.navigateTo({ url: `/pages/auth/${mode}` });
}

export function openInMarket(code: string, market: Market = "auto") {
  navState.pendingCode = code;
  navState.pendingMarket = market;
}
