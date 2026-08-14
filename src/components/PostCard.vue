<template>
  <view class="post glass anim-fade-up">
    <!-- 头部：头像 + 昵称 + 时间 + 话题 + 删除 -->
    <view class="p-head">
      <UserAvatar :url="post.authorAvatarUrl || ''" :seed="post.authorUsername || post.author" :size="60" :frame="post.authorFrame" />
      <view class="p-meta">
        <text class="p-name">{{ post.author }}</text>
        <text class="p-time">{{ timeText }}</text>
      </view>
      <view v-if="post.topic" class="p-topic" :style="topicStyle">#{{ post.topic.name }}</view>
      <!-- 关注 / 取消关注：非本人帖子展示；点击切换并即时反映状态（plus→关注 / check→已关注） -->
      <view v-if="!mine" class="p-follow" :class="{ on: following }" hover-class="p-follow-hover" @click.stop="toggleFollow(post.author)">
        <OutlineIcon :type="following ? 'check' : 'plus'" :size="26" :color="following ? 'var(--text-2)' : 'var(--primary)'" />
        <text class="p-follow-t">{{ following ? "已关注" : "关注" }}</text>
      </view>
      <view v-if="mine" class="p-del" @click="$emit('remove', post.id)">
        <OutlineIcon type="trash" :size="30" color="var(--text-2)" />
      </view>
    </view>

    <!-- 纯文字动态：# + 股票代码 自动解析为可点击标签（全局交互） -->
    <StockText v-if="post.type === 'text'" :text="post.content || ''" class="p-text" />

    <!-- 持仓卡片 -->
    <view v-else-if="post.card?.kind === 'holding'" class="card-s holding">
      <view class="cs-head">
        <text class="cs-tag">持仓</text>
        <text class="cs-title">{{ c.stock }}</text>
        <text class="cs-code">{{ c.code }}</text>
      </view>
      <view class="cs-grid">
        <view class="cs-cell"><text class="cs-k">持仓成本</text><text class="cs-v">{{ fmt(c.cost) }}</text></view>
        <view class="cs-cell"><text class="cs-k">持仓数量</text><text class="cs-v">{{ fmt(c.shares) }}</text></view>
        <view class="cs-cell"><text class="cs-k">现价</text><text class="cs-v">{{ fmt(c.price) }}</text></view>
      </view>
      <view class="cs-foot">
        <text class="cs-k">浮动盈亏</text>
        <text class="cs-pnl" :style="{ color: pnl >= 0 ? 'var(--up)' : 'var(--down)' }">
          {{ pnl >= 0 ? "+" : "" }}{{ fmt(pnl) }} ({{ pct >= 0 ? "+" : "" }}{{ pct.toFixed(2) }}%)
        </text>
      </view>
    </view>

    <!-- 操作记录卡片 -->
    <view v-else-if="post.card?.kind === 'operation'" class="card-s operation">
      <view class="cs-head">
        <text :class="['cs-side', c.side]">{{ c.side === "buy" ? "买入" : "卖出" }}</text>
        <text class="cs-title">{{ c.stock }}</text>
        <text class="cs-code">{{ c.code }}</text>
      </view>
      <view class="cs-grid">
        <view class="cs-cell"><text class="cs-k">成交价</text><text class="cs-v">{{ fmt(c.price) }}</text></view>
        <view class="cs-cell"><text class="cs-k">成交股数</text><text class="cs-v">{{ fmt(c.shares) }}</text></view>
      </view>
      <text v-if="c.note" class="cs-note">{{ c.note }}</text>
    </view>

    <!-- 收益卡片 -->
    <view v-else-if="post.card?.kind === 'profit'" class="card-s profit">
      <view class="cs-head">
        <text class="cs-tag">收益</text>
        <text class="cs-title">{{ c.period }}</text>
      </view>
      <view class="cs-big" :style="{ color: c.totalReturn >= 0 ? 'var(--up)' : 'var(--down)' }">
        {{ c.totalReturn >= 0 ? "+" : "" }}{{ c.totalReturn }}%
      </view>
      <view class="cs-grid">
        <view class="cs-cell"><text class="cs-k">已实现</text><text class="cs-v" :style="{ color: c.realized >= 0 ? 'var(--up)' : 'var(--down)' }">{{ signed(c.realized) }}</text></view>
        <view class="cs-cell"><text class="cs-k">未实现</text><text class="cs-v" :style="{ color: c.unrealized >= 0 ? 'var(--up)' : 'var(--down)' }">{{ signed(c.unrealized) }}</text></view>
        <view v-if="c.winRate != null" class="cs-cell"><text class="cs-k">胜率</text><text class="cs-v">{{ c.winRate }}%</text></view>
      </view>
    </view>

    <!-- 配图网格（最多 9 张，点击预览） -->
    <view v-if="post.images && post.images.length" class="p-imgs">
      <image
        v-for="(img, i) in post.images"
        :key="i"
        class="p-img"
        :class="{ single: post.images!.length === 1 }"
        :src="img"
        mode="aspectFill"
        @click="preview(img)"
      />
    </view>

    <!-- 操作栏：点赞 / 回复 -->
    <view class="p-actions">
      <view :class="['p-act', post.likedByMe ? 'liked' : '']" @click="$emit('like', post.id)">
        <OutlineIcon :type="post.likedByMe ? 'heart-filled' : 'heart'" :size="32" :color="post.likedByMe ? 'var(--up)' : 'var(--text-2)'" />
        <text class="p-act-t" :style="{ color: post.likedByMe ? 'var(--up)' : 'var(--text-2)' }">{{ post.likes || "" }}</text>
      </view>
      <view class="p-act" @click="toggleReply">
        <OutlineIcon type="chatbubble" :size="32" color="var(--text-2)" />
        <text class="p-act-t" :style="{ color: 'var(--text-2)' }">{{ post.replies.length || "" }}</text>
      </view>
    </view>

    <!-- 回复区 -->
    <view v-if="showReply" class="p-replies">
      <view v-for="r in post.replies" :key="r.id" class="p-reply">
        <text class="pr-name">{{ r.author }}</text>
        <StockText :text="r.content || ''" class="pr-text" />
      </view>
      <view class="p-reply-input">
        <input class="pri-in" v-model="replyText" placeholder="回复 TA…" :maxlength="200" @confirm="sendReply" />
        <view class="pri-send" @click="sendReply">
          <OutlineIcon type="send" :size="24" color="#fff" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import StockText from "./StockText.vue";
