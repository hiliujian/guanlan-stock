// =====================================================================
// 社区数据仓储（Supabase Service 层）
// ---------------------------------------------------------------------
// 架构约定（2026-08-01 统一后端）：前端只调用 communityRepo 的方法，永远
// 不关心存储细节；数据唯一来源是 Supabase（community_posts / replies /
// likes）。不再保留 localStorage 兜底分支与示例种子数据——未配置后端时
// 列表返回空，由页面「未登录 / 暂无数据」空态承接，符合无冗余的设计目标。
//
// JSONB 字段命名：数据库内一律 snake_case；TS 接口与 UI 沿用 JS camelCase
// 惯例，入库前 toStoredCard() 转 snake、出库后 toClientCard() 转回 camel，
// 边界单点映射，UI 无需改动。
// =====================================================================
import { getSupabase } from "@/api/supabase";
import { withTimeout } from "@/api/transport";
import { translateSupabaseError } from "@/api/auth";
import { getMyName } from "@/store/identity";
import { userState } from "@/store/user";

// ---------------------------------------------------------------------
// 类型定义（TS / UI 侧 camelCase）
// ---------------------------------------------------------------------

/** 持仓卡片：展示某只股票的持仓成本 / 数量 / 现价与浮动盈亏 */
export interface HoldingCard {
  kind: "holding";
  stock: string;
  code?: string;
  cost: number; // 持仓成本价
  shares: number; // 持仓股数
  price: number; // 现价
}

/** 操作记录卡片：一次买入 / 卖出 */
export interface OperationCard {
  kind: "operation";
  stock: string;
  code?: string;
  side: "buy" | "sell";
  price: number; // 成交价
  shares: number; // 成交股数
  note?: string; // 操作理由
}

/** 收益卡片：一段周期的战绩 */
export interface ProfitCard {
  kind: "profit";
  period: string; // 例如 "本月" "今年" "累计"
  totalReturn: number; // 总收益率 %（DB: total_return）
  realized: number; // 已实现盈亏（元）
  unrealized: number; // 未实现盈亏（元）
  winRate?: number; // 胜率 %（DB: win_rate）
}

export type PostCard = HoldingCard | OperationCard | ProfitCard;

/** 话题：动态归属的标的（个股或板块），用于社区首页分类筛选 */
export interface Topic {
  type: "stock" | "sector";
  name: string; // 个股名（如 贵州茅台）或板块名（如 白酒）
  code?: string; // 个股代码（可选）
}

interface Reply {
  id: string;
  author: string;
  content: string;
  createdAt: number;
}

export interface CommunityPost {
  id: string;
  type: "text" | "card";
  author: string;
  userId?: string | null; // 发布者账号 id（登录后写入，用于判定"我的"帖子）
  authorAvatarUrl?: string; // 作者头像 URL（发布时冗余快照 + 联表 profiles 兜底；缺省回退「字」头像）
  authorFrame?: string; // 作者头像框 id（发布时冗余快照 + 联表 profiles 兜底；'' = 无边框）
  authorUsername?: string; // 作者用户名（冗余快照）：默认头像种子用，保证与个人资料页一致（用户名首字）
  topic?: Topic; // 关联标的（个股 / 板块），用于分类
  createdAt: number;
  content?: string;
  card?: PostCard;
  images?: string[]; // 帖子配图 URL 数组（DB: images text[]）
  likes: number;
  likedByMe: boolean;
  replies: Reply[];
}

/** 消息中心通知项（点赞 / 评论，由后端从我自己的帖子实时派生） */
export interface NotificationItem {
  id: string;
  kind: "like" | "comment"; // like = 有人赞了我的帖；comment = 有人评论了我的帖
  actorId: string; // 触发者账号 id
  actorName: string;
  actorAvatarUrl: string;
  actorFrame: string;
  postId: string; // 关联的我的帖子
  postSnippet: string; // 帖子摘要（文字内容 / 卡片一句话）
  commentContent?: string; // 仅 comment 类型有值
  createdAt: number;
}

