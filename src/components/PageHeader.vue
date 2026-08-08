<template>
  <view class="ph" :class="{ 'ph-sticky': sticky, 'ph-anim': showAnimation }">
    <view class="ph-brand-wrap">
      <!-- 优先级：#brand slot > brandIcon + brandText > 默认空 -->
      <slot name="brand">
        <view v-if="brandText || brandIcon" class="ph-brand">
          <view v-if="brandIcon" class="ph-brand-ic">
            <OutlineIcon :type="brandIcon" :size="38" color="var(--primary)" />
          </view>
          <text v-if="brandText" class="ph-brand-text">{{ brandText }}</text>
        </view>
      </slot>
    </view>
    <view class="ph-right">
      <slot name="right" />
    </view>
  </view>
</template>

<script setup lang="ts">
import OutlineIcon from "./OutlineIcon.vue";
/**
 * 通用页面顶部栏（自选 / 社区共用，避免重复样式）
 * - 仅外壳：左侧品牌图标 + 字 + 右侧 slot（业务按钮由调用方实现）
 * - 玻璃磨砂背景 + 主题色渐变品牌字 + 呼吸光晕动效
 */
withDefaults(
  defineProps<{
    brandText?: string;
    brandIcon?: string;
    showAnimation?: boolean;
    sticky?: boolean;
  }>(),
  {
    brandText: "",
    brandIcon: "",
    showAnimation: true,
    sticky: true,
  }
);
</script>

<style scoped>
.ph {
  flex: none;
  position: relative;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 增加顶部/底部留白，让整体高度更舒展，避免「矮」 */
  padding: 16rpx 18rpx 18rpx;
  background: var(--sticky-bg);
  backdrop-filter: blur(16rpx) saturate(140%);
  -webkit-backdrop-filter: blur(16rpx) saturate(140%);
}
.ph-sticky {
  position: sticky;
  top: 0;
}
.ph-brand-wrap {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 48rpx;
}
.ph-brand {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 12rpx;
  z-index: 1;
}
/* 图标方块渐变描边 + 软底，与品牌字色调一致 */
.ph-brand-ic {
  width: 48rpx;
  height: 48rpx;
  border-radius: 14rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-soft);
  box-shadow: inset 0 0 0 1rpx rgba(7, 193, 96, 0.28);
  flex: none;
}
.ph-brand-text {
  font-size: var(--font-lg);
  font-weight: 800;
  letter-spacing: 2rpx;
  line-height: 1.1;
  background: linear-gradient(135deg, var(--primary), var(--primary-dark, #06a050));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
}
/* 呼吸光晕：仅在 ph-anim 开启时挂载，避免无意义渲染开销 */
.ph-anim .ph-brand::after {
  content: "";
  position: absolute;
  left: -10%;
  top: -30%;
  width: 130%;
  height: 170%;
  background: radial-gradient(
    ellipse at center,
    var(--primary-soft) 0%,
    transparent 60%
  );
  filter: blur(10rpx);
  opacity: 0.55;
  z-index: -1;
  animation: phGlow 3.6s ease-in-out infinite;
  pointer-events: none;
}
@keyframes phGlow {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.55; }
}
@media (prefers-reduced-motion: reduce) {
  .ph-anim .ph-brand::after {
    animation: none;
    opacity: 0.4;
  }
}
.ph-right {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
</style>