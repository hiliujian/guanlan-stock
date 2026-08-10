<template>
  <!-- 二级页面框架：与「设置」一致（app-shell 居中 + 吸顶导航 + 滚动主体 + 分组卡片） -->
  <view class="app-shell page-col">
    <!-- 自定义导航头：返回 + 标题居中 + 右侧占位（与设置页共用 sticky-head / nav-* 全局类） -->
    <view class="sticky-head">
      <view class="nav-back" hover-class="nav-back-hover" role="button" aria-label="返回" @click="onBack">
        <OutlineIcon type="arrow-left" :size="30" color="var(--text)" />
      </view>
      <text class="nav-title">{{ title }}</text>
      <view class="nav-ph" />
    </view>

    <!-- 滚动主体：协议正文置于分组卡片内，与设置页视觉一致 -->
    <scroll-view class="page-scroll" :scroll-y="true">
      <view class="page-group legal-group">
        <text v-if="updatedAt" class="legal-updated">最近更新：{{ updatedAt }}</text>

        <!-- 正文：无内层卡片，纯文本流；字号取自项目字体库，字重常规（不加粗） -->
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

        <text class="foot-note">观澜 · 让数据说话</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
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
/* 根直接复用全局 .page-col（二级页纵向外壳），与设置页完全一致，不另行覆盖 display */

/* 分组卡片内边距微调：长文比设置页短行更需要留白 */
.legal-group {
  padding: 20rpx 24rpx 26rpx;
}

/* 文档元信息：最近更新日期 */
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

/* 章节标题：用字号（--font-lg，与导航标题同档）+ 深色建立层级，不加粗 */
.legal-sec-title {
  display: block;
  font-size: var(--font-lg);
  color: var(--text);
  line-height: 1.5;
  margin-bottom: 12rpx;
}

/* 正文段落：--font-md，浅色，两端对齐 */
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
/* 页脚标语：完全复用全局 .foot-note（与设置页同款字号 --font-sm / --text-3），此处不再覆盖 */
</style>
