// 纯函数：数字格式化（跨端通用，无平台依赖）
// 价格统一保留 3 位小数（全局口径）；指数点位等特殊场景显式传 digits=2
export function fmtPrice(v: number | null | undefined, digits = 3): string {
  if (v == null || isNaN(v)) return "--";
  return v.toFixed(digits);
}

export function fmtPct(v: number | null | undefined, withSign = true): string {
  if (v == null || isNaN(v)) return "--";
  const s = withSign && v > 0 ? "+" : "";
  return s + v.toFixed(2) + "%";
}

// 整数感知的数字格式化（社区持仓卡片用）：缺失/非数 → "-"，整数直接显示、否则 3 位小数。
// （成本/现价均为价格量纲，随全局价格口径保留 3 位；数量为整数走整数分支不受影响。）
// 从 PostCard / PostComposer 中抽取的共享实现，避免两份完全相同的 fmt() 冗余。
export function fmtNum(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "-";
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
}

// 带正负号的绝对值（用于涨跌额）
export function fmtSigned(v: number | null | undefined, digits = 2): string {
  if (v == null || isNaN(v)) return "--";
  const s = v > 0 ? "+" : "";
  return s + v.toFixed(digits);
}

// 市值（元）：全项目市值展示统一口径 —— 一律保留两位小数（如 ¥2751 → ¥2751.00），
// 不走 fmtAmount 的万/亿缩写，避免自选页汇总卡与资料页持仓明细等页面精度不一致。
export function fmtMV(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "--";
  return v.toFixed(2);
}

// 成交额（元）→ 亿 / 万 自适应
export function fmtAmount(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "--";
  if (v >= 1e8) return (v / 1e8).toFixed(2) + "亿";
  if (v >= 1e4) return (v / 1e4).toFixed(2) + "万";
  return v.toFixed(0);
}

// 涨跌色分类（A股约定：涨红跌绿）。全项目统一的配色规则：
// 数值真实存在且 >0 才「涨(up)」、<0 才「跌(down)」；缺失 / 非数 / 零值一律「flat」。
// flat 由样式映射为灰色，确保 "--" 占位符永不显示红/绿，保持灰色。
type Trend = "up" | "down" | "flat";
export function trendCls(v: number | null | undefined): Trend {
  if (v == null || isNaN(v)) return "flat";
  if (v > 0) return "up";
  if (v < 0) return "down";
  return "flat";
}
