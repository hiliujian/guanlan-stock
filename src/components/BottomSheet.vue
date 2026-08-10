<template>
  <teleport to="body">
    <!-- 面板：自底部上滑 / 下拉收起；无遮罩层、无 × 图标，结构/背景与自选页「今日最热」卡片一致；
         整体可下拉收起（拖拽下移预览，松手超过阈值即收起），与 PeekSheet 下拉收起语义对齐 -->
    <Transition name="bs-slide">
      <view
        v-if="modelValue"
        class="bs-panel"
        :style="panelStyle"
        @touchstart.stop="onDown"
        @touchmove.stop="onMove"
        @touchend.stop="onUp"
        @touchcancel.stop="onUp"
        @mousedown.stop="onDown"
        @mousemove.stop="onMove"
        @mouseup.stop="onUp"
        @mouseleave.stop="onUp"
      >
        <view class="bs-grip" />
        <view class="bs-head">
          <text class="bs-title">{{ title }}</text>
        </view>
        <view class="bs-body">
          <slot />
        </view>
      </view>
    </Transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** 可见状态（v-model） */
    modelValue: boolean;
    /** 标题，空则不渲染标题栏 */
    title?: string;
  }>(),
  { title: "" }
);

const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void }>();

function close() {
  emit("update:modelValue", false);
}

// 下拉收起手势：拖动面板下移预览，松手超过阈值即收起（与 PeekSheet 下拉收起语义一致）
const dragging = ref(false);
const dragY = ref(0);
let startY = 0;

// 拖拽预览偏移：拖拽中实时跟随手指（仅下拉 dy>0），松手后由 base 过渡回弹 / 离开动画接管
const panelStyle = computed(() => {
  if (!dragging.value || dragY.value <= 0) return {};
  return {
    transform: `translateX(-50%) translateY(${dragY.value}px)`,
    transition: "none",
  };
});

function ptY(e: any): number {
  if (e.touches && e.touches[0]) return e.touches[0].clientY;
  if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY;
  return e.clientY || 0;
}

function onDown(e: any) {
  dragging.value = true;
  dragY.value = 0;
  startY = ptY(e);
}
function onMove(e: any) {
  if (!dragging.value) return;
  const dy = ptY(e) - startY;
  // 仅响应下拉（dy>0）；上滑不做处理，避免误触；方向未成型前不处理
  if (dy <= 0 || dy < 4) {
    dragY.value = 0;
    return;
  }
  dragY.value = dy;
  // 拖拽期间阻止页面级下拉刷新 / 滚动误触发
  if (e.cancelable) {
    try {
      e.preventDefault();
    } catch (_) {}
  }
}
function onUp() {
  if (!dragging.value) return;
  const dy = dragY.value;
  dragging.value = false;
  dragY.value = 0;
  // 位移超过阈值（约 70px）才认定为下拉收起；否则回弹归位（不触发关闭）
  if (dy > 70) close();
}
</script>

<style scoped>
/* 面板：固定底部、玻璃质感（与自选页「今日最热」卡片一致的半透明背景 + 毛玻璃）、
   仅顶部圆角、浅阴影；无遮罩层，弹出/收起仅靠面板上滑 / 下拉动画。 */
.bs-panel {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  z-index: 91;
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  background: var(--tabbar-bg);
  backdrop-filter: blur(20rpx) saturate(150%);
  -webkit-backdrop-filter: blur(20rpx) saturate(150%);
  border-top: 1rpx solid var(--border);
  border-radius: 22rpx 22rpx 0 0;
  box-shadow: var(--shadow-sheet);
  /* 拖拽松手回弹 / 入场动画复用同一缓动 */
  transition: transform var(--dur) var(--ease-out);
}
/* 顶部拖拽手柄（视觉装饰，与 PeekSheet 风格统一） */
.bs-grip {
  flex: none;
  width: 56rpx;
  height: 6rpx;
  border-radius: 999rpx;
  background: var(--card-2);
  margin: 14rpx auto 4rpx;
}
.bs-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 72rpx;
  border-bottom: 1rpx solid var(--border);
}
/* 标题字号 / 字重 / 颜色与分组面板 .grp-title 完全一致（var(--font-md) / 500 / --text-2） */
.bs-title {
  font-size: var(--font-md);
  font-weight: 500;
  color: var(--text-2);
}
.bs-body {
  flex: 1;
  min-height: 0;
  padding: 8rpx 24rpx calc(36rpx + env(safe-area-inset-bottom));
  -webkit-overflow-scrolling: touch;
}

/* 动画：面板自底部上滑 / 下滑收起（保留居中 translateX(-50%)） */
.bs-slide-enter-active,
.bs-slide-leave-active {
  transition: transform var(--dur) var(--ease-out);
}
.bs-slide-enter-from,
.bs-slide-leave-to {
  transform: translateX(-50%) translateY(100%);
}
</style>