/** 私信会话（按对方聚合的列表项） */
export interface Conversation {
  otherId: string; // 对方账号 id
  otherName: string;
  otherAvatarUrl: string;
  otherFrame: string;
  lastContent: string; // 最近一条消息内容
  lastAt: number;
  unreadCount: number;
  lastSenderMe: boolean; // 最近一条是否我发的
}

/** 单条私信 */
export interface DmMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  status: string; // sent / read
  createdAt: number;
}

// ---------------------------------------------------------------------
// card JSONB 边界映射：DB 存 snake_case，TS/UI 用 camelCase
// 仅 profit 卡片含驼峰字段（totalReturn / winRate），其余已是 snake。
// ---------------------------------------------------------------------
function toStoredCard(card: PostCard): any {
  if (!card || card.kind !== "profit") return card;
  const { totalReturn, winRate, ...rest } = card;
  return { ...rest, total_return: totalReturn, win_rate: winRate };
}

function toClientCard(card: any): PostCard {
  if (!card || card.kind !== "profit") return card;
  const { total_return, win_rate, ...rest } = card;
  return { ...rest, totalReturn: total_return, winRate: win_rate } as ProfitCard;
}

// ---------------------------------------------------------------------
// Public API（Supabase Service 层；UI 只依赖这些方法，无本地分支）
// ---------------------------------------------------------------------
export const communityRepo = {
  async list(): Promise<CommunityPost[]> {
    return listRemote();
  },

  async create(
    input:
      | { type: "text"; content: string; topic?: Topic; images?: string[] }
      | { type: "card"; card: PostCard; images?: string[] }
  ): Promise<CommunityPost> {
    return createRemote(input);
  },

  async toggleLike(id: string): Promise<CommunityPost | null> {
    return toggleLikeRemote(id);
  },

  async addReply(id: string, content: string): Promise<CommunityPost | null> {
    return addReplyRemote(id, content);
  },

  async remove(id: string): Promise<void> {
    return removeRemote(id);
  },

  // ---------------- 消息中心：通知（点赞 / 评论） ----------------
  async myNotifications(): Promise<NotificationItem[]> {
    return notificationsRemote();
  },

  // ---------------- 私信 ----------------
  async sendDm(receiverId: string, content: string): Promise<DmMessage | null> {
    return sendDmRemote(receiverId, content);
  },
  async listConversations(): Promise<Conversation[]> {
    return listConversationsRemote();
  },
  async getDmThread(otherId: string): Promise<DmMessage[]> {
    return getDmThreadRemote(otherId);
  },
  async unreadDmCount(): Promise<number> {
    return unreadDmCountRemote();
  },

  // ---------------- 帖子搜索（关键字 / 股票代码 / 股票名称） ----------------
  async searchPosts(query: string): Promise<CommunityPost[]> {
    return searchRemote(query);
  },
};

