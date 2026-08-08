<template>
  <view class="legal-page app-shell">
    <BackgroundFX />

    <!-- 自定义导航头（navigationStyle:custom，需自带返回） -->
    <view class="legal-head">
      <view class="legal-back" hover-class="legal-back-hover" role="button" aria-label="返回" @click="onBack">
        <OutlineIcon type="arrow-left" :size="44" color="var(--text)" />
      </view>
      <text class="legal-title">{{ title }}</text>
      <view class="legal-head-ph" />
    </view>

    <scroll-view class="legal-scroll" :scroll-y="true">
      <view class="legal-doc">
        <text class="legal-h1">{{ title }}</text>
        <text v-if="updatedAt" class="legal-updated">最近更新：{{ updatedAt }}</text>

        <view v-for="(s, i) in sections" :key="i" class="legal-sec">
          <text class="legal-h2">{{ s.heading }}</text>
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
/* 自定义导航头：与「设置」页一致（返回 + 标题居中 + 右侧占位对称） */
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
  font-weight: 700;
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
.legal-doc {
  padding: 28rpx 28rpx 0;
  box-sizing: border-box;
}
.legal-h1 {
  display: block;
  font-size: var(--font-2xl);
  font-weight: 700;
  color: var(--text);
  line-height: 1.4;
  margin-bottom: 8rpx;
}
.legal-updated {
  display: block;
  font-size: var(--font-xs);
  color: var(--text-3);
  margin-bottom: 22rpx;
}
.legal-sec {
  margin-bottom: 26rpx;
}
.legal-h2 {
  display: block;
  font-size: var(--font-lg);
  font-weight: 600;
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
