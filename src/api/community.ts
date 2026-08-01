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
import { translateSupabaseError } from "@/api/auth";
import { getMyName } from "@/store/identity";
import { userState } from "@/store/user";

// ---------------------------------------------------------------------
// 类型定义（TS / UI 侧 camelCase）
// ---------------------------------------------------------------------
export type CardKind = "holding" | "operation" | "profit";

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

export interface Reply {
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
  topic?: Topic; // 关联标的（个股 / 板块），用于分类
  createdAt: number;
  content?: string;
  card?: PostCard;
  likes: number;
  likedByMe: boolean;
  replies: Reply[];
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
      | { type: "text"; content: string; topic?: Topic }
      | { type: "card"; card: PostCard }
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
  const p = (n: number) => String(n).padStart(2, "0");
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
  const { data, error } = await sb
    .from("community_posts")
    .select(
      "id, type, author, user_id, topic, content, card, likes, created_at, replies:community_replies(id, author, content, created_at)"
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  // 点赞态以服务端 community_likes 为唯一权威（不再本地缓存）
  const liked = await loadLikedFromServer(sb);
  return (data as any[]).map((r) => ({
    id: r.id,
    type: r.type,
    author: r.author,
    userId: r.user_id || null,
    topic: r.topic || undefined,
    createdAt: new Date(r.created_at).getTime(),
    content: r.content ?? undefined,
    card: r.card ? toClientCard(r.card) : undefined,
    likes: r.likes ?? 0,
    likedByMe: liked.has(r.id),
    replies: (r.replies || []).map((x: any) => ({
      id: x.id,
      author: x.author,
      content: x.content,
      createdAt: new Date(x.created_at).getTime(),
    })),
  }));
}

/** 取当前用户点过赞的帖子 id 集合（服务端权威；未登录则为空集） */
async function loadLikedFromServer(sb: any): Promise<Set<string>> {
  const { data: u } = await sb.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return new Set();
  const { data } = await sb.from("community_likes").select("post_id").eq("user_id", uid);
  return new Set((data || []).map((x: any) => x.post_id as string));
}

async function createRemote(
  input:
    | { type: "text"; content: string; topic?: Topic }
    | { type: "card"; card: PostCard }
): Promise<CommunityPost> {
  const sb = getSupabase();
  if (!sb) throw new Error("发布失败，请稍后再试");
  const row: any = {
    author: getMyName(),
    user_id: userState.userId || null,
    topic: input.type === "text" ? input.topic ?? null : null,
    type: input.type,
    content: input.type === "text" ? input.content.trim() : null,
    card: input.type === "card" ? toStoredCard(input.card) : null,
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
    topic: d.topic || undefined,
    createdAt: new Date(d.created_at).getTime(),
    content: d.content ?? undefined,
    card: d.card ? toClientCard(d.card) : undefined,
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
  // 点赞态以 RPC 返回的 liked_by_me 为准（服务端已写入 community_likes）
  return {
    id: d.id,
    type: d.type,
    author: d.author,
    topic: d.topic || undefined,
    createdAt: new Date(d.created_at).getTime(),
    content: d.content ?? undefined,
    card: d.card ? toClientCard(d.card) : undefined,
    likes: d.likes ?? 0,
    likedByMe: !!d.liked_by_me,
    replies: [],
  };
}

async function addReplyRemote(id: string, content: string): Promise<CommunityPost | null> {
  const sb = getSupabase();
  if (!sb) return null;
  await sb
    .from("community_replies")
    .insert({ post_id: id, author: getMyName(), content: content.trim() });
  return listRemote().then((list) => list.find((p) => p.id === id) || null);
}

async function removeRemote(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("community_posts").delete().eq("id", id);
}