import UserAvatar from "./UserAvatar.vue";
import { formatRelative, type CommunityPost } from "@/api/community";
import { topicColor } from "@/utils/avatar";
import { useFollow } from "@/store/follow";

const props = defineProps<{ post: CommunityPost; mine: boolean }>();
const emit = defineEmits<{
  (e: "like", id: string): void;
  (e: "reply", id: string, content: string): void;
  (e: "remove", id: string): void;
}>();

// 关注 / 取消关注：仅对非本人帖子展示（mine 由社区页按身份判定）。
// follows 为响应式 Set，computed 读取 follows.value 即可随切换实时重渲染。
const { follows, toggleFollow } = useFollow();
const following = computed(() => follows.value.has(props.post.author));

const showReply = ref(false);
const replyText = ref("");

// 话题（股票 / 板块）标签配色，便于一眼区分标的归属
const topicStyle = computed(() => {
  const t = props.post.topic;
  if (!t) return {};
  const c = topicColor(t.type);
  return { color: c.fg, background: c.bg };
});

const timeText = computed(() => formatRelative(props.post.createdAt));
const c = computed(() => props.post.card as any);

// 持仓浮动盈亏 / 收益率
const pnl = computed(() => {
  const card = props.post.card;
  if (!card || card.kind !== "holding") return 0;
  return (card.price - card.cost) * card.shares;
});
const pct = computed(() => {
  const card = props.post.card;
  if (!card || card.kind !== "holding" || !card.cost) return 0;
  return ((card.price - card.cost) / card.cost) * 100;
});

