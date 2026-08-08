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
import { canAccess } from "@/store/access";

export const navState = reactive<{
  pendingCode: string;
  pendingMarket: Market;
}>({
  pendingCode: "",
  pendingMarket: "auto",
});

export const navTab = reactive<{ currentKey: TabKey }>({ currentKey: "market" });

/**
 * 吞掉 uni 导航 Promise 的良性拒绝（如「Navigation cancelled / interrupted」——
 * 多由并发导航互相取消引起），避免控制台「Uncaught (in promise)」噪声；
 * 真实失败（URL 非法等）仍 warn 出来便于排查。
 */
function swallow(p: any): void {
  if (p && typeof p.catch === "function") {
    p.catch((e: any) => {
      const msg = (e && (e.errMsg || e.message)) || "";
      if (!/cancel|interrupt|navigateTo:fail|redirectTo:fail|reLaunch:fail/i.test(msg)) {
        console.warn("[nav] 导航异常:", msg || e);
      }
    });
  }
}

/**
 * 跳转登录页（带可选返回目标，供登录成功后回跳）。
 * - 优先 reLaunch 到登录页（关闭所有页面，避免返回键回到受限页）；
 * - 带 fail 兜底 navigateTo（极端环境 reLaunch 不可用时）。
 * - 不拦截：登录 / 注册 / 找回本身永远可达，否则会拦截「去登录」自身造成死循环。
 */
export function redirectToLogin(redirect?: string) {
  let url = "/pages/auth/login";
  if (redirect) url += "?redirect=" + encodeURIComponent(redirect);
  swallow(
    uni.reLaunch({
      url,
      fail: () => swallow(uni.navigateTo({ url })),
    })
  );
}

/**
 * 切换底部 Tab（key 驱动，仅更新 navTab.currentKey）。
 * - 目标 Tab 被远程菜单配置关闭（menus.<key>=false）时忽略该次切换；
 * - 目标 Tab 未对游客开放（白名单 open=false）且用户未登录 → 跳转登录页拦截，
 *   不再由各页自身 onActivated 重复处理（统一收敛到全局守卫）。
 *   已登录用户访问任何 Tab 均放行（白名单只约束游客公开访问）。
 */
export function goTab(key: TabKey) {
  if (!isTabEnabled(key)) return;
  if (!canAccess(key)) {
    redirectToLogin(key);
    return;
  }
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
    swallow(
      uni.navigateBack({
        fail: () => swallow(uni.reLaunch({ url: "/pages/index/index" })),
      })
    );
  } else {
    swallow(uni.reLaunch({ url: "/pages/index/index" }));
  }
}

/** 注册 / 找回密码等「终点动作」成功后直接进首页（不回退来源）。带 fail 兜底。 */
export function goHome() {
  swallow(
    uni.reLaunch({
      url: "/pages/index/index",
      fail: () => swallow(uni.navigateTo({ url: "/pages/index/index" })),
    })
  );
}

/**
 * 已登录用户访问认证页（登录 / 注册 / 找回）时重定向到「我的」。
 * - 设置全局 tab 为 profile（「我的」），并 reLaunch 首页：
 *   reLaunch 会关闭所有页面，等价于 replace 语义，返回键不会再回到被关闭的登录页。
 * - 带 fail 兜底 navigateTo（极端环境 reLaunch 不可用时）。
 */
export function goToProfile() {
  navTab.currentKey = "profile";
  swallow(
    uni.reLaunch({
      url: "/pages/index/index",
      fail: () => swallow(uni.navigateTo({ url: "/pages/index/index" })),
    })
  );
}

export function openInMarket(code: string, market: Market = "auto") {
  navState.pendingCode = code;
  navState.pendingMarket = market;
}
