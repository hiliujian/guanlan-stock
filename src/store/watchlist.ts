// =====================================================================
// 自选股 store（跨端响应式单例）
// - 已登录：数据来自 Supabase（watchlists 表），并订阅 Realtime
// - 未登录 / 无 Supabase：降级到本地 Storage，保证功能可用
// =====================================================================
import { reactive, readonly } from "vue";
import { getSupabase } from "@/api/supabase";
import { translateSupabaseError } from "@/api/auth";
import { userState } from "./user";

/** 价格预警配置：高于 / 低于某价触发（任一为 null 表示该方向不监控） */
export interface PriceAlert {
  above?: number | null;
  below?: number | null;
}

export interface WatchItem {
  id?: string;
  code: string;
  market: string;
  name: string;
  note: string;
  group?: string; // 分组名，'' = 默认分组
  order?: number; // 分组内自定义排序权重（对应 DB sort_order）；本地模式同样保留
  alerts?: PriceAlert; // 价格预警配置
  created_at?: string;
}

interface WatchState {
  items: WatchItem[];
  loading: boolean;
  mode: "cloud" | "local";
}

const LOCAL_KEY = "stock_analyzer_watchlist_local";

const state = reactive<WatchState>({
  items: [],
  loading: false,
  mode: "local",
});

function loadLocal(): WatchItem[] {
  try {
    return uni.getStorageSync(LOCAL_KEY) || [];
  } catch (e) {
    return [];
  }
}
function saveLocal(items: WatchItem[]) {
  try {
    uni.setStorageSync(LOCAL_KEY, items);
  } catch (e) {
    /* ignore */
  }
}

// 取当前全部自选里最大的 sort_order，+1 作为新项的全局唯一排序权重。
// 设计：order 为全局唯一（不按分组各自从 0 起算），「全部」视图即按此全局序展示；
// 移入/移出分组只改 group 不改 order，故个股在「全部」中的位置保持稳定、不会跳到末尾。
function nextGroupOrder(): number {
  let m = 0;
  for (const i of state.items) {
    if ((i.order ?? 0) > m) m = i.order as number;
  }
  return m + 1;
}

// 内存数组按「全局 sort_order → 创建时间」稳定排序。
// 说明：order 是全局唯一权重（不按分组聚类）；「全部」视图直接以本序展示，
// 因此移入/移出分组只改 group、不动 order，个股在「全部」中的位置保持稳定、
// 不会因重新聚类而被推到列表末尾。
function sortItems(items: WatchItem[]): WatchItem[] {
  return items.slice().sort((a, b) => {
    const oa = a.order ?? 0;
    const ob = b.order ?? 0;
    if (oa !== ob) return oa - ob;
    return (a.created_at || "").localeCompare(b.created_at || "");
  });
}

async function loadCloud(userId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const { data, error } = await sb
    .from("watchlists")
    .select("*")
    .eq("user_id", userId)
    // 登录同步恢复完整自选逻辑：先按分组、再按分组内自定义排序、最后创建时间兜底
    .order("group_name", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (!error && data) {
    state.items = sortItems(
      data.map((d: any) => ({
        id: d.id,
        code: d.code,
        market: d.market,
        name: d.name,
        note: d.note || "",
        group: d.group_name || "",
        order: typeof d.sort_order === "number" ? d.sort_order : 0,
        alerts: parseAlerts(d.alerts),
        created_at: d.created_at,
      }))
    );
  }
}

// 当前活跃的 Realtime channel（保活引用，避免多次 initWatchlist 堆叠多个订阅）
let realtimeChannel: any = null;

function subscribeRealtime(userId: string) {
  const sb = getSupabase();
  if (!sb) return;
  // 先清掉旧 channel，避免重复 init 时堆叠多个订阅导致重复回调
  if (realtimeChannel) {
    try {
      sb.removeChannel(realtimeChannel);
    } catch {
      /* ignore */
    }
    realtimeChannel = null;
  }
  // 小程序端实时依赖 WebSocket，环境不支持时静默降级（手动刷新即可）
  try {
    realtimeChannel = sb
      .channel("watchlists-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watchlists", filter: `user_id=eq.${userId}` },
        () => loadCloud(userId)
      )
      .subscribe();
  } catch (e) {
    /* ignore */
  }
}

/** 取消自选 Realtime 订阅（登出 / 切到本地模式 / 应用卸载时调用，防止 channel 泄漏） */
export function unsubscribeWatchlistRealtime() {
  const sb = getSupabase();
  if (sb && realtimeChannel) {
    try {
      sb.removeChannel(realtimeChannel);
    } catch {
      /* ignore */
    }
    realtimeChannel = null;
  }
}

