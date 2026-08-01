<template>
  <view class="auth-page">
    <BackgroundFX />
    <view class="auth-content">
      <view class="auth-nav">
        <view class="auth-nav-back" role="button" aria-label="返回" @click="onBack">
          <OutlineIcon type="arrow-left" :size="30" color="var(--text)" />
        </view>
        <text class="auth-nav-title">{{ title }}</text>
      </view>

      <!-- 品牌标：与行情首页统一的「观澜」文字商标（绿字 + 辉光），作为全局记忆点 -->
        <view class="auth-logo">
          <text class="auth-wordmark anim-glow">观澜</text>
          <text class="auth-tagline">智能股票分析</text>
        </view>

      <view class="auth-body">
        <slot />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import BackgroundFX from "./BackgroundFX.vue";
import OutlineIcon from "./OutlineIcon.vue";

defineProps<{
  title: string;
}>();

function onBack() {
  // 返回来源页（如「我的」）；无上一页时兜底回首页
  uni.navigateBack({
    fail: () => uni.reLaunch({ url: "/pages/index/index" }),
  });
}
</script>
