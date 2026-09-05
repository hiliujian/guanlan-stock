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

/**
 * 会员金框（member）为 VIP 专属视觉：过期 / 未开通自动回收为无边框，其余框不受 VIP 约束。
 * 所有 UserAvatar 的 frame 传参统一经此收口，保证「已过期」用户在任意展示位不再保留金框
 * （昵称金色列 / 金冠 / LevelTag 均已按 vipActive 判定，此处补齐头像框这一环）。
 * isVip 传 undefined（如数据源缺 VIP 字段）视为未知、不做回收，避免误伤。
 */
export function vipGatedFrame(frame: string | null | undefined, isVip?: boolean): string {
  if (frame === "member" && isVip === false) return "";
  return frame || "";
}