export function useWatchlist() {
  return readonly(state);
}

export async function initWatchlist() {
  state.loading = true;
  if (userState.loggedIn && userState.userId && getSupabase()) {
    state.mode = "cloud";
    await loadCloud(userState.userId);
    subscribeRealtime(userState.userId);
  } else {
    unsubscribeWatchlistRealtime();
    state.mode = "local";
    state.items = loadLocal();
  }
  state.loading = false;
}

export async function addWatch(item: WatchItem): Promise<{ ok: boolean; error?: string }> {
  const grp = item.group || "";
  const order = nextGroupOrder();
  if (state.mode === "cloud" && userState.userId) {
    const sb = getSupabase()!;
    const { error } = await sb.from("watchlists").insert({
      user_id: userState.userId,
      code: item.code,
      market: item.market,
      name: item.name,
      note: item.note || "",
      group_name: grp,
      sort_order: order,
    });
    if (error) return { ok: false, error: translateSupabaseError(error.message) };
    await loadCloud(userState.userId);
  } else {
    const next = sortItems([
      { ...item, group: grp, order },
      ...state.items.filter((i) => !(i.code === item.code && i.market === item.market)),
    ]);
    state.items = next;
    saveLocal(next);
  }
  return { ok: true };
}

// 仅保留有限、合法的预警数值；非数 / 空 → null（关闭该方向）
function parseAlerts(raw: any): PriceAlert | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const above = typeof raw.above === "number" && isFinite(raw.above) ? raw.above : null;
  const below = typeof raw.below === "number" && isFinite(raw.below) ? raw.below : null;
  if (above == null && below == null) return undefined;
  return { above, below };
}
// 出库→入库的预警字段归一（写入 DB 的 jsonb；列定义 NOT NULL，故空配置返回 {} 而非 null）
function toAlertJson(a?: PriceAlert): any {
  if (!a) return {};
  const above = typeof a.above === "number" && isFinite(a.above) ? a.above : null;
  const below = typeof a.below === "number" && isFinite(a.below) ? a.below : null;
  if (above == null && below == null) return {};
  return { above, below };
}

/** 将某只自选移动到其它分组：只改 group_name，保留其全局排序权重 order 不变。
 *  因为 order 是全局唯一的（详见 sortItems），移入/移出分组不会改变个股在「全部」视图中的
 *  位置——这正是修复「在全部中把某股移入分组后它跑到列表末尾」的根因：旧实现会把 order 重置为
 *  nextGroupOrder(grp)，等于把它沉到目标分组 + 全部列表的末尾。
 *  云：按 id 更新 group_name（sort_order 一并写回原值，避免漂移）；本地：打补丁并重存。 */
export async function setItemGroup(code: string, market: string, group: string): Promise<void> {
  const grp = group || "";
  const target = state.items.find((i) => i.code === code && i.market === market);
  if (!target) return;
  const order = target.order ?? 0; // 保留原全局排序权重：移组不改序，全部视图位置稳定
  await patchItem(code, market, { group_name: grp, sort_order: order });
  if (state.mode !== "cloud") {
    state.items = sortItems(
      state.items.map((i) =>
        i.code === code && i.market === market ? { ...i, group: grp, order } : i
      )
    );
    saveLocal(state.items);
  }
}

/**
 * 拖拽重排：传入目标分组与该分组内重排后的可见键顺序（code|market），
 * 仅重排该分组内的 sort_order 并持久化（云：批量按 id 更新；本地：重存）。
 * - 单分组视图：group 为分组名，仅重排该分组内顺序（"组内排序"语义）。
 * - "全部"视图：group 传 "*"，忽略分组维度、对整个列表整体重排并持久化。
 * 登录后自动同步：排序权重写入 watchlists.sort_order，恢复时按 group_name + sort_order 还原。
 */
