import { watch, onUnmounted, toValue, type MaybeRefOrGetter } from "vue";

/**
 * 底部卡片 / BottomSheet / Drawer 展开时锁定背景页面滚动，关闭时自动恢复。
 *
 * 背景：底部卡片（PeekSheet / BottomSheet）多为 position:fixed 且「不是」页面主滚动容器的
 * 后代（MarketView / WatchlistView 中 PeekSheet 与 .mk-scroll / .wl-grid 平级）。
 * 当卡片展开后在卡片内拖拽、其内部 scroll-view 抵达边界时，浏览器会把滚动「链式传递」到
 * 视口（window），表现为整页被拉动 / iOS 橡皮筋。本 composable 通过给 <html> 加 .ps-lock
 * （见 global.css）禁用 window 级滚动与 overscroll 链式传递，从而锁住背景。
 *
 * 设计要点（全局只此一份核心逻辑，各页面/组件复用）：
 *  - 引用计数：多个弹层同时出现也不会提前解锁；最后一个关闭才真正移除锁类。
 *  - 组件卸载自动释放，避免泄漏。
 *  - 不触碰 touch-action，以免误伤卡片内部 scroll-view 的纵向滚动；卡片自身的拖拽手势
 *    仍由各组件既有的手势处理（PeekSheet 手势接管 / BottomSheet .bs-panel 的 touch-action:none）负责。
 *
 * 用法（在组件的 <script setup> 中）：
 *   // BottomSheet：随 v-model 开关
 *   usePreventPageScroll(() => props.modelValue);
 *   // PeekSheet：仅展开态（非折叠）锁背景，折叠态允许背景页面正常滚动
 *   usePreventPageScroll(() => mode.value !== "collapsed");
 */
const LOCK_CLASS = "ps-lock";
let lockCount = 0;

function applyLock(): void {
  if (typeof document === "undefined") return;
  if (lockCount === 0) {
    document.documentElement.classList.add(LOCK_CLASS);
  }
  lockCount += 1;
}

function releaseLock(): void {
  if (typeof document === "undefined") return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.documentElement.classList.remove(LOCK_CLASS);
  }
}

export function usePreventPageScroll(active: MaybeRefOrGetter<boolean>): void {
  let locked = false;

  const sync = (): void => {
    const want = !!toValue(active);
    if (want && !locked) {
      locked = true;
      applyLock();
    } else if (!want && locked) {
      locked = false;
      releaseLock();
    }
  };

  // immediate：组件初始即为展开态（如 URL 直达 / keep-alive 恢复）也能立刻上锁
  watch(
    () => toValue(active),
    sync,
    { immediate: true }
  );

  onUnmounted(() => {
    if (locked) {
      locked = false;
      releaseLock();
    }
  });
}
