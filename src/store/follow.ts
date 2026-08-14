// 关注系统：本地持久化的「关注用户」集合（以帖子 author 唯一标识）。
// 后端关注表尚未接入前，先用本机存储兜底，后续可平滑替换为 Supabase 查询。
// 同时导出 followPanelOpen 共享信号，供 ProfileView 跨 tab 打开社区内的「我的关注」弹层。
import { ref } from "vue";

const STORAGE_KEY = "guanlan_follows";

function load(): string[] {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY);
    if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string");
  } catch (_) {
    /* 忽略读取异常，回退空列表 */
  }
  return [];
}

// 关注的用户名集合（响应式，组件间共享同一实例）
const follows = ref<Set<string>>(new Set(load()));

// 跨组件打开「我的关注」弹层的共享信号（ProfileView 置 true，CommunityView 监听并挂载 FollowListView）
const followPanelOpen = ref(false);

function persist() {
  try {
    uni.setStorageSync(STORAGE_KEY, Array.from(follows.value));
  } catch (_) {
    /* 忽略写入异常 */
  }
}

export function useFollow() {
  function isFollowing(name: string): boolean {
    return !!name && follows.value.has(name);
  }
  // 切换关注状态，返回切换后是否处于「已关注」
  function toggleFollow(name: string): boolean {
    if (!name) return false;
    const next = new Set(follows.value);
    let nowFollowing: boolean;
    if (next.has(name)) {
      next.delete(name);
      nowFollowing = false;
    } else {
      next.add(name);
      nowFollowing = true;
    }
    follows.value = next;
    persist();
    return nowFollowing;
  }
  function follow(name: string) {
    if (!name || follows.value.has(name)) return;
    const next = new Set(follows.value);
    next.add(name);
    follows.value = next;
    persist();
  }
  function unfollow(name: string) {
    if (!name || !follows.value.has(name)) return;
    const next = new Set(follows.value);
    next.delete(name);
    follows.value = next;
    persist();
  }
  function list(): string[] {
    return Array.from(follows.value);
  }
  return { follows, isFollowing, toggleFollow, follow, unfollow, list };
}

export function useFollowPanel() {
  return { followPanelOpen };
}
