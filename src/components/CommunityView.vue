<template>
  <view class="community">
    <!-- 顶部：品牌 + 我的昵称 / 头像（可点击编辑） -->
    <view class="cm-header">
      <text class="cm-brand">社区</text>
      <view class="cm-me" @click="editing = !editing">
        <view class="cm-avatar" :style="myAvatarStyle">{{ myAvatarText }}</view>
        <text class="cm-name">{{ myName }}</text>
        <OutlineIcon type="gear" :size="24" color="var(--text-2)" />
      </view>
    </view>

    <!-- 昵称 / 头像编辑 -->
    <view v-if="editing" class="cm-edit glass">
      <view class="cm-edit-row">
        <input class="cm-edit-in" v-model="nameDraft" placeholder="设置你的昵称" maxlength="12" />
        <view class="cm-edit-save" @click="saveName">保存</view>
      </view>
      <text class="cm-edit-lbl">选择头像（点选 emoji，留空则用昵称首字母）</text>
      <view class="cm-emoji-row">
        <view
          v-for="e in presetEmojis"
          :key="e || 'none'"
          :class="['cm-emoji', myAvatar === e ? 'on' : '']"
          @click="pickEmoji(e)"
        >{{ e || "字" }}</view>
      </view>
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
      :mine="p.author === myName"
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
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import PostComposer from "./PostComposer.vue";
import PostCard from "./PostCard.vue";
import { useCommunity } from "@/store/community";
import { getMyName, setMyName, getMyAvatar, setMyAvatar } from "@/store/identity";
import { avatarGradient, topicColor, presetEmojis } from "@/utils/avatar";
import type { CommunityPost, PostCard as PostCardData, Topic } from "@/api/community";

const { posts, loading, load, publishText, publishCard, like, reply, remove } = useCommunity();

// ---------------- 我的身份（昵称 + 头像） ----------------
const myName = ref(getMyName());
const myAvatar = ref(getMyAvatar());
const myInitial = computed(() => (myName.value || "?").slice(0, 1));
const myAvatarText = computed(() => (myAvatar.value || myInitial.value));
const myAvatarStyle = computed(() =>
  myAvatar.value
    ? { background: "var(--card-2)", fontSize: "26rpx" }
    : { background: avatarGradient(myName.value) }
);

const editing = ref(false);
const nameDraft = ref(myName.value);
function saveName() {
  const v = nameDraft.value.trim();
  if (!v) return;
  setMyName(v);
  myName.value = v;
  editing.value = false;
}
function pickEmoji(e: string) {
  myAvatar.value = e;
  setMyAvatar(e);
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
async function onText(content: string, topic?: Topic) {
  await publishText(content, topic);
}
async function onCard(card: PostCardData) {
  await publishCard(card);
}

onMounted(() => {
  if (!posts.value.length) load();
});
</script>

<style scoped>
.community {
  min-height: 100%;
}
.cm-header {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12rpx 22rpx 14rpx;
  background: var(--sticky-bg);
  backdrop-filter: blur(16rpx) saturate(140%);
  -webkit-backdrop-filter: blur(16rpx) saturate(140%);
  box-shadow: var(--sticky-shadow);
}
.cm-brand {
  font-size: 40rpx;
  font-weight: 800;
  letter-spacing: 2rpx;
  color: var(--text);
}
.cm-me {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background: var(--card-2);
}
.cm-avatar {
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  font-weight: 700;
  color: #fff;
}
.cm-name {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--text);
  max-width: 160rpx;
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
  font-size: 25rpx;
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
  font-size: 25rpx;
  font-weight: 700;
}
.cm-edit-lbl {
  display: block;
  margin: 16rpx 0 10rpx;
  font-size: 21rpx;
  color: var(--text-2);
}
.cm-emoji-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.cm-emoji {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
  border-radius: 14rpx;
  background: var(--card-2);
  border: 2rpx solid transparent;
}
.cm-emoji.on {
  border-color: var(--primary);
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
  font-size: 23rpx;
  font-weight: 600;
  color: var(--text-2);
  background: var(--card-2);
  border: 2rpx solid var(--border);
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
  font-size: 26rpx;
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
  font-size: 25rpx;
  color: var(--text-2);
}
.cm-pad {
  height: calc(140rpx + env(safe-area-inset-bottom));
}
</style>
