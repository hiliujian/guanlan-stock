<template>
  <teleport to="body">
    <!-- 面板：自底部上滑 / 下滑收起；无遮罩层，结构/背景与自选页「今日最热」卡片保持一致 -->
    <Transition name="bs-slide">
      <view v-if="modelValue" class="bs-panel">
        <view class="bs-grip" />
        <view class="bs-head">
          <text class="bs-title">{{ title }}</text>
          <view class="bs-close" role="button" @click="close" hover-class="bs-close-hover">
            <OutlineIcon type="close" :size="32" color="var(--text-2)" />
          </view>
        </view>
        <view class="bs-body">
          <slot />
        </view>
      </view>
    </Transition>
  </teleport>
</template>

<script setup lang="ts">
import OutlineIcon from "@/components/OutlineIcon.vue";

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
</script>

<style scoped>
/* 面板：固定底部、玻璃质感（与自选页「今日最热」卡片一致的半透明背景 + 毛玻璃）、
   仅顶部圆角、浅阴影；无遮罩层，弹出/收起仅靠面板上滑动画。 */
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
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80rpx;
  border-bottom: 1rpx solid var(--border);
}
.bs-title {
  font-size: var(--font-lg);
  font-weight: 600;
  color: var(--text);
}
.bs-close {
  position: absolute;
  right: 18rpx;
  top: 50%;
  transform: translateY(-50%);
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  border-radius: 50%;
}
.bs-close-hover {
  background: var(--card-2);
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
