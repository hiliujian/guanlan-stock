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
  globalOrder?: number; // 「全部」视图排序权重（对应 DB global_sort_order）；与分组内 order 互相独立
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

// 取「目标分组内」当前最大的 sort_order，+1 作为新项在该分组内的排序权重。
// 设计：order 是「分组内」权重（各分组各自从 0 起算，不跨分组比较），仅用于单分组视图。
// 「全部」视图的展示序由独立的 globalOrder 决定（见视图 filteredList，未拖拽时回落 created_at），
// 与 order 互不干扰。移入某分组时 order = 组内最大+1，即按「加入该分组的时间」追加到目标分组末尾。
function nextGroupOrder(grp: string): number {
  let m = -1;
  for (const i of state.items) {
    if ((i.group || "") === grp && (i.order ?? 0) > m) m = i.order as number;
  }
  return m + 1;
}

// 内存默认序：创建时间 → 分组内 order → 分组名。该序仅作内存兜底（如本地模式列表维护）；
// 视图展示由 filteredList 决定——单分组按 order，全部视图按独立字段 globalOrder（见视图）。
// 移组不改 created_at，个体在「全部」中位置基本稳定。
function sortItems(items: WatchItem[]): WatchItem[] {
  return items.slice().sort((a, b) => {
    const ca = a.created_at || "";
    const cb = b.created_at || "";
    if (ca !== cb) return ca < cb ? -1 : 1;
    const oa = a.order ?? 0;
    const ob = b.order ?? 0;
    if (oa !== ob) return oa - ob;
    return (a.group || "").localeCompare(b.group || "");
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
        globalOrder: typeof d.global_sort_order === "number" ? d.global_sort_order : undefined,
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
function unsubscribeWatchlistRealtime() {
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
  const order = nextGroupOrder(grp);
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

/** 将某只自选移动到其它分组：改写 group_name，并将其「分组内排序权重」order 重置为
 *  目标分组内当前的「最大 order + 1」——即按「加入该分组的时间」追加到目标分组末尾，
 *  满足「目标分组内项目按加入顺序排列」的诉求。
 *  云：按 id 更新 group_name + 新 sort_order；本地：打补丁并就地重排后重存。 */
export async function setItemGroup(code: string, market: string, group: string): Promise<void> {
  const grp = group || "";
  const target = state.items.find((i) => i.code === code && i.market === market);
  if (!target) return;
  const order = nextGroupOrder(grp); // 追加到目标分组末尾：组内最大 order + 1（加入该分组的时间顺序）
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
 * 拖拽重排：传入目标范围（具体分组名 / "" 默认分组 / "__all__" 全部视图）与该范围内
 * 重排后的可见键顺序（code|market），将对应项的排序权重连续重编为 0..n 并持久化。
 * 两套权重彼此独立，确保「各分组的顺序互相不影响」：
 * - 单分组视图（group 为具体分组名或 ""）：仅修改该分组的「分组内权重」order
 *   （对应 DB sort_order），不影响其它分组，也不触碰「全部」视图的全局顺序。
 * - 全部视图（group === "__all__"）：仅修改「全局权重」globalOrder
 *   （对应 DB global_sort_order），不影响任何分组的内部顺序。
 */
export async function applyGroupOrder(group: string, orderedKeys: string[]): Promise<void> {
  const grp = group || "";
  const global = group === "__all__";
  const idxByKey = new Map<string, number>();
  orderedKeys.forEach((k, i) => idxByKey.set(k, i));

  // 单选范围：全局重排作用于所有 orderedKeys 内的项；单分组重排仅作用于该分组内的项。
  // 写入字段彼此独立（globalOrder vs order），互不污染。
  const newValByKey = new Map<string, number>();
  state.items
    .filter((i) =>
      global ? idxByKey.has(`${i.code}|${i.market}`) : (i.group || "") === grp
    )
    .sort(
      (a, b) =>
        (idxByKey.get(`${a.code}|${a.market}`) ?? 0) -
        (idxByKey.get(`${b.code}|${b.market}`) ?? 0)
    )
    .forEach((i, n) => {
      newValByKey.set(`${i.code}|${i.market}`, n);
    });

  state.items = state.items.map((i) => {
    const k = `${i.code}|${i.market}`;
    if (!newValByKey.has(k)) return i;
    return global
      ? { ...i, globalOrder: newValByKey.get(k)! }
      : { ...i, order: newValByKey.get(k)! };
  });

  if (state.mode === "cloud" && userState.userId) {
    const sb = getSupabase()!;
    const col = global ? "global_sort_order" : "sort_order";
    const pick = (i: WatchItem) => (global ? i.globalOrder : i.order) ?? 0;
    await Promise.all(
      state.items
        .filter(
          (i) =>
            newValByKey.has(`${i.code}|${i.market}`) &&
            (global || (i.group || "") === grp) &&
            !!i.id
        )
        .map((i) => sb.from("watchlists").update({ [col]: pick(i) }).eq("id", i.id))
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
