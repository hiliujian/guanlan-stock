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
