<template>
  <view class="card analysis-card anim-fade-up" :style="{ animationDelay: delay + 'ms' }">
    <view class="ac-head">
      <OutlineIcon v-if="icon" :type="icon" :size="30" :color="iconColor || 'var(--primary)'" />
      <text class="ac-title">{{ title }}</text>
      <view class="ac-extra"><slot name="extra" /></view>
    </view>
    <view class="ac-body"><slot /></view>
  </view>
</template>

<script setup lang="ts">
import OutlineIcon from "./OutlineIcon.vue";

withDefaults(
  defineProps<{
    title: string;
    icon?: string;
    iconColor?: string;
    delay?: number;
  }>(),
  { delay: 0 }
);
</script>

<style scoped>
.analysis-card {
  padding: 16rpx 18rpx;
  border: 1rpx solid var(--border);
  backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  box-shadow: var(--shadow), inset 0 1rpx 0 rgba(255, 255, 255, 0.06);
}
.ac-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 8rpx;
}
.ac-title {
  font-size: var(--font-lg);
  font-weight: 600;
  color: var(--text);
}
.ac-extra {
  margin-left: auto;
}
.ac-body {
  font-size: var(--font-md);
  color: var(--text-2);
  line-height: 1.7;
}
</style>
