<template>
  <!-- 全项目统一的「向上滚动切换」容器：当 rollKey 变化时，新内容自下方滑入、旧内容同步向上滑出。
       离场元素脱离文档流（absolute）与新元素重叠于同一位置，配合外层 overflow:hidden 形成连续滚动，
       切换过程中不撑高容器、无跳动/闪烁。仅在 rollKey 变化时才动画，首次挂载不触发（无 appear）。 -->
  <view class="roll-swap" :style="rootStyle">
    <Transition name="roll">
      <view :key="rollKey ?? undefined" class="roll-item">
        <slot />
      </view>
    </Transition>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** 信息身份键：变化时触发滚动切换（如指数 secid、热股 code）。价格等数值跳动不应作为 key，以免误触发 */
    rollKey: string | number | null | undefined;
    /** 单次滚动时长(ms)，默认 360 */
    duration?: number;
  }>(),
  { duration: 360 }
);

const rootStyle = computed(() => ({ "--roll-dur": `${props.duration}ms` }));
</script>

<style scoped>
/* 默认撑满外层容器高度；仅在 PeekSheet 折叠卡预览行中使用，外层均已限定高度 */
.roll-swap {
  position: relative;
  overflow: hidden;
  display: block;
  min-width: 0;
  height: 100%;
}
/* 内部整块垂直居中，使名称/价格/涨跌幅与折叠卡左右标签对齐 */
.roll-item {
  display: flex;
  align-items: center;
  height: 100%;
  min-width: 0;
  white-space: nowrap;
}
/* 向上滚动：旧内容上滑出、新内容自下方滑入，二者同步向上运动 */
.roll-swap .roll-enter-active,
.roll-swap .roll-leave-active {
  transition:
    transform var(--roll-dur, 360ms) cubic-bezier(0.22, 0.61, 0.36, 1),
    opacity calc(var(--roll-dur, 360ms) * 0.85) ease;
  will-change: transform, opacity;
}
.roll-swap .roll-enter-from {
  transform: translateY(100%);
  opacity: 0;
}
.roll-swap .roll-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
/* 离场元素脱离文档流，与新元素重叠于同一位置，形成连续滚动而不撑高容器 */
.roll-swap .roll-leave-active {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
}
</style>
