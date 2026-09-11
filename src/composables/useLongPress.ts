// 统一的「长按」手势：触摸与鼠标通用，移动端/桌面端表现一致（修复此前帖子卡片
// PC 鼠标长按不生效、且与自选/持仓页长按逻辑两套实现不一致的问题）。
//
// 设计要点（沿用自选/持仓页已验证可用的算法）：
// - 按下（touchstart / mousedown）启动计时，移动超过阈值即取消（横滑滚动不会误判为长按）；
// - 计时到点触发 onLongPress(item)；松手清除计时；
// - 移动端部分内核会把长按补发成延迟的兼容 mousedown/mousemove/mouseup，时序混乱会清掉
//   下一次长按刚起的计时器（表现为「长按不切换、要再按一次」）。touch 后 LP_COMPAT_MS 窗口内
//   收到的鼠标事件一律视作兼容事件忽略（PC 纯鼠标路径不产生 touch，不受影响）。
// - 长按触发后，在 document 捕获阶段拦一次随后冒泡的 click（长按松手的那一下），避免误触跳转；
//   该捕获监听在消费后自移除，且仅作用于这一次，不会吃掉后续正常点击。
import { onUnmounted } from "vue";

export interface UseLongPressOptions<T> {
  /** 触发长按的时长阈值(ms)，默认 500 */
  duration?: number;
  /** 视为拖拽取消的位移阈值(px)，默认 10 */
  moveTolerance?: number;
  /** 触摸手势后忽略兼容鼠标事件的窗口(ms)，默认 900（PC 纯鼠标路径不受此影响） */
  compatMs?: number;
  /** 长按触发回调，回传按下时携带的 item */
  onLongPress: (item: T) => void;
  /** 是否禁用（如整理模式 / 预览态），返回 true 时不启动计时 */
  disabled?: () => boolean;
}

export function useLongPress<T = void>(opts: UseLongPressOptions<T>) {
  const LP_MS = opts.duration ?? 500;
  const LP_MOVE = opts.moveTolerance ?? 10;
  const LP_COMPAT_MS = opts.compatMs ?? 900;

  let lpTimer: ReturnType<typeof setTimeout> | null = null;
  let lpFired = false;
  let lpStartX = 0;
  let lpStartY = 0;
  let lpLastTouchAt = 0;
  let lpItem: T | undefined;
  let clickGuard: ((e: any) => void) | null = null;

  function isTouchLike(e: any): boolean {
    return !!e && typeof e.type === "string" && e.type.indexOf("touch") === 0;
  }
  function lpCompatBlocked(e: any): boolean {
    if (isTouchLike(e)) {
      lpLastTouchAt = Date.now();
      return false;
    }
    return lpLastTouchAt !== 0 && Date.now() - lpLastTouchAt < LP_COMPAT_MS;
  }
  function pressPt(e: any): { x: number; y: number } {
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (t) return { x: t.clientX, y: t.clientY };
    return { x: e.clientX || 0, y: e.clientY || 0 };
  }
  function clearTimer() {
    if (lpTimer != null) {
      clearTimeout(lpTimer);
      lpTimer = null;
    }
  }
  function removeClickGuard() {
    if (clickGuard) {
      document.removeEventListener("click", clickGuard, true);
      clickGuard = null;
    }
  }
  // 长按触发后拦一次随后的 click（长按松手那一下），避免误触跳转
  function installClickGuard() {
    removeClickGuard();
    const guard = (ev: any) => {
      removeClickGuard();
      if (lpFired) {
        lpFired = false;
        ev.stopPropagation();
        ev.preventDefault();
      }
    };
    clickGuard = guard;
    document.addEventListener("click", guard, true);
  }

  /** 按下（触摸/鼠标均可）：携带 item 启动计时；兼容鼠标事件直接忽略 */
  function onStart(item: T, e: any) {
    if (opts.disabled?.()) return;
    if (lpCompatBlocked(e)) return;
    lpFired = false;
    lpItem = item;
    const p = pressPt(e);
    lpStartX = p.x;
    lpStartY = p.y;
    clearTimer();
    lpTimer = setTimeout(() => {
      lpFired = true;
      installClickGuard();
      opts.onLongPress(lpItem as T);
    }, LP_MS);
  }
  function onMove(e: any) {
    if (lpTimer == null) return;
    if (lpCompatBlocked(e)) return;
    const p = pressPt(e);
    if (Math.abs(p.x - lpStartX) > LP_MOVE || Math.abs(p.y - lpStartY) > LP_MOVE) clearTimer();
  }
  function onEnd(e?: any) {
    if (e && lpCompatBlocked(e)) return;
    clearTimer();
  }
  /** 点击前调用：若本次为长按触发的松手，消费并阻止冒泡的 click（返回 true 表示已吞掉） */
  function consumeLongPress(): boolean {
    if (lpFired) {
      lpFired = false;
      removeClickGuard();
      return true;
    }
    removeClickGuard();
    return false;
  }

  onUnmounted(() => {
    clearTimer();
    removeClickGuard();
  });

  return { onStart, onMove, onEnd, consumeLongPress, isFired: () => lpFired };
}
