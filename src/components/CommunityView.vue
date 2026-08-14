<template>
  <view class="cm-root">
    <!-- 顶部：品牌 + 消息入口（邮件图标 + 文字 + 未读角标），与自选共用 PageHeader -->
    <PageHeader brand-text="社区" brand-icon="chatbubble">
      <template #right>
        <view class="cm-msg" @click="msgOpen = true">
          <OutlineIcon type="mail" :size="30" color="var(--text)" />
          <view class="cm-msg-label">
            <text class="cm-msg-text">消息</text>
            <view v-if="unreadTotal > 0" class="cm-badge">{{ unreadTotal > 99 ? '99+' : unreadTotal }}</view>
          </view>
        </view>
      </template>
    </PageHeader>

    <!-- 搜索栏：关键字 / 股票代码 / 股票名称 -->
    <view class="cm-search">
      <OutlineIcon type="search" :size="30" color="var(--text-2)" />
      <input
        class="cm-search-input"
        :value="searchQuery"
        @input="onSearchInput"
        @confirm="onSearchConfirm"
        placeholder="搜索帖子、股票代码或名称"
        placeholder-class="cm-search-ph"
        confirm-type="search"
      />
      <view v-if="searchQuery" class="cm-search-clear" @click="clearSearch">
        <OutlineIcon type="close" :size="26" color="var(--text-2)" />
      </view>
    </view>

    <!-- 可滚动内容区 -->
    <scroll-view class="cm-scroll" scroll-y>

    <!-- 动态栏目标题 + 筛选下拉（下拉刷新由页面 onPullDownRefresh 触发，此处不再保留刷新按钮） -->
    <view class="cm-bar flex-between">
      <view v-if="!searching" class="cm-filter" @click="filterOpen = !filterOpen">
        <text class="cm-bar-t">{{ filterTitle }}</text>
        <OutlineIcon type="pulldown" :size="22" color="var(--text-2)" class="cm-filter-arrow" :class="{ 'is-open': filterOpen }" />
      </view>
      <text v-else class="cm-bar-t">搜索结果 · {{ displayPosts.length }}</text>
    </view>
    <!-- 筛选下拉菜单 -->
    <view v-if="filterOpen && !searching" class="cm-filter-mask" @click="filterOpen = false">
      <view class="cm-filter-menu" @click.stop>
        <view
          v-for="opt in filterOptions"
          :key="opt.key"
          class="cm-filter-item"
          :class="{ active: filterKey === opt.key }"
          @click="chooseFilter(opt.key)"
        >
          <text class="cm-filter-item-text">{{ opt.label }}</text>
          <OutlineIcon v-if="filterKey === opt.key" type="check" :size="26" color="var(--primary)" />
        </view>
      </view>
    </view>

    <!-- 加载态 -->
    <view v-if="loading && !displayPosts.length" class="cm-loading"><view class="cl-spin" /></view>

    <!-- 信息流 -->
    <PostCard
      v-for="p in displayPosts"
      :key="p.id"
      :post="p"
      :mine="isMine(p)"
      @like="like"
      @reply="reply"
      @remove="remove"
    />

    <!-- 空态 -->
    <view v-if="!loading && !displayPosts.length" class="cm-empty">
      <OutlineIcon type="chatbubble" :size="84" color="var(--border)" />
      <text class="empty-title">{{ emptyText }}</text>
    </view>

    <!-- 底部留白（避免被固定 tabbar 与底部发帖卡片遮挡） -->
    <view class="cm-pad" />
    </scroll-view>

    <!-- 底部发帖卡片：复用自选同款 PeekSheet（与自选卡片一致），折叠态为输入框卡片，展开进入完整发帖界面 -->
    <PeekSheet ref="postSheet">
      <template #peek>
        <view class="pe-peek">
          <UserAvatar :url="myAvatarUrl" :seed="mySeed" :size="44" :frame="myFrame" />
          <view class="pe-ph">分享你的观点、复盘或提问…</view>
        </view>
      </template>
      <template #default>
        <scroll-view scroll-y class="pe-body">
          <PostComposer @publish-text="onText" @publish-card="onCard" />
        </scroll-view>
      </template>
    </PeekSheet>

    <!-- 消息中心（通知铃铛触发）：按需挂载为 PeekSheet 卡片，关闭即卸载，避免与发帖卡片争位 -->
    <MessageCenter v-if="msgOpen" v-model="msgOpen" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onActivated, watch } from "vue";
// 声明可接收的 open-market 监听（父级 pages/index 动态 <component> + KeepAlive 可能透传），
// 声明后 Vue 按自定义事件处理，避免 extraneous 告警。本组件自身不触发该事件。
defineEmits<{ (e: "open-market", payload: { code: string; market: string }): void }>();
import OutlineIcon from "./OutlineIcon.vue";
import PageHeader from "./PageHeader.vue";
import PostComposer from "./PostComposer.vue";
import PostCard from "./PostCard.vue";
import UserAvatar from "./UserAvatar.vue";
import PeekSheet from "./PeekSheet.vue";
import MessageCenter from "./MessageCenter.vue";
import { useCommunity, useMessageCenter } from "@/store/community";
import { usePageGuard } from "@/store/guard";
import { getMyName } from "@/store/identity";
import { userState } from "@/store/user";
import { avatarSeed } from "@/utils/avatar";
import type { CommunityPost, PostCard as PostCardData, Topic } from "@/api/community";

