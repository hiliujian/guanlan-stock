// =====================================================================
// 头像与话题的视觉工具
// ---------------------------------------------------------------------
// 社区采用「字」头像：按昵称稳定生成渐变底色 + 首字，无需任何图片 / emoji。
// 另外导出话题（股票 / 板块）标签配色，供社区首页筛选与帖子头部使用。
// =====================================================================

/** 一套辨识度高、在明暗主题下都清晰的高级渐变（按昵称哈希稳定取用） */
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

/** 取昵称首字（中文取首字，英文取首字母大写），用于「字」头像 */
export function avatarChar(name: string): string {
  const s = (name || "?").trim();
  return s.charAt(0).toUpperCase() || "?";
}

/**
 * 「字」头像的稳定种子：唯一依赖「用户名」生成（用户名唯一、固定、不可修改，
 * 正式环境不为空），保证默认头像底色与首字在昵称可编辑时始终不变，
 * 仅当用户自行上传图片头像时才改变。不使用邮箱或用户 id 回退。
 * 仅传入用户名即可；用户名为空时返回空串，由调用方兜底（如「我」）。
 */
export function avatarSeed(username: string): string {
  return (username || "").trim();
}

/** 话题（股票 / 板块）标签配色：个股走主色系，板块走紫罗兰系，便于一眼区分 */
export function topicColor(type: "stock" | "sector"): { fg: string; bg: string } {
  if (type === "sector") {
    return { fg: "#7c5cff", bg: "rgba(124, 92, 255, 0.12)" };
  }
  return { fg: "var(--primary-dark)", bg: "rgba(7, 193, 96, 0.14)" };
}
