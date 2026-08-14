<template>
  <!-- 统一使用 PeekSheet 卡片框架（与自选「今日最热」/「显示列」同源）：
       无遮罩层、玻璃质感、仅顶部圆角，底部固定卡片。铃铛触发展开，关闭即卸载，
       避免与底部发帖卡片争抢同一固定位。 -->
  <PeekSheet ref="sheet" @collapse="onCollapse">
    <!-- 折叠态预览行（极少出现，因挂载即展开）：与发帖卡片一致的触发外观 -->
    <template #peek>
      <view class="mc-peek">
        <OutlineIcon type="bell" :size="30" color="var(--text-2)" />
        <text class="mc-peek-t">消息中心</text>
        <view v-if="unreadTotal > 0" class="mc-peek-badge">{{ unreadTotal > 99 ? '99+' : unreadTotal }}</view>
      </view>
    </template>

    <!-- 展开 / 铺满：消息中心内容（私信 / 点赞 / 评论） -->
    <template #default>
      <view class="mc-wrap">
        <!-- 头部：复用全局 grp-head + panel-head + sheet-title，左右留返回 / 关闭 -->
        <view class="grp-head panel-head mc-bar">
          <view class="mc-back" v-if="selectedOther" @click="selectedOther = null">
            <OutlineIcon type="arrow-left" :size="34" color="var(--text)" />
          </view>
          <text class="sheet-title">{{ selectedOther ? selectedOtherName : "消息中心" }}</text>
          <view class="mc-close" @click="close">
            <OutlineIcon type="close" :size="34" color="var(--text-2)" />
          </view>
        </view>

        <!-- 标签页（私信 / 点赞 / 评论） -->
        <view v-if="!selectedOther" class="mc-tabs">
          <view
            v-for="t in tabs"
            :key="t.key"
            :class="['mc-tab', tab === t.key ? 'on' : '']"
            @click="tab = t.key"
          >
            <OutlineIcon :type="t.icon" :size="30" :color="tab === t.key ? 'var(--primary)' : 'var(--text-2)'" />
            <text class="mc-tab-t">{{ t.label }}</text>
            <view v-if="t.key === 'dm' && unreadDm > 0" class="mc-tab-badge">{{ unreadDm > 99 ? "99+" : unreadDm }}</view>
          </view>
        </view>

        <!-- 会话列表 / 通知列表（可滚动） -->
        <scroll-view v-if="!selectedOther" scroll-y class="mc-scroll">
          <!-- 私信会话列表 -->
          <template v-if="tab === 'dm'">
            <view v-if="convLoading && !conversations.length" class="mc-loading"><view class="cl-spin" /></view>
            <view
              v-for="c in conversations"
              :key="c.otherId"
              class="mc-conv"
              @click="openConv(c)"
            >
              <UserAvatar :url="c.otherAvatarUrl" :seed="c.otherName" :size="84" :frame="c.otherFrame" />
              <view class="mc-conv-mid">
                <text class="mc-conv-name truncate">{{ c.otherName }}</text>
                <text class="mc-conv-last truncate">{{ c.lastContent || "还没有消息" }}</text>
              </view>
              <view class="mc-conv-right">
                <text class="mc-conv-time">{{ c.lastAt ? formatRelative(c.lastAt) : "" }}</text>
                <view v-if="c.unreadCount > 0" class="mc-dot">{{ c.unreadCount > 99 ? "99+" : c.unreadCount }}</view>
              </view>
            </view>
            <view v-if="!convLoading && !conversations.length" class="mc-empty">
              <OutlineIcon type="mail" :size="80" color="var(--border)" />
              <text class="empty-title">还没有私信</text>
            </view>
          </template>

          <!-- 点赞 / 评论通知 -->
          <template v-else>
            <view v-if="notifLoading && !notifications.length" class="mc-loading"><view class="cl-spin" /></view>
            <view
              v-for="n in filteredNotifs"
              :key="n.id"
              class="mc-notif"
            >
              <UserAvatar :url="n.actorAvatarUrl" :seed="n.actorName" :size="72" :frame="n.actorFrame" />
              <view class="mc-notif-mid">
                <view class="mc-notif-line">
                  <text class="mc-notif-name">{{ n.actorName }}</text>
                  <text class="mc-notif-act">{{ n.kind === "like" ? "赞了你的帖子" : "评论了你" }}</text>
                </view>
                <text v-if="n.kind === 'comment' && n.commentContent" class="mc-notif-comment truncate">{{ n.commentContent }}</text>
                <text class="mc-notif-snip truncate">「{{ n.postSnippet }}」</text>
              </view>
              <text class="mc-notif-time">{{ formatRelative(n.createdAt) }}</text>
            </view>
            <view v-if="!notifLoading && !filteredNotifs.length" class="mc-empty">
              <OutlineIcon :type="tab === 'like' ? 'heart' : 'chatbubble'" :size="80" color="var(--border)" />
              <text class="empty-title">{{ tab === "like" ? "还没有点赞通知" : "还没有评论通知" }}</text>
            </view>
          </template>
        </scroll-view>

        <!-- 私信会话详情（聊天） -->
        <template v-else>
          <scroll-view class="mc-thread" scroll-y :scroll-into-view="threadBottomId">
            <view
              v-for="m in activeThread"
              :key="m.id"
              :class="['mc-msg', m.senderId === myId ? 'mine' : '']"
            >
              <view class="mc-bubble">{{ m.content }}</view>
              <text class="mc-msg-time">{{ formatRelative(m.createdAt) }}</text>
            </view>
            <view :id="threadBottomId" />
          </scroll-view>
          <view class="mc-input">
            <input
              class="mc-input-in"
              v-model="dmText"
              placeholder="发送私信…"
              maxlength="500"
              confirm-type="send"
              @confirm="send"
            />
            <view :class="['mc-send', dmText.trim() ? '' : 'disabled']" @click="send">
              <OutlineIcon type="send" :size="30" :color="dmText.trim() ? '#fff' : 'rgba(255,255,255,0.6)'" />
            </view>
          </view>
        </template>
      </view>
    </template>
  </PeekSheet>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import UserAvatar from "./UserAvatar.vue";
