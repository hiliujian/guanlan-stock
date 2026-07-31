// =====================================================================
// 社区数据仓储（模拟 Supabase 的 Service 层）
// ---------------------------------------------------------------------
// 设计目标：UI 层只调用 communityRepo 的方法，永远不关心数据存在哪。
// - 现在（USE_REMOTE = false）：localStorage 实现，单机可用、无需后端，
//   并用 delay() 模拟网络延迟，让"假接口"的行为无限接近真实异步请求。
// - 将来：在 src/config/app.ts 填入真实 Supabase 凭据后，isSupabaseConfigured
//   变为 true，USE_REMOTE 自动为真，下列 public 方法会改走真实 Supabase 表
//   （community_posts / community_replies / community_likes）。UI 一行不改。
// =====================================================================
import { getSupabase, isSupabaseConfigured } from "@/api/supabase";
import { getMyName, getMyAvatar } from "@/store/identity";

const USE_REMOTE = isSupabaseConfigured; // 开放 Supabase 配置即自动切换
const LS_KEY = "guanlan_community_v1";

// ---------------------------------------------------------------------
// 类型定义
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
  totalReturn: number; // 总收益率 %
  realized: number; // 已实现盈亏（元）
  unrealized: number; // 未实现盈亏（元）
  winRate?: number; // 胜率 %
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
  avatar?: string; // 头像 emoji（为空则用昵称首字母占位）
  topic?: Topic; // 关联标的（个股 / 板块），用于分类
  createdAt: number;
  content?: string;
  card?: PostCard;
  likes: number;
  likedByMe: boolean;
  replies: Reply[];
}

// ---------------------------------------------------------------------
// 本地存储（localStorage 实现）
// ---------------------------------------------------------------------
function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 模拟网络延迟，让"假接口"具备真实异步请求的时序特征 */
function delay<T>(v: T, ms = 160): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(v), ms));
}

function loadLocal(): CommunityPost[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as CommunityPost[]) : [];
  } catch {
    return [];
  }
}

function saveLocal(posts: CommunityPost[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(posts));
  } catch {
    /* 隐私模式 / 配额满：静默降级，不影响本次会话内存态 */
  }
}

// ---------------------------------------------------------------------
// 已点赞集合（仅远程模式使用）
// 远程 list 不返回 likedByMe 的可靠用户维度（当前无 Auth），用本地集合
// 记录"我点过赞的帖子"，刷新后回填，避免点赞态丢失。
// ---------------------------------------------------------------------
const LS_LIKED = "guanlan_liked_posts";
function loadLiked(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_LIKED) || "[]") as string[]);
  } catch {
    return new Set();
  }
}
function saveLiked(set: Set<string>): void {
  try {
    localStorage.setItem(LS_LIKED, JSON.stringify([...set]));
  } catch {
    /* 静默降级 */
  }
}

