<template>
  <view class="peek">
    <view
      class="peek-card"
      :class="{ expanded: mode !== 'collapsed', max: mode === 'max' }"
      :style="cardStyle"
    >
      <!-- 拖拽手柄：展开/铺满态显示；折叠态由 peek 卡片本体作为点击区 -->
      <view
        v-if="mode !== 'collapsed'"
        class="peek-grip"
        @touchstart.stop="onDown"
        @touchmove.stop="onMove"
        @touchend.stop="onUp"
        @touchcancel.stop="onUp"
        @mousedown.stop="onDown"
        @mousemove.stop="onMove"
        @mouseup.stop="onUp"
        @mouseleave.stop="onUp"
        @click.stop="onTap"
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

// 纯持久窗体：始终渲染，折叠露出卡片(peek)；父组件通过 expand/collapse 控制展开/收起，
// 下拉收起 / 点击手柄收起时 emit('collapse') 供父组件复位面板状态（如 activePanel）。
const emit = defineEmits<{ (e: "collapse"): void }>();

type Mode = "collapsed" | "expanded" | "max";
const mode = ref<Mode>("collapsed");

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
let moved = false;

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
function onDown(e: any) {
  dragging.value = true;
  dragY.value = 0;
  dragUp.value = false;
  moved = false;
  startY = ptY(e);
}
function onMove(e: any) {
  if (!dragging.value) return;
  const dy = ptY(e) - startY;
  dragY.value = dy;
  dragUp.value = dy < 0;
  if (Math.abs(dy) > 4) moved = true;
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
  const wasUp = dragUp.value;
  dragY.value = 0;
  if (wasUp) {
    if (mode.value === "max") {
      // 已铺满：下拉超过阈值回退到半屏
      if (dy > 80) mode.value = "expanded";
    } else if (-dy > 64) {
      // 半屏：上拉超过阈值铺满整页
      mode.value = "max";
    }
  } else {
    if (mode.value === "max") {
      // 铺满：下拉先回退到半屏
      mode.value = "expanded";
    } else {
      // 半屏：下拉收起回到露出卡片
      mode.value = "collapsed";
      emit("collapse");
    }
  }
}
function onTap() {
  if (moved) {
    moved = false;
    return; // 拖拽结束后不触发点击，避免重复动作
  }
  // 展开态点手柄：收起回到露出卡片
  mode.value = "collapsed";
  emit("collapse");
}

function expand() {
  mode.value = "expanded";
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
  border-top: 1rpx solid var(--tabbar-border);
  box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.08); /* 更克制的浅阴影，统一（榜单/分组/显示列共用） */
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
