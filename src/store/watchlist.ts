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

async function loadCloud(userId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const { data, error } = await sb
    .from("watchlists")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (!error && data) {
    state.items = data.map((d: any) => ({
      id: d.id,
      code: d.code,
      market: d.market,
      name: d.name,
      note: d.note || "",
      group: d.group_name || "",
      alerts: parseAlerts(d.alerts),
      created_at: d.created_at,
    }));
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
  if (state.mode === "cloud" && userState.userId) {
    const sb = getSupabase()!;
    const { error } = await sb.from("watchlists").insert({
      user_id: userState.userId,
      code: item.code,
      market: item.market,
      name: item.name,
      note: item.note || "",
      group_name: grp,
    });
    if (error) return { ok: false, error: translateSupabaseError(error.message) };
    await loadCloud(userState.userId);
  } else {
    const next = [
      { ...item, group: grp },
      ...state.items.filter((i) => !(i.code === item.code && i.market === item.market)),
    ];
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

/** 将某只自选移动到其它分组（云：按 id 更新 group_name；本地：打补丁并重存） */
export async function setItemGroup(code: string, market: string, group: string): Promise<void> {
  await patchItem(code, market, { group_name: group || "" });
  if (state.mode !== "cloud") {
    state.items = state.items.map((i) =>
      i.code === code && i.market === market ? { ...i, group: group || "" } : i
    );
    saveLocal(state.items);
  }
}

/** 设置某只自选的价格预警（传 undefined 即清空） */
export async function setAlerts(code: string, market: string, alerts?: PriceAlert): Promise<void> {
  const json = toAlertJson(alerts);
  await patchItem(code, market, { alerts: json });
  if (state.mode !== "cloud") {
    state.items = state.items.map((i) =>
      i.code === code && i.market === market ? { ...i, alerts: parseAlerts(json) } : i
    );
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

export function clearLocal() {
  saveLocal([]);
}
