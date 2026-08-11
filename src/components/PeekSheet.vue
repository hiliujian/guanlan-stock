<template>
  <view class="peek">
    <view
      class="peek-card"
      :class="{ expanded: mode !== 'collapsed', max: mode === 'max' }"
      :style="cardStyle"
      @touchstart.stop="onDown"
      @touchmove.stop="onMove"
      @touchend.stop="onUp"
      @touchcancel.stop="onUp"
      @mousedown.stop="onDown"
      @mousemove.stop="onMove"
      @mouseup.stop="onUp"
      @mouseleave.stop="onUp"
    >
      <!-- 拖拽手柄：展开/铺满态显示；折叠态由 peek 卡片本体作为点击区（整个卡片均可拖拽） -->
      <view
        v-if="mode !== 'collapsed'"
        class="peek-grip"
      ><view class="peek-handle" /></view>

      <!-- 折叠态：常驻露出卡片 -->
      <view v-if="mode === 'collapsed'" class="peek-peek" @click="expand">
        <slot name="peek" />
      </view>

      <!-- 展开/铺满：内容区 -->
      <view v-if="mode !== 'collapsed'" class="peek-body">
        <slot :mode="mode" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { usePreventPageScroll } from "@/composables/usePreventPageScroll";

// 纯持久窗体：始终渲染，折叠露出卡片(peek)；父组件通过 expand/collapse 控制展开/收起，
// 下拉收起 / 点击手柄收起时 emit('collapse') 供父组件复位面板状态（如 activePanel）。
const emit = defineEmits<{ (e: "collapse"): void; (e: "expand"): void }>();

type Mode = "collapsed" | "expanded" | "max";
const mode = ref<Mode>("collapsed");

// 展开 / 铺满态锁定背景页面滚动（window 级），折叠态（仅露出常驻卡片）允许背景正常滚动。
// 逻辑统一由 usePreventPageScroll 提供，避免各页面重复实现。
usePreventPageScroll(() => mode.value !== "collapsed");

// 视口测量（拖拽高度实时预览用）
const winH = ref(0);
const tabPx = ref(0);
function measure() {
  try {
    const info: any = (uni as any).getWindowInfo
      ? (uni as any).getWindowInfo()
      : uni.getSystemInfoSync();
    const w = info.windowWidth || info.screenWidth || 375;
    winH.value = info.windowHeight || 0;
    const safe = (info.safeAreaInsets && info.safeAreaInsets.bottom) || 0;
    tabPx.value = safe + (w / 750) * 110; // 110rpx 底部偏移 + 安全区
  } catch (_) {}
}
onMounted(() => {
  measure();
  if (typeof window !== "undefined") {
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
  }
});
onUnmounted(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", measure);
    window.removeEventListener("orientationchange", measure);
  }
});

// 拖拽手势：下拉收起 / 上拉铺满
const dragging = ref(false);
const dragUp = ref(false);
const dragY = ref(0);
let startY = 0;

const shellStyle = computed(() => {
  if (!dragging.value) return {};
  if (dragUp.value) {
    // 上拉：实时增高预览（直到铺满整页）
    const base = winH.value * 0.62;
    const maxH = Math.max(base, winH.value - tabPx.value);
    let h = base - dragY.value; // dragY 为负（上拉），h 增大
    if (h > maxH) h = maxH + (h - maxH) * 0.2; // 超过铺满后加阻尼
    return { height: `${h}px`, transition: "none" };
  }
  // 下拉：整体下移预览，松手后收起
  return { transform: `translateX(-50%) translateY(${dragY.value}px)`, transition: "none" };
});

const cardStyle = computed(() => {
  return { zIndex: 40, ...shellStyle.value };
});

