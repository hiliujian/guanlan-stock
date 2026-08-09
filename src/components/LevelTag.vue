<template>
  <view class="lv-tag" :style="style" role="img" :aria-label="`等级：${meta.name}`">
    <OutlineIcon :type="meta.icon" :size="18" :color="colors.icon" />
    <text class="lv-name">{{ meta.name }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import { levelMeta, BAND_COLORS } from "@/store/level";

const props = defineProps<{ level: number }>();

const meta = computed(() => levelMeta(props.level));
const colors = computed(() => BAND_COLORS[meta.value.band]);
const style = computed(() => ({
  background: `linear-gradient(135deg, ${colors.value.from}, ${colors.value.to})`,
  color: colors.value.icon,
}));
</script>

<style scoped>
.lv-tag {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  font-size: var(--font-xs);
  font-weight: 400;
  line-height: 1.3;
  box-shadow: var(--shadow-2);
  vertical-align: middle;
}
/* 擦亮效果：一道白色高光周期性从左扫到右，像被擦拭发亮（不改形状/颜色，仅叠加光泽） */
.lv-tag::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    105deg,
    transparent 35%,
    rgba(255, 255, 255, 0.55) 50%,
    transparent 65%
  );
  transform: translateX(-130%);
  animation: lv-shine 10s ease-in-out infinite;
  pointer-events: none;
}
@keyframes lv-shine {
  0% { transform: translateX(-130%); }
  18% { transform: translateX(130%); }
  100% { transform: translateX(130%); }
}
/* 尊重无障碍：用户偏好减少动态时关闭扫光 */
@media (prefers-reduced-motion: reduce) {
  .lv-tag::after {
    animation: none;
    background: none;
  }
}
.lv-name {
  letter-spacing: 1rpx;
}
</style>
