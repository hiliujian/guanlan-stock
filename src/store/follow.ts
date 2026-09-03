// =====================================================================
// 关注系统（服务端唯一权威）
// 关注关系存于 public.follows 表（follower_id / following_id，联合主键）。
// 前端仅缓存「我关注了哪些 uid」（follows 集合）用于即时 UI；真实粉丝数 /
// 关注数由 count_followers / count_following RPC 计算。
// 登录态变化时由模块级 onAuthStateChange 订阅自动拉取 / 清空，避免与 user.ts 形成循环依赖。
// 同时导出 followPanelOpen 共享信号，供 ProfileView 跨 tab 打开社区内的「我的关注」弹层。
// =====================================================================
import { ref } from "vue";
import { getSupabase, isSupabaseConfigured } from "@/api/supabase";

// 我关注的用户 uid 集合（响应式，组件间共享同一实例）
const follows = ref<Set<string>>(new Set());

// 跨组件打开「我的关注」弹层的共享信号（ProfileView 置 true，CommunityView 监听并挂载 FollowListView）
const followPanelOpen = ref(false);

let loadStarted = false;
let myUidCache: { value: string | null; ts: number } | null = null;

/** 取当前登录用户 uid（带 60s 会话内缓存，减少对 auth 接口的调用）。 */
async function getMyUid(sb: any): Promise<string | null> {
  if (myUidCache && Date.now() - myUidCache.ts < 60_000) return myUidCache.value;
  let uid: string | null = null;
  try {
    const { data } = await sb.auth.getUser();
    uid = data?.user?.id ?? null;
  } catch {
    uid = null;
  }
  myUidCache = { value: uid, ts: Date.now() };
  return uid;
}

/** 从服务端拉取「我关注的用户」列表，填充 follows 集合。 */
export async function loadFollows() {
  const sb = getSupabase();
  if (!sb) return;
  const uid = await getMyUid(sb);
  if (!uid) {
    follows.value = new Set();
    return;
  }
  const { data, error } = await sb.from("follows").select("following_id").eq("follower_id", uid);
  if (!error && data) {
    follows.value = new Set((data as any[]).map((r) => r.following_id as string));
  }
}

// 模块级订阅登录态：登录即拉取关注列表，登出即清空。
if (isSupabaseConfigured) {
  const sb0 = getSupabase();
  sb0?.auth.onAuthStateChange((_event: string, session: any) => {
    if (session?.user) loadFollows();
    else follows.value = new Set();
  });
}

export function useFollow() {
  // 首次使用时惰性触发一次加载（订阅未命中时兜底）。幂等。
  if (isSupabaseConfigured && !loadStarted) {
    loadStarted = true;
    loadFollows();
  }

  function isFollowing(uid: string): boolean {
    return !!uid && follows.value.has(uid);
  }

  /** 切换关注状态，返回切换后是否处于「已关注」。乐观更新：先改本地集合，DB 失败回滚。不能关注自己。 */
  async function toggleFollow(uid: string): Promise<boolean> {
    const sb = getSupabase();
    if (!sb || !uid) return false;
    const me = await getMyUid(sb);
    if (!me || me === uid) return false; // 不可关注自己

    const next = new Set(follows.value);
    const nowFollowing = !next.has(uid);
    if (nowFollowing) next.add(uid);
    else next.delete(uid);
    follows.value = next; // 乐观更新

    try {
      if (nowFollowing) {
        await sb.from("follows").insert({ follower_id: me, following_id: uid });
      } else {
        await sb.from("follows").delete().eq("follower_id", me).eq("following_id", uid);
      }
      return nowFollowing;
    } catch {
      // 回滚到切换前状态
      const rollback = new Set(follows.value);
      if (nowFollowing) rollback.delete(uid);
      else rollback.add(uid);
      follows.value = rollback;
      return !nowFollowing;
    }
  }

  function follow(uid: string) {
    if (uid) toggleFollow(uid);
  }
  function unfollow(uid: string) {
    if (uid) toggleFollow(uid);
  }
  function list(): string[] {
    return Array.from(follows.value);
  }

  /** 粉丝数：count_followers RPC（security definer，公开可读）。 */
  async function fetchFollowerCount(uid: string): Promise<number> {
    const sb = getSupabase();
    if (!sb || !uid) return 0;
    const { data, error } = await sb.rpc("count_followers", { p_user_id: uid });
    return error ? 0 : (data as number) ?? 0;
  }

  /** 关注数：count_following RPC。 */
  async function fetchFollowingCount(uid: string): Promise<number> {
    const sb = getSupabase();
    if (!sb || !uid) return 0;
    const { data, error } = await sb.rpc("count_following", { p_user_id: uid });
    return error ? 0 : (data as number) ?? 0;
  }

  return { follows, isFollowing, toggleFollow, follow, unfollow, list, loadFollows, fetchFollowerCount, fetchFollowingCount };
}

export function useFollowPanel() {
  return { followPanelOpen };
}
