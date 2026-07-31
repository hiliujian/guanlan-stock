// =====================================================================
// 头像与话题的视觉工具
// ---------------------------------------------------------------------
// 社区当前为「本地昵称」匿名体系，没有真实头像图片。这里提供两类视觉标识：
//   - 首字母占位头像：按昵称哈希生成【稳定且各异】的渐变底色，
//     解决"所有人头像都是同一个主色、分不清谁是谁"的问题。
//   - emoji 头像：用户在身份栏任选一个，优先显示，更有"头像"感。
// 另外导出话题（股票/板块）标签配色，供社区首页筛选与帖子头部使用。
// =====================================================================

/** 预设头像 emoji（用户在身份栏点选；空字符串表示"用首字母占位"） */
export const presetEmojis: string[] = [
  "", "🦊", "🐼", "🚀", "💰", "🐯", "🦉", "🌟", "🔥", "🐳",
  "🍀", "⚡", "🐺", "🐝", "🦅", "🌈", "💎", "🏆", "🌊", "🧠",
];

/** 一套辨识度高、在明暗主题下都清晰的高级渐变（首字母占位头像用） */
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
