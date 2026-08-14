// =====================================================================
// 社区 feed 响应式状态（模块级单例，跨 tab 切换保持，配合 keep-alive）
// UI 组件通过 useCommunity() 拿到 posts / loading 与一组 actions，
// 所有数据读写都经 communityRepo（模拟 Supabase 的 Service 层）。
// =====================================================================
import { ref, computed } from "vue";
import {
  communityRepo,
  type CommunityPost,
  type PostCard,
  type Topic,
  type NotificationItem,
  type Conversation,
  type DmMessage,
} from "@/api/community";

const posts = ref<CommunityPost[]>([]);
const loading = ref(false);
const searchResults = ref<CommunityPost[]>([]);

function replace(p: CommunityPost) {
  const i = posts.value.findIndex((x) => x.id === p.id);
  if (i >= 0) posts.value[i] = p;
  // 搜索结果缓存中的同一帖也一并就地更新，保证点赞/回复在搜索态下即时反映
  const j = searchResults.value.findIndex((x) => x.id === p.id);
  if (j >= 0) searchResults.value[j] = p;
}

export function useCommunity() {
  async function load() {
    loading.value = true;
    try {
      posts.value = await communityRepo.list();
    } finally {
      loading.value = false;
    }
  }

  async function publishText(content: string, topic?: Topic, images?: string[]): Promise<CommunityPost | null> {
    const trimmed = content.trim();
    if (!trimmed) return null;
    const p = await communityRepo.create({ type: "text", content: trimmed, topic, images });
    posts.value = [p, ...posts.value];
    return p;
  }

  async function publishCard(card: PostCard, images?: string[]): Promise<CommunityPost | null> {
    const p = await communityRepo.create({ type: "card", card, images });
    posts.value = [p, ...posts.value];
    return p;
  }

  async function like(id: string) {
    const p = await communityRepo.toggleLike(id);
    if (p) replace(p);
  }

  async function reply(id: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) return;
    const p = await communityRepo.addReply(id, trimmed);
    if (p) replace(p);
  }

  async function remove(id: string) {
    await communityRepo.remove(id);
    posts.value = posts.value.filter((x) => x.id !== id);
  }

  /** 搜索帖子（关键字 / 股票代码 / 股票名称）；空查询清空结果。结果写入 searchResults。 */
  async function search(query: string): Promise<void> {
    const q = query.trim();
    if (!q) {
      searchResults.value = [];
      return;
    }
    loading.value = true;
    try {
      searchResults.value = await communityRepo.searchPosts(q);
    } finally {
      loading.value = false;
    }
  }

  return { posts, loading, searchResults, load, publishText, publishCard, like, reply, remove, search };
}

// =====================================================================
// 消息中心（模块级单例，跨组件共享：顶部栏未读角标与弹层共用同一份状态）
// 通知（点赞 / 评论）由后端实时派生；私信走 community_dms + 会话聚合。
// =====================================================================
const notifications = ref<NotificationItem[]>([]);
const notifLoading = ref(false);
const conversations = ref<Conversation[]>([]);
const convLoading = ref(false);
const unreadDm = ref(0);
const activeThread = ref<DmMessage[]>([]); // 当前会话消息流
const threadLoading = ref(false);

// 通知「已读基线」：客户端持久化的时间戳。后端 NotificationItem 无 read 标记，
// 故以「通知创建时间晚于该基线」判定为未读（社媒通行的「最后查看时间」模式）。
const SEEN_KEY = "gl_last_notif_seen_at";
const lastNotifSeenAt = ref<number>(Number(uni.getStorageSync(SEEN_KEY)) || 0);
function persistSeen() {
  try {
    uni.setStorageSync(SEEN_KEY, lastNotifSeenAt.value);
  } catch {
    /* 持久化失败不影响内存态角标 */
  }
}

export function useMessageCenter() {
  async function loadNotifications() {
    notifLoading.value = true;
    try {
      notifications.value = await communityRepo.myNotifications();
      // 首次加载（基线为 0）：把基线设为「最早一条通知时间 - 1」，
      // 使历史通知不被一次性计为未读；之后再有新通知才会触发角标。
      if (lastNotifSeenAt.value === 0 && notifications.value.length) {
        const minT = notifications.value
          .map((n) => new Date(n.createdAt).getTime())
          .filter((t) => Number.isFinite(t));
        if (minT.length) {
          lastNotifSeenAt.value = Math.min(...minT) - 1;
          persistSeen();
        }
      }
    } finally {
      notifLoading.value = false;
    }
  }

  async function loadConversations() {
    convLoading.value = true;
    try {
      conversations.value = await communityRepo.listConversations();
      // 会话未读之和即为私信角标数
      unreadDm.value = conversations.value.reduce((s, c) => s + c.unreadCount, 0);
    } finally {
      convLoading.value = false;
    }
  }

  /** 单独刷私信未读数（轻量，供顶部栏角标用） */
  async function loadUnreadDm() {
    unreadDm.value = await communityRepo.unreadDmCount();
  }

  /** 打开与某人的会话：拉取消息流并顺带标记已读 → 重新聚合未读 */
  async function openThread(otherId: string) {
    threadLoading.value = true;
    try {
      activeThread.value = await communityRepo.getDmThread(otherId);
      await loadConversations();
    } finally {
      threadLoading.value = false;
    }
  }

  async function sendDm(otherId: string, content: string): Promise<DmMessage | null> {
    const m = await communityRepo.sendDm(otherId, content);
    if (m) {
      activeThread.value = [...activeThread.value, m];
      await loadConversations(); // 更新会话列表（末条内容 / 顺序 / 未读）
    }
    return m;
  }

  function resetThread() {
    activeThread.value = [];
  }

  function reset() {
    notifications.value = [];
    conversations.value = [];
    unreadDm.value = 0;
    activeThread.value = [];
    // 重置基线，使下次加载按「首次加载」逻辑重新校准（适配切换账号）。
    lastNotifSeenAt.value = 0;
  }

  /** 当前用户未读的活动通知数（点赞 / 评论）：createdAt 晚于已读基线。 */
  const unreadNotif = computed(() =>
    notifications.value.filter((n) => {
      const t = new Date(n.createdAt).getTime();
      return Number.isFinite(t) && t > lastNotifSeenAt.value;
    }).length
  );

  /** 顶部铃铛角标：私信未读 + 活动通知未读（社媒标准聚合）。 */
  const unreadTotal = computed(() => unreadDm.value + unreadNotif.value);

  /** 标记活动通知已读：把基线推到「现在」并持久化 → 清铃铛徽章。 */
  function markNotifSeen() {
    lastNotifSeenAt.value = Date.now();
    persistSeen();
  }

  return {
    notifications,
    notifLoading,
    conversations,
    convLoading,
    unreadDm,
    unreadNotif,
    unreadTotal,
    activeThread,
    threadLoading,
    loadNotifications,
    loadConversations,
    loadUnreadDm,
    openThread,
    sendDm,
    markNotifSeen,
    resetThread,
    reset,
  };
}
