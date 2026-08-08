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

      <!-- 品牌标：上下双层文字——上方「观澜」LOGO 主体，下方「让数据说话」SLOGAN；
           两行两端严格对齐、紧密贴合，形成经典 LOGO + SLOGAN 组合结构 -->
      <view class="auth-logo">
        <view class="auth-wordmark anim-glow">观澜</view>
        <view class="auth-tagline">
          <text>让</text><text>数</text><text>据</text><text>说</text><text>话</text>
        </view>
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
import BackgroundFX from "./BackgroundFX.vue";
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
