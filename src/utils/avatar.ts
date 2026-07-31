// =====================================================================
// 头像与话题的视觉工具
// ---------------------------------------------------------------------
// 社区当前为「本地昵称」匿名体系，没有真实头像图片。这里提供三类视觉标识：
//   - 默认头像集合（DEFAULT_AVATARS）：一组精心搭配的 emoji + 渐变底，
//     用户未上传/未自选头像时，按昵称哈希稳定分配一个，保证"人人有像、且各异"。
//   - 自选 emoji 头像：用户在身份栏点选，优先于默认头像显示。
// 另外导出话题（股票/板块）标签配色，供社区首页筛选与帖子头部使用。
// =====================================================================

/** 预设头像 emoji（用户在身份栏点选；空字符串表示"用默认头像"） */
export const presetEmojis: string[] = [
  "", "🦊", "🐼", "🚀", "💰", "🐯", "🦉", "🌟", "🔥", "🐳",
  "🍀", "⚡", "🐺", "🐝", "🦅", "🌈", "💎", "🏆", "🌊", "🧠",
];

/** 单个头像的视觉设计（文本 + 底色 + 字号） */
export interface AvatarDesign {
  text: string;
  bg: string;
  fontSize: string;
}

/**
 * 一组精心设计的默认头像（emoji + 渐变底）。
 * 用户未上传 / 未自选头像时使用，按昵称稳定分配，避免"所有人都是同一个占位"或光秃秃首字母。
 */
export const DEFAULT_AVATARS: AvatarDesign[] = [
  { text: "🦊", bg: "linear-gradient(135deg, #ff9a3c, #ff6b6b)", fontSize: "32rpx" },
  { text: "🐼", bg: "linear-gradient(135deg, #9aa7b3, #5f6f7d)", fontSize: "32rpx" },
  { text: "🚀", bg: "linear-gradient(135deg, #4f8cff, #6a5cff)", fontSize: "32rpx" },
  { text: "🌟", bg: "linear-gradient(135deg, #f7b733, #fc4a1a)", fontSize: "32rpx" },
  { text: "🐳", bg: "linear-gradient(135deg, #16bffd, #0a6cff)", fontSize: "32rpx" },
  { text: "🌈", bg: "linear-gradient(135deg, #a18cd1, #fbc2eb)", fontSize: "32rpx" },
  { text: "💎", bg: "linear-gradient(135deg, #43e97b, #38f9d7)", fontSize: "32rpx" },
  { text: "🧠", bg: "linear-gradient(135deg, #2bc0e4, #330867)", fontSize: "32rpx" },
];

/** 一套辨识度高、在明暗主题下都清晰的高级渐变（默认头像 / 兼容旧逻辑用） */
const GRADIENTS: string[] = [
  "linear-gradient(135deg, #07c160, #0a9d8f)",
  "linear-gradient(135deg, #3b82f6, #6366f1)",
  "linear-gradient(135deg, #f59e0b, #ef4444)",
  "linear-gradient(135deg, #ec4899, #8b5cf6)",
  "linear-gradient(135deg, #14b8a6, #0ea5e9)",
  "linear-gradient(135deg, #f43f5e, #fb7185)",
  "linear-gradient(135deg, #8b5cf6, #6366f1)",
  "linear-gradient(135deg, #22c55e, #16a34a)",
  "linear-gradient(135deg, #eab308, #f97316)",
  "linear-gradient(135deg, #06b6d4, #3b82f6)",
];

/** 按昵称稳定分配一个默认头像（同昵称永远同一个） */
export function defaultAvatarFor(name: string): AvatarDesign {
  const s = (name || "?").trim();
  return DEFAULT_AVATARS[hash(s) % DEFAULT_AVATARS.length];
}

/**
 * 统一解析头像：优先用用户自选 / 上传的 emoji；
 * 无头像时回退到按昵称稳定分配的默认头像（而不是光秃秃的首字母）。
 */
export function resolveAvatar(name: string, avatar?: string): AvatarDesign {
  const a = (avatar || "").trim();
  if (a) return { text: a, bg: "var(--card-2)", fontSize: "34rpx" };
  return defaultAvatarFor(name);
}

/** 简单字符串哈希（djb2 变体），用于把昵称映射到稳定索引 */
function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return h >>> 0; // 转无符号，避免负数
}

/** 按昵称生成【稳定】的渐变底色（同昵称永远同色） */
export function avatarGradient(name: string): string {
  const s = (name || "?").trim();
  return GRADIENTS[hash(s) % GRADIENTS.length];
}

/** 话题（股票 / 板块）标签配色：个股走主色系，板块走紫罗兰系，便于一眼区分 */
export function topicColor(type: "stock" | "sector"): { fg: string; bg: string } {
  if (type === "sector") {
    return { fg: "#7c5cff", bg: "rgba(124, 92, 255, 0.12)" };
  }
  return { fg: "var(--primary-dark)", bg: "rgba(7, 193, 96, 0.14)" };
}
