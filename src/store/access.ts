// =====================================================================
// 页面白名单 store（全局页面访问拦截的数据层）
// - accessState：响应式白名单表（路径 → 元数据），组件 watch 后自动响应远程变更；
// - initPageAccess：应用启动时拉取 Supabase page_access 并合并内置默认（幂等 + TTL 缓存，
//   避免每次导航都打库）；未建表 / 未配后端时回退到内置默认白名单，应用照常运行；
// - isRouteOpen / showInMenu / canAccess：拦截判定助手。
//
// 拦截语义（见需求）：除「明确开放」的页面外，所有页面拦截「未登录」用户并跳转登录页。
//   - open（白名单开关）= true：游客可见，人人可访问；
//   - open = false（未开放）+ 未登录：拦截 → 跳转登录页；
//   - open = false + 已登录：放行（白名单只约束游客公开访问，登录用户不二次限制）。
// 该语义由 canAccess() 统一实现，拦截器层与页面守卫层共用，避免逻辑分叉。
// =====================================================================
import { reactive } from "vue";
import { getSupabase, isSupabaseConfigured } from "@/api/supabase";
import { fetchPageAccess, type PageAccessRow } from "@/config/remote";
import { userState } from "@/store/user";

// 单条白名单元数据
interface AccessMeta {
  path: string;
  open: boolean;
  showInMenu: boolean;
  sortWeight: number;
  extra: Record<string, unknown>;
  isTab: boolean;
}

// 内置默认白名单：本地兜底（无 Supabase / 未建表时生效）。
// 当前需求：仅「行情」开放，其余全部拦截（auth 页与首页宿主恒开放，否则会拦截「去登录」自身）。
const BUILTIN_ACCESS: Record<string, AccessMeta> = {
  market: { path: "market", open: true, showInMenu: true, sortWeight: 10, extra: {}, isTab: true },
  "pages/auth/login": { path: "pages/auth/login", open: true, showInMenu: false, sortWeight: 0, extra: {}, isTab: false },
  "pages/auth/register": { path: "pages/auth/register", open: true, showInMenu: false, sortWeight: 0, extra: {}, isTab: false },
  "pages/auth/reset": { path: "pages/auth/reset", open: true, showInMenu: false, sortWeight: 0, extra: {}, isTab: false },
  "pages/index/index": { path: "pages/index/index", open: true, showInMenu: false, sortWeight: 0, extra: {}, isTab: false },
  watch: { path: "watch", open: false, showInMenu: true, sortWeight: 20, extra: {}, isTab: true },
  community: { path: "community", open: false, showInMenu: true, sortWeight: 30, extra: {}, isTab: true },
  profile: { path: "profile", open: false, showInMenu: true, sortWeight: 40, extra: {}, isTab: true },
  "pages/settings/settings": { path: "pages/settings/settings", open: false, showInMenu: false, sortWeight: 0, extra: {}, isTab: false },
  "pages/profile/edit": { path: "pages/profile/edit", open: false, showInMenu: false, sortWeight: 0, extra: {}, isTab: false },
  "pages/profile/security": { path: "pages/profile/security", open: false, showInMenu: false, sortWeight: 0, extra: {}, isTab: false },
  "pages/profile/level": { path: "pages/profile/level", open: false, showInMenu: false, sortWeight: 0, extra: {}, isTab: false },
  /* 协议页对游客开放：登录页脚可点击查看，未登录亦不被拦截（fail-closed 不应误拦协议） */
  "pages/legal/terms": { path: "pages/legal/terms", open: true, showInMenu: false, sortWeight: 0, extra: {}, isTab: false },
  "pages/legal/privacy": { path: "pages/legal/privacy", open: true, showInMenu: false, sortWeight: 0, extra: {}, isTab: false },
};

// 缓存 TTL：远程白名单 5 分钟内不重复拉取，导航时直接读内存（满足「缓存减少查询」）。
const TTL = 5 * 60 * 1000;

// 内置默认 → Map（模块加载即铺底，避免 initPageAccess 异步返回前 entries 为空导致误拦）
function builtinEntries(): Map<string, AccessMeta> {
  const m = new Map<string, AccessMeta>();
  for (const [k, v] of Object.entries(BUILTIN_ACCESS)) m.set(k, { ...v });
  return m;
}

const accessState = reactive<{
  ready: boolean;
  entries: Map<string, AccessMeta>;
}>({
  ready: false,
  entries: builtinEntries(),
});

let initialized = false;
let lastFetched = 0;

// 路由标准化：去 query、去前导 "/"，与内置 / 数据库 path 一致
function normalizeRoute(route: string): string {
  return route.split("?")[0].replace(/^\/+/, "");
}

function rowToMeta(r: PageAccessRow): AccessMeta {
  return {
    path: normalizeRoute(r.path),
    open: r.open,
    showInMenu: r.show_in_menu,
    sortWeight: r.sort_weight,
    extra: r.extra ?? {},
    isTab: r.is_tab,
  };
}

/**
 * 初始化页面白名单（幂等）。
 * - 先以内置默认铺底；
 * - 已配置 Supabase 时拉取远程表，逐条覆盖内置（远程为准）；未建表 / 异常则静默保留内置；
 * - TTL 内不重复拉取（导航读内存即可）。
 */
export async function initPageAccess(): Promise<void> {
  const now = Date.now();
  if (initialized && now - lastFetched < TTL) return;
  initialized = true;

  const merged = builtinEntries();

  if (isSupabaseConfigured) {
    const sb = getSupabase();
    if (sb) {
      try {
        const rows = await fetchPageAccess();
        for (const r of rows) {
          const meta = rowToMeta(r);
          merged.set(meta.path, meta);
        }
      } catch {
        // 远程不可用 → 维持内置默认，静默降级
      }
    }
  }

  accessState.entries = merged;
  accessState.ready = true;
  lastFetched = now;
}

/** 路由是否对游客开放（白名单开关）。未登记路由默认 false（fail-closed：未开放即拦截）。 */
export function isRouteOpen(route: string): boolean {
  const e = accessState.entries.get(normalizeRoute(route));
  return e ? e.open : false;
}

/** 路由是否应在导航 / 菜单中展示（底部 Tab 栏 / 各页菜单过滤用）。 */
export function showInMenu(route: string): boolean {
  const e = accessState.entries.get(normalizeRoute(route));
  return e ? e.showInMenu : false;
}

/**
 * 统一访问判定（拦截器层与页面守卫层共用）：
 * - 游客开放（open）→ 放行；
 * - 未配置后端（无登录能力）→ 全开放，避免离线 / 游客模式被锁死（与既有 needLogin
 *   仅在校验 supabaseEnabled 时拦截的语义保持一致）；
 * - 已登录（无论 open）→ 放行；
 * - 未开放 + 未登录 → 拦截（返回 false，调用方跳转登录页）。
 */
export function canAccess(route: string): boolean {
  if (isRouteOpen(route)) return true;
  if (!isSupabaseConfigured) return true;
  if (userState.loggedIn) return true;
  return false;
}
