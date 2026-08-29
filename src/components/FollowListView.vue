<template>
  <!-- 复用消息中心同款 PeekSheet 卡片框架（无遮罩、玻璃质感、仅顶部圆角、底部固定）。
       挂载即展开，关闭即卸载，避免与底部发帖卡片争抢同一固定位。 -->
  <PeekSheet ref="sheet" @collapse="onCollapse">
    <!-- 折叠态预览行（极少出现，因挂载即展开）：与消息中心一致的触发外观 -->
    <template #peek>
      <view class="fl-peek">
        <OutlineIcon type="user" :size="30" color="var(--text-2)" />
        <text class="fl-peek-t">我的关注</text>
        <text v-if="followList.length" class="fl-peek-badge">{{ followList.length }}</text>
      </view>
    </template>

    <!-- 展开 / 铺满：我的关注列表（姓名 + 取消关注） -->
    <template #default>
      <view class="fl-wrap">
        <!-- 头部：复用全局 grp-head + panel-head + sheet-title，右侧留关闭 -->
        <view class="grp-head panel-head fl-bar">
          <text class="sheet-title">我的关注</text>
          <view class="fl-close" @click="close">
            <OutlineIcon type="close" :size="34" color="var(--text-2)" />
          </view>
        </view>

        <!-- 关注列表（可滚动） -->
        <scroll-view scroll-y class="fl-scroll">
          <view
            v-for="f in followList"
            :key="f"
            class="fl-item"
          >
            <UserAvatar :url="avatarOf(f)" :seed="f" :size="84" :frame="frameOf(f)" />
            <view class="fl-item-mid">
              <text class="fl-item-name truncate">{{ f }}</text>
            </view>
            <!-- 取消关注：点击即移除，列表随 follows 响应式收缩 -->
            <view class="fl-unfollow" hover-class="fl-unfollow-hover" @click="unfollow(f)">
              <text class="fl-unfollow-t">取消关注</text>
            </view>
          </view>
          <view v-if="!followList.length" class="fl-empty">
            <OutlineIcon type="user" :size="80" color="var(--border)" />
            <text class="empty-title">还没有关注任何人</text>
          </view>
        </scroll-view>
      </view>
    </template>
  </PeekSheet>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import UserAvatar from "./UserAvatar.vue";
import PeekSheet from "./PeekSheet.vue";
import { useFollow } from "@/store/follow";
import { useCommunity } from "@/store/community";

const props = withDefaults(defineProps<{ modelValue: boolean }>(), { modelValue: false });
const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void }>();

const { list, unfollow: doUnfollow } = useFollow();
const { posts } = useCommunity();

const followList = computed(() => list());

// 关注仅以昵称唯一标识，头像从社区帖子反查（昵称一致即同一用户），无帖子则用「字」头像兜底。
const avatarMap = computed(() => {
  const m = new Map<string, { url: string; frame: string }>();
  for (const p of posts.value) {
    if (!m.has(p.author)) m.set(p.author, { url: p.authorAvatarUrl || "", frame: p.authorFrame || "" });
  }
  return m;
});
function avatarOf(name: string): string {
  return avatarMap.value.get(name)?.url || "";
}
function frameOf(name: string): string {
  return avatarMap.value.get(name)?.frame || "";
}
function unfollow(name: string) {
  doUnfollow(name);
}

const sheet = ref<any>(null);
// 挂载即展开（ProfileView 已控制跳转社区并置 followPanelOpen，本组件按需挂载）
onMounted(() => {
  sheet.value?.expand();
});

// 拖拽收起到底 / 关闭按钮 → 卸载自身，露出底部发帖卡片
function onCollapse() {
  emit("update:modelValue", false);
}
function close() {
  emit("update:modelValue", false);
}
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
/* 头部：复用全局 panel-head 居中标题；右侧留关闭 */
.fl-bar {
  position: relative;
  justify-content: center;
}
.fl-bar .sheet-title {
  flex: 1;
  text-align: center;
}
.fl-close {
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  display: flex;
  align-items: center;
  padding: 0 26rpx;
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

/* 关注列表条目：头像 + 昵称 + 取消关注 */
.fl-item {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 20rpx 26rpx;
  border-bottom: 1rpx solid var(--border);
}
.fl-item:active {
  background: var(--card-2);
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
.fl-unfollow {
  flex: none;
  display: inline-flex;
  align-items: center;
  padding: 10rpx 22rpx;
  border-radius: 999rpx;
  background: var(--card-2);
  box-shadow: inset 0 0 0 1rpx var(--border);
  transition: transform 0.12s ease, opacity 0.12s ease;
}
.fl-unfollow-hover {
  opacity: 0.6;
}
.fl-unfollow-t {
  font-size: var(--font-sm);
  color: var(--text-2);
}
</style>