// ---------------------------------------------------------------------
// 相对时间格式化（"刚刚 / x分钟前 / x小时前 / x天前 / 日期"）
// ---------------------------------------------------------------------
export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// =====================================================================
// 远程实现（Supabase 为唯一后端）
// 表结构严格对应 supabase/deploy.sql：
//   community_posts(id uuid pk, user_id uuid→auth.users on delete set null,
//                   type text chk, author text, topic jsonb,
//                   content text, card jsonb, likes int chk>=0,
//                   status text, images text[], tags text[], meta jsonb,
//                   created_at timestamptz)
//   community_replies(id uuid pk, post_id uuid fk→posts on delete cascade,
//                     user_id uuid, author text, content text, created_at,
//                     status text, parent_id uuid, meta jsonb)
//   community_likes(post_id uuid fk, user_id uuid, primary key(post_id, user_id))
//   —— 点赞计数由 trg_sync_likes 触发器从 community_likes 聚合，客户端无法伪造
//   —— 点赞切换走 RPC：public.toggle_post_like(p_post_id uuid)，返回 liked_by_me
// =====================================================================
async function listRemote(): Promise<CommunityPost[]> {
  const sb = getSupabase();
  if (!sb) return [];
  // 网络异常时 Supabase 查询可能挂起，用 withTimeout 兜底（10s），避免下拉刷新 loading 卡死
  const { data, error } = await withTimeout(
    sb
      .from("community_posts")
      .select(
        "id, type, author, user_id, topic, content, card, images, likes, created_at, replies:community_replies(id, author, content, created_at)"
      )
      .order("created_at", { ascending: false })
      .limit(50) as unknown as Promise<{ data: any; error: any }>,
    10000
  );
  if (error || !data) return [];
  // 点赞态以服务端 community_likes 为唯一权威（不再本地缓存）
  const liked = await loadLikedFromServer(sb);
  // 联表批量取作者头像 / 头像框（一次查询，避免每条再发请求）
  const profileMap = await loadProfilesForPosts(sb, data as any[]);
  return (data as any[]).map((r) => {
    const ai = profileMap.get(r.user_id) || { avatar_url: "", avatar_frame: "" };
    return mapRowToPost(r, ai, liked);
  });
}

/**
 * 将 community_posts 单行（含可选嵌套 replies）映射为 CommunityPost（UI 侧 camelCase）。
 * 被 listRemote 与 searchRemote 共用，避免重复映射逻辑；replies 缺省为空数组。
 */
function mapRowToPost(
  r: any,
  ai: { avatar_url: string; avatar_frame: string },
  liked: Set<string>
): CommunityPost {
  return {
    id: r.id,
    type: r.type,
    author: r.author,
    userId: r.user_id || null,
    // 作者展示字段：优先用帖子冗余快照（发布时写入，不依赖 profiles RLS），
    // 旧帖（迁移前）无快照则回退 profiles 联表结果（profiles 现已公开可读）。
    authorAvatarUrl: r.author_avatar_url || ai.avatar_url || "",
    authorFrame: r.author_frame || ai.avatar_frame || "",
    authorUsername: r.author_username || "",
    topic: r.topic || undefined,
    createdAt: new Date(r.created_at).getTime(),
    content: r.content ?? undefined,
    card: r.card ? toClientCard(r.card) : undefined,
    images: (r.images as string[] | undefined) || [],
    likes: r.likes ?? 0,
    likedByMe: liked.has(r.id),
    replies: (r.replies || []).map((x: any) => ({
      id: x.id,
      author: x.author,
      content: x.content,
      createdAt: new Date(x.created_at).getTime(),
    })),
  };
}

// =====================================================================
// 帖子搜索（RPC: search_posts）：关键字 / 股票代码 / 股票名称
// 后端直接 ILIKE 匹配 content、topic(name/code)、card(stock/code)，
// 返回与 feed 同构的行（嵌套 replies 以 JSON 数组呈现），复用 mapRowToPost。
// =====================================================================
async function searchRemote(query: string): Promise<CommunityPost[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await withTimeout(
    sb.rpc("search_posts", { p_query: query }) as unknown as Promise<{ data: any; error: any }>,
    10000
  );
  if (error || !data) return [];
  // 点赞态 / 作者资料与列表一致（复用同一套服务端权威逻辑）
  const liked = await loadLikedFromServer(sb);
  const profileMap = await loadProfilesForPosts(sb, data as any[]);
  return (data as any[]).map((r) => {
    const ai = profileMap.get(r.user_id) || { avatar_url: "", avatar_frame: "" };
    return mapRowToPost(r, ai, liked);
  });
}

// 当前用户点赞集合的内存缓存：listRemote 每次加载都会用到，避免「每次列表刷新都多发一次
// community_likes 查询」。uid 变化时（登录 / 登出）自动失效重拉；点赞切换后就地更新单条。
let likedCache: { uid: string; ids: Set<string> } | null = null;