import PeekSheet from "./PeekSheet.vue";
import { formatRelative, type Conversation, type NotificationItem } from "@/api/community";
import { useMessageCenter, useDmTarget } from "@/store/community";
import { userState } from "@/store/user";

const props = withDefaults(defineProps<{ modelValue: boolean }>(), { modelValue: false });
const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void }>();

const {
  notifications,
  notifLoading,
  conversations,
  convLoading,
  unreadDm,
  unreadTotal,
  activeThread,
  threadLoading,
  loadNotifications,
  loadConversations,
  openThread,
  sendDm,
  markNotifSeen,
} = useMessageCenter();
// 私信深链：公开资料页「发私信」写入目标，消息中心挂载时按对方 id 直接打开会话
const { consumeDmTarget } = useDmTarget();

const sheet = ref<any>(null);

type TabKey = "dm" | "like" | "comment";
const tabs: { key: TabKey; label: string; icon: string }[] = [
  { key: "dm", label: "私信", icon: "mail" },
  { key: "like", label: "点赞", icon: "heart" },
  { key: "comment", label: "评论", icon: "chatbubble" },
];
const tab = ref<TabKey>("dm");
const selectedOther = ref<Conversation | null>(null);
const dmText = ref("");

const myId = computed(() => userState.userId || "");
const selectedOtherName = computed(() => selectedOther.value?.otherName || "");
const threadBottomId = computed(() => `t-${activeThread.value.length}`);
const filteredNotifs = computed(() =>
  notifications.value.filter((n: NotificationItem) => n.kind === tab.value)
);

// 挂载即展开（铃铛已控制 v-if 按需挂载），并拉取数据（每次打开都是全新挂载）
onMounted(async () => {
  sheet.value?.expand();
  loadConversations();
  loadNotifications();
  // 私信深链：来自公开资料页「发私信」——直接打开与该用户的会话
  // （已有会话则载入历史，否则空会话待发，发送后由 loadConversations 聚合）
  const t = consumeDmTarget();
  if (t) {
    const conv: Conversation = {
      otherId: t.otherId,
      otherName: t.otherName,
      otherAvatarUrl: t.otherAvatarUrl,
      otherFrame: t.otherFrame,
      lastContent: "",
      lastAt: 0,
      unreadCount: 0,
      lastSenderMe: false,
    };
    selectedOther.value = conv;
    await openThread(t.otherId);
  }
});

// 拖拽收起到底 → 卸载自身，露出底部发帖卡片
function onCollapse() {
  emit("update:modelValue", false);
}
// 关闭按钮：直接卸载
function close() {
  emit("update:modelValue", false);
}

async function openConv(c: Conversation) {
  selectedOther.value = c;
  await openThread(c.otherId);
}
async function send() {
  const txt = dmText.value.trim();
  if (!txt || !selectedOther.value) return;
  const m = await sendDm(selectedOther.value.otherId, txt);
  if (m) dmText.value = "";
}

// 查看点赞 / 评论标签页即视为已读活动通知 → 清顶部铃铛徽章（社媒标准行为）
watch(
  () => tab.value,
  (k) => {
    if (k === "like" || k === "comment") markNotifSeen();
  }
);
</script>

