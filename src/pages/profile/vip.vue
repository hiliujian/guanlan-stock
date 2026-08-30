<template>
  <view class="vip-page">
    <!-- 自定义导航头（navigationStyle:custom，需自带返回） -->
    <view class="vip-head sticky-head">
      <view class="vip-back nav-back" hover-class="nav-back-hover" @click="back" role="button" aria-label="返回">
        <OutlineIcon type="arrow-left" :size="30" color="var(--text)" />
      </view>
      <text class="vip-title nav-title">VIP 会员</text>
      <view class="vip-head-ph nav-ph" />
    </view>

    <scroll-view class="vip-scroll" scroll-y>
      <!-- 尊贵 hero：金冠勋章 + 开通状态 + 徽章开通前后对比（与等级徽标同一套视觉） -->
      <view class="card vip-hero anim-fade-up" :class="{ on: isVip }">
        <view class="vip-crown" :style="crownStyle">
          <OutlineIcon type="crown" :size="52" :color="VIP_BADGE.fg" />
        </view>
        <text class="vip-hero-title">观澜 VIP 会员</text>
        <text class="vip-hero-sub">{{ isVip ? "尊贵身份已生效，金色徽章随身携带" : "与等级徽标一体化的尊贵身份层" }}</text>
        <view class="vip-state" :class="{ on: isVip }">{{ isVip ? "已开通" : "未开通" }}</view>
        <text v-if="isVip" class="vip-valid">{{ vipValidityText(true, user.profile?.vip_expires_at) }}</text>

        <!-- 徽章对比：当前徽章 → 开通后的金冠徽章（同一枚徽章的两种形态） -->
        <view class="vip-preview">
          <view class="vip-preview-col">
            <LevelTag :level="level" />
            <text class="vip-preview-lab">当前徽章</text>
          </view>
          <OutlineIcon type="arrow-right" :size="26" color="var(--text-3)" />
          <view class="vip-preview-col">
            <LevelTag :level="level" vip />
            <text class="vip-preview-lab vip-preview-lab-gold">开通后</text>
          </view>
        </view>
      </view>

      <!-- 会员权益 -->
      <view class="card vip-block anim-fade-up">
        <view class="vip-sec-title">
          <OutlineIcon type="trophy" :size="26" color="var(--primary)" />
          <text>会员权益</text>
        </view>
        <view v-for="(p, i) in VIP_PERKS" :key="i" class="vip-perk">
          <view class="vip-perk-ic">
            <OutlineIcon type="check" :size="22" :color="perkCheckColor" />
          </view>
          <text class="vip-perk-txt">{{ p }}</text>
        </view>
      </view>

      <!-- 开通说明 -->
      <view class="card vip-block anim-fade-up">
        <view class="vip-sec-title">
          <OutlineIcon type="info" :size="26" color="var(--primary)" />
          <text>开通说明</text>
        </view>
        <text class="vip-note-text">
          VIP 与用户等级共用一套徽章视觉：开通后等级徽章自动升级为金冠样式（VIP·等级名），
          社区、个人主页与公开资料页处处彰显；徽章内的等级名随成长实时联动。
        </text>
        <text class="vip-note-text">
          VIP 由官方授予开通，开闭状态以账户为准；如需开通，请联系官方客服。
        </text>
      </view>

      <text class="foot-note">VIP 会员由官方授予开通，权益内容以最新公告为准，最终解释权归观澜所有</text>
      <view class="bottom-pad" />
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import LevelTag from "@/components/LevelTag.vue";
import { useUser } from "@/store/user";
import { usePageGuard } from "@/store/guard";
import { isDark } from "@/utils/theme";
import { VIP_PERKS, VIP_BADGE, vipActive, vipValidityText } from "@/store/level";

const user = useUser();
// 全局页面守卫：会员页未对游客开放 + 未登录 → 跳转登录页
usePageGuard("/pages/profile/vip");

const level = computed(() => {
  const l = user.profile?.level;
  return typeof l === "number" && l >= 0 ? l : 0;
});
// VIP 有效态（过期自动退回未开通视觉与广告引导）
const isVip = computed(() => vipActive(user.profile?.vip, user.profile?.vip_expires_at));

