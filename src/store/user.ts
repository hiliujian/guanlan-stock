// =====================================================================
// 用户态 store（跨端响应式单例）
// 统一管理：登录态、资料、Supabase 会话订阅
// =====================================================================
import { reactive, readonly } from "vue";
import { getSupabase, isSupabaseConfigured } from "@/api/supabase";
import { onAuthChange } from "@/api/auth";

interface Profile {
  id: string;
  display_name: string;
  username: string;
  bio: string;
  avatar_url: string;
}

interface UserState {
  ready: boolean;
  loggedIn: boolean;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  supabaseEnabled: boolean;
}

const state = reactive<UserState>({
  ready: false,
  loggedIn: false,
  userId: null,
  email: null,
  profile: null,
  supabaseEnabled: isSupabaseConfigured,
});

let unsub: (() => void) | null = null;

async function loadProfile(userId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from("profiles").select("*").eq("id", userId).single();
  if (data) {
    state.profile = {
      id: data.id,
      display_name: data.display_name || "",
      username: data.username || "",
      bio: data.bio || "",
      avatar_url: data.avatar_url || "",
    };
  }
}

export function useUser() {
  if (!state.ready) {
    state.ready = true;
    state.supabaseEnabled = isSupabaseConfigured;
    if (isSupabaseConfigured) {
      unsub = onAuthChange(async (user) => {
        if (user) {
          state.loggedIn = true;
          state.userId = user.id;
          state.email = user.email ?? null;
          await loadProfile(user.id);
        } else {
          state.loggedIn = false;
          state.userId = null;
          state.email = null;
          state.profile = null;
        }
      });
    } else {
      // 未配置 Supabase：直接标记就绪（游客模式）
      state.loggedIn = false;
    }
  }
  return readonly(state);
}

export function refreshProfile() {
  if (state.userId) return loadProfile(state.userId);
}

export function disposeUser() {
  if (unsub) unsub();
  unsub = null;
  state.ready = false;
}

export { state as userState };
