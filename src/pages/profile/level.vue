<template>
  <view class="lv-page">
    <!-- 自定义导航头（navigationStyle:custom，需自带返回） -->
    <view class="lv-head sticky-head">
      <view class="lv-back nav-back" hover-class="nav-back-hover" @click="back" role="button" aria-label="返回">
        <OutlineIcon type="arrow-left" :size="30" color="var(--text)" />
      </view>
      <text class="lv-title nav-title">我的等级</text>
      <view class="lv-head-ph nav-ph" />
    </view>

    <scroll-view class="lv-scroll" scroll-y>
      <!-- 当前状态卡：勋章徽标（等级/VIP 一体化视觉）+ 经验进度 -->
      <view class="card lv-hero anim-fade-up" :class="{ 'is-vip': isVip }">
        <view class="lv-medal" :style="medalStyle">
          <OutlineIcon :type="hero.icon" :size="46" :color="hero.fg" />
        </view>
        <view class="lv-hero-main">
          <view class="lv-hero-top">
            <text class="lv-hero-name">{{ hero.name }}</text>
            <text class="lv-hero-no">Lv.{{ hero.id }}</text>
            <view v-if="isVip" class="lv-vip-chip">VIP</view>
          </view>
          <view class="lv-exp-row">
            <text class="lv-exp-lab">当前经验</text>
            <text class="lv-exp-num">{{ progress.exp }}</text>
          </view>
          <view class="lv-bar">
            <view class="lv-bar-fill" :style="barStyle" />
          </view>
          <text class="lv-bar-tip">
            <template v-if="progress.isMax">已达最高等级 · 封顶 🎉</template>
            <template v-else>距离 Lv.{{ hero.id + 1 }} 还需 <text class="lv-need">{{ progress.toNext }}</text> 经验</template>
          </text>
        </view>
      </view>

      <!-- VIP 会员已独立成页（pages/profile/vip），「我的」页有横幅入口；等级页聚焦等级本身 -->

      <!-- 升级规则总述 -->
      <view class="card lv-block anim-fade-up">
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
        <view v-for="s in EXP_SOURCES" :key="s.key" class="lv-src">
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

      <!-- 完整等级体系：纵向时间线（色带节点 + 连接线），当前级高亮 -->
      <view class="card lv-block anim-fade-up">
        <view class="lv-sec-title">
          <OutlineIcon type="trophy" :size="26" color="var(--primary)" />
          <text>等级体系</text>
        </view>
        <view
          v-for="(r, i) in rows"
          :key="r.level"
          class="lv-tier"
          :class="{ 'is-current': r.current, 'is-locked': !r.reached }"
        >
          <view class="lv-rail">
            <view class="lv-node" :style="nodeStyle(r.level)">
              <OutlineIcon :type="r.icon" :size="24" :color="nodeFg(r.level)" />
            </view>
            <view v-if="i < rows.length - 1" class="lv-rail-line" :class="{ lit: rows[i + 1].reached }" :style="railStyle(i)" />
          </view>
          <view class="lv-tier-info">
            <view class="lv-tier-name">
              <text>{{ r.name }}</text>
              <text class="lv-tier-no">Lv.{{ r.id }}</text>
              <text v-if="r.current" class="lv-flag-current">当前</text>
            </view>
            <text class="lv-tier-range">{{ r.range.label }} 经验</text>
            <view class="lv-perks">
              <text v-for="(p, pi) in r.perks" :key="pi" class="lv-perk">· {{ p }}</text>
            </view>
          </view>
          <view v-if="r.reached && !r.current" class="lv-tier-flag">
            <OutlineIcon type="check" :size="28" :color="nodeFg(r.level)" />
          </view>
        </view>
      </view>

      <text class="foot-note">等级与经验由系统根据活跃行为自动计算，最终解释权归观澜所有</text>
      <view class="bottom-pad" />
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import { useUser } from "@/store/user";
import { usePageGuard } from "@/store/guard";
import {
  badgeVisual,
  progressOf,
  levelLadder,
  EXP_SOURCES,
  LEVEL_RULE_NOTE,
  vipActive,
} from "@/store/level";

const user = useUser();
// 全局页面守卫：等级页未对游客开放 + 未登录 → 跳转登录页
usePageGuard("/pages/profile/level");

const level = computed(() => {
  const l = user.profile?.level;
  return typeof l === "number" && l >= 0 ? l : 0;
});
const exp = computed(() => {
  const e = user.profile?.exp;
  return typeof e === "number" && e > 0 ? e : 0;
});
const isVip = computed(() => vipActive(user.profile?.vip, user.profile?.vip_expires_at));

// hero / 节点 / 连接线全部取自 badgeVisual：VIP 与等级徽标一套视觉体系，无第二套配色
const hero = computed(() => badgeVisual(level.value, isVip.value));
const progress = computed(() => progressOf(level.value, exp.value));
const rows = computed(() => levelLadder(level.value, exp.value));

// 勋章：色带渐变圆牌 + 同色柔光外环；VIP 换金环
const medalStyle = computed(() => ({
  background: `linear-gradient(135deg, ${hero.value.from}, ${hero.value.to})`,
  boxShadow: isVip.value
    ? `0 0 0 6rpx ${hero.value.ring}, 0 8rpx 24rpx ${hero.value.ring}`
    : `0 0 0 6rpx ${hero.value.from}2e, var(--shadow-2)`,
}));

