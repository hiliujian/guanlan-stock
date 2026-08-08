<template>
  <view class="cm-root">
    <!-- 顶部：品牌 + 我的昵称 / 头像（可点击编辑），与自选共用 PageHeader -->
    <PageHeader brand-text="社区" brand-icon="chatbubble">
      <template #right>
        <view class="cm-me" @click="toggleEdit">
          <UserAvatar :url="myAvatarUrl" :seed="mySeed" :size="48" />
          <text class="cm-name">{{ myName }}</text>
          <OutlineIcon type="gear" :size="24" color="var(--text-2)" />
        </view>
      </template>
    </PageHeader>

    <!-- 可滚动内容区 -->
    <scroll-view class="cm-scroll" scroll-y>

    <!-- 昵称编辑（未登录时本地编辑；已登录昵称同步到账号资料） -->
    <view v-if="editing" class="cm-edit glass">
      <view class="cm-edit-row">
        <input class="cm-edit-in" v-model="nameDraft" placeholder="设置你的昵称" maxlength="12" />
        <view class="cm-edit-save" @click="saveName">保存</view>
      </view>
      <text class="cm-edit-lbl">{{ userState.loggedIn ? "用户名可在「我的 → 个人资料」中修改" : "昵称仅保存在本机，换设备不互通" }}</text>
    </view>

    <!-- 发帖器 -->
    <PostComposer @publish-text="onText" @publish-card="onCard" />

    <!-- 话题筛选（按股票 / 板块分类，避免所有评论汇聚一起） -->
    <scroll-view v-if="topics.length" scroll-x class="cm-topics" :show-scrollbar="false">
      <view
        v-for="t in topics"
        :key="t.key"
        :class="['cm-chip', activeTopic === t.key ? 'on' : '']"
        :style="activeChipStyle(t)"
        @click="activeTopic = t.key"
      >{{ t.label }}</view>
    </scroll-view>

    <!-- 动态栏目标题 + 刷新 -->
    <view class="cm-bar">
      <text class="cm-bar-t">{{ activeTopic === "all" ? "最新动态" : "# " + activeLabel }}</text>
      <view class="cm-refresh" :class="{ 'anim-spin': loading }" @click="load">
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
      <text class="cm-empty-t">{{ activeTopic === "all" ? "还没有动态，来发第一条吧" : "该话题下还没有动态" }}</text>
    </view>

    <!-- 底部留白（避免被固定 tabbar 遮挡） -->
    <view class="cm-pad" />
    </scroll-view>
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
import { useCommunity } from "@/store/community";
import { usePageGuard } from "@/store/guard";
import { getMyName, setMyName } from "@/store/identity";
import { userState } from "@/store/user";
import { updateProfile } from "@/api/auth";
import { refreshProfile } from "@/store/user";
import { avatarSeed, topicColor } from "@/utils/avatar";
import type { CommunityPost, PostCard as PostCardData, Topic } from "@/api/community";

const { posts, loading, load, publishText, publishCard, like, reply, remove } = useCommunity();

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

function isMine(p: CommunityPost): boolean {
  // 已登录：按账号 id 判定（帖子创建时已写入 userId）
  if (userState.loggedIn && userState.userId) {
    return !!p.userId && p.userId === userState.userId;
  }
  // 未登录：按本地昵称判定
  return p.author === myName.value;
}

const editing = ref(false);
const nameDraft = ref("");
function toggleEdit() {
  editing.value = !editing.value;
  if (editing.value) nameDraft.value = myName.value;
}
async function saveName() {
  const v = nameDraft.value.trim();
  if (!v) return;
  if (userState.loggedIn) {
    // 已登录：昵称同步写入账号资料（与「我的 → 个人资料」同源）
    const r = await updateProfile({ username: v, display_name: v });
    if (!r.ok) {
      uni.showToast({ title: r.error || "保存失败", icon: "none" });
      return;
    }
    await refreshProfile();
  } else {
    setMyName(v);
  }
  editing.value = false;
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
  if (activeTopic.value === ALL) return posts.value;
  return posts.value.filter((p) => topicKeyOf(p) === activeTopic.value);
});

// ---------------- 发布 ----------------
async function onText(content: string, topic?: Topic, images?: string[]) {
  try {
    await publishText(content, topic, images);
  } catch (e: any) {
    uni.showToast({ title: e?.message || "发布失败，请稍后再试", icon: "none" });
  }
}
async function onCard(card: PostCardData, images?: string[]) {
  try {
    await publishCard(card, images);
  } catch (e: any) {
    uni.showToast({ title: e?.message || "发布失败，请稍后再试", icon: "none" });
  }
}

// keep-alive 每次激活：（已登录 / 公开页）加载社区动态；未授权由全局守卫跳转登录页
onActivated(() => {
  if (!posts.value.length) load();
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
.cm-header,
.cm-brand {
  /* 顶部栏外壳已迁出至 PageHeader.vue，保留空规则兼容历史选择器 */
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
  font-size: var(--font-sm);
  font-weight: 400;
  color: var(--text);
  max-width: 180rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cm-edit {
  /* 顶部与 header 保持 14rpx 间距，底部归零由评论框的 margin-top 接管，避免展开态出现双倍间距 */
  margin: 14rpx 18rpx 0;
  padding: 16rpx 18rpx;
  border-radius: var(--radius);
}
.cm-edit-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.cm-edit-in {
  flex: 1;
  height: 64rpx;
  padding: 0 18rpx;
  font-size: var(--font-sm);
  color: var(--text);
  background: var(--card-2);
  border-radius: 14rpx;
}
.cm-edit-save {
  flex: none;
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  background: var(--primary);
  color: #fff;
  font-size: var(--font-sm);
  font-weight: 700;
}
.cm-edit-lbl {
  display: block;
  margin: 16rpx 0 10rpx;
  font-size: var(--font-xs);
  color: var(--text-2);
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
  display: flex;
  align-items: center;
  justify-content: space-between;
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
.cm-empty-t {
  font-size: var(--font-sm);
  color: var(--text-2);
}

.cm-pad {
  height: calc(140rpx + env(safe-area-inset-bottom));
}
</style>
