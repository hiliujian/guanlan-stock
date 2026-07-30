// =====================================================================
// UI 桥接 store（跨端）：用于视图间解耦通信
//  - authVisible：是否弹出登录/注册对话框（来自「我的」页或加自选守卫）
//  - pendingCode / pendingMarket：从「自选」页点击某只股票跳转到「行情」页
//    并自动带入代码开始分析
// 用响应式单例而非全局事件总线，H5 / 微信小程序行为完全一致
// =====================================================================
import { reactive } from "vue";
import type { Market } from "@/utils/period";

export const navState = reactive<{
  authVisible: boolean;
  pendingCode: string;
  pendingMarket: Market;
}>({
  authVisible: false,
  pendingCode: "",
  pendingMarket: "auto",
});

export function openAuth() {
  navState.authVisible = true;
}
export function closeAuth() {
  navState.authVisible = false;
}
export function openInMarket(code: string, market: Market = "auto") {
  navState.pendingCode = code;
  navState.pendingMarket = market;
}