// 权益勾图标：金色随主题切换明暗（暗金 #8a6a10 在深色底上不可读，深色换亮金）
const perkCheckColor = computed(() => {
  if (!isVip.value) return "var(--text-3)";
  return isDark.value ? "#f0cd6e" : "#8a6a10";
});

// 金冠勋章：VIP 金渐变圆牌；已开通加发光金环
const crownStyle = computed(() => ({
  background: `linear-gradient(135deg, ${VIP_BADGE.from}, ${VIP_BADGE.to})`,
  boxShadow: isVip.value
    ? `0 0 0 6rpx rgba(192, 142, 14, 0.35), 0 8rpx 24rpx rgba(192, 142, 14, 0.45)`
    : `0 0 0 6rpx rgba(192, 142, 14, 0.18)`,
}));

function back() {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: "/pages/index/index" }) });
}
</script>

<style scoped>
.vip-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  overflow-x: hidden;
}
.vip-scroll {
  flex: 1;
  height: 100%;
  box-sizing: border-box;
  padding: 24rpx 24rpx 0;
}

/* hero：暖金玻璃卡 */
.vip-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  padding: 44rpx 32rpx 36rpx;
  background: linear-gradient(160deg, rgba(247, 210, 122, 0.16), rgba(192, 142, 14, 0.06)), var(--card);
  box-shadow: inset 0 0 0 1rpx rgba(192, 142, 14, 0.32), var(--shadow-1);
}
.vip-hero.on {
  box-shadow: inset 0 0 0 1rpx rgba(192, 142, 14, 0.5), 0 8rpx 24rpx rgba(192, 142, 14, 0.18);
}
.vip-crown {
  width: 128rpx;
  height: 128rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.vip-hero-title {
  font-size: var(--font-2xl);
  color: var(--text);
  margin-top: 8rpx;
}
.vip-hero-sub {
  font-size: var(--font-sm);
  color: var(--text-2);
  text-align: center;
  line-height: 1.5;
}
.vip-state {
  font-size: var(--font-xs);
  padding: 8rpx 22rpx;
  border-radius: 999rpx;
  background: var(--card-2);
  color: var(--text-2);
}
.vip-state.on {
  background: linear-gradient(135deg, #f7d27a, #c08e0e);
  color: #43300a;
  box-shadow: 0 0 0 1rpx rgba(192, 142, 14, 0.55);
}
.vip-valid {
  font-size: var(--font-xs);
  color: #8a6a10;
}
/* 深色主题：暗金文字在深底上不可读，统一提亮为亮金 */
.theme-dark .vip-valid {
  color: #f0cd6e;
}

/* 徽章对比：同一枚徽章的两种形态 */
.vip-preview {
  display: flex;
  align-items: center;
  gap: 28rpx;
  margin-top: 20rpx;
  padding: 22rpx 30rpx;
  border-radius: 18rpx;
  background: var(--card-2);
}
.vip-preview-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
}
.vip-preview-lab {
  font-size: var(--font-xs);
  color: var(--text-3);
}
.vip-preview-lab-gold {
  color: #8a6a10;
}
.theme-dark .vip-preview-lab-gold {
  color: #f0cd6e;
}

/* 区块通用 */
.vip-block {
  margin-top: 20rpx;
  padding: 26rpx 28rpx;
}
.vip-sec-title {
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: var(--font-md);
  color: var(--text);
  margin-bottom: 16rpx;
}
.vip-perk {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 14rpx 0;
  border-top: 1rpx solid var(--border);
}
.vip-perk:first-of-type {
  border-top: none;
}
.vip-perk-ic {
  width: 44rpx;
  height: 44rpx;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  background: linear-gradient(135deg, rgba(247, 210, 122, 0.22), rgba(192, 142, 14, 0.1));
}
.vip-perk-txt {
  flex: 1;
  min-width: 0;
  font-size: var(--font-sm);
  color: var(--text);
  line-height: 1.6;
}
.vip-note-text {
  display: block;
  font-size: var(--font-sm);
  line-height: 1.7;
  color: var(--text-2);
  margin-bottom: 10rpx;
}

.bottom-pad {
  height: 80rpx;
}
</style>