const { posts, loading, searchResults, load, publishText, publishCard, like, reply, remove, search } = useCommunity();

// 消息中心：未读总数角标（私信 + 活动通知）+ 进入消息中心加载会话
const { unreadTotal, loadConversations, loadNotifications } = useMessageCenter();
const msgOpen = ref(false);
const postSheet = ref<any>(null);

// 全局页面守卫：本页未对游客开放 + 未登录 → 跳转登录页（统一由 src/store/guard.ts 处理）
usePageGuard("community");

// ---------------- 我的身份（昵称，账号感知且响应式） ----------------
// getMyName 已内置账号优先逻辑：登录后用账号资料，未登录回退本地。
// 这里包一层 computed，登录态/资料变化时自动重算；头像为按昵称生成的「字」头像。
const myName = computed(() => getMyName());
// 「字」头像种子 = 用户名（固定唯一）：已登录时昵称修改不改变默认头像；
// 未登录沿用本地昵称（本地昵称亦即其身份）。
const mySeed = computed(() =>
  userState.loggedIn && userState.userId
    ? avatarSeed(userState.profile?.username || "") || "我"
    : myName.value
);
// 已登录时直接读 user.profile.avatar_url（与个人资料页同源）；
// 未登录时无 url，回退到「字」头像。这是修复「社区头像不同步」的根因。
const myAvatarUrl = computed(() =>
  userState.loggedIn ? userState.profile?.avatar_url || "" : ""
);
// 自己的头像框：已登录读 profiles.avatar_frame；未登录无边框
const myFrame = computed(() =>
  userState.loggedIn ? userState.profile?.avatar_frame || "" : ""
);

function isMine(p: CommunityPost): boolean {
  // 已登录：按账号 id 判定（帖子创建时已写入 userId）
  if (userState.loggedIn && userState.userId) {
    return !!p.userId && p.userId === userState.userId;
  }
  // 未登录：按本地昵称判定
  return p.author === myName.value;
}

// ---------------- 信息流筛选（最新动态 / 关注的人 / 参与的帖子 / 我发布的） ----------------
type FilterKey = "latest" | "following" | "participated" | "mine";
const filterOptions: { key: FilterKey; label: string }[] = [
  { key: "latest", label: "最新动态" },
  { key: "following", label: "关注的人" },
  { key: "participated", label: "参与的帖子" },
  { key: "mine", label: "我发布的" },
];
const filterKey = ref<FilterKey>("latest");
const filterOpen = ref(false);
const filterTitle = computed(
  () => filterOptions.find((o) => o.key === filterKey.value)?.label || "最新动态"
);
// 关注系统尚未接入：followedAuthors 默认空，待后端提供关注列表后填充即可启用「关注的人」。
const followedAuthors = ref<Set<string>>(new Set());
const filteredPosts = computed(() => {
  const base = posts.value;
  switch (filterKey.value) {
    case "mine":
      return base.filter((p) => isMine(p));
    case "participated":
      // 我发布的或我回过的帖子都算「参与」
      return base.filter((p) => isMine(p) || p.replies.some((r) => r.author === myName.value));
    case "following":
      return base.filter((p) => followedAuthors.value.has(p.author));
    default:
      return base;
  }
});

// ---------------- 信息流（展示筛选结果；搜索态优先展示搜索结果） ----------------
const displayPosts = computed(() => (searching.value ? searchResults.value : filteredPosts.value));

// 空态文案：随筛选 / 搜索态变化
const emptyText = computed(() => {
  if (searching.value) return "未找到相关帖子";
  if (filterKey.value === "following") return "还没有关注的人动态";
  if (filterKey.value !== "latest") return "这里还没有相关动态";
  return "还没有动态，来发第一条吧";
});

function chooseFilter(key: FilterKey) {
  filterKey.value = key;
  filterOpen.value = false;
  // 选中筛选项时退出搜索态，让筛选结果可见（否则搜索结果会覆盖筛选）
  if (searching.value) clearSearch();
}

// ---------------- 搜索栏逻辑（关键字 / 股票代码 / 股票名称） ----------------
const searchQuery = ref("");
const searching = computed(() => searchQuery.value.trim().length > 0);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function runSearch() {
  filterOpen.value = false;
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  if (searchQuery.value.trim()) {
    search(searchQuery.value);
  } else {
    searchResults.value = [];
  }
}
function onSearchInput(e: any) {
  const v = e?.detail?.value ?? e?.target?.value ?? "";
  searchQuery.value = v;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 300);
}
function onSearchConfirm() {
  runSearch();
}
function clearSearch() {
  searchQuery.value = "";
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  searchResults.value = [];
}

