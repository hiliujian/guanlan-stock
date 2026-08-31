<template>
  <view class="lv-tag" :class="{ vip: v.vip }" :style="style" role="img" :aria-label="`等级：${v.name}`">
    <view class="lv-ic"><OutlineIcon :type="v.icon" :size="16" :color="v.fg" /></view>
    <text class="lv-name">{{ v.label }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import { badgeVisual } from "@/store/level";

// 统一等级 / VIP 徽章：视觉（渐变 / 图标 / 文案）全部来自 store/level 的 badgeVisual()，
// 徽章文案与等级页一致（完整等级名；VIP 为「VIP·等级名」）。
// 形态：迷你勋章章面（圆形图标托），无阴影扁平化；VIP 尊贵感由擦亮动效体现（.lv-tag.vip::after）。
const props = defineProps<{ level: number; vip?: boolean }>();

const v = computed(() => badgeVisual(props.level, props.vip));
const style = computed(() => ({
  background: `linear-gradient(135deg, ${v.value.from}, ${v.value.to})`,
  color: v.value.fg,
  // 无 box-shadow：普通与 VIP 徽章均不带阴影（含内高光/描边环/外投影），保持干净扁平
}));
</script>

<style scoped>
.lv-tag {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: 4rpx 16rpx 4rpx 5rpx;
  border-radius: 999rpx;
  font-size: var(--font-xs);
  line-height: 1.2;
  vertical-align: middle;
}
/* 圆形图标托：章面里的「小勋章」，营造徽章层次 */
.lv-ic {
  width: 30rpx;
  height: 30rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  background: rgba(0, 0, 0, 0.14);
}
/* VIP 档：金色字距，突出尊贵感；「擦亮」高光 10s 一次（一道金光缓慢扫过：6s 静止 → 3s 慢扫，其余时间无动画） */
.lv-tag.vip {
  letter-spacing: 1rpx;
  position: relative;
  overflow: hidden;
}
.lv-tag.vip::after {
  content: "";
  position: absolute;
  top: -30%;
  left: 0;
  width: 42%;
  height: 160%;
  background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.65), transparent);
  transform: translateX(-300%) skewX(-18deg);
  animation: vipShine 10s ease-in-out infinite;
  pointer-events: none;
}
@keyframes vipShine {
  0%, 60% {
    transform: translateX(-300%) skewX(-18deg);
  }
  90%, 100% {
    transform: translateX(320%) skewX(-18deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .lv-tag.vip::after { display: none; }
}
</style>
