// =====================================================================
// 全局页面访问守卫（中间件层）
// 两层统一拦截，判定逻辑全部收敛到 access.canAccess()，避免分叉：
//   1) installNavGuards()：注册 uni.addInterceptor 拦截所有 navigateTo / redirectTo /
//      reLaunch / switchTab，未授权页面的目标被重写为登录页（覆盖深层链接、菜单跳转等）。
//   2) usePageGuard(route)：页面 / Tab 视图 setup 中调用一次，作为 onShow / onActivated
//      的安全网（keep-alive Tab 不触发 uni 导航，拦截器抓不到，需这里兜底）。
// 两层的「去登录」永远放行，否则会拦截「去登录」自身造成死循环。
// =====================================================================
import { watch, onActivated } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { userState, useUser } from "@/store/user";
import { canAccess, isRouteOpen } from "@/store/access";
import { redirectToLogin } from "@/store/nav";

const AUTH_ROUTES = new Set([
  "pages/auth/login",
  "pages/auth/register",
  "pages/auth/reset",
  "pages/index/index", // 首页宿主恒开放，否则会拦截登录成功后的回跳
]);

// 当前栈顶页面 route（用于防循环：已在登录页则不重复跳转）
function currentTopRoute(): string | null {
  const pages = getCurrentPages();
  const top = pages && pages.length ? pages[pages.length - 1] : null;
  return (top as any)?.route ?? null;
}

function isAuthRoute(path: string): boolean {
  return AUTH_ROUTES.has(path);
}

/**
 * 页面级安全网守卫。在视图 / 页面 <script setup> 顶部调用一次即可。
 * 每次 onShow / onActivated 判定：未授权 → 跳转登录页（带防循环）；
 * 额外 watch 登录态：登录态丢失（如登出）且本页非公开 → 立即跳转登录页。
 */
export function usePageGuard(route: string) {
  useUser();
  let redirected = false;

  function check() {
    if (redirected) return; // 本实例已发起过跳转（防 onShow + onActivated 双触发）
    if (canAccess(route)) {
      redirected = false; // 允许则清除标记，允许下次再次判定
      return;
    }
    // 已在登录 / 注册 / 找回页 → 不再跳转（防循环）
    const top = currentTopRoute();
    if (top && isAuthRoute(top)) return;
    redirected = true;
    redirectToLogin(route);
  }

  onShow(check);
  onActivated(check);

  // 登录态变化（如登出）后：若当前页非公开，主动跳转登录页
  watch(
    () => userState.loggedIn,
    (li) => {
      if (!li && !isRouteOpen(route)) check();
    }
  );
}

/**
 * 注册全局导航拦截器（幂等，仅执行一次）。
 * 任何 uni 导航调用（含深层链接、菜单跳转）在 invoke 阶段即被改写目标：
 * 未授权（closed + 未登录）→ 重写为登录页；已登录或开放页 → 放行。
 */
let installed = false;
export function installNavGuards() {
  if (installed) return;
  installed = true;

  const methods = ["navigateTo", "redirectTo", "reLaunch", "switchTab"] as const;
  for (const method of methods) {
    uni.addInterceptor(method, {
      invoke(args: any) {
        const url: string | undefined = args?.url;
        if (!url) return args;
        const path = url.split("?")[0].replace(/^\/+/, "");
        // 登录 / 注册 / 找回 / 首页宿主永远放行
        if (isAuthRoute(path)) return args;
        // 未授权 → 重写目标为登录页（保留来源路由，便于后续回跳）
        if (!canAccess(path)) {
          const redirect = path.startsWith("pages/") ? path : "";
          args.url = (() => {
            let u = "/pages/auth/login";
            if (redirect) u += "?redirect=" + encodeURIComponent(redirect);
            return u;
          })();
        }
        return args;
      },
    });
  }
}
