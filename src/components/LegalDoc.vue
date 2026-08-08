<template>
  <!-- 根样式完全复用登录页 .auth-page（白底 / 全屏 fixed / 滚动），
       保证从登录页跳转时背景、留白、滚动行为一致，视觉平滑过渡 -->
  <view class="auth-page legal-page">
    <BackgroundFX />

    <!-- 导航头：复用登录页 .auth-nav（绝对定位 88rpx + 返回箭头 + 标题） -->
    <view class="auth-nav">
      <view class="auth-nav-back" role="button" aria-label="返回" @click="onBack">
        <OutlineIcon type="arrow-left" :size="30" color="var(--text)" />
      </view>
      <text class="auth-nav-title">{{ title }}</text>
    </view>

    <!-- 内容容器：复用登录页 .auth-content（顶部预留导航高度 + 24rpx 边距） -->
    <view class="auth-content">
      <!-- 品牌标：复用登录页 .auth-logo / .auth-wordmark / .auth-tagline，
           使两个页面顶部与登录页完全一致，跳转无突兀感 -->
      <view class="auth-logo">
        <text class="auth-wordmark anim-glow">观澜</text>
        <text class="auth-tagline">让数据说话</text>
      </view>

      <text v-if="updatedAt" class="legal-updated">最近更新：{{ updatedAt }}</text>

      <!-- 正文：无卡片，纯文本流；字号全部取自项目字体库，字重常规（不加粗） -->
      <view class="legal-body">
        <view v-for="(s, i) in sections" :key="i" class="legal-sec">
          <text class="legal-sec-title">{{ s.heading }}</text>
          <text
            v-for="(p, j) in s.paras || []"
            :key="'p' + j"
            class="legal-p"
          >{{ p }}</text>
          <view v-if="s.list && s.list.length" class="legal-list">
            <view v-for="(li, k) in s.list" :key="'l' + k" class="legal-li">
              <text class="legal-li-dot">·</text>
              <text class="legal-li-text">{{ li }}</text>
            </view>
          </view>
        </view>
      </view>

      <view class="bottom-pad" />
    </view>
  </view>
</template>

<script setup lang="ts">
import BackgroundFX from "@/components/BackgroundFX.vue";
import OutlineIcon from "@/components/OutlineIcon.vue";

export interface LegalSection {
  heading: string;
  paras?: string[];
  list?: string[];
}

withDefaults(
  defineProps<{
    title: string;
    updatedAt?: string;
    sections: LegalSection[];
  }>(),
  { updatedAt: "" }
);

function onBack() {
  uni.navigateBack({
    fail: () => uni.reLaunch({ url: "/pages/index/index" }),
  });
}
</script>

<style scoped>
/* 根沿用 .auth-page（登录页同款），此处仅保留类锚点，不重写登录样式 */
.legal-page {
  display: block;
}

/* 文档元信息：最近更新日期，复用标签级字号（与登录页 tagline/协议文字同档 --font-sm） */
.legal-updated {
  display: block;
  font-size: var(--font-sm);
  color: var(--text-3);
  line-height: 1.6;
  margin: 0 0 24rpx;
}

/* 正文容器 */
.legal-body {
  display: block;
}

/* 章节块：仅用间距分隔，不包卡片 */
.legal-sec {
  display: block;
  margin-bottom: 30rpx;
}

/* 章节标题：用字号（--font-lg，与登录页导航标题同档）+ 深色建立层级，不加粗 */
.legal-sec-title {
  display: block;
  font-size: var(--font-lg);
  color: var(--text);
  line-height: 1.5;
  margin-bottom: 12rpx;
}

/* 正文段落：--font-md（与登录页输入框/正文同档），浅色，两端对齐 */
.legal-p {
  display: block;
  font-size: var(--font-md);
  color: var(--text-2);
  line-height: 1.85;
  margin-bottom: 10rpx;
  text-align: justify;
}

.legal-list {
  margin: 4rpx 0 10rpx;
  padding-left: 4rpx;
}
.legal-li {
  display: flex;
  align-items: flex-start;
  gap: 10rpx;
  margin-bottom: 8rpx;
}
.legal-li-dot {
  flex: none;
  font-size: var(--font-md);
  color: var(--primary);
  line-height: 1.85;
}
.legal-li-text {
  flex: 1;
  font-size: var(--font-md);
  color: var(--text-2);
  line-height: 1.85;
  text-align: justify;
}
.bottom-pad {
  height: 40rpx;
}
</style>