/** 取当前用户点过赞的帖子 id 集合（服务端权威；未登录则为空集）。带会话内缓存。 */
async function loadLikedFromServer(sb: any): Promise<Set<string>> {
  const { data: u } = await sb.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return new Set();
  if (likedCache && likedCache.uid === uid) return likedCache.ids;
  const { data } = await sb.from("community_likes").select("post_id").eq("user_id", uid);
  const ids = new Set<string>((data || []).map((x: any) => x.post_id as string));
  likedCache = { uid, ids };
  return ids;
}

// 作者资料缓存：listRemote 批量联表后写入，供 createRemote / toggleLikeRemote 即时取用，
// 避免单帖回查或丢失头像框。键为 user_id → { 头像 URL, 头像框 id }。
let profileCache: Map<string, { avatar_url: string; avatar_frame: string }> | null = null;

/**
 * 批量联表取作者头像 / 头像框：从帖子列表收集 user_id，一次 queries profiles，
 * 返回 user_id → { avatar_url, avatar_frame } 映射，并写入 profileCache 供后续复用。
 * 旧帖 / 游客帖 user_id 为空：对应项缺省为「字」头像（无边框），由 PostCard 回退。
 */
async function loadProfilesForPosts(
  sb: any,
  rows: any[]
): Promise<Map<string, { avatar_url: string; avatar_frame: string }>> {
  const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
  const map = new Map<string, { avatar_url: string; avatar_frame: string }>();
  if (ids.length) {
    const { data } = await sb.from("profiles").select("id, avatar_url, avatar_frame").in("id", ids);
    for (const p of (data as any[]) || []) {
      map.set(p.id, { avatar_url: p.avatar_url || "", avatar_frame: p.avatar_frame || "" });
    }
  }
  profileCache = map;
  return map;
}

/** 从缓存取某作者的头像 / 头像框（无缓存则回退「字」头像、无边框） */
function authorInfoOf(userId?: string | null): { avatar_url: string; avatar_frame: string } {
  if (userId && profileCache && profileCache.has(userId)) return profileCache.get(userId)!;
  return { avatar_url: "", avatar_frame: "" };
}

async function createRemote(
  input:
    | { type: "text"; content: string; topic?: Topic; images?: string[] }
    | { type: "card"; card: PostCard; images?: string[] }
): Promise<CommunityPost> {
  const sb = getSupabase();
  if (!sb) throw new Error("发布失败，请稍后再试");
  const row: any = {
    author: getMyName(),
    user_id: userState.userId || null,
    // 发布时冗余快照作者公开资料：使信息流展示自包含，不受 profiles RLS 影响。
    author_avatar_url: userState.profile?.avatar_url || "",
    author_frame: userState.profile?.avatar_frame || "",
    author_username: userState.profile?.username || "",
    topic: input.type === "text" ? input.topic ?? null : null,
    type: input.type,
    content: input.type === "text" ? input.content.trim() : null,
    card: input.type === "card" ? toStoredCard(input.card) : null,
    images: (input.images && input.images.length ? input.images : []) as any,
    likes: 0,
  };
  const { data, error } = await sb.from("community_posts").insert(row).select().single();
  if (error || !data) throw new Error(translateSupabaseError(error?.message));
  const d = data as any;
  return {
    id: d.id,
    type: d.type,
    author: d.author,
    userId: d.user_id || null,
    // 优先用行内快照（与入库值一致），profile 兜底（极端情况下快照为空时）
    authorAvatarUrl: d.author_avatar_url || userState.profile?.avatar_url || "",
    authorFrame: d.author_frame || userState.profile?.avatar_frame || "",
    authorUsername: d.author_username || userState.profile?.username || "",
    topic: d.topic || undefined,
    createdAt: new Date(d.created_at).getTime(),
    content: d.content ?? undefined,
    card: d.card ? toClientCard(d.card) : undefined,
    images: (d.images as string[] | undefined) || [],
    likes: 0,
    likedByMe: false,
    replies: [],
  };
}

