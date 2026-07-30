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

// 成交量：原始单位通常为「手」，这里按亿手/万手展示
export function fmtVol(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "--";
  if (v >= 1e8) return (v / 1e8).toFixed(2) + "亿手";
  if (v >= 1e4) return (v / 1e4).toFixed(2) + "万手";
  return Math.round(v) + "手";
}

// 金额（元）→ 亿 / 万
export function fmtMoney(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "--";
  const abs = Math.abs(v);
  if (abs >= 1e8) return (v / 1e8).toFixed(2) + "亿";
  if (abs >= 1e4) return (v / 1e4).toFixed(2) + "万";
  return v.toFixed(2);
}

export function fmtDate(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return String(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