function fmt(n: number): string {
  if (n == null || isNaN(n)) return "-";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
function signed(n: number): string {
  if (n == null || isNaN(n)) return "-";
  return (n >= 0 ? "+" : "") + fmt(n);
}

function toggleReply() {
  showReply.value = !showReply.value;
}
function sendReply() {
  const v = replyText.value.trim();
  if (!v) return;
  emit("reply", props.post.id, v);
  replyText.value = "";
}

function preview(current: string) {
  const urls = (props.post.images || []).filter(Boolean);
  if (!urls.length) return;
  uni.previewImage({ current, urls });
}
</script>

<style scoped>
.post {
  margin: 0 18rpx 14rpx;
  padding: 20rpx;
  border-radius: var(--radius);
}
.p-head {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 14rpx;
}
.p-meta {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.p-name {
  font-size: var(--font-md);
  color: var(--text);
}
.p-time {
  font-size: var(--font-xs);
  color: var(--text-2);
}
.p-del {
  flex: none;
  padding: 6rpx;
}
/* 关注 / 取消关注胶囊：非本人帖子头部右侧；未关注强调主色，已关注转中性描边 */
.p-follow {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  background: var(--primary-soft);
  transition: transform 0.12s ease, opacity 0.12s ease;
}
.p-follow.on {
  background: var(--card-2);
  box-shadow: inset 0 0 0 1rpx var(--border);
}
.p-follow-hover {
  opacity: 0.6;
}
.p-follow-t {
  font-size: var(--font-sm);
  color: var(--primary);
}
.p-follow.on .p-follow-t {
  color: var(--text-2);
}
.p-text {
  font-size: var(--font-md);
  line-height: 1.6;
  color: var(--text);
  word-break: break-word;
}

/* ---------- 特殊卡片（持仓 / 操作 / 收益） ---------- */
.card-s {
  margin-top: 6rpx;
  padding: 18rpx;
  border-radius: 18rpx;
  background: var(--card-2);
  border: 1rpx solid var(--border);
  border-left: 6rpx solid var(--primary);
}
.card-s.holding { border-left-color: var(--primary); }
.card-s.operation { border-left-color: var(--text-2); }
.card-s.profit { border-left-color: var(--up); }

.cs-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 14rpx;
}
.cs-tag {
  font-size: var(--font-xs);
  color: #fff;
  background: var(--primary);
  padding: 3rpx 12rpx;
  border-radius: 8rpx;
}
.cs-side {
  font-size: var(--font-xs);
  padding: 4rpx 14rpx;
  border-radius: 8rpx;
}
.cs-side.buy { color: var(--up); background: rgba(239, 35, 42, 0.12); }
.cs-side.sell { color: var(--down); background: rgba(9, 176, 122, 0.12); }
.cs-title {
  font-size: var(--font-md);
  color: var(--text);
}
.cs-code {
  font-size: var(--font-xs);
  color: var(--text-2);
}
.cs-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10rpx;
}
.cs-cell {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.cs-k {
  font-size: var(--font-xs);
  color: var(--text-2);
}
.cs-v {
  font-size: var(--font-sm);
  color: var(--text);
}
.cs-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid var(--border);
}
.cs-pnl {
  font-size: var(--font-md);
}
.cs-big {
  font-size: var(--font-3xl);
  line-height: 1.1;
  letter-spacing: 1rpx;
  margin: 4rpx 0 14rpx;
}
.cs-note {
  display: block;
  margin-top: 12rpx;
  font-size: var(--font-sm);
  color: var(--text-2);
  font-style: italic;
}

/* ---------- 配图网格 ---------- */
.p-imgs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10rpx;
  margin-top: 14rpx;
}
.p-img {
  width: 100%;
  height: 200rpx;
  border-radius: 12rpx;
  background: var(--card-2);
}
.p-img.single {
  height: 360rpx;
  grid-column: 1 / 2;
}

/* ---------- 操作栏 ---------- */
.p-actions {
  display: flex;
  gap: 40rpx;
  margin-top: 16rpx;
}
.p-act {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 6rpx;
  transition: transform 0.15s ease;
}
.p-act:active {
  transform: scale(0.9);
}
.p-act-t {
  font-size: var(--font-sm);
}

/* ---------- 回复区 ---------- */
.p-replies {
  margin-top: 14rpx;
  padding-top: 14rpx;
  border-top: 1rpx solid var(--border);
}
.p-reply {
  font-size: var(--font-sm);
  line-height: 1.5;
  padding: 6rpx 0;
}
.pr-name {
  color: var(--primary);
  margin-right: 10rpx;
}
.pr-text {
  color: var(--text-2);
  word-break: break-word;
}
.p-reply-input {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 12rpx;
}
.pri-in {
  flex: 1;
  height: 64rpx;
  padding: 0 18rpx;
  font-size: var(--font-sm);
  color: var(--text);
  background: var(--card-2);
  border-radius: 999rpx;
}
.pri-in::placeholder {
  color: var(--text-2);
}
.pri-send {
  width: 64rpx;
  height: 64rpx;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--primary);
  transition: transform 0.15s ease;
}
.pri-send:active {
  transform: scale(0.9);
}
</style>