// 进度条填充与勋章同渐变（VIP 金色），强化一体化视觉
const barStyle = computed(() => ({
  width: (progress.value.ratio * 100).toFixed(1) + "%",
  background: `linear-gradient(90deg, ${hero.value.from}, ${hero.value.to})`,
}));

function nodeStyle(levelIdx: number) {
  const b = badgeVisual(levelIdx);
  return { background: `linear-gradient(135deg, ${b.from}, ${b.to})` };
}
function nodeFg(levelIdx: number) {
  return badgeVisual(levelIdx).fg;
}
/** 节点连接线：下一段已达成时用相邻两级的色带渐变点亮，否则默认细线 */
function railStyle(i: number) {
  const next = rows.value[i + 1];
  if (!next || !next.reached) return null;
  const a = badgeVisual(i);
  const b = badgeVisual(i + 1);
  return { background: `linear-gradient(180deg, ${a.from}, ${b.from})` };
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
.lv-scroll {
  flex: 1;
  height: 100%;
  box-sizing: border-box;
  padding: 24rpx 24rpx 0;
}

/* 当前状态 hero 卡：勋章 + 进度 */
.lv-hero {
  display: flex;
  align-items: center;
  gap: 26rpx;
  padding: 32rpx 28rpx;
}
/* VIP 态 hero 卡：金色调描边呼应徽章 */
.lv-hero.is-vip {
  box-shadow: inset 0 0 0 1rpx rgba(192, 142, 14, 0.4), var(--shadow-1);
}
.lv-medal {
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.lv-hero-main {
  flex: 1;
  min-width: 0;
}
.lv-hero-top {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.lv-hero-name {
  font-size: var(--font-xl);
  color: var(--text);
}
.lv-hero-no {
  font-size: var(--font-sm);
  color: var(--text-2);
}
.lv-vip-chip {
  flex: none;
  font-size: var(--font-xs);
  line-height: 1;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  color: #43300a;
  background: linear-gradient(135deg, #f7d27a, #c08e0e);
  box-shadow: 0 0 0 1rpx rgba(192, 142, 14, 0.55);
}
.lv-exp-row {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  margin-top: 8rpx;
}
.lv-exp-lab {
  font-size: var(--font-sm);
  color: var(--text-2);
}
.lv-exp-num {
  font-size: var(--font-lg);
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
  transition: width 0.4s ease;
}
.lv-bar-tip {
  display: block;
  font-size: var(--font-sm);
  color: var(--text-2);
  margin-top: 12rpx;
}
.lv-need {
  color: var(--primary);
}

/* 区块通用 */
.lv-block {
  margin-top: 20rpx;
  padding: 26rpx 28rpx;
}
.lv-sec-title {
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: var(--font-md);
  color: var(--text);
  margin-bottom: 16rpx;
}
.lv-note-text {
  display: block;
  font-size: var(--font-sm);
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
  font-size: var(--font-md);
  color: var(--text);
}
.lv-src-desc {
  display: block;
  font-size: var(--font-sm);
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
  font-size: var(--font-md);
  color: var(--primary);
}
.lv-src-unit {
  font-size: var(--font-xs);
  color: var(--text-2);
}

/* 等级体系：纵向时间线（左轨节点 + 连接线） */
.lv-tier {
  display: flex;
  align-items: stretch;
  gap: 20rpx;
}
.lv-tier.is-current {
  border: 2rpx solid var(--primary);
  border-radius: 18rpx;
  background: var(--primary-soft, rgba(7, 193, 96, 0.12));
  padding: 18rpx 16rpx 18rpx 6rpx;
}
.lv-tier.is-locked .lv-tier-info {
  opacity: 0.55;
}
.lv-rail {
  flex: none;
  width: 48rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.lv-node {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  margin-top: 4rpx;
  box-shadow: var(--shadow-1);
}
/* 未达成的节点整体去饱和，达成后恢复彩色 */
.lv-tier.is-locked .lv-node {
  filter: grayscale(1);
  opacity: 0.5;
}
.lv-rail-line {
  flex: 1;
  width: 2rpx;
  min-height: 26rpx;
  margin: 6rpx 0;
  background: var(--border);
  border-radius: 2rpx;
}
.lv-rail-line.lit {
  background: var(--border);
}
.lv-tier-info {
  flex: 1;
  min-width: 0;
  padding: 4rpx 0 26rpx;
}
.lv-tier:last-child .lv-tier-info {
  padding-bottom: 6rpx;
}
.lv-tier-name {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  font-size: var(--font-md);
  color: var(--text);
}
.lv-tier-no {
  font-size: var(--font-xs);
  color: var(--text-2);
}
.lv-flag-current {
  flex: none;
  font-size: var(--font-xs);
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  background: var(--primary);
  color: #fff;
}
.lv-tier-range {
  display: block;
  font-size: var(--font-sm);
  color: var(--text-2);
  margin-top: 4rpx;
}
.lv-perks {
  display: flex;
  flex-direction: column;
  margin-top: 10rpx;
}
.lv-perk {
  font-size: var(--font-sm);
  color: var(--text-2);
  line-height: 1.6;
}
.lv-tier-flag {
  flex: none;
  display: flex;
  align-items: flex-start;
  padding-top: 10rpx;
}

.bottom-pad {
  height: 80rpx;
}
</style>