export async function applyGroupOrder(group: string, orderedKeys: string[]): Promise<void> {
  const all = group === "*";
  const grp = group || "";
  const idxByKey = new Map<string, number>();
  orderedKeys.forEach((k, i) => idxByKey.set(k, i));

  // 计算重排后的「全局键序列」：
  // - "全部"视图（group="*"）：直接按传入的整体顺序重排整个列表。
  // - 单分组视图：仅在该分组占用的「槽位」内按新顺序重排，保持与其它分组项的相对位置，
  //   避免单分组内拖拽后，这些项因 order 被重置为 0..n 而整体跳到「全部」列表顶部。
  let newKeyOrder: string[];
  if (all) {
    newKeyOrder = orderedKeys.slice();
  } else {
    const reorderedGroupKeys = state.items
      .filter((i) => (i.group || "") === grp)
      .map((i) => `${i.code}|${i.market}`)
      .sort((a, b) => (idxByKey.get(a) ?? 0) - (idxByKey.get(b) ?? 0));
    let gi = 0;
    newKeyOrder = state.items.map((i) => {
      const k = `${i.code}|${i.market}`;
      return (i.group || "") === grp ? reorderedGroupKeys[gi++] : k;
    });
  }

  // 依据全局键序列重排：order = 该项在新序列中的索引（全局唯一权重），再按 order 稳定排序。
  const posByKey = new Map(newKeyOrder.map((k, i) => [k, i]));
  state.items = sortItems(
    state.items.map((i) => {
      const k = `${i.code}|${i.market}`;
      if (!posByKey.has(k)) return i;
      return { ...i, order: posByKey.get(k)! };
    })
  );

  if (state.mode === "cloud" && userState.userId) {
    const sb = getSupabase()!;
    const targets = state.items.filter(
      (i) => posByKey.has(`${i.code}|${i.market}`) && !!i.id
    );
    await Promise.all(
      targets.map((i) =>
        sb.from("watchlists").update({ sort_order: i.order ?? 0 }).eq("id", i.id)
      )
    );
  } else {
    saveLocal(state.items);
  }
}

/** 设置某只自选的价格预警（传 undefined 即清空） */
export async function setAlerts(code: string, market: string, alerts?: PriceAlert): Promise<void> {
  const json = toAlertJson(alerts);
  // 乐观更新内存：清除 / 设置预警后立即生效，视图层（如命中闪烁 alertState）能即时反映，
  // 不再依赖云端往返时机（云模式下 patchItem 的 loadCloud 重建为异步，会造成命中态滞后）。
  state.items = state.items.map((i) =>
    i.code === code && i.market === market ? { ...i, alerts: parseAlerts(json) } : i
  );
  await patchItem(code, market, { alerts: json });
  if (state.mode !== "cloud") {
    saveLocal(state.items);
  }
}

// 通用补丁：云模式按 id 更新指定列，本地模式直接在内存数组打补丁（patchItem 负责）
async function patchItem(code: string, market: string, patch: Record<string, any>): Promise<void> {
  const target = state.items.find((i) => i.code === code && i.market === market);
  if (!target) return;
  if (state.mode === "cloud" && userState.userId && target.id) {
    const sb = getSupabase()!;
    const { error } = await sb.from("watchlists").update(patch).eq("id", target.id);
    if (error) {
      uni.showToast({ title: translateSupabaseError(error.message), icon: "none" });
      return;
    }
    await loadCloud(userState.userId);
  }
  // 本地模式由调用方同步到 state.items（避免重复逻辑）；此处仅占位
}

/** 重命名分组（含「默认」外的所有同名项） */
export async function renameGroup(oldName: string, newName: string): Promise<void> {
  if (!oldName || !newName || oldName === newName) return;
  const grp = newName || "";
  if (state.mode === "cloud" && userState.userId) {
    const sb = getSupabase()!;
    await sb
      .from("watchlists")
      .update({ group_name: grp })
      .eq("user_id", userState.userId)
      .eq("group_name", oldName);
    await loadCloud(userState.userId);
  } else {
    state.items = state.items.map((i) => (i.group === oldName ? { ...i, group: grp } : i));
    saveLocal(state.items);
  }
}

/** 删除分组：组内项回退到默认分组 */
export async function deleteGroup(name: string): Promise<void> {
  if (!name) return;
  if (state.mode === "cloud" && userState.userId) {
    const sb = getSupabase()!;
    await sb
      .from("watchlists")
      .update({ group_name: "" })
      .eq("user_id", userState.userId)
      .eq("group_name", name);
    await loadCloud(userState.userId);
  } else {
    state.items = state.items.map((i) => (i.group === name ? { ...i, group: "" } : i));
    saveLocal(state.items);
  }
}

export async function removeWatch(code: string, market: string): Promise<void> {
  if (state.mode === "cloud" && userState.userId) {
    const sb = getSupabase()!;
    const target = state.items.find((i) => i.code === code && i.market === market);
    if (target?.id) await sb.from("watchlists").delete().eq("id", target.id);
    state.items = state.items.filter((i) => !(i.code === code && i.market === market));
  } else {
    const next = state.items.filter((i) => !(i.code === code && i.market === market));
    state.items = next;
    saveLocal(next);
  }
}

export function isWatched(code: string, market: string): boolean {
  return state.items.some((i) => i.code === code && i.market === market);
}
