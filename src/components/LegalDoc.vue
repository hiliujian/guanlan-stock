<template>
  <view class="legal-page app-shell">
    <BackgroundFX />

    <!-- 自定义导航头：与「设置」页 .st-head 完全一致（返回 + 标题居中 + 右侧占位对称） -->
    <view class="legal-head">
      <view class="legal-back" hover-class="legal-back-hover" role="button" aria-label="返回" @click="onBack">
        <OutlineIcon type="arrow-left" :size="44" color="var(--text)" />
      </view>
      <text class="legal-title">{{ title }}</text>
      <view class="legal-head-ph" />
    </view>

    <scroll-view class="legal-scroll" :scroll-y="true">
      <view class="legal-wrap">
        <!-- 头部主标题卡片 -->
        <view class="legal-hero card">
          <text class="legal-h1">{{ title }}</text>
          <text v-if="updatedAt" class="legal-updated">最近更新：{{ updatedAt }}</text>
        </view>

        <!-- 各章节：复用系统 .card 玻璃卡片分组，与「设置」分组风格统一 -->
        <view v-for="(s, i) in sections" :key="i" class="legal-sec card">
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

        <view class="bottom-pad" />
      </view>
    </scroll-view>
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
.legal-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  overflow-x: hidden;
}
/* 自定义导航头：与「设置」页 .st-head 完全一致 */
.legal-head {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 88rpx;
  padding: 0 12rpx;
  background: var(--sticky-bg);
  backdrop-filter: blur(16rpx) saturate(140%);
  -webkit-backdrop-filter: blur(16rpx) saturate(140%);
  box-shadow: var(--sticky-shadow);
}
.legal-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  margin-left: 6rpx;
  transition: background 0.18s ease;
}
.legal-back-hover {
  background: var(--card-2);
}
.legal-title {
  font-size: var(--font-lg);
  color: var(--text);
}
.legal-head-ph {
  width: 72rpx;
}
.legal-scroll {
  flex: 1;
  height: 100%;
  box-sizing: border-box;
}
.legal-wrap {
  padding: 20rpx 24rpx 0;
  box-sizing: border-box;
}
/* 头部主标题卡片（复用全局 .card 玻璃卡片） */
.legal-hero {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.legal-h1 {
  font-size: var(--font-2xl);
  color: var(--text);
  line-height: 1.4;
}
.legal-updated {
  font-size: var(--font-xs);
  color: var(--text-3);
}
/* 章节卡片：.card 已提供背景/圆角/边框/内边距/间距，这里仅补充分组内文本间距 */
.legal-sec-title {
  display: block;
  font-size: var(--font-md);
  color: var(--text);
  line-height: 1.5;
  margin-bottom: 10rpx;
}
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