// ---------------------------------------------------------------------
// 首次进入的示例动态（让信息流开箱即有内容，并演示三类特殊卡片）
// ---------------------------------------------------------------------
function seedIfEmpty(): CommunityPost[] {
  const existing = loadLocal();
  if (existing.length) return existing;

  const day = 86_400_000;
  const now = Date.now();
  const seeded: CommunityPost[] = [
    {
      id: uid(),
      type: "text",
      author: "趋势猎人",
      avatar: "🦊",
      topic: { type: "sector", name: "大盘" },
      createdAt: now - 2 * 3_600_000,
      content:
        "大盘缩量回踩 20 日线，但北向资金连续三日净流入，个人判断这里更像是洗盘而不是转势。仓位不动，等放量确认再决定加仓。",
      likes: 18,
      likedByMe: false,
      replies: [
        { id: uid(), author: "价值守望", content: "同意，量能没放出来之前都不用慌。", createdAt: now - 1.6 * 3_600_000 },
        { id: uid(), author: "短线小王", content: "我早盘抄了点，被套 1 个点 😂", createdAt: now - 1.2 * 3_600_000 },
      ],
    },
    {
      id: uid(),
      type: "card",
      author: "价值守望",
      avatar: "🐼",
      topic: { type: "stock", name: "贵州茅台", code: "600519" },
      createdAt: now - 5 * 3_600_000,
      card: { kind: "holding", stock: "贵州茅台", code: "600519", cost: 1480, shares: 100, price: 1526.5 },
      likes: 7,
      likedByMe: false,
      replies: [],
    },
    {
      id: uid(),
      type: "card",
      author: "短线小王",
      avatar: "🚀",
      topic: { type: "stock", name: "宁德时代", code: "300750" },
      createdAt: now - 9 * 3_600_000,
      card: { kind: "operation", stock: "宁德时代", code: "300750", side: "buy", price: 186.2, shares: 200, note: "突破平台 + 量能放大，打底仓" },
      likes: 4,
      likedByMe: false,
      replies: [
        { id: uid(), author: "趋势猎人", content: "追高需谨慎，设好止损。", createdAt: now - 8 * 3_600_000 },
      ],
    },
    {
      id: uid(),
      type: "card",
      author: "复利机器",
      avatar: "💰",
      createdAt: now - 1 * day,
      card: { kind: "profit", period: "本月", totalReturn: 6.8, realized: 4200, unrealized: -1300, winRate: 63 },
      likes: 25,
      likedByMe: false,
      replies: [],
    },
    {
      id: uid(),
      type: "text",
      author: "复利机器",
      avatar: "💰",
      topic: { type: "sector", name: "投资理念" },
      createdAt: now - 1.5 * day,
      content: "分享一个心态：账户回撤 5% 以内就当没发生，别天天盯盘。把时间花在研究财报和产业链上，收益是认知的副产品。",
      likes: 33,
      likedByMe: false,
      replies: [],
    },
  ];
  saveLocal(seeded);
  return seeded;
}

