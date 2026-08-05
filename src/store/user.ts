// =====================================================================
// 用户态 store（跨端响应式单例）
// 统一管理：登录态、资料、Supabase 会话订阅
// =====================================================================
import { reactive, readonly } from "vue";
import { getSupabase, isSupabaseConfigured } from "@/api/supabase";
import { onAuthChange, updateProfile } from "@/api/auth";

interface Profile {
  id: string;
  display_name: string;
  username: string;
  bio: string;
  avatar_url: string;
  level?: number; // 用户等级序号（0=新手散户）；由后端维护，前端只读
  exp?: number; // 用户经验值；由后端维护，缺省 0
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

async function loadProfile(userId: string) {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from("profiles").select("*").eq("id", userId).single();
  if (data) {
    const profile = {
      id: data.id,
      username: data.username || "",
      display_name: data.display_name || "",
      bio: data.bio || "",
      avatar_url: data.avatar_url || "",
      level: typeof data.level === "number" ? data.level : 0,
      exp: typeof data.exp === "number" ? data.exp : 0,
    };
    // 注意：username 由用户在注册时自填、唯一（见 deploy.sql 部分唯一索引）。
    // 历史空 username 不再由前端自动补随机值；
    // 新注册用户经触发器/注册流程已带 username，旧空账号保持空串、昵称优先展示即可。
    state.profile = profile;
  }
}

export function useUser() {
  if (!state.ready) {
    state.ready = true;
    state.supabaseEnabled = isSupabaseConfigured;
    if (isSupabaseConfigured) {
      onAuthChange(async (user) => {
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

export function refreshProfile(): Promise<void> {
  if (state.userId) return loadProfile(state.userId);
  return Promise.resolve();
}

/**
 * 跨标签同步：当另一个标签通过邮件链接完成验证后，本标签的 Supabase 客户端
 * 会监听 storage 事件自动更新会话；此函数作为兜底，主动读取一次会话并刷新状态，
 * 供「等待邮件确认」页轮询调用，确保同浏览器下也能及时切到已登录态。
 */
export async function syncSession(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data } = await sb.auth.getSession();
  const user = data.session?.user ?? null;
  if (user) {
    if (!state.loggedIn || state.userId !== user.id) {
      state.loggedIn = true;
      state.userId = user.id;
      state.email = user.email ?? null;
      await loadProfile(user.id);
    }
    return true;
  }
  return false;
}

export { state as userState };
