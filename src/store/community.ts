// =====================================================================
// 社区 feed 响应式状态（模块级单例，跨 tab 切换保持，配合 keep-alive）
// UI 组件通过 useCommunity() 拿到 posts / loading 与一组 actions，
// 所有数据读写都经 communityRepo（模拟 Supabase 的 Service 层）。
// =====================================================================
import { ref } from "vue";
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

function replace(p: CommunityPost) {
  const i = posts.value.findIndex((x) => x.id === p.id);
  if (i >= 0) posts.value[i] = p;
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

  return { posts, loading, load, publishText, publishCard, like, reply, remove };
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

export function useMessageCenter() {
  async function loadNotifications() {
    notifLoading.value = true;
    try {
      notifications.value = await communityRepo.myNotifications();
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
  }

  return {
    notifications,
    notifLoading,
    conversations,
    convLoading,
    unreadDm,
    activeThread,
    threadLoading,
    loadNotifications,
    loadConversations,
    loadUnreadDm,
    openThread,
    sendDm,
    resetThread,
    reset,
  };
}