<style scoped>
/* 折叠态预览行（与发帖卡片一致的外观） */
.mc-peek {
  display: flex;
  align-items: center;
  gap: 12rpx;
  height: 100%;
  padding: 0 26rpx;
}
.mc-peek-t {
  font-size: var(--font-md);
  color: var(--text);
}
.mc-peek-badge {
  min-width: 28rpx;
  height: 28rpx;
  padding: 0 6rpx;
  border-radius: 999rpx;
  background: var(--danger);
  color: #fff;
  font-size: 20rpx;
  line-height: 28rpx;
  text-align: center;
}

/* 展开内容容器：填满 peek-body，纵向三段（头部 / 标签 / 滚动列表） */
.mc-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* 头部：复用全局 panel-head 居中标题；左右留返回 / 关闭 */
.mc-bar {
  position: relative;
  justify-content: center;
}
.mc-bar .sheet-title {
  flex: 1;
  text-align: center;
}
.mc-back,
.mc-close {
  position: absolute;
  top: 0;
  height: 100%;
  display: flex;
  align-items: center;
  padding: 0 26rpx;
}
.mc-back {
  left: 0;
}
.mc-close {
  right: 0;
}

/* 标签页 */
.mc-tabs {
  flex: none;
  display: flex;
  padding: 0 18rpx;
  border-bottom: 1rpx solid var(--border);
}
.mc-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  height: 84rpx;
  position: relative;
  font-size: var(--font-md);
  color: var(--text-2);
}
.mc-tab.on {
  color: var(--text);
}
.mc-tab.on::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: 48rpx;
  height: 4rpx;
  border-radius: 999rpx;
  background: var(--primary);
}
.mc-tab-t {
  font-size: var(--font-md);
}
.mc-tab-badge {
  min-width: 28rpx;
  height: 28rpx;
  padding: 0 6rpx;
  border-radius: 999rpx;
  background: var(--danger);
  color: #fff;
  font-size: 20rpx;
  line-height: 28rpx;
  text-align: center;
}

/* 内容滚动区 */
.mc-scroll {
  flex: 1;
  min-height: 0;
}
.mc-loading {
  display: flex;
  justify-content: center;
  padding: 60rpx 0;
}
.mc-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18rpx;
  padding: 90rpx 0;
}

/* 会话列表条目 */
.mc-conv {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 20rpx 26rpx;
}
.mc-conv:active {
  background: var(--card-2);
}
.mc-conv-mid {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.mc-conv-name {
  font-size: var(--font-md);
  color: var(--text);
}
.mc-conv-last {
  font-size: var(--font-sm);
  color: var(--text-2);
}
.mc-conv-right {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10rpx;
}
.mc-conv-time {
  font-size: var(--font-xs);
  color: var(--text-3);
}
.mc-dot {
  min-width: 30rpx;
  height: 30rpx;
  padding: 0 8rpx;
  border-radius: 999rpx;
  background: var(--danger);
  color: #fff;
  font-size: 20rpx;
  line-height: 30rpx;
  text-align: center;
}

/* 聊天 */
.mc-thread {
  flex: 1;
  min-height: 0;
  padding: 18rpx 26rpx;
}
.mc-msg {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-bottom: 20rpx;
}
.mc-msg.mine {
  align-items: flex-end;
}
.mc-bubble {
  max-width: 70%;
  padding: 18rpx 22rpx;
  font-size: var(--font-sm);
  line-height: 1.45;
  border-radius: 18rpx;
  background: var(--card-2);
  color: var(--text);
}
.mc-msg.mine .mc-bubble {
  background: var(--primary);
  color: #fff;
}
.mc-msg-time {
  margin-top: 6rpx;
  font-size: var(--font-xs);
  color: var(--text-3);
}
.mc-input {
  flex: none;
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 14rpx 22rpx;
  border-top: 1rpx solid var(--border);
}
.mc-input-in {
  flex: 1;
  height: 72rpx;
  padding: 0 24rpx;
  font-size: var(--font-sm);
  color: var(--text);
  background: var(--card-2);
  border-radius: 999rpx;
}
.mc-send {
  flex: none;
  width: 72rpx;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background: var(--primary);
}
.mc-send.disabled {
  opacity: 0.5;
}

/* 通知条目 */
.mc-notif {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 18rpx 26rpx;
}
.mc-notif:active {
  background: var(--card-2);
}
.mc-notif-mid {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.mc-notif-line {
  display: flex;
  align-items: baseline;
  gap: 10rpx;
}
.mc-notif-name {
  font-size: var(--font-md);
  color: var(--text);
}
.mc-notif-act {
  font-size: var(--font-sm);
  color: var(--text-2);
}
.mc-notif-comment {
  font-size: var(--font-sm);
  color: var(--text);
}
.mc-notif-snip {
  font-size: var(--font-sm);
  color: var(--text-2);
}
.mc-notif-time {
  flex: none;
  font-size: var(--font-xs);
  color: var(--text-3);
}
</style>
