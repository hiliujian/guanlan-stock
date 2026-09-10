<template>
  <!-- 复用消息中心同款 PeekSheet 卡片框架（无遮罩、玻璃质感、仅顶部圆角、底部固定）。
       挂载即展开，关闭即卸载，避免与底部发帖卡片争抢同一固定位。 -->
  <PeekSheet ref="sheet" :z-index="zIndex" @collapse="onCollapse">
    <!-- 折叠态预览行（极少出现，因挂载即展开）：与消息中心一致的触发外观 -->
    <template #peek>
      <view class="fl-peek">
        <OutlineIcon type="user" :size="30" color="var(--text-2)" />
        <text class="fl-peek-t">{{ isFans ? "我的粉丝" : "我的关注" }}</text>
        <text v-if="listUsers.length" class="fl-peek-badge">{{ listUsers.length }}</text>
      </view>
    </template>

    <!-- 展开 / 铺满：关注 / 粉丝列表（姓名 + 操作按钮） -->
    <template #default>
      <view class="fl-wrap">
        <!-- 头部：复用全局 grp-head + panel-head + sheet-title -->
        <view class="grp-head panel-head fl-bar">
          <text class="sheet-title">{{ isFans ? "我的粉丝" : "我的关注" }}</text>
        </view>

        <!-- 列表（可滚动） -->
        <scroll-view scroll-y class="fl-scroll">
          <view
            v-for="f in listUsers"
            :key="f.id"
            class="fl-item"
          >
            <!-- 点击头像 / 昵称 → 进入该用户资料页 -->
            <view class="fl-item-info" hover-class="fl-item-info-hover" @click="openProfile(f.id)">
              <UserAvatar :url="f.avatar_url" :seed="f.display_name || f.username" :size="84" :frame="vipGatedFrame(f.avatar_frame, vipActive(f.vip, f.vip_expires_at))" />
              <view class="fl-item-mid">
                <text class="fl-item-name truncate">{{ f.display_name || f.username }}</text>
              </view>
            </view>
            <!-- 关注模式：取消关注；粉丝模式：回关 / 已互关（状态随 follows 集合即时切换） -->
            <view
              :class="['fl-act', { 'fl-act-on': isFans && isFollowing(f.id) }]"
              hover-class="fl-act-hover"
              @click="isFans ? toggleFollow(f.id) : unfollow(f.id)"
            >
              <text class="fl-act-t">{{ isFans ? (isFollowing(f.id) ? "已互关" : "回关") : "取消关注" }}</text>
            </view>
          </view>
          <view v-if="!listUsers.length" class="fl-empty">
            <OutlineIcon type="user" :size="80" color="var(--border)" />
            <text class="empty-title">{{ isFans ? "还没有粉丝" : "还没有关注任何人" }}</text>
          </view>
        </scroll-view>
      </view>
    </template>
  </PeekSheet>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import UserAvatar from "./UserAvatar.vue";
import PeekSheet from "./PeekSheet.vue";
import { useFollow } from "@/store/follow";
import { userState } from "@/store/user";
import { vipActive } from "@/store/level";
import { getSupabase } from "@/api/supabase";
import { vipGatedFrame } from "@/utils/avatarFrame";

// 弹层方向：following=我关注的用户；fans=关注我的粉丝（复用同一列表框架，仅数据源与操作不同）
const props = withDefaults(defineProps<{ modelValue: boolean; zIndex?: number; mode?: "following" | "fans" }>(), {
  modelValue: false,
  zIndex: 40,
  mode: "following",
});
const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void }>();
const isFans = computed(() => props.mode === "fans");

const { follows, toggleFollow, isFollowing } = useFollow();

// 列表数据：关注模式=「我关注的 uid 集合」反查 profiles；粉丝模式=follows 表反查 follower_id。
// 统一由 profiles 表补齐头像 / 昵称 / 头像框（服务端权威，与资料页一致）。
interface FollowedUser {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string;
  avatar_frame: string;
  vip: boolean;
  vip_expires_at: string | null;
}
const listUsers = ref<FollowedUser[]>([]);
async function loadListUsers() {
  const sb = getSupabase();
  if (!sb) return;
  if (isFans.value) {
    // 粉丝：follows 表 where following_id = 我 → 取全部 follower_id 反查 profiles
    const myUid = userState.userId;
    if (!myUid) {
      listUsers.value = [];
      return;
    }
    const { data: rows } = await sb
      .from("follows")
      .select("follower_id")
      .eq("following_id", myUid);
    const ids = ((rows as any[]) || []).map((r) => r.follower_id as string);
    if (!ids.length) {
      listUsers.value = [];
      return;
    }
    const { data } = await sb
      .from("profiles")
      .select("id, display_name, username, avatar_url, avatar_frame, vip, vip_expires_at")
      .in("id", ids);
    listUsers.value = (data || []) as FollowedUser[];
  } else {
    const ids = Array.from(follows.value);
    if (!ids.length) {
      listUsers.value = [];
      return;
    }
    const { data } = await sb
      .from("profiles")
      .select("id, display_name, username, avatar_url, avatar_frame, vip, vip_expires_at")
      .in("id", ids);
    listUsers.value = (data || []) as FollowedUser[];
  }
}
// 关注模式随 follows 集合变化（取消关注即时收缩）；粉丝模式仅挂载时加载一次
watch(follows, () => { if (!isFans.value) loadListUsers(); }, { immediate: true });

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
  loadListUsers();
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
  /* 与全部底部折叠卡（今日最热 / 股市行情 / 分享观点）统一字号 */
  font-size: var(--font-sm);
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
/* 操作按钮：关注模式=取消关注（危险红字）；粉丝模式=回关（主题色高亮）/已互关（灰色） */
.fl-act {
  flex: none;
  display: inline-flex;
  align-items: center;
  padding: 10rpx 8rpx;
  transition: transform 0.12s ease, opacity 0.12s ease;
}
.fl-act-hover {
  opacity: 0.6;
}
.fl-act-t {
  font-size: var(--font-sm);
  color: var(--danger);
}
.fl-act-on .fl-act-t {
  color: var(--text-2);
}
</style>
