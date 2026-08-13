// 跨端统一的色彩与主题常量（纯字符串，不依赖任何平台 API）
// 注意：微信小程序/港股 A 股涨跌色遵循「红涨绿跌」中国习惯
// 与图表（StockChart 蜡烛色）保持一致，避免同一张图里筹码直方图与蜡烛红绿不同色
export const UP = "#ef232a"; // 涨 / 阳线
export const DOWN = "#09b07a"; // 跌 / 阴线
export const NO_CHANGE = "#888888"; // 平盘中性色

// 趋势线专用蓝（与压力红/支撑绿三色区分，互不混淆，且对红绿色盲更友好）
export const TREND = "#2f74ff";
// 指标折线调色板：主图/量/MACD 各 pane 的折线按「内容顺序」循环取色（橙/蓝/紫/绿/品红）。
// 与图表画线颜色保持一致，图例复用同一份颜色，避免图例与图线颜色脱节（用户要求各图例颜色不同）。
// 分时量/MACD 面板（StockChart）与 设置面板 MA 开关（KlineCard）共用同一份，确保配色一致。
export const INDICATOR_LINE_COLORS = ["#f5a623", "#1c9cf0", "#9b59b6", "#2ecc71", "#e11d74"];

// 运行时从 CSS 变量读取主题色。
// 关键约束：klinecharts 等图表引擎把图形画在 <canvas> 上，canvas 的 fillStyle/strokeStyle
// 无法解析 CSS 变量（var(--up) 在 canvas 里是无效颜色），必须读出真实 hex 再喂给引擎。
// 非 DOM 环境（SSR / 微信小程序）下 document 不存在，自动回退到下方硬编码常量，避免报错。
export function cssColor(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

// 图表涨跌色：以 global.css 的 --up/--down 为单一真源（CSS 变量驱动），
// 与全站价格文字保持一致；无 DOM 时回退到硬编码常量 UP/DOWN。
export function upColor(): string {
  return cssColor("--up", UP);
}
export function downColor(): string {
  return cssColor("--down", DOWN);
}
