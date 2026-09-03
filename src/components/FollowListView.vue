<template>
  <!-- 复用消息中心同款 PeekSheet 卡片框架（无遮罩、玻璃质感、仅顶部圆角、底部固定）。
       挂载即展开，关闭即卸载，避免与底部发帖卡片争抢同一固定位。 -->
  <PeekSheet ref="sheet" :z-index="zIndex" @collapse="onCollapse">
    <!-- 折叠态预览行（极少出现，因挂载即展开）：与消息中心一致的触发外观 -->
    <template #peek>
      <view class="fl-peek">
        <OutlineIcon type="user" :size="30" color="var(--text-2)" />
        <text class="fl-peek-t">我的关注</text>
        <text v-if="followedUsers.length" class="fl-peek-badge">{{ followedUsers.length }}</text>
      </view>
    </template>

    <!-- 展开 / 铺满：我的关注列表（姓名 + 取消关注） -->
    <template #default>
      <view class="fl-wrap">
        <!-- 头部：复用全局 grp-head + panel-head + sheet-title -->
        <view class="grp-head panel-head fl-bar">
          <text class="sheet-title">我的关注</text>
        </view>

        <!-- 关注列表（可滚动） -->
        <scroll-view scroll-y class="fl-scroll">
          <view
            v-for="f in followedUsers"
            :key="f.id"
            class="fl-item"
          >
            <!-- 点击头像 / 昵称 → 进入该用户资料页 -->
            <view class="fl-item-info" hover-class="fl-item-info-hover" @click="openProfile(f.id)">
              <UserAvatar :url="f.avatar_url" :seed="f.display_name || f.username" :size="84" :frame="f.avatar_frame" />
              <view class="fl-item-mid">
                <text class="fl-item-name truncate">{{ f.display_name || f.username }}</text>
              </view>
            </view>
            <!-- 取消关注：点击即移除，列表随 follows 响应式收缩 -->
            <view class="fl-unfollow" hover-class="fl-unfollow-hover" @click="unfollow(f.id)">
              <text class="fl-unfollow-t">取消关注</text>
            </view>
          </view>
          <view v-if="!followedUsers.length" class="fl-empty">
            <OutlineIcon type="user" :size="80" color="var(--border)" />
            <text class="empty-title">还没有关注任何人</text>
          </view>
        </scroll-view>
      </view>
    </template>
  </PeekSheet>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import UserAvatar from "./UserAvatar.vue";
import PeekSheet from "./PeekSheet.vue";
import { useFollow } from "@/store/follow";
import { userState } from "@/store/user";
import { getSupabase } from "@/api/supabase";

withDefaults(defineProps<{ modelValue: boolean; zIndex?: number }>(), { modelValue: false, zIndex: 40 });
const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void }>();

const { follows, toggleFollow } = useFollow();

// 关注列表：由「我关注的用户 uid 集合」反查 profiles（服务端权威，含头像 / 昵称 / 头像框），
// 不再依赖社区帖子反查昵称，头像与资料页一致。
interface FollowedUser {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string;
  avatar_frame: string;
}
const followedUsers = ref<FollowedUser[]>([]);
async function loadFollowedUsers() {
  const ids = Array.from(follows.value);
  if (!ids.length) {
    followedUsers.value = [];
    return;
  }
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb
    .from("profiles")
    .select("id, display_name, username, avatar_url, avatar_frame")
    .in("id", ids);
  followedUsers.value = (data || []) as FollowedUser[];
}
watch(follows, loadFollowedUsers, { immediate: true });

/** 取消关注：toggleFollow 在已关注状态下会自动取消。 */
function unfollow(uid: string) {
  toggleFollow(uid);
}
/** 点击关注项（头像 / 昵称）→ 进入该用户资料页。 */
function openProfile(uid: string) {
  if (uid === userState.userId) uni.navigateTo({ url: "/pages/profile/edit" });
  else uni.navigateTo({ url: `/pages/profile/detail?uid=${encodeURIComponent(uid)}` });
}

const sheet = ref<any>(null);
// 挂载即展开（ProfileView 已控制跳转社区并置 followPanelOpen，本组件按需挂载）
onMounted(() => {
  loadFollowedUsers();
  sheet.value?.expand();
});

// 拖拽收起到底 / 关闭按钮 → 播放收起过渡后再卸载（本组件 v-if 按需挂载，立即 emit 会让卡片瞬间消失、
// 没有任何动效；先 collapse() 让 PeekSheet 的 height 过渡播完，再通知父组件卸载）。
// 与消息中心 MessageCenter 完全一致的收起动画逻辑，保证同类卡片动效统一。
const CLOSE_ANIM_MS = 340; // 略大于 PeekSheet --dur(0.32s)
let closeTimer: any = null;
function animateClose() {
  sheet.value?.collapse();
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = setTimeout(() => emit("update:modelValue", false), CLOSE_ANIM_MS);
}
function onCollapse() {
  animateClose();
}
onUnmounted(() => {
  if (closeTimer) clearTimeout(closeTimer);
});
// 暴露给父组件（与消息中心保持一致），便于复用同一套带过渡的收起动画
defineExpose({ animateClose });
</script>

<style scoped>
/* 折叠态预览行（与消息中心一致的外观） */
.fl-peek {
  display: flex;
  align-items: center;
  gap: 12rpx;
  height: 100%;
  padding: 0 26rpx;
}
.fl-peek-t {
  font-size: var(--font-md);
  color: var(--text);
}
.fl-peek-badge {
  min-width: 28rpx;
  height: 28rpx;
  padding: 0 6rpx;
  border-radius: 999rpx;
  background: var(--primary-soft);
  color: var(--primary);
  font-size: var(--font-xs);
  line-height: 28rpx;
  text-align: center;
}

/* 展开内容容器：填满 peek-body，纵向两段（头部 / 滚动列表） */
.fl-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* 头部：复用全局 panel-head 居中标题 */
.fl-bar {
  position: relative;
  justify-content: center;
}
.fl-bar .sheet-title {
  flex: 1;
  text-align: center;
}

/* 内容滚动区 */
.fl-scroll {
  flex: 1;
  min-height: 0;
}
.fl-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18rpx;
  padding: 90rpx 0;
}

/* 关注列表条目：头像 + 昵称（可点进资料页） + 取消关注 */
.fl-item {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 20rpx 26rpx;
  border-bottom: 1rpx solid var(--border);
}
/* 头像 + 昵称：点击进入资料页；点击反馈放在此区域，避免误触「取消关注」时整行高亮 */
.fl-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 18rpx;
}
.fl-item-info-hover {
  opacity: 0.6;
}
.fl-item-mid {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.fl-item-name {
  font-size: var(--font-md);
  color: var(--text);
}
/* 取消关注：纯文字危险操作，去掉背景与描边，红字与中性信息区分 */
.fl-unfollow {
  flex: none;
  display: inline-flex;
  align-items: center;
  padding: 10rpx 8rpx;
  transition: transform 0.12s ease, opacity 0.12s ease;
}
.fl-unfollow-hover {
  opacity: 0.6;
}
.fl-unfollow-t {
  font-size: var(--font-sm);
  color: var(--danger);
}
</style>
