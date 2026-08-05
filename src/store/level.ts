// =====================================================================
// 用户等级元数据（纯常量模块，无响应式状态）
// - 等级阶梯：名称、色带(band)、徽章图标、经验阈值(expMin)
// - 等级由后端（profiles.level 字段）决定，前端只读展示
// - 经验值(EXP)为等级体系定义（升级所需经验），前端用于展示与进度计算；
//   用户实际 exp 由后端 profiles.exp 维护（缺省 0）。
// =====================================================================

export type Band = "bronze" | "silver" | "gold" | "diamond";

export interface LevelMeta {
  id: number;
  name: string;
  band: Band;
  icon: string; // OutlineIcon 类型
  expMin: number; // 达到该等级所需的最低经验值（数组顺序即递增）
  perks: string[]; // 该等级享有的权益（用于等级详情页展示，可扩展）
}

// 等级阶梯（数组下标 = 等级序号；0 = 新手散户）
// 经验阈值门槛：每级所需累计经验值（expMin）。perks 为该等级解锁的权益。
export const TIERS: LevelMeta[] = [
  {
    id: 1,
    name: "新手散户",
    band: "bronze",
    icon: "star",
    expMin: 0,
    perks: ["创建自选股、查看个股基础分析", "新手引导与使用教程", "每日行情速览"],
  },
  {
    id: 2,
    name: "进阶散户",
    band: "bronze",
    icon: "star-filled",
    expMin: 100,
    perks: ["解锁深度技术指标解读（MACD / KDJ / RSI）", "自定义自选分组", "分时与 K 线增强视图"],
  },
  {
    id: 3,
    name: "初级交易员",
    band: "silver",
    icon: "medal",
    expMin: 300,
    perks: ["解锁行业板块解读与关联资讯", "社区发帖与评论互动", "基础风险评级提示"],
  },
  {
    id: 4,
    name: "中级交易员",
    band: "silver",
    icon: "medal",
    expMin: 600,
    perks: ["自选股异动提醒", "多维技术研判报告", "情绪面与资金流向解读"],
  },
  {
    id: 5,
    name: "资深操盘手",
    band: "gold",
    icon: "trophy",
    expMin: 1000,
    perks: ["专业研报摘要速读", "无广告纯净体验", "大盘环境与板块轮动分析"],
  },
  {
    id: 6,
    name: "私募经理",
    band: "gold",
    icon: "trophy",
    expMin: 2000,
    perks: ["多账户 / 多标的对比", "专属客服通道", "自定义分析指标模板"],
  },
  {
    id: 7,
    name: "股神",
    band: "diamond",
    icon: "crown",
    expMin: 4000,
    perks: ["解锁全部高级功能", "社区「认证大 V」标识", "优先体验内测新功能"],
  },
];

// 最高等级序号
export const MAX_LEVEL = TIERS.length - 1;

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

export interface LevelRange {
  min: number;
  max: number | null; // null 表示最高等级（无上限）
  label: string; // 如 "0–99" 或 "4000+"
}

/** 某等级的「经验值范围」：下界为 expMin，上界为下一级 expMin-1；最高级无上限。 */
export function expRangeOf(level: number): LevelRange {
  const lv = clampLevel(level);
  const min = TIERS[lv].expMin;
  const next = TIERS[lv + 1];
  const max = next ? next.expMin - 1 : null;
  const label = max === null ? `${min}+` : `${min}–${max}`;
  return { min, max, label };
}

export interface LevelProgress {
  exp: number; // 实际经验（已 clamp 到合理范围）
  range: LevelRange;
  span: number; // 当前等级宽度（max ? max-min+1 : 1）
  base: number; // 当前等级下界
  inLevel: number; // 当前等级内已积累经验
  ratio: number; // 0–1 进度（最高级恒为 1）
  toNext: number | null; // 距下一级还需经验（最高级为 null）
  isMax: boolean;
}

