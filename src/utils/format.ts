// 纯函数：数字格式化（跨端通用，无平台依赖）
export function fmtPrice(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "--";
  return v.toFixed(2);
}

export function fmtPct(v: number | null | undefined, withSign = true): string {
  if (v == null || isNaN(v)) return "--";
  const s = withSign && v > 0 ? "+" : "";
  return s + v.toFixed(2) + "%";
}

// 带正负号的绝对值（用于涨跌额）
export function fmtSigned(v: number | null | undefined, digits = 2): string {
  if (v == null || isNaN(v)) return "--";
  const s = v > 0 ? "+" : "";
  return s + v.toFixed(digits);
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
export type Trend = "up" | "down" | "flat";
export function trendCls(v: number | null | undefined): Trend {
  if (v == null || isNaN(v)) return "flat";
  if (v > 0) return "up";
  if (v < 0) return "down";
  return "flat";
}
