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
  padding: 12rpx 16rpx 12rpx;
}
.ac-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 6rpx;
}
.ac-title {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--text);
}
.ac-extra {
  margin-left: auto;
}
.ac-body {
  font-size: 26rpx;
  color: var(--text-2);
  line-height: 1.7;
}
</style>
