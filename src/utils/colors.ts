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
