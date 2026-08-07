<template>
  <view v-if="shown" class="peek">
    <view v-if="modal" class="peek-mask" :style="maskStyle" @click="onMask"></view>
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

      <!-- 折叠态：常驻露出卡片（仅 persistent 模式） -->
      <view v-if="mode === 'collapsed' && persistent" class="peek-peek" @click="expand">
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
import { computed, ref, watch, onMounted, onUnmounted } from "vue";

const props = withDefaults(
  defineProps<{
    /** 非持久模式下的开关；持久模式(persistent)始终可见，忽略此值 */
    modelValue?: boolean;
    /** 持久模式：始终渲染，带折叠露出卡片(peek)，收起回到卡片 */
    persistent?: boolean;
    /** 模态模式：渲染遮罩，点遮罩/下拉收起即关闭 */
    modal?: boolean;
    /** 展开态高度（默认半屏） */
    expandedHeight?: string;
    /** 铺满态高度（默认整页减去底部菜单栏） */
    maxHeight?: string;
  }>(),
  {
    modelValue: undefined,
    persistent: false,
    modal: false,
    expandedHeight: "62vh",
    maxHeight: "calc(100vh - 110rpx - env(safe-area-inset-bottom))",
  }
);

const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void }>();

type Mode = "collapsed" | "expanded" | "max";
const mode = ref<Mode>(props.persistent ? "collapsed" : "expanded");
// 可见性：非持久模式由 modelValue 控制开关；关闭时先播放下滑动画再真正隐藏
const shown = ref(props.persistent ? true : !!props.modelValue);
const closing = ref(false);
let hideTimer: number | undefined;

watch(
  () => props.modelValue,
  (v) => {
    if (props.persistent) return;
    if (v) {
      // 重新打开（或关闭动画途中再次打开）：取消待执行的隐藏，复位状态
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = undefined;
      }
      shown.value = true;
      mode.value = "expanded";
      closing.value = false;
    } else if (!closing.value) {
      // 父组件直接置 false（如选中分组后关闭）——统一走关闭动画
      close();
    }
  }
);

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
  if (hideTimer) window.clearTimeout(hideTimer);
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
  const base: Record<string, string | number> = {
    ...(props.modal ? { zIndex: 70 } : { zIndex: 40 }),
  };
  if (closing.value) {
    // 关闭动画：整体下滑至屏幕外，复用 .peek-card 的 transform 过渡(--dur)
    base.transform = "translateX(-50%) translateY(120%)";
  } else {
    Object.assign(base, shellStyle.value);
  }
  return base;
});
const maskStyle = { zIndex: 65 };

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
    } else if (props.persistent) {
      // 半屏：下拉收起回到露出卡片
      mode.value = "collapsed";
    } else {
      // 非持久：下拉收起即关闭
      close();
    }
  }
}
function onTap() {
  if (moved) {
    moved = false;
    return; // 拖拽结束后不触发点击，避免重复动作
  }
  if (props.persistent) mode.value = "collapsed";
  else close();
}

function expand() {
  mode.value = "expanded";
}
function collapse() {
  if (props.persistent) mode.value = "collapsed";
  else close();
}
function close() {
  if (props.persistent) return;
  if (closing.value) return;
  closing.value = true;
  emit("update:modelValue", false);
  // 与 .peek-card 的 transform 过渡(--dur=0.32s)对齐，结束后真正隐藏
  if (hideTimer) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    closing.value = false;
    shown.value = false;
    hideTimer = undefined;
  }, 320);
}
function onMask() {
  if (props.modal) close();
}

defineExpose({ expand, collapse, close });
</script>

<style scoped>
/* 统一底部窗体：固定底部、玻璃质感、浅阴影、仅顶部圆角，与主题一致 */
.peek-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
}
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
  box-shadow: 0 -4rpx 20rpx rgba(0, 0, 0, 0.12); /* 浅浅的阴影，统一 */
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