/** 给定等级与实际经验，计算当前等级内进度（用于进度条与「距下一级还需 X」）。 */
export function progressOf(level: number, exp: number): LevelProgress {
  const lv = clampLevel(level);
  const range = expRangeOf(lv);
  const raw = Number.isFinite(exp) && exp > 0 ? exp : 0;
  const base = range.min;
  const isMax = range.max === null;
  const inLevel = isMax ? 0 : Math.max(0, Math.min(raw, range.max!) - base);
  const span = isMax ? 1 : range.max! - base + 1;
  const ratio = isMax ? 1 : Math.max(0, Math.min(1, (raw - base) / (range.max! - base)));
  const toNext = isMax ? null : Math.max(0, range.max! + 1 - raw);
  return { exp: raw, range, span, base, inLevel, ratio, toNext, isMax };
}

/** 完整等级体系（供面板展示）：每级名称、图标、经验范围、是否已达成。 */
export function levelLadder(currentLevel: number, currentExp: number) {
  const lv = clampLevel(currentLevel);
  const exp = Number.isFinite(currentExp) && currentExp > 0 ? currentExp : 0;
  return TIERS.map((t, i) => ({
    level: i,
    id: t.id,
    name: t.name,
    band: t.band,
    icon: t.icon,
    perks: t.perks,
    range: expRangeOf(i),
    reached: exp >= t.expMin, // 已达成（含当前）
    current: i === lv,
  }));
}

// =====================================================================
// 经验获取途径（升级规则）
// - 用户通过「行为」获取经验值(exp)，累计达到 TIERS[i].expMin 即升级。
// - 规则设计为数据驱动，新增途径只需在下方数组追加一项，前端自动展示，
//   后端据此累加（见 deploy.sql / 业务逻辑层）。
// - once=true 表示仅首次触发（如完善资料），否则为可重复行为（每日/每次）。
// =====================================================================
export interface ExpSource {
  key: string;
  label: string; // 行为名称
  exp: number; // 该行为获得的经验值
  unit?: string; // 数值单位说明（如「每次」「每日」）
  once?: boolean; // 是否仅首次获得
  desc: string; // 规则描述（详情页展示）
}

export const EXP_SOURCES: ExpSource[] = [
  { key: "profile", label: "完善个人资料", exp: 20, once: true, desc: "首次完善昵称 / 头像 / 简介，一次性奖励经验。" },
  { key: "signin", label: "每日登录签到", exp: 5, unit: "每日", desc: "每日打开 App 登录即获得，连续登录有额外加成。" },
  { key: "streak", label: "连续登录加成", exp: 15, unit: "每 7 天", desc: "连续登录满 7 天额外奖励，鼓励持续活跃。" },
  { key: "report", label: "查看分析报告", exp: 2, unit: "每次", desc: "每次查看个股分析 / 研报解读获得经验。" },
  { key: "watch", label: "添加自选股", exp: 3, unit: "每次", desc: "每添加一只自选股获得经验（上限 30 次 / 日）。" },
  { key: "post", label: "社区发帖", exp: 10, unit: "每次", desc: "在社区发布原创帖子获得经验。" },
  { key: "comment", label: "发表评论", exp: 5, unit: "每次", desc: "在帖子下发表评论获得经验。" },
  { key: "like", label: "互动点赞", exp: 1, unit: "每次", desc: "为帖子 / 评论点赞获得经验。" },
  { key: "liked", label: "内容被赞", exp: 3, unit: "每次", desc: "自己的内容被其他用户点赞获得经验。" },
];

// 升级规则要点（详情页顶部说明文字）
export const LEVEL_RULE_NOTE =
  "等级由累计经验值（EXP）决定：经验达到某一门槛即自动升级，不会降级。" +
  "经验通过日常使用行为获取（见下方「升级规则」），注册并完成资料完善即可从 Lv.1 起步。";

