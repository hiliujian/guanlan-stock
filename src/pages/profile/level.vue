<template>
  <view class="lv-page">
    <BackgroundFX />

    <!-- 自定义导航头（navigationStyle:custom，需自带返回） -->
    <view class="lv-head">
      <view class="lv-back" hover-class="lv-back-hover" @click="back" role="button" aria-label="返回">
        <OutlineIcon type="arrow-left" :size="44" color="var(--text)" />
      </view>
      <text class="lv-title">我的等级</text>
      <view class="lv-head-ph" />
    </view>

    <scroll-view class="lv-scroll" scroll-y>
      <!-- 当前状态卡：等级徽章 + 当前经验 + 升级进度 -->
      <view class="card lv-hero anim-fade-up">
        <view class="lv-badge" :style="badgeStyle">
          <OutlineIcon :type="meta.icon" :size="44" :color="band.icon" />
        </view>
        <view class="lv-hero-main">
          <view class="lv-hero-top">
            <text class="lv-hero-name">{{ meta.name }}</text>
            <text class="lv-hero-no">Lv.{{ meta.id }}</text>
          </view>
          <view class="lv-exp-row">
            <text class="lv-exp-lab">当前经验</text>
            <text class="lv-exp-num">{{ progress.exp }}</text>
          </view>
          <view class="lv-bar">
            <view class="lv-bar-fill" :style="{ width: (progress.ratio * 100).toFixed(1) + '%' }" />
          </view>
          <text class="lv-bar-tip">
            <template v-if="progress.isMax">已达最高等级 · 封顶 🎉</template>
            <template v-else>距离 Lv.{{ meta.id + 1 }} 还需 <text class="lv-need">{{ progress.toNext }}</text> 经验</template>
          </text>
        </view>
      </view>

      <!-- 升级规则总述 -->
      <view class="card lv-note anim-fade-up">
        <view class="lv-sec-title">
          <OutlineIcon type="info" :size="26" color="var(--primary)" />
          <text>等级与升级规则</text>
        </view>
        <text class="lv-note-text">{{ LEVEL_RULE_NOTE }}</text>
      </view>

      <!-- 经验获取途径（升级方式） -->
      <view class="card lv-block anim-fade-up">
        <view class="lv-sec-title">
          <OutlineIcon type="fire" :size="26" color="var(--primary)" />
          <text>如何获取经验</text>
        </view>
        <view
          v-for="s in EXP_SOURCES"
          :key="s.key"
          class="lv-src"
        >
          <view class="lv-src-left">
            <text class="lv-src-label">{{ s.label }}</text>
            <text class="lv-src-desc">{{ s.desc }}</text>
          </view>
          <view class="lv-src-gain">
            <text class="lv-src-exp">+{{ s.exp }}</text>
            <text class="lv-src-unit">{{ s.unit || (s.once ? "一次性" : "") }}</text>
          </view>
        </view>
      </view>

      <!-- 完整等级体系（等级划分 + 各等级权益） -->
      <view class="card lv-block anim-fade-up">
        <view class="lv-sec-title">
          <OutlineIcon type="trophy" :size="26" color="var(--primary)" />
          <text>等级体系</text>
        </view>
        <view
          v-for="r in rows"
          :key="r.level"
          class="lv-tier"
          :class="{ 'lv-tier-current': r.current, 'lv-tier-locked': !r.reached }"
        >
          <view class="lv-tier-ic" :style="iconBoxStyle(r.band)">
            <OutlineIcon :type="r.icon" :size="30" :color="bandColor(r.band).icon" />
          </view>
          <view class="lv-tier-info">
            <view class="lv-tier-name">
              <text>{{ r.name }}</text>
              <text class="lv-tier-no">Lv.{{ r.id }}</text>
            </view>
            <text class="lv-tier-range">{{ r.range.label }} 经验</text>
            <view class="lv-perks">
              <text v-for="(p, pi) in r.perks" :key="pi" class="lv-perk">· {{ p }}</text>
            </view>
          </view>
          <view class="lv-tier-flag">
            <text v-if="r.current" class="lv-flag lv-flag-current">当前</text>
            <OutlineIcon v-else-if="r.reached" type="check" :size="28" :color="bandColor(r.band).icon" />
            <text v-else class="lv-flag lv-flag-lock">未达成</text>
          </view>
        </view>
      </view>

      <view class="lv-foot">
        <text>等级与经验由系统根据活跃行为自动计算，最终解释权归观澜所有</text>
      </view>
      <view class="bottom-pad" />
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import BackgroundFX from "@/components/BackgroundFX.vue";
import { useUser } from "@/store/user";
import {
  levelMeta,
  BAND_COLORS,
  progressOf,
  levelLadder,
  EXP_SOURCES,
  LEVEL_RULE_NOTE,
} from "@/store/level";
import type { Band } from "@/store/level";

const user = useUser();

const level = computed(() => {
  const l = user.profile?.level;
  return typeof l === "number" && l >= 0 ? l : 0;
});
const exp = computed(() => {
  const e = user.profile?.exp;
  return typeof e === "number" && e > 0 ? e : 0;
});