function ptY(e: any): number {
  if (e.touches && e.touches[0]) return e.touches[0].clientY;
  if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY;
  return e.clientY || 0;
}
// 表单输入元素内的手势不接管，避免影响输入框文本选择 / 编辑
function isFormField(el: any): boolean {
  const t = (el && el.tagName) || "";
  return t === "INPUT" || t === "TEXTAREA" || (el && el.isContentEditable);
}
// 找到触摸点所在的 uni-app scroll-view 滚动容器（仅当确实可滚动时返回）
function findScrollEl(target: any): HTMLElement | null {
  let node: HTMLElement | null = target;
  while (node && node !== document.documentElement && node !== document.body) {
    if (
      node.classList &&
      node.classList.contains("uni-scroll-view") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}
// 手势起点时的内部列表滚动状态（锁定本次手势，避免中途抖动）
let scrollAtTop = true;
let scrollAtBottom = true;

function onDown(e: any) {
  if (isFormField(e.target)) return;
  dragging.value = true;
  dragY.value = 0;
  dragUp.value = false;
  startY = ptY(e);
  const sc = findScrollEl(e.target);
  if (sc) {
    const st = sc.scrollTop;
    scrollAtTop = st <= 0;
    scrollAtBottom = st + sc.clientHeight >= sc.scrollHeight - 1;
  } else {
    scrollAtTop = true;
    scrollAtBottom = true;
  }
}
function onMove(e: any) {
  if (!dragging.value) return;
  const dy = ptY(e) - startY;
  // 方向未成型前不处理
  if (Math.abs(dy) < 4) return;
  const upward = dy < 0;
  const downward = dy > 0;
  // 是否把本次手势接管为窗体拖拽（收起/展开）：
  //  - 下滑收起：仅当内部列表已滚到顶部（否则放行列表继续上滑浏览）
  //  - 上滑展开：仅当内部列表已滚到底部（否则放行列表继续下滑浏览）
  let hijack = false;
  if (downward) hijack = scrollAtTop;
  else if (upward) hijack = scrollAtBottom;
  if (!hijack) {
    // 交给内部 scroll-view 正常滚动，不移动窗体、也不阻止默认
    dragging.value = false;
    dragY.value = 0;
    return;
  }
  dragY.value = dy;
  dragUp.value = upward;
  // 拖拽期间阻止页面级下拉刷新 / 页面滚动误触发
  if (e.cancelable) {
    try {
      e.preventDefault();
    } catch (_) {}
  }
}
function onUp() {
  if (!dragging.value) return;
  dragging.value = false;
  const dy = dragY.value;
  dragY.value = 0;
  // 纯点击（位移极小）视为误触，不触发任何展开/收起切换：
  // 避免展开态下点顶部手柄空白区导致窗体被收起并复位到榜单（进而误跳热榜）。
  // 仅当位移超过阈值才认定为拖拽手势。
  if (Math.abs(dy) < 10) return;
  const movedUp = dy < 0;
  const prev = mode.value;
  if (movedUp) {
    // 上滑：展开（折叠 → 半屏 → 铺满）
    if (prev === "collapsed") mode.value = "expanded";
    else if (prev === "expanded") mode.value = "max";
    if (prev === "collapsed") emit("expand");
  } else {
    // 下滑：收起（铺满 → 半屏 → 折叠露出）
    if (prev === "max") mode.value = "expanded";
    else {
      mode.value = "collapsed";
      emit("collapse");
    }
  }
}
function expand() {
  mode.value = "expanded";
  emit("expand");
}
function collapse() {
  mode.value = "collapsed";
  emit("collapse");
}
defineExpose({ expand, collapse });
</script>

<style scoped>
/* 统一底部窗体：固定底部、玻璃质感、浅阴影、仅顶部圆角，与主题一致 */
.peek-card {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(env(safe-area-inset-bottom) + 110rpx);
  width: 100%;
  max-width: 480px;
  height: 76rpx; /* 折叠态默认高度；展开/铺满由 .expanded/.max 覆盖 */
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 22rpx 22rpx 0 0;
  background: var(--tabbar-bg);
  backdrop-filter: blur(20rpx) saturate(150%);
  -webkit-backdrop-filter: blur(20rpx) saturate(150%);
  border-top: 1rpx solid var(--border);
  box-shadow: var(--shadow-sheet);
  transition: height var(--dur) var(--ease-out), transform var(--dur) var(--ease-out);
  animation: peekIn 0.26s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.peek-card.expanded {
  height: 62vh;
}
.peek-card.max {
  height: calc(100vh - 110rpx - env(safe-area-inset-bottom));
}
@keyframes peekIn {
  from {
    transform: translateX(-50%) translateY(24rpx);
    opacity: 0;
  }
  to {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
}
.peek-peek {
  flex: none;
  height: 76rpx;
  display: flex;
  align-items: center;
}
.peek-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* 顶部拖拽手柄：比视觉手柄稍大便于下拉收起；touch-action:none 保证手势用于拖拽而非滚动 */
.peek-grip {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 26rpx;
  margin-bottom: 4rpx;
  cursor: grab;
  touch-action: none;
}
.peek-grip:active {
  cursor: grabbing;
}
.peek-handle {
  width: 56rpx;
  height: 6rpx;
  border-radius: 999rpx;
  background: var(--card-2);
}
</style>
