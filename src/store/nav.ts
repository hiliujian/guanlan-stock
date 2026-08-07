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

/**
 * 登录成功后的可靠跳转：
 * - 若登录页是通过 navigateTo 进入（页面栈存在上一页，如「我的」），优先 navigateBack
 *   回到来源页，并保留 fail 兜底 reLaunch 首页；
 * - 若登录页是栈底（App 启动未登录被 reLaunch 进来、或直接刷新登录页 URL），
 *   直接 reLaunch 到首页。
 *
 * 关键修复：uni.navigateBack 在 H5 栈底时既不成功也不触发 fail 回调（history.back()
 * 离站或空 history），会卡在登录页造成「登录成功却不跳转」。用 getCurrentPages()
 * 显式判断栈深度，规避该跨端不可靠行为。
 */
export function goAfterAuth() {
  const pages = getCurrentPages();
  if (pages && pages.length > 1) {
    uni.navigateBack({ fail: () => uni.reLaunch({ url: "/pages/index/index" }) });
  } else {
    uni.reLaunch({ url: "/pages/index/index" });
  }
}

/** 注册 / 找回密码等「终点动作」成功后直接进首页（不回退来源）。带 fail 兜底。 */
export function goHome() {
  uni.reLaunch({
    url: "/pages/index/index",
    fail: () => uni.navigateTo({ url: "/pages/index/index" }),
  });
}

export function openInMarket(code: string, market: Market = "auto") {
  navState.pendingCode = code;
  navState.pendingMarket = market;
}
