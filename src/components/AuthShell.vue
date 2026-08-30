<template>
  <view class="auth-page">
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
          <text class="auth-tagline">让数据说话</text>
        </view>

      <view class="auth-body">
        <slot />
      </view>

      <!-- 协议贴底：作为 flex 列末尾项，始终落在屏幕最底部；
           键盘弹起时不浮到键盘上、也不消失（由布局流自然定位，不再用 fixed） -->
      <AuthAgreement :action="agreementAction" />
    </view>
  </view>
</template>

<script setup lang="ts">
import OutlineIcon from "./OutlineIcon.vue";
import AuthAgreement from "./AuthAgreement.vue";

withDefaults(
  defineProps<{
    title: string;
    agreementAction?: string;
  }>(),
  { agreementAction: "使用" }
);

function onBack() {
  // 返回来源页（如「我的」）；无上一页时兜底回首页
  uni.navigateBack({
    fail: () => uni.reLaunch({ url: "/pages/index/index" }),
  });
}
</script>
