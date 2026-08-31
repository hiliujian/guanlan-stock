// =====================================================================
// 用户等级元数据（纯常量模块，无响应式状态）
// - 等级阶梯：名称、色带(band)、徽章图标、经验阈值(expMin)
// - 等级由后端（profiles.level 字段）决定，前端只读展示；
//   后端 refresh_level 阈值与本文件 TIERS.expMin 必须保持一致（改一处必改另一处）
// - 经验值(EXP)为等级体系定义（升级所需经验），前端用于展示与进度计算；
//   用户实际 exp 由后端 profiles.exp 维护（缺省 0）
// - VIP 会员（profiles.vip，官方授予）：与等级徽标一体化的金色徽章视觉，
//   见 badgeVisual() —— 徽章渐变 / 图标 / 文案的唯一来源
// =====================================================================

type Band = "bronze" | "silver" | "gold" | "diamond";

interface LevelMeta {
  id: number;
  name: string;
  band: Band;
  icon: string; // OutlineIcon 类型
  expMin: number; // 达到该等级所需的最低经验值（数组顺序即递增）
  perks: string[]; // 该等级享有的权益（用于等级详情页展示，可扩展）
}

// 等级阶梯（数组下标 = 等级序号；0 = 新手散户）
// 经验阈值门槛：每级所需累计经验值（expMin）。perks 为该等级解锁的权益。
// 2026-08-30 校准：整体上调约 1.5 倍，让高等级更具稀缺性与成就感；
// 后端只升不降（refresh_level greatest 保底），已获等级不受校准影响。
const TIERS: LevelMeta[] = [
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
    expMin: 150,
    perks: ["解锁深度技术指标解读（MACD / KDJ / RSI）", "自定义自选分组", "分时与 K 线增强视图"],
  },
  {
    id: 3,
    name: "初级交易员",
    band: "silver",
    icon: "medal",
    expMin: 450,
    perks: ["解锁行业板块解读与关联资讯", "社区发帖与评论互动", "基础风险评级提示"],
  },
  {
    id: 4,
    name: "中级交易员",
    band: "silver",
    icon: "medal",
    expMin: 900,
    perks: ["自选股异动提醒", "多维技术研判报告", "情绪面与资金流向解读"],
  },
  {
    id: 5,
    name: "资深操盘手",
    band: "gold",
    icon: "trophy",
    expMin: 1600,
    perks: ["专业研报摘要速读", "无广告纯净体验", "大盘环境与板块轮动分析"],
  },
  {
    id: 6,
    name: "私募经理",
    band: "gold",
    icon: "trophy",
    expMin: 3000,
    perks: ["多账户 / 多标的对比", "专属客服通道", "自定义分析指标模板"],
  },
  {
    id: 7,
    name: "股神",
    band: "diamond",
    icon: "crown",
    expMin: 5500,
    perks: ["解锁全部高级功能", "社区「认证大 V」标识", "优先体验内测新功能"],
  },
];

// 色带配色：仅用于等级徽章的渐变与图标色（深 / 浅主题下均清晰可读）
interface BandColor {
  from: string;
  to: string;
  icon: string; // 与渐变搭配的文字 / 图标色（深色，保证对比度）
}
const BAND_COLORS: Record<Band, BandColor> = {
  bronze: { from: "#e8b06b", to: "#a86a2c", icon: "#3a2509" },
  silver: { from: "#eef2f7", to: "#aeb7c4", icon: "#3a4350" },
  gold: { from: "#ffe27a", to: "#d39b00", icon: "#4a3500" },
  diamond: { from: "#9bf0ff", to: "#2bb6e6", icon: "#06303a" },
};

// VIP 尊贵金：比 gold 色带更深邃的金 + 金环描边，徽章层面的最高视觉档。
// 导出为金色视觉唯一来源（VIP 徽章 / 会员页 / 「我的」横幅均从此取色）。
export const VIP_BADGE = {
  from: "#f7d27a",
  to: "#c08e0e",
  fg: "#43300a",
  ring: "rgba(192, 142, 14, 0.55)",
};

