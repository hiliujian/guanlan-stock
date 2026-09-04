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
import { getSupabase } from "@/api/supabase";
import { userState } from "@/store/user";

const posts = ref<CommunityPost[]>([]);
const loading = ref(false);
const searchResults = ref<CommunityPost[]>([]);
// 主信息流分页（无限滚动）：游标 = 本页末条 createdAt(ms)；feedDone=true 表示已全部加载
const FEED_PAGE_SIZE = 10;
const feedCursor = ref<number | null>(null);
const feedDone = ref(false);

function replace(p: CommunityPost) {
  const i = posts.value.findIndex((x) => x.id === p.id);
  if (i >= 0) posts.value[i] = p;
  // 搜索结果缓存中的同一帖也一并就地更新，保证点赞/回复在搜索态下即时反映
  const j = searchResults.value.findIndex((x) => x.id === p.id);
  if (j >= 0) searchResults.value[j] = p;
}

export function useCommunity() {
  /**
   * 首屏 / 刷新：重置游标从头加载第一页（默认 10 条）。
   * 服务端多取 1 条判定「是否还有下一页」，slice 掉探测条后写入 posts。
   */
  async function load() {
    loading.value = true;
    try {
      const res = await communityRepo.list({ limit: FEED_PAGE_SIZE });
      // 刷新容错：repo 读失败会以空数组伪装成功。已有内容时，空结果按失败处理——
      // 保留旧信息流（posts/feedDone/cursor 原样），避免「有帖子 → 还没有动态」的突兀跳变；
      // 首次加载的空结果不受影响，仍正常显示空态。
      if (res.length === 0 && posts.value.length > 0) return;
      const hasMore = res.length > FEED_PAGE_SIZE;
      const page = hasMore ? res.slice(0, FEED_PAGE_SIZE) : res;
      posts.value = page;
      feedDone.value = !hasMore;
      feedCursor.value = page.length ? page[page.length - 1].createdAt : null;
    } finally {
      loading.value = false;
    }
  }

  /** 触底续拉下一页（无限滚动）；已到底或在途中则忽略。 */
  async function loadMore() {
    if (feedDone.value || loading.value) return;
    loading.value = true;
    try {
      const res = await communityRepo.list({ limit: FEED_PAGE_SIZE, cursor: feedCursor.value ?? undefined });
      const hasMore = res.length > FEED_PAGE_SIZE;
      const page = hasMore ? res.slice(0, FEED_PAGE_SIZE) : res;
      // 续拉容错：空页可能是读失败伪装成功——已有内容时不动 feedDone（保持可重试），
      // 避免一次网络抖动就把信息流误判为「已经到底了」。
      if (page.length === 0 && posts.value.length > 0) return;
      posts.value = [...posts.value, ...page];
      feedDone.value = !hasMore;
      if (page.length) feedCursor.value = page[page.length - 1].createdAt;
    } finally {
      loading.value = false;
    }
  }

  /**
   * 统一发布入口：一条帖可同时携带正文(content) + 附加卡片(card) + 配图(images) + 关联标的(topic)。
   * 旧版的「纯文字 / 纯卡片」两类发布已合并到此；三者任意其一非空即可发布。
   */
  async function publish(payload: {
    content?: string;
    card?: PostCard;
    topic?: Topic;
    images?: string[];
  }): Promise<CommunityPost | null> {
    const hasContent = !!(payload.content && payload.content.trim());
    const hasImages = !!(payload.images && payload.images.length);
    if (!hasContent && !payload.card && !hasImages) return null;
    const p = await communityRepo.create({
      content: payload.content,
      card: payload.card,
      topic: payload.topic,
      images: payload.images,
    });
    posts.value = [p, ...posts.value];
    return p;
  }

  async function like(id: string) {
    const p = await communityRepo.toggleLike(id);
    if (p) replace(p);
  }

  async function reply(id: string, content: string, replyTo?: { name: string; userId?: string | null }) {
    const trimmed = content.trim();
    if (!trimmed) return;
    const p = await communityRepo.addReply(id, trimmed, replyTo ?? null);
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

  return { posts, loading, searchResults, load, loadMore, feedDone, publish, like, reply, remove, search };
}

// =====================================================================
// 社区筛选 preset（模块级单例，跨 tab 信号）
// ProfileView「我的帖子 / 赞过」等入口跳转社区时，先 setPreset 目标筛选项，
// 再切 tab；CommunityView 激活时用 consumePreset() 读取并立即应用，随后清空，
// 避免重复点击时反复回到该筛选。
// =====================================================================
export type CommunityFilterKey = "latest" | "following" | "participated" | "mine" | "liked";

const communityPresetFilter = ref<CommunityFilterKey | null>(null);
export function useCommunityPreset() {
  function setPreset(key: CommunityFilterKey) {
    communityPresetFilter.value = key;
  }
  /** 读取并消费预设（读后清空），无预设返回 null。 */
  function consumePreset(): CommunityFilterKey | null {
    const v = communityPresetFilter.value;
    communityPresetFilter.value = null;
    return v;
  }
  return { communityPresetFilter, setPreset, consumePreset };
}

// =====================================================================
// 私信深链目标（模块级单例，跨页信号）
// 公开资料页「发私信」→ setDmTarget（带对方身份摘要）→ 切到社区 tab 并打开消息中心；
// MessageCenter 挂载时 consumeDmTarget() 读取并直接打开与该用户的会话（已有则载入历史，
// 无则空会话待发）。读后清空，避免重复打开。
// =====================================================================
interface DmTarget {
  otherId: string;
  otherName: string;
  otherAvatarUrl: string;
  otherFrame: string;
}

const dmTarget = ref<DmTarget | null>(null);
export function useDmTarget() {
  function setDmTarget(t: DmTarget) {
    dmTarget.value = t;
  }
  /** 读取并消费私信深链目标（读后清空），无目标返回 null。 */
  function consumeDmTarget(): DmTarget | null {
    const v = dmTarget.value;
    dmTarget.value = null;
    return v;
  }
  return { dmTarget, setDmTarget, consumeDmTarget };
}

// =====================================================================
// 社区「某用户帖子」深链目标（模块级单例，跨页信号）
// 公开资料页「查看更多 TA 的动态」→ setUserTarget（带 userId + 昵称）→ 切到社区 tab；
// CommunityView 激活时 consumeUserTarget() 读取并进入「该用户帖子模式」，随后清空，
// 避免重复点击时反复回到该用户列表。与 useDmTarget 同款跨页深链范式。
// =====================================================================
export interface CommunityUserTarget {
  userId: string;
  userName: string;
}

const userTarget = ref<CommunityUserTarget | null>(null);
export function useCommunityUserTarget() {
  function setUserTarget(t: CommunityUserTarget) {
    userTarget.value = t;
  }
  /** 读取并消费该用户帖子深链目标（读后清空），无目标返回 null。 */
  function consumeUserTarget(): CommunityUserTarget | null {
    const v = userTarget.value;
    userTarget.value = null;
    return v;
  }
  return { userTarget, setUserTarget, consumeUserTarget };
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
let dmThreadPeer = ""; // 当前会话流归属的对方 userId（openThread 容错判据）

// 通知「已读基线」：按消息类型（点赞 / 评论）分别持久化的时间戳。后端 NotificationItem
// 无 read 标记，故以「通知创建时间晚于该类型基线」判定为该类型未读（社媒通行的「最后查看
// 时间」模式）。分类型基线让点赞、评论各自独立计未读，用户能在标签栏看到分别的红点徽标，
// 一眼区分「被赞了」还是「被评论了」，而非混成一个总数。
// 通知「已读基线」：按消息类型（点赞 / 评论）分别持久化的「最后查看时间」时间戳（ms）。
// 后端 NotificationItem 无 read 标记，故以「通知创建时间晚于该类型基线」判定为该类型未读
// （社媒通行的「最后查看时间」模式）。基线**按当前登录用户隔离**持久化到本地存储：
// 重新登录（同一用户）能从本地读回，不再把已读历史重新标红；切换账号自动隔离，互不干扰。
function seenKey(kind: "like" | "comment"): string {
  const uid = userState.userId || "anon";
  return `gl_last_${kind}_seen_at_${uid}`;
}
const seenLikeAt = ref<number>(0);
const seenCommentAt = ref<number>(0);
// 登录态变化 / 重新拉取前：若内存基线为空，从本地存储读回当前用户的已读基线。
// 仅当内存态为 0 时才读回，避免覆盖本次会话内 markNotifSeen 已更新的内存值。
function ensureSeenLoaded() {
  if (seenLikeAt.value === 0) {
    const v = Number(uni.getStorageSync(seenKey("like"))) || 0;
    if (v > 0) seenLikeAt.value = v;
  }
  if (seenCommentAt.value === 0) {
    const v = Number(uni.getStorageSync(seenKey("comment"))) || 0;
    if (v > 0) seenCommentAt.value = v;
  }
}
function persistSeenLike() {
  try {
    uni.setStorageSync(seenKey("like"), seenLikeAt.value);
  } catch {
    /* 持久化失败不影响内存态角标 */
  }
}
function persistSeenComment() {
  try {
    uni.setStorageSync(seenKey("comment"), seenCommentAt.value);
  } catch {
    /* 持久化失败不影响内存态角标 */
  }
}

// 通知（点赞 / 评论）由后端实时派生，无独立通知表，故「删除」只能在本机隐藏：
// 记录被忽略的通知 id，列表过滤时不展示。切换账号 / 登出时清空（reset 中处理）。
const DISMISSED_KEY = "gl_dismissed_notif_ids";
const dismissedNotifIds = ref<string[]>(
  (() => {
    try {
      const arr = JSON.parse(uni.getStorageSync(DISMISSED_KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  })()
);
function persistDismissed() {
  try {
    uni.setStorageSync(DISMISSED_KEY, JSON.stringify(dismissedNotifIds.value));
  } catch {
    /* 持久化失败不影响内存态 */
  }
}
function dismissNotification(id: string) {
  if (!dismissedNotifIds.value.includes(id)) {
    dismissedNotifIds.value = [...dismissedNotifIds.value, id];
    persistDismissed();
  }
}

/** 拉取我的活动通知（点赞 / 评论），并校准「已读基线」。 */
async function loadNotifications() {
  notifLoading.value = true;
  try {
    // 重新登录 / 登出再进：内存基线可能被 reset 清 0，先从本地读回当前用户已读基线，
    // 避免把已读历史重新标红。
    ensureSeenLoaded();
    const list = await communityRepo.myNotifications();
    // 刷新容错：读失败伪装成空数组——已有通知时保留旧列表（未读角标不误清），首次为空正常
    if (list.length === 0 && notifications.value.length > 0) return;
    notifications.value = list;
    // 校准「已读基线」：仅当本用户从未有过基线（首次进入消息中心）时，把基线设为「此刻」，
    // 使所有历史通知视为已读；之后新到达的通知（晚于此刻）才计未读。
    // 若已有基线（含重新登录从本地读回），保持原值，避免把已读历史重新标红。
    if (notifications.value.length && seenLikeAt.value === 0 && seenCommentAt.value === 0) {
      const now = Date.now();
      seenLikeAt.value = now;
      seenCommentAt.value = now;
      persistSeenLike();
      persistSeenComment();
    }
  } finally {
    notifLoading.value = false;
  }
}

/** 拉取私信会话列表并聚合未读数（供徽标与消息中心共用）。 */
async function loadConversations() {
  convLoading.value = true;
  try {
    const list = await communityRepo.listConversations();
    // 刷新容错：读失败伪装成空数组——已有会话时保留旧列表（私信角标不误清），首次为空正常
    if (list.length === 0 && conversations.value.length > 0) return;
    conversations.value = list;
    // 会话未读之和即为私信角标数
    unreadDm.value = conversations.value.reduce((s, c) => s + c.unreadCount, 0);
  } finally {
    convLoading.value = false;
  }
}

// ── 实时订阅（与 watchlist 同款保活模式）──────────────────────────────
// 监听社区点赞 / 评论 / 私信的 INSERT，有新互动即重拉通知与会话，
// 使顶部铃铛徽标实时刷新，无需切回社区页或手动刷新。
let msgRealtimeChannel: any = null;

function subscribeMessageRealtime() {
  const sb = getSupabase();
  if (!sb) return;
  // 先清掉旧 channel，避免重复 init 时堆叠多个订阅导致重复回调
  if (msgRealtimeChannel) {
    try {
      sb.removeChannel(msgRealtimeChannel);
    } catch {
      /* ignore */
    }
    msgRealtimeChannel = null;
  }
  // 小程序端实时依赖 WebSocket，环境不支持时静默降级（手动刷新即可）
  try {
    const onEvent = () => {
      loadNotifications();
      loadConversations();
    };
    msgRealtimeChannel = sb
      .channel("message-center-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_likes" }, onEvent)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_replies" }, onEvent)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_dms" }, onEvent)
      .subscribe();
  } catch {
    /* ignore */
  }
}

function unsubscribeMessageRealtime() {
  const sb = getSupabase();
  if (sb && msgRealtimeChannel) {
    try {
      sb.removeChannel(msgRealtimeChannel);
    } catch {
      /* ignore */
    }
  }
  msgRealtimeChannel = null;
}

/** 初始化消息中心实时订阅（幂等；未登录时自动退订）。登录态变化时调用。 */
export function initMessageRealtime() {
  // 登录态变化（含重新登录）时先恢复已读基线，使顶部角标即时正确，无需等进消息中心
  ensureSeenLoaded();
  if (userState.loggedIn && userState.userId && getSupabase()) {
    subscribeMessageRealtime();
  } else {
    unsubscribeMessageRealtime();
  }
}

/** 停止消息中心实时订阅（仅 useMessageCenter().reset 登出/切换账号时调用；无外部使用故不导出）。 */
function stopMessageRealtime() {
  unsubscribeMessageRealtime();
}

export function useMessageCenter() {
  /** 单独刷私信未读数（轻量，供顶部栏角标用） */
  async function loadUnreadDm() {
    const n = await communityRepo.unreadDmCount();
    // 刷新容错：读失败伪装成 0——已有未读时保留旧值（真正的已读清零走 openThread→loadConversations）
    if (n === 0 && unreadDm.value > 0) return;
    unreadDm.value = n;
  }

  /** 打开与某人的会话：拉取消息流并顺带标记已读 → 重新聚合未读 */
  async function openThread(otherId: string) {
    threadLoading.value = true;
    try {
      const list = await communityRepo.getDmThread(otherId);
      // 刷新容错：读失败伪装成空数组——同一会话已有消息时保留旧消息流；
      // 切换到新会话（peer 变化）的空结果仍正常显示空态
      if (list.length === 0 && activeThread.value.length > 0 && dmThreadPeer === otherId) return;
      activeThread.value = list;
      dmThreadPeer = otherId;
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

  /** 删除与某人的私信会话（双向，真实删除）：成功后重拉会话列表聚合未读。 */
  async function deleteConversation(otherId: string): Promise<boolean> {
    const ok = await communityRepo.deleteDmThread(otherId);
    if (ok) await loadConversations();
    return ok;
  }

  function resetThread() {
    activeThread.value = [];
  }

  function reset() {
    // 登出 / 切换账号：退订实时，避免旧账号 channel 泄漏与误回调
    stopMessageRealtime();
    notifications.value = [];
    conversations.value = [];
    unreadDm.value = 0;
    activeThread.value = [];
    dmThreadPeer = "";
    dismissedNotifIds.value = [];
    // 重置基线，使下次加载按「首次加载」逻辑重新校准（适配切换账号）。
    seenLikeAt.value = 0;
    seenCommentAt.value = 0;
  }

  /** 未读点赞数：kind === 'like' 且创建时间晚于点赞已读基线。 */
  const unreadLike = computed(() =>
    notifications.value.filter((n) => {
      if (n.kind !== "like") return false;
      const t = new Date(n.createdAt).getTime();
      return Number.isFinite(t) && t > seenLikeAt.value;
    }).length
  );
  /** 未读评论数：kind === 'comment' 且创建时间晚于评论已读基线。 */
  const unreadComment = computed(() =>
    notifications.value.filter((n) => {
      if (n.kind !== "comment") return false;
      const t = new Date(n.createdAt).getTime();
      return Number.isFinite(t) && t > seenCommentAt.value;
    }).length
  );
  /** 当前用户未读的活动通知总数（点赞 + 评论），供铃铛聚合角标。 */
  const unreadNotif = computed(() => unreadLike.value + unreadComment.value);

  /** 顶部铃铛角标：私信未读 + 活动通知未读（社媒标准聚合）。 */
  const unreadTotal = computed(() => unreadDm.value + unreadNotif.value);

  /** 标记活动通知已读：按类型把对应基线推到「现在」并持久化；不传类型则两类一并清。
   *  分类型标记使「看过点赞」不会顺带清掉「评论」红点，用户能在标签栏区分未读类型。 */
  function markNotifSeen(kind?: "like" | "comment") {
    // 留 1s 余量，规避客户端与服务端时钟漂移导致「刚标记已读却仍判未读」
    const now = Date.now() + 1000;
    if (kind === "like") {
      seenLikeAt.value = now;
      persistSeenLike();
    } else if (kind === "comment") {
      seenCommentAt.value = now;
      persistSeenComment();
    } else {
      seenLikeAt.value = now;
      seenCommentAt.value = now;
      persistSeenLike();
      persistSeenComment();
    }
  }

  return {
    notifications,
    notifLoading,
    conversations,
    convLoading,
    unreadDm,
    unreadLike,
    unreadComment,
    unreadNotif,
    unreadTotal,
    activeThread,
    threadLoading,
    loadNotifications,
    loadConversations,
    loadUnreadDm,
    openThread,
    sendDm,
    deleteConversation,
    markNotifSeen,
    dismissNotification,
    dismissedNotifIds,
    resetThread,
    reset,
  };
}
