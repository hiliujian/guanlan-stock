// =====================================================================
// 用户等级元数据（纯常量模块，无 EXP / 无响应式状态）
// - 等级阶梯：名称、色带(band)、徽章图标
// - 等级由后端（profiles.level 字段）决定，前端只读展示
// - 经验值(EXP)已废弃：所有用户默认等级为 0（新手散户），界面不再展示 EXP
// =====================================================================

export type Band = "bronze" | "silver" | "gold" | "diamond";

export interface LevelMeta {
  id: number;
  name: string;
  band: Band;
  icon: string; // OutlineIcon 类型
}

// 等级阶梯（数组下标 = 等级序号；0 = 新手散户）
export const TIERS: LevelMeta[] = [
  { id: 1, name: "新手散户", band: "bronze", icon: "star" },
  { id: 2, name: "进阶散户", band: "bronze", icon: "star-filled" },
  { id: 3, name: "初级交易员", band: "silver", icon: "medal" },
  { id: 4, name: "中级交易员", band: "silver", icon: "medal" },
  { id: 5, name: "资深操盘手", band: "gold", icon: "trophy" },
  { id: 6, name: "私募经理", band: "gold", icon: "trophy" },
  { id: 7, name: "股神", band: "diamond", icon: "crown" },
];

// 色带配色：仅用于等级标签 / 徽章的渐变与图标色（深 / 浅主题下均清晰可读）
export interface BandColor {
  from: string;
  to: string;
  icon: string; // 与渐变搭配的文字 / 图标色（深色，保证对比度）
}
export const BAND_COLORS: Record<Band, BandColor> = {
  bronze: { from: "#e8b06b", to: "#a86a2c", icon: "#3a2509" },
  silver: { from: "#eef2f7", to: "#aeb7c4", icon: "#3a4350" },
  gold: { from: "#ffe27a", to: "#d39b00", icon: "#4a3500" },
  diamond: { from: "#9bf0ff", to: "#2bb6e6", icon: "#06303a" },
};

function clampLevel(level: number): number {
  if (!Number.isFinite(level) || level < 0) return 0;
  if (level > TIERS.length - 1) return TIERS.length - 1;
  return Math.floor(level);
}

export function levelMeta(level: number): LevelMeta {
  return TIERS[clampLevel(level)] ?? TIERS[0];
}