async function toggleLikeRemote(id: string): Promise<CommunityPost | null> {
  const sb = getSupabase();
  if (!sb) return null;
  // rpc 直接返回 data（数组，单行），不要用 .select().single() 链（rpc 不支持）
  // 注意：入参名 p_post_id 必须与 supabase/deploy.sql 中函数签名一致
  const { data, error } = await sb.rpc("toggle_post_like", { p_post_id: id });
  if (error || !data) return null;
  const d = (data as any[])[0];
  if (!d) return null;
  const liked = !!d.liked_by_me;
  // 同步点赞缓存：就地更新单条，避免下次列表加载重复拉取 liked 集合
  if (likedCache) {
    if (liked) likedCache.ids.add(id);
    else likedCache.ids.delete(id);
  }
  // 点赞后重查完整帖（含最新回复与配图），避免 replace 时把 replies/images 覆盖为空
  const { data: fresh, error: ferr } = await sb
    .from("community_posts")
    .select(
      "id, type, author, user_id, topic, content, card, images, likes, created_at, replies:community_replies(id, author, content, created_at)"
    )
    .eq("id", id)
    .single();
  if (ferr || !fresh) return null;
  const f = fresh as any;
  const ai = authorInfoOf(f.user_id);
  return {
    id: f.id,
    type: f.type,
    author: f.author,
    userId: f.user_id || null,
    authorAvatarUrl: f.author_avatar_url || ai.avatar_url || "",
    authorFrame: f.author_frame || ai.avatar_frame || "",
    authorUsername: f.author_username || "",
    topic: f.topic || undefined,
    createdAt: new Date(f.created_at).getTime(),
    content: f.content ?? undefined,
    card: f.card ? toClientCard(f.card) : undefined,
    images: (f.images as string[] | undefined) || [],
    likes: f.likes ?? 0,
    likedByMe: likedCache ? likedCache.ids.has(id) : liked,
    replies: (f.replies || []).map((x: any) => ({
      id: x.id,
      author: x.author,
      content: x.content,
      createdAt: new Date(x.created_at).getTime(),
    })),
  };
}

async function addReplyRemote(id: string, content: string): Promise<CommunityPost | null> {
  const sb = getSupabase();
  if (!sb) return null;
  await sb
    .from("community_replies")
    .insert({
      post_id: id,
      // 关键：写入当前用户 id，否则后端 get_my_notifications 用
      // `user_id is distinct from auth.uid()` 仍会把 NULL 当他人纳入，
      // 但更稳妥的做法是始终显式归属，避免 NULL 模糊语义。
      user_id: userState.userId || null,
      author: getMyName(),
      content: content.trim(),
    });
  // 仅重查该帖（含最新回复数与点赞态），避免 listRemote 整表 + liked 集合二次拉取
  const { data, error } = await sb
    .from("community_posts")
    .select(
      "id, type, author, user_id, author_avatar_url, author_frame, author_username, topic, content, card, images, likes, created_at, replies:community_replies(id, author, content, created_at)"
    )
    .eq("id", id)
    .single();
  if (error || !data) return null;
  const d = data as any;
  const ai = authorInfoOf(d.user_id); // profiles 联表兜底（profiles 现已公开可读）
  const liked = likedCache ? likedCache.ids.has(id) : false;
  return {
    id: d.id,
    type: d.type,
    author: d.author,
    userId: d.user_id || null,
    authorAvatarUrl: d.author_avatar_url || ai.avatar_url || "",
    authorFrame: d.author_frame || ai.avatar_frame || "",
    authorUsername: d.author_username || "",
    topic: d.topic || undefined,
    createdAt: new Date(d.created_at).getTime(),
    content: d.content ?? undefined,
    card: d.card ? toClientCard(d.card) : undefined,
    images: (d.images as string[] | undefined) || [],
    likes: d.likes ?? 0,
    likedByMe: liked,
    replies: (d.replies || []).map((x: any) => ({
      id: x.id,
      author: x.author,
      content: x.content,
      createdAt: new Date(x.created_at).getTime(),
    })),
  };
}