interface BadgeVisual {
  id: number; // Lv 序号（1 起）
  name: string; // 等级完整名（徽章与等级页一致展示）
  label: string; // 徽章文案（等级名；VIP 时为「VIP·等级名」，一体化标识）
  icon: string; // OutlineIcon 类型；VIP 恒为金冠 crown
  from: string; // 徽章渐变起
  to: string; // 徽章渐变止
  fg: string; // 徽章内文字 / 图标色
  ring: string; // 徽章外圈描边色（VIP 金环，普通为透明）
  vip: boolean;
}

/**
 * 等级 / VIP 徽章视觉的唯一来源（LevelTag 与等级页 hero 均从此处取值，
 * 保证「VIP 标识与等级图标」全局一体、不出现两套配色）。
 */
export function badgeVisual(level: number, vip?: boolean): BadgeVisual {
  const meta = levelMeta(level);
  if (vip) {
    return {
      id: meta.id,
      name: meta.name,
      label: `VIP·${meta.name}`,
      icon: "crown",
      from: VIP_BADGE.from,
      to: VIP_BADGE.to,
      fg: VIP_BADGE.fg,
      ring: VIP_BADGE.ring,
      vip: true,
    };
  }
  const c = BAND_COLORS[meta.band];
  return {
    id: meta.id,
    name: meta.name,
    label: meta.name,
    icon: meta.icon,
    from: c.from,
    to: c.to,
    fg: c.icon,
    ring: "transparent",
    vip: false,
  };
}

function clampLevel(level: number): number {
  if (!Number.isFinite(level) || level < 0) return 0;
  if (level > TIERS.length - 1) return TIERS.length - 1;
  return Math.floor(level);
}

function levelMeta(level: number): LevelMeta {
  return TIERS[clampLevel(level)] ?? TIERS[0];
}

interface LevelRange {
  min: number;
  max: number | null; // null 表示最高等级（无上限）
  label: string; // 如 "0–99" 或 "4000+"
}

/** 某等级的「经验值范围」：下界为 expMin，上界为下一级 expMin-1；最高级无上限。 */
function expRangeOf(level: number): LevelRange {
  const lv = clampLevel(level);
  const min = TIERS[lv].expMin;
  const next = TIERS[lv + 1];
  const max = next ? next.expMin - 1 : null;
  const label = max === null ? `${min}+` : `${min}–${max}`;
  return { min, max, label };
}

interface LevelProgress {
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
interface ExpSource {
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
  "等级由累计经验值（EXP）决定：经验达到某一门槛即自动升级，等级只升不降。" +
  "经验通过日常使用行为获取（见下方「升级规则」），注册并完成资料完善即可从 Lv.1 起步。" +
  "门槛会不定期校准，已获等级不受校准影响。";

// VIP 会员权益（叠加在等级权益之上的身份层；官方授予，与等级徽标一体化展示）
export const VIP_PERKS = [
  "专属金色 VIP 徽章，与等级徽标一体化展示",
  "黑金尊贵昵称 + 会员金框头像，社区与个人主页处处彰显",
  "优先体验内测新功能与专属活动",
  "专属客服通道，问题优先响应",
];

// =====================================================================
// VIP 有效期（profiles.vip_expires_at，官方授予时写入；null = 永久）
// =====================================================================

/** VIP 是否在有效期内：vip=true 且未过期（vip_expires_at 为空视为永久）。 */
export function vipActive(vip?: boolean, vipExpiresAt?: string | null): boolean {
  if (vip !== true) return false;
  if (!vipExpiresAt) return true;
  const t = new Date(vipExpiresAt).getTime();
  return Number.isFinite(t) && t > Date.now();
}

/** VIP 有效期展示文案：「永久有效」或「YYYY-MM-DD 到期」；未开通返回空串。 */
export function vipValidityText(vip?: boolean, vipExpiresAt?: string | null): string {
  if (!vipActive(vip, vipExpiresAt)) return "";
  if (!vipExpiresAt) return "永久有效";
  const d = new Date(vipExpiresAt);
  if (!Number.isFinite(d.getTime())) return "永久有效";
  const p = (n: number) => String(n).padStart(2, "0");
  return `有效期至 ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