const meta = computed(() => levelMeta(level.value));
const band = computed(() => BAND_COLORS[meta.value.band]);
const badgeStyle = computed(() => ({
  background: `linear-gradient(135deg, ${band.value.from}, ${band.value.to})`,
}));
const progress = computed(() => progressOf(level.value, exp.value));
const rows = computed(() => levelLadder(level.value, exp.value));

function bandColor(b: Band) {
  return BAND_COLORS[b];
}
function iconBoxStyle(b: Band) {
  const c = BAND_COLORS[b];
  return {
    background: `linear-gradient(135deg, ${c.from}, ${c.to})`,
  };
}

function back() {
  uni.navigateBack({ fail: () => uni.reLaunch({ url: "/pages/index/index" }) });
}
</script>

<style scoped>
.lv-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  overflow-x: hidden;
}
.lv-head {
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
.lv-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  margin-left: 6rpx;
  transition: background 0.18s ease;
}
.lv-back-hover {
  background: var(--card-2);
}
.lv-title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--text);
}
.lv-head-ph {
  width: 72rpx;
}
.lv-scroll {
  flex: 1;
  height: 100%;
  box-sizing: border-box;
  padding: 24rpx 24rpx 0;
}

/* 当前状态 hero 卡 */
.lv-hero {
  display: flex;
  align-items: center;
  gap: 26rpx;
  padding: 32rpx 28rpx;
}
.lv-badge {
  width: 104rpx;
  height: 104rpx;
  border-radius: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  box-shadow: 0 8rpx 22rpx rgba(0, 0, 0, 0.2);
}
.lv-hero-main {
  flex: 1;
  min-width: 0;
}
.lv-hero-top {
  display: flex;
  align-items: baseline;
  gap: 16rpx;
}
.lv-hero-name {
  font-size: 38rpx;
  font-weight: 700;
  color: var(--text);
}
.lv-hero-no {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--text-2);
}
.lv-exp-row {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  margin-top: 8rpx;
}
.lv-exp-lab {
  font-size: 24rpx;
  color: var(--text-2);
}
.lv-exp-num {
  font-size: 34rpx;
  font-weight: 800;
  color: var(--primary);
}
.lv-bar {
  height: 16rpx;
  border-radius: 999rpx;
  background: var(--card-2);
  overflow: hidden;
  margin-top: 16rpx;
}
.lv-bar-fill {
  height: 100%;
  border-radius: 999rpx;
  background: linear-gradient(90deg, var(--primary), var(--primary-dark, #06a050));
  transition: width 0.4s ease;
}
.lv-bar-tip {
  display: block;
  font-size: 24rpx;
  color: var(--text-2);
  margin-top: 12rpx;
}
.lv-need {
  color: var(--primary);
  font-weight: 700;
}

/* 区块通用 */
.lv-note,
.lv-block {
  margin-top: 20rpx;
  padding: 26rpx 28rpx;
}
.lv-sec-title {
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: 28rpx;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 16rpx;
}
.lv-note-text {
  display: block;
  font-size: 25rpx;
  line-height: 1.7;
  color: var(--text-2);
}

/* 经验获取途径 */
.lv-src {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 18rpx 0;
  border-top: 1rpx solid var(--border);
}
.lv-src-left {
  flex: 1;
  min-width: 0;
}
.lv-src-label {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text);
}
.lv-src-desc {
  display: block;
  font-size: 23rpx;
  color: var(--text-2);
  margin-top: 4rpx;
  line-height: 1.5;
}
.lv-src-gain {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.lv-src-exp {
  font-size: 28rpx;
  font-weight: 800;
  color: var(--primary);
}
.lv-src-unit {
  font-size: 20rpx;
  color: var(--text-2);
}

/* 等级体系 */
.lv-tier {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
  padding: 22rpx 0;
  border-top: 1rpx solid var(--border);
}
.lv-tier-current {
  border: 2rpx solid var(--primary);
  border-radius: 18rpx;
  padding: 20rpx 18rpx;
  margin-top: 12rpx;
  background: var(--primary-soft, rgba(7, 193, 96, 0.12));
}
.lv-tier-locked {
  opacity: 0.62;
}
.lv-tier-ic {
  width: 64rpx;
  height: 64rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  box-shadow: 0 4rpx 10rpx rgba(0, 0, 0, 0.16);
}
.lv-tier-info {
  flex: 1;
  min-width: 0;
}
.lv-tier-name {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: var(--text);
}
.lv-tier-no {
  font-size: 22rpx;
  color: var(--text-2);
  font-weight: 600;
}
.lv-tier-range {
  display: block;
  font-size: 23rpx;
  color: var(--text-2);
  margin-top: 4rpx;
}
.lv-perks {
  display: flex;
  flex-direction: column;
  margin-top: 10rpx;
}
.lv-perk {
  font-size: 23rpx;
  color: var(--text-2);
  line-height: 1.6;
}
.lv-tier-flag {
  flex: none;
  display: flex;
  align-items: center;
}
.lv-flag {
  font-size: 22rpx;
  font-weight: 700;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
}
.lv-flag-current {
  background: var(--primary);
  color: #fff;
}
.lv-flag-lock {
  background: var(--border);
  color: var(--text-2);
}

.lv-foot {
  padding: 8rpx 0 0;
  text-align: center;
  font-size: 22rpx;
  color: var(--text-2);
  line-height: 1.5;
}
.bottom-pad {
  height: 80rpx;
}
</style>
