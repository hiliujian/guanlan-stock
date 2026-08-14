<template>
  <view class="cm-root">
    <!-- 顶部：品牌 + 我的昵称 / 头像（可点击编辑），与自选共用 PageHeader -->
    <PageHeader brand-text="社区" brand-icon="chatbubble">
      <template #right>
        <view class="cm-me">
          <UserAvatar :url="myAvatarUrl" :seed="mySeed" :size="48" :frame="myFrame" />
          <text class="cm-name truncate">{{ myName }}</text>
          <view class="cm-dyn" @click="msgOpen = true">
            <OutlineIcon type="chatbubble" :size="30" color="var(--text-2)" />
            <text class="cm-dyn-t">动态</text>
            <view v-if="unreadDm > 0" class="cm-badge">{{ unreadDm > 99 ? '99+' : unreadDm }}</view>
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

    <!-- 话题筛选（按股票 / 板块分类，避免所有评论汇聚一起） -->
    <scroll-view v-if="topics.length && !searching" scroll-x class="cm-topics" :show-scrollbar="false">
      <view
        v-for="t in topics"
        :key="t.key"
        :class="['cm-chip', activeTopic === t.key ? 'on' : '']"
        :style="activeChipStyle(t)"
        @click="activeTopic = t.key"
      >{{ t.label }}</view>
    </scroll-view>

    <!-- 动态栏目标题 + 刷新 -->
    <view class="cm-bar flex-between">
      <text class="cm-bar-t">{{ searching ? ('搜索结果 · ' + displayPosts.length) : (activeTopic === 'all' ? '最新动态' : '# ' + activeLabel) }}</text>
      <view class="cm-refresh" :class="{ 'anim-spin': loading }" @click="searching ? search(searchQuery) : load">
        <OutlineIcon type="refresh" :size="30" color="var(--text-2)" />
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
      <text class="empty-title">{{ searching ? "未找到相关帖子" : (activeTopic === "all" ? "还没有动态，来发第一条吧" : "该话题下还没有动态") }}</text>
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

    <!-- 消息中心（动态：私信 / 点赞 / 评论） -->
    <MessageCenter v-model="msgOpen" />
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
import { avatarSeed, topicColor } from "@/utils/avatar";
import type { CommunityPost, PostCard as PostCardData, Topic } from "@/api/community";

const { posts, loading, searchResults, load, publishText, publishCard, like, reply, remove, search } = useCommunity();

// 消息中心（动态）：未读私信角标 + 进入消息中心加载会话
const { unreadDm, loadConversations } = useMessageCenter();
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

// ---------------- 话题筛选 ----------------
interface TopicChip {
  key: string;
  label: string;
  type?: Topic["type"];
}
const ALL = "all";
const activeTopic = ref<string>(ALL);

// 话题唯一键：个股 / 板块按「类型:名称」聚合
function topicKeyOf(p: CommunityPost): string {
  return p.topic ? `${p.topic.type}:${p.topic.name}` : "";
}
const topics = computed<TopicChip[]>(() => {
  const map = new Map<string, TopicChip>();
  for (const p of posts.value) {
    const k = topicKeyOf(p);
    if (!k || map.has(k)) continue;
    const t = p.topic!;
    map.set(k, { key: k, label: t.name, type: t.type });
  }
  return [{ key: ALL, label: "全部" }, ...map.values()];
});
const activeLabel = computed(() => topics.value.find((t) => t.key === activeTopic.value)?.label || "");

function activeChipStyle(t: TopicChip): Record<string, string> {
  if (activeTopic.value !== t.key) return {};
  if (t.type) {
    const c = topicColor(t.type);
    return { color: c.fg, background: c.bg, borderColor: "transparent" };
  }
  return { color: "#fff", background: "var(--primary)", borderColor: "transparent" };
}

const displayPosts = computed(() => {
  if (searching.value) return searchResults.value;
  if (activeTopic.value === ALL) return posts.value;
  return posts.value.filter((p) => topicKeyOf(p) === activeTopic.value);
});

// ---------------- 搜索栏逻辑（关键字 / 股票代码 / 股票名称） ----------------
const searchQuery = ref("");
const searching = computed(() => searchQuery.value.trim().length > 0);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function runSearch() {
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
  // 刷新私信未读角标（已登录才拉）
  if (userState.loggedIn) loadConversations();
});
// 登录后：空态消失，立即加载社区动态
watch(
  () => userState.loggedIn,
  (li) => {
    if (li && !posts.value.length) load();
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
/* 「我」的胶囊：自选/社区共用，与新顶部栏高度协调：头像 48rpx + 字 26rpx */
.cm-me {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 6rpx 18rpx 6rpx 6rpx;
  border-radius: 999rpx;
  background: var(--card-2);
  box-shadow: inset 0 0 0 1rpx var(--border);
}
.cm-name {
  font-size: var(--font-md);
  font-weight: 400;
  color: var(--text);
  max-width: 180rpx;
  /* 截断属性已提升至全局 .truncate */
}
/* 动态入口（原昵称设置按钮位置）：消息中心入口，带未读角标 */
.cm-dyn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  background: var(--card-2);
  box-shadow: inset 0 0 0 1rpx var(--border);
  font-size: var(--font-sm);
  color: var(--text);
}
.cm-dyn:active {
  opacity: 0.65;
}
.cm-dyn-t {
  font-size: var(--font-sm);
  color: var(--text);
}
.cm-badge {
  position: absolute;
  top: -6rpx;
  right: -6rpx;
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

/* 底部发帖卡片折叠态（输入框卡片）：复用 PeekSheet 玻璃面板，这里仅定义内部行布局 */
.pe-peek {
  display: flex;
  align-items: center;
  gap: 14rpx;
  height: 100%;
  padding: 0 22rpx;
}
.pe-ph {
  flex: 1;
  height: 56rpx;
  line-height: 56rpx;
  padding: 0 22rpx;
  font-size: var(--font-sm);
  color: var(--text-2);
  background: var(--card-2);
  border-radius: 999rpx;
}
.pe-body {
  flex: 1;
  min-height: 0;
  height: 100%;
}

/* 话题筛选 chips */
.cm-topics {
  white-space: nowrap;
  padding: 4rpx 18rpx 12rpx;
}
.cm-chip {
  display: inline-block;
  margin-right: 14rpx;
  padding: 8rpx 22rpx;
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-2);
  background: var(--card-2);
  border: 1rpx solid var(--border);
  border-radius: 999rpx;
}
.cm-chip.on {
  color: #fff;
  background: var(--primary);
}

.cm-bar {
  /* 布局属性已提升至全局 .flex-between */
  padding: 6rpx 26rpx 10rpx;
}
.cm-bar-t {
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--text-2);
}
.cm-refresh {
  padding: 8rpx;
  /* 仅做点击反馈，旋转交给 .anim-spin 持续动画，彻底避免来回摇摆 */
}
.cm-refresh:active {
  opacity: 0.6;
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