// ---------------------------------------------------------------------
// Public API（Supabase 形态的 Service 层；UI 只依赖这些方法）
// ---------------------------------------------------------------------
export const communityRepo = {
  async list(): Promise<CommunityPost[]> {
    if (USE_REMOTE) return listRemote();
    const posts = seedIfEmpty();
    return delay(posts.slice().sort((a, b) => b.createdAt - a.createdAt));
  },

  async create(
    input:
      | { type: "text"; content: string; topic?: Topic; avatar?: string }
      | { type: "card"; card: PostCard; avatar?: string }
  ): Promise<CommunityPost> {
    if (USE_REMOTE) return createRemote(input);
    const posts = loadLocal();
    // 特殊卡片（持仓 / 操作）自动归属到对应个股话题；纯文字帖由调用方传入 topic
    const topic: Topic | undefined =
      input.type === "card"
        ? input.card.kind === "holding" || input.card.kind === "operation"
          ? { type: "stock", name: input.card.stock, code: input.card.code }
          : undefined
        : input.topic;
    const post: CommunityPost = {
      id: uid(),
      type: input.type,
      author: getMyName(),
      avatar: input.avatar ?? getMyAvatar(),
      topic,
      createdAt: Date.now(),
      content: input.type === "text" ? input.content.trim() : undefined,
      card: input.type === "card" ? input.card : undefined,
      likes: 0,
      likedByMe: false,
      replies: [],
    };
    posts.push(post);
    saveLocal(posts);
    return delay(post);
  },

  async toggleLike(id: string): Promise<CommunityPost | null> {
    if (USE_REMOTE) return toggleLikeRemote(id);
    const posts = loadLocal();
    const p = posts.find((x) => x.id === id);
    if (!p) return delay(null);
    p.likedByMe = !p.likedByMe;
    p.likes += p.likedByMe ? 1 : -1;
    if (p.likes < 0) p.likes = 0;
    saveLocal(posts);
    return delay(p);
  },

  async addReply(id: string, content: string): Promise<CommunityPost | null> {
    if (USE_REMOTE) return addReplyRemote(id, content);
    const posts = loadLocal();
    const p = posts.find((x) => x.id === id);
    if (!p) return delay(null);
    p.replies.push({ id: uid(), author: getMyName(), content: content.trim(), createdAt: Date.now() });
    saveLocal(posts);
    return delay(p);
  },

  async remove(id: string): Promise<void> {
    if (USE_REMOTE) return removeRemote(id);
    const posts = loadLocal().filter((x) => x.id !== id);
    saveLocal(posts);
    return delay(undefined);
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
// 远程实现（开放 Supabase 配置后启用，仅供切换参考）
// 表结构（严格对应 supabase/deploy.sql）：
//   community_posts(id uuid pk, user_id uuid→auth.users on delete set null,
//                   type text chk, author text, avatar text, topic jsonb,
//                   content text, card jsonb, likes int chk>=0, created_at timestamptz)
//   community_replies(id uuid pk, post_id uuid fk→posts on delete cascade,
//                     user_id uuid, author text, content text, created_at timestamptz)
//   community_likes(post_id uuid fk, user_id uuid, primary key(post_id, user_id))
//   —— 点赞计数由 trg_sync_likes 触发器从 community_likes 聚合，客户端无法伪造
//   —— 点赞切换走 RPC：public.toggle_post_like(p_post_id uuid)
// 注：开放配置后 UI 一行不改即切远程；listRemote 已请求 avatar/topic 字段。
// =====================================================================
async function listRemote(): Promise<CommunityPost[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("community_posts")
    .select("id, type, author, avatar, topic, content, card, likes, created_at, replies:community_replies(id, author, content, created_at)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  const liked = loadLiked();
  return (data as any[]).map((r) => ({
    id: r.id,
    type: r.type,
    author: r.author,
    avatar: r.avatar || undefined,
    topic: r.topic || undefined,
    createdAt: new Date(r.created_at).getTime(),
    content: r.content ?? undefined,
    card: r.card ?? undefined,
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

async function createRemote(
  input:
    | { type: "text"; content: string; topic?: Topic; avatar?: string }
    | { type: "card"; card: PostCard; avatar?: string }
): Promise<CommunityPost> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase 未配置");
  const row: any = {
    author: getMyName(),
    avatar: input.avatar ?? getMyAvatar(),
    topic: input.type === "text" ? input.topic ?? null : null,
    type: input.type,
    content: input.type === "text" ? input.content.trim() : null,
    card: input.type === "card" ? input.card : null,
    likes: 0,
  };
  const { data, error } = await sb.from("community_posts").insert(row).select().single();
  if (error || !data) throw error || new Error("发布失败");
  const d = data as any;
  return {
    id: d.id,
    type: d.type,
    author: d.author,
    avatar: d.avatar || undefined,
    topic: d.topic || undefined,
    createdAt: new Date(d.created_at).getTime(),
    content: d.content ?? undefined,
    card: d.card ?? undefined,
    likes: 0,
    likedByMe: false,
    replies: [],
  };
}

async function toggleLikeRemote(id: string): Promise<CommunityPost | null> {
  const sb = getSupabase();
  if (!sb) return null;
  // rpc 直接返回 data（数组，单行），不要用 .select().single() 链（rpc 不支持）
  const { data, error } = await sb.rpc("toggle_post_like", { post_id: id });
  if (error || !data) return null;
  const d = (data as any[])[0];
  if (!d) return null;
  // 用服务端返回的 liked_by_me 同步本地已点赞集合，刷新后不丢态
  const liked = loadLiked();
  if (d.liked_by_me) liked.add(id);
  else liked.delete(id);
  saveLiked(liked);
  return {
    id: d.id,
    type: d.type,
    author: d.author,
    avatar: d.avatar || undefined,
    topic: d.topic || undefined,
    createdAt: new Date(d.created_at).getTime(),
    content: d.content ?? undefined,
    card: d.card ?? undefined,
    likes: d.likes ?? 0,
    likedByMe: !!d.liked_by_me,
    replies: [],
  };
}

async function addReplyRemote(id: string, content: string): Promise<CommunityPost | null> {
  const sb = getSupabase();
  if (!sb) return null;
  await sb.from("community_replies").insert({ post_id: id, author: getMyName(), content: content.trim() });
  return listRemote().then((list) => list.find((p) => p.id === id) || null);
}

async function removeRemote(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("community_posts").delete().eq("id", id);
}