// ---------------- 发布 ----------------
async function onText(content: string, topic?: Topic, images?: string[]) {
  try {
    await publishText(content, topic, images);
    postSheet.value?.collapse();
  } catch (e: any) {
    uni.showToast({ title: e?.message || "发布失败，请稍后再试", icon: "none" });
  }
}
async function onCard(card: PostCardData, images?: string[]) {
  try {
    await publishCard(card, images);
    postSheet.value?.collapse();
  } catch (e: any) {
    uni.showToast({ title: e?.message || "发布失败，请稍后再试", icon: "none" });
  }
}

// keep-alive 每次激活：（已登录 / 公开页）加载社区动态；未授权由全局守卫跳转登录页
onActivated(() => {
  if (!posts.value.length) load();
  // 刷新未读角标（私信 + 活动通知，已登录才拉）
  if (userState.loggedIn) {
    loadConversations();
    loadNotifications();
  }
});
// 登录后：空态消失，立即加载社区动态与未读角标
watch(
  () => userState.loggedIn,
  (li) => {
    if (li) {
      if (!posts.value.length) load();
      loadConversations();
      loadNotifications();
    }
  }
);

// 暴露给页面级下拉刷新（index.vue onPullDownRefresh 路由到此）：重载社区帖子列表
defineExpose({ refresh: load });
</script>

<style scoped>
.cm-root {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.cm-scroll {
  flex: 1;
  min-height: 0;
  height: auto;
}
/* 「消息」入口：邮件图标 + 文字组合，替代原头像/昵称区；点击进入消息中心 */
.cm-msg {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: 6rpx;
  color: var(--text);
}
.cm-msg:active {
  opacity: 0.6;
}
.cm-msg-label {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.cm-msg-text {
  font-size: var(--font-md);
  font-weight: 400;
  color: var(--text);
}
/* 未读角标：红色圆形，置于「消息」文字右上角，数量 >99 显示 99+ */
.cm-badge {
  position: absolute;
  top: -8rpx;
  right: -10rpx;
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

/* 底部发帖卡片折叠态（输入框卡片）：复用 PeekSheet 玻璃面板，这里仅定义内部行布局。
   内边距 / 间距对齐全局 .peek-row（padding:0 28rpx; gap:12rpx），与「今日最热」等底部卡片一致 */
.pe-peek {
  display: flex;
  align-items: center;
  gap: 12rpx;
  height: 100%;
  padding: 0 28rpx;
}
.pe-ph {
  flex: 1;
  min-width: 0;
  height: 64rpx;
  line-height: 64rpx;
  padding: 0 28rpx;
  font-size: var(--font-md);
  color: var(--text-2);
  background: var(--card-2);
  border-radius: 999rpx;
}
.pe-body {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.cm-bar {
  /* 布局属性已提升至全局 .flex-between */
  padding: 6rpx 26rpx 10rpx;
}
.cm-bar-t {
  font-size: var(--font-sm);
  color: var(--text-2);
}
/* 筛选入口：标题 + 向下箭头，点击展开下拉菜单 */
.cm-filter {
  display: inline-flex;
  align-items: center;
  gap: 4rpx;
}
.cm-filter:active {
  opacity: 0.6;
}
.cm-filter-arrow {
  transition: transform 0.18s ease;
}
.cm-filter-arrow.is-open {
  transform: rotate(180deg);
}
/* 下拉菜单（紧贴标题栏下方）：毛玻璃卡片，点击遮罩空白处关闭 */
.cm-filter-mask {
  padding: 0 26rpx;
}
.cm-filter-menu {
  background: var(--card);
  border: 1rpx solid var(--border);
  border-radius: 18rpx;
  box-shadow: var(--shadow-2);
  overflow: hidden;
}
.cm-filter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 22rpx 26rpx;
}
.cm-filter-item:active {
  background: var(--card-2);
}
.cm-filter-item.active {
  color: var(--primary);
}
.cm-filter-item-text {
  font-size: var(--font-md);
  color: inherit;
}
.cm-loading {
  display: flex;
  justify-content: center;
  padding: 60rpx 0;
}
.cm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18rpx;
  padding: 90rpx 0;
}
/* 空态标题已统一为全局 .empty-title（见 global.css） */

.cm-pad {
  height: calc(200rpx + env(safe-area-inset-bottom));
}

/* 搜索栏：吸顶，置于话题筛选之上 */
.cm-search {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin: 10rpx 18rpx 4rpx;
  padding: 0 20rpx;
  height: 64rpx;
  background: var(--card-2);
  border: 1rpx solid var(--border);
  border-radius: 999rpx;
  box-shadow: var(--shadow-1);
}
.cm-search-input {
  flex: 1;
  height: 64rpx;
  font-size: var(--font-sm);
  color: var(--text);
  background: transparent;
}
.cm-search-ph {
  color: var(--text-2);
}
.cm-search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44rpx;
  height: 44rpx;
  border-radius: 999rpx;
}
.cm-search-clear:active {
  opacity: 0.6;
}
</style>
