// =====================================================================
// 自选股 store（跨端响应式单例）
// - 已登录：数据来自 Supabase（watchlists 表），并订阅 Realtime
// - 未登录 / 无 Supabase：降级到本地 Storage，保证功能可用
// =====================================================================
import { reactive, readonly } from "vue";
import { getSupabase } from "@/api/supabase";
import { translateSupabaseError } from "@/api/auth";
import { userState } from "./user";

export interface WatchItem {
  id?: string;
  code: string;
  market: string;
  name: string;
  note: string;
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
  if (state.mode === "cloud" && userState.userId) {
    const sb = getSupabase()!;
    const { error } = await sb.from("watchlists").insert({
      user_id: userState.userId,
      code: item.code,
      market: item.market,
      name: item.name,
      note: item.note || "",
    });
    if (error) return { ok: false, error: translateSupabaseError(error.message) };
    await loadCloud(userState.userId);
  } else {
    const next = [item, ...state.items.filter((i) => !(i.code === item.code && i.market === item.market))];
    state.items = next;
    saveLocal(next);
  }
  return { ok: true };
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