async function removeRemote(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("community_posts").delete().eq("id", id);
}

// =====================================================================
// 消息中心：点赞 / 评论通知（RPC: get_my_notifications）
// 后端从我自己的帖子实时聚合 community_likes / community_replies，无需本地逻辑
// =====================================================================
async function notificationsRemote(): Promise<NotificationItem[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const res = (await withTimeout(
    sb.rpc("get_my_notifications") as unknown as Promise<{ data: any; error: any }>,
    10000
  )) as {
    data: any;
    error: any;
  };
  if (res.error || !res.data) return [];
  return (res.data as any[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    actorId: r.actor_id,
    actorName: r.actor_name || "用户",
    actorAvatarUrl: r.actor_avatar || "",
    actorFrame: r.actor_frame || "",
    postId: r.post_id,
    postSnippet: r.post_snippet || "",
    commentContent: r.comment_content || undefined,
    createdAt: new Date(r.created_at).getTime(),
  }));
}

// =====================================================================
// 私信（RPC: send_dm / get_my_conversations / get_dm_thread / unread_dm_count）
// =====================================================================
async function sendDmRemote(receiverId: string, content: string): Promise<DmMessage | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const res = (await withTimeout(
    sb.rpc("send_dm", { p_receiver: receiverId, p_content: content }) as unknown as Promise<{
      data: any;
      error: any;
    }>,
    10000
  )) as { data: any; error: any };
  if (res.error || !res.data) return null;
  const d = (res.data as any[])[0];
  if (!d) return null;
  return {
    id: d.id,
    senderId: d.sender_id,
    receiverId: d.receiver_id,
    content: d.content,
    status: d.status,
    createdAt: new Date(d.created_at).getTime(),
  };
}

async function listConversationsRemote(): Promise<Conversation[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const res = (await withTimeout(
    sb.rpc("get_my_conversations") as unknown as Promise<{ data: any; error: any }>,
    10000
  )) as {
    data: any;
    error: any;
  };
  if (res.error || !res.data) return [];
  return (res.data as any[]).map((r) => ({
    otherId: r.other_id,
    otherName: r.other_name || "用户",
    otherAvatarUrl: r.other_avatar || "",
    otherFrame: r.other_frame || "",
    lastContent: r.last_content || "",
    lastAt: new Date(r.last_at).getTime(),
    unreadCount: Number(r.unread_count) || 0,
    lastSenderMe: !!r.last_sender_me,
  }));
}

async function getDmThreadRemote(otherId: string): Promise<DmMessage[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const res = (await withTimeout(
    sb.rpc("get_dm_thread", { p_other: otherId }) as unknown as Promise<{ data: any; error: any }>,
    10000
  )) as {
    data: any;
    error: any;
  };
  if (res.error || !res.data) return [];
  return (res.data as any[]).map((r) => ({
    id: r.id,
    senderId: r.sender_id,
    receiverId: r.receiver_id,
    content: r.content,
    status: r.status,
    createdAt: new Date(r.created_at).getTime(),
  }));
}

async function unreadDmCountRemote(): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  const res = (await withTimeout(
    sb.rpc("unread_dm_count") as unknown as Promise<{ data: any; error: any }>,
    10000
  )) as {
    data: any;
    error: any;
  };
  if (res.error || !res.data) return 0;
  // 标量函数可能返回 [{ unread_dm_count: n }] 或 [n] 或标量，统一兜底
  const raw = res.data as any;
  if (Array.isArray(raw)) {
    if (raw.length && typeof raw[0] === "object") return Number(raw[0].unread_dm_count) || 0;
    return Number(raw[0]) || 0;
  }
  return Number(raw) || 0;
}
