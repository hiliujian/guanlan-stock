// =====================================================================
// 全局页面访问守卫（中间件层）
// 两层统一拦截，判定逻辑全部收敛到 access.canAccess() / 登录态，避免分叉：
//   1) installNavGuards()：注册 uni.addInterceptor 拦截所有 navigateTo / redirectTo /
//      reLaunch / switchTab：
//      - 已登录用户访问认证页（登录 / 注册 / 找回）→ 前置重写目标为「我的」（用户页面），
//        认证页根本不会被加载（无闪烁），避免重复登录 / 注册；
//      - 未授权页面的目标被重写为登录页（覆盖深层链接、菜单跳转等）。
//   2) usePageGuard(route)：页面 / Tab 视图 setup 中调用一次，作为 onShow / onActivated
//      的安全网（keep-alive Tab 不触发 uni 导航，拦截器抓不到，需这里兜底）。
//   3) 认证页自身另由 useAuthGuard（onLoad/onShow）兜底：直接 URL / 浏览器前进后退等
//      拦截器抓不到的路径，已登录用户也会在页面进入时被踢回「我的」。
// 两层的「去登录」永远放行，否则会拦截「去登录」自身造成死循环。
// =====================================================================
import { watch, onActivated } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { userState, useUser } from "@/store/user";
import { canAccess, isRouteOpen } from "@/store/access";
import { redirectToLogin, navTab } from "@/store/nav";

const AUTH_ROUTES = new Set([
  "pages/auth/login",
  "pages/auth/register",
  "pages/auth/reset",
  "pages/index/index", // 首页宿主恒开放，否则会拦截登录成功后的回跳
]);

// 已登录用户访问这些认证页时应重定向到「我的」（用户页面），避免重复登录 / 注册。
// 需求明确要求登录页 + 注册页；找回密码页一并纳入，因为已登录用户同样无需进入任何认证页。
// 该集合配合下方 installNavGuards 的「前置中间件」拦截：导航 invoke 阶段即改写目标，
// 认证页根本不会被加载（无闪烁），与页面级 useAuthGuard（onLoad/onShow 兜底）构成双重保险。
const AUTH_REDIRECT_ROUTES = new Set([
  "pages/auth/login",
  "pages/auth/register",
  "pages/auth/reset",
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
  useUser(); // 确保登录态监听已就绪（幂等），userState.loggedIn 才能实时反映会话变化

  const methods = ["navigateTo", "redirectTo", "reLaunch", "switchTab"] as const;
  for (const method of methods) {
    uni.addInterceptor(method, {
      invoke(args: any) {
        const url: string | undefined = args?.url;
        if (!url) return args;
        const path = url.split("?")[0].replace(/^\/+/, "");
        // ---- 已登录用户访问认证页 → 前置重定向到「我的」（用户页面） ----
        // 需求：已登录用户访问登录 / 注册页应自动重定向，避免重复登录或注册。
        // 作为全局中间件，在导航 invoke 阶段即改写目标，认证页根本不会被加载（无闪烁）；
        // 与页面级 useAuthGuard（onLoad/onShow 兜底，覆盖浏览器前进/后退等拦截器抓不到的路径）互补。
        if (userState.loggedIn && AUTH_REDIRECT_ROUTES.has(path)) {
          navTab.currentKey = "profile"; // 落到「我的」Tab
          args.url = "/pages/index/index";
          return args;
        }
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
