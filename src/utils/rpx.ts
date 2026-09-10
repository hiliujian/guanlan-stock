// rpx → px 换算：必须与 uni 的 rem 方案同源，否则桌面端会溢出。
//
// 背景：uni 把 `N rpx` 编译为 `N/32 rem`，运行时再设置
//   html { font-size: 基准宽 / 23.4375 }（23.4375 = 750/32）
// 且当视口宽度超过 uni 的上限（rpxCalcMaxDeviceWidth，默认 960，即 PC 端）时，
// 基准宽会被收敛到 375 —— 也就是桌面端 1rpx 恒等于 0.5px，内容保持手机尺寸，
// 而页面内容被 .app-shell 约束在居中的 480px 外壳内。
//
// ⚠️ 因此**不要**用 `window.innerWidth / 750` 自行换算：在 1920px 宽的桌面端
// 会算成 2.56px/rpx（放大 5 倍多），JS 计算出的宽高/偏移将远超 480px 外壳，
// 表现为「内容超出页面边界 / 横向溢出」。统一走本文件的 rpx()。

/** 兜底值：375 基准下 1rpx = 0.5px */
const DEFAULT_RPX = 0.5;

/** 当前 1rpx 等于多少 px（跟随 uni 实际根字号，自动适配 PC 端收敛） */
export function rpx(): number {
  if (typeof document === "undefined") return DEFAULT_RPX;
  const fs = parseFloat(getComputedStyle(document.documentElement).fontSize || "");
  return Number.isFinite(fs) && fs > 0 ? fs / 32 : DEFAULT_RPX;
}

/**
 * 应用外壳（.app-shell，PC 端 max-width:480px 居中）的横向边界。
 * 浮层定位用它来夹紧，保证不越出「页面」左右边界；取不到时回退整个视口。
 */
export function shellBounds(): { left: number; right: number; width: number } {
  if (typeof document === "undefined") return { left: 0, right: 0, width: 0 };
  const el = document.querySelector(".app-shell") as HTMLElement | null;
  if (el) {
    const r = el.getBoundingClientRect();
    if (r.width > 0) return { left: r.left, right: r.right, width: r.width };
  }
  return { left: 0, right: window.innerWidth, width: window.innerWidth };
}

/**
 * 把 [left, left+width] 夹进外壳内（左右各留 padRpx 的 rpx 安全边距）。
 * 用于 teleport 到 body 的浮层，避免在 PC 端贴边或越界。
 */
export function clampToShell(left: number, width: number, padRpx = 8): number {
  const b = shellBounds();
  const pad = padRpx * rpx();
  const min = b.left + pad;
  const max = b.right - width - pad;
  if (max <= min) return Math.max(min, (b.left + b.right - width) / 2);
  return Math.max(min, Math.min(left, max));
}
