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
