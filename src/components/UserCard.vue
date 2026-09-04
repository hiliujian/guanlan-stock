<template>
  <!-- 社区搜索用户名片（抖音风用户卡片）：头像 + 昵称/@用户名 + 简介 + 粉丝数 + 关注按钮；
       点击卡片（非关注按钮）→ 跳该用户公开资料页；本人则显示「我」标识。
       平滑过渡由外层 <Transition name="ucard"> 驱动，过渡类定义在本组件 scoped 样式中。 -->
  <view class="ucard glass" @click="goProfile">
    <!-- 头部：左头像 + 中昵称/@用户名（垂直居中）+ 右操作区（「我」标识 / 关注按钮） -->
    <view class="uc-head">
      <UserAvatar
        :url="user.avatar_url"
        :seed="user.display_name || user.username"
        :size="60"
        :frame="user.avatar_frame"
      />
      <view class="uc-meta">
        <view class="uc-namerow">
          <text :class="['uc-name', 'truncate', { 'vip-name': isVip }]">{{ user.display_name || user.username }}</text>
          <view v-if="isVip" class="uc-crown">
            <OutlineIcon type="crown" :size="22" color="var(--vip-gold)" />
          </view>
        </view>
        <text class="uc-username">@{{ user.username }}</text>
      </view>

      <!-- 本人 → 「我」标识；他人 → 关注/已关注按钮（关注态随服务端实时变化） -->
      <view v-if="isSelf" class="uc-self">我</view>
      <view
        v-else
        class="uc-follow"
        :class="{ on: following }"
        hover-class="uc-follow-hover"
        role="button"
        @click.stop="onToggleFollow"
      >
        <OutlineIcon :type="following ? 'check' : 'plus'" :size="24" :color="following ? 'var(--text-2)' : 'var(--primary)'" />
        <text class="uc-follow-t">{{ following ? "已关注" : "关注" }}</text>
      </view>
    </view>

    <!-- 个人简介（空则引导文案，与资料页一致） -->
    <text v-if="user.signature" class="uc-bio">{{ user.signature }}</text>
    <text v-else class="uc-bio uc-bio-empty">这个人很懒，还没有填写简介</text>

    <!-- 粉丝数 / 动态数（真实值，来自 count_followers RPC 与 community_posts 计数） -->
    <view class="uc-foot">
      <text class="uc-stat"><text class="uc-fans-n">{{ followerCount }}</text> 粉丝</text>
      <text class="uc-stat"><text class="uc-fans-n">{{ postCount }}</text> 动态</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import UserAvatar from "./UserAvatar.vue";
import type { UsernameLookup } from "@/api/user";
import { communityRepo } from "@/api/community";
import { useFollow } from "@/store/follow";
import { userState } from "@/store/user";
import { vipActive } from "@/store/level";

const props = defineProps<{ user: UsernameLookup }>();

// 关注态：服务端 follows 表，以 uid 为键；乐观更新由 useFollow 内部处理。
const { follows, toggleFollow, fetchFollowerCount } = useFollow();
const following = computed(() => follows.value.has(props.user.id));
// 当前登录用户即名片本人 → 显示「我」标识（不展示关注按钮）
const isSelf = computed(() => !!userState.loggedIn && !!userState.userId && props.user.id === userState.userId);
// VIP 有效态（过期自动退回普通视觉）
const isVip = computed(() => vipActive(props.user.vip, props.user.vip_expires_at));

// 粉丝数 / 动态数：每次名片指向的用户变化时重新拉取（均公开可读）
const followerCount = ref(0);
const postCount = ref(0);
async function loadStats() {
  const uid = props.user.id;
  followerCount.value = await fetchFollowerCount(uid);
  postCount.value = await communityRepo.countPosts(uid);
}
watch(() => props.user.id, loadStats, { immediate: true });
onMounted(loadStats);

async function onToggleFollow() {
  if (!userState.loggedIn) {
    uni.showToast({ title: "登录后可关注", icon: "none" });
    return;
  }
  await toggleFollow(props.user.id);
}

function goProfile() {
  // 跳转对齐 PostCard/FollowListView 同款口径：本人 → 个人资料页（可编辑），
  // 他人 → 公开资料页（detail?uid=）
  if (isSelf.value) {
    uni.navigateTo({ url: "/pages/profile/edit" });
    return;
  }
  uni.navigateTo({ url: `/pages/profile/detail?uid=${encodeURIComponent(props.user.id)}` });
}
</script>

<style scoped>
.ucard {
  margin: 0 18rpx 14rpx;
  padding: 22rpx 24rpx;
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}
/* 头部：头像 + 昵称列 + 右侧操作 */
.uc-head {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.uc-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.uc-namerow {
  display: flex;
  align-items: center;
  gap: 6rpx;
  min-width: 0;
}
.uc-name {
  flex: 0 1 auto;
  min-width: 0;
  max-width: calc(100% - 34rpx);
  font-size: var(--font-md);
  color: var(--text);
}
.uc-crown {
  flex: none;
  display: flex;
  align-items: center;
  line-height: 1;
}
.uc-username {
  font-size: var(--font-xs);
  color: var(--text-3);
}
/* 「我」标识：中性描边胶囊，区别于关注按钮（主色） */
.uc-self {
  flex: none;
  padding: 8rpx 22rpx;
  border-radius: 999rpx;
  background: var(--card-2);
  box-shadow: inset 0 0 0 1rpx var(--border);
  font-size: var(--font-sm);
  color: var(--text-2);
}
/* 关注按钮：轻量药丸，与 PostCard .p-follow 同款视觉语言（未关注主色、已关注中性描边） */
.uc-follow {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: 8rpx 22rpx;
  border-radius: 999rpx;
  background: var(--primary-soft);
  transition: transform 0.12s ease, opacity 0.12s ease;
}
.uc-follow.on {
  background: var(--card-2);
  box-shadow: inset 0 0 0 1rpx var(--border);
}
.uc-follow-hover {
  opacity: 0.6;
}
.uc-follow-t {
  font-size: var(--font-sm);
  color: var(--primary);
}
.uc-follow.on .uc-follow-t {
  color: var(--text-2);
}
/* 简介：两行省略，避免撑高卡片 */
.uc-bio {
  font-size: var(--font-sm);
  line-height: 1.5;
  color: var(--text-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.uc-bio-empty {
  color: var(--text-3);
}
.uc-foot {
  display: flex;
  gap: 28rpx;
}
.uc-stat {
  font-size: var(--font-sm);
  color: var(--text-3);
}
.uc-fans-n {
  color: var(--text);
}

/* 平滑过渡（由外层 <Transition name="ucard"> 触发，类加在本组件根元素上） */
.ucard-enter-active,
.ucard-leave-active {
  transition: opacity var(--dur) var(--ease-out), transform var(--dur) var(--ease-out);
}
.ucard-enter-from,
.ucard-leave-to {
  opacity: 0;
  transform: translateY(-12rpx);
}
</style>
