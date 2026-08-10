// =====================================================================
// 头像框注册表（前端唯一来源）
// ---------------------------------------------------------------------
// profiles.avatar_frame 只存「框 id」字符串（如 'rainbow' / ''），
// 具体的视觉（渐变 / 动画）由本文件 + UserAvatar 的 CSS class 决定。
// 这里集中维护「可选框清单」，供「个人资料」页选择器与任何需要枚举框的地方复用。
// 新增框：在 AVATAR_FRAMES 加一项 + 在 UserAvatar 样式补对应的 .af-xxx .ua-frame 规则即可。
// =====================================================================

export interface AvatarFrameDef {
  /** 存入数据库的 id（空串 = 无边框） */
  id: string;
  /** 展示名（选择器用） */
  name: string;
  /** UserAvatar 叠加环的 CSS class（对应 UserAvatar 样式中的 .af-xxx .ua-frame） */
  cls: string;
  /** 选择器里的简短说明 */
  desc: string;
}

/** 全部可选头像框（第一项为空 = 无边框，作为默认 / 取消选择） */
export const AVATAR_FRAMES: AvatarFrameDef[] = [
  { id: "", name: "无", cls: "", desc: "默认无边框" },
  { id: "rainbow", name: "炫彩", cls: "af-rainbow", desc: "流动炫彩光环" },
  { id: "member", name: "会员", cls: "af-member", desc: "尊贵会员金框" },
  { id: "aurora", name: "极光", cls: "af-aurora", desc: "极光渐变光环" },
  { id: "diamond", name: "钻石", cls: "af-diamond", desc: "钻石璀璨光环" },
];

/** 按 id 取 class（未知 / 空 → 空串，调用方据此判断是否渲染边框） */
export function frameClass(id?: string | null): string {
  if (!id) return "";
  return AVATAR_FRAMES.find((f) => f.id === id)?.cls ?? "";
}

/** 该 id 是否对应一个有效（非空）边框 */
export function hasFrame(id?: string | null): boolean {
  return frameClass(id) !== "";
}

/** 取某 id 的展示名（未知 → '无'），用于展示 / 调试 */
export function frameName(id?: string | null): string {
  if (!id) return "无";
  return AVATAR_FRAMES.find((f) => f.id === id)?.name ?? "无";
}
