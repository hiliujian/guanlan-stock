// 跨端统一的色彩与主题常量（纯字符串，不依赖任何平台 API）
// 注意：微信小程序/港股 A 股涨跌色遵循「红涨绿跌」中国习惯
export const UP = "#fa5151"; // 涨 / 阳线
export const DOWN = "#09bb07"; // 跌 / 阴线

// 均线配色（与 K 线图保持一致）
export const MA_COLORS = ["#ff9f1c", "#3b82f6", "#8b5cf6", "#06b6d4"];

// uCharts 调色板：前两个用于蜡烛图（涨/跌），其余用于均线
export const UCHARTS_PALETTE = [UP, DOWN, ...MA_COLORS];

export const POSITIVE = "ok"; // 中性偏多
export const NEGATIVE = "bad"; // 中性偏空
export const NEUTRAL = "info";
