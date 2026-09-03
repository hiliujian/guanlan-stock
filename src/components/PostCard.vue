<template>
  <view :class="['post', 'glass', 'anim-fade-up', preview ? 'as-preview' : '']" @click="onRootClick">
    <!-- 头部：头像 + 昵称 + 时间 + 话题 + 删除 -->
    <view class="p-head">
      <view
        class="p-avatar"
        hover-class="p-avatar-hover"
        @click.stop="onAvatarClick"
        role="button"
        :aria-label="isSelf ? '查看我的资料' : '查看用户资料'"
      >
        <UserAvatar :url="post.authorAvatarUrl || ''" :seed="post.author || post.authorUsername" :size="60" :frame="post.authorFrame" />
      </view>
      <view class="p-meta">
        <view class="p-namerow">
          <!-- 会员帖子：金色皇冠正常放在昵称右侧（垂直居中，无背景），点击进 VIP 会员页 -->
          <text :class="['p-name', 'truncate', { 'vip-name': post.authorVip }]">{{ post.author }}</text>
          <view
            v-if="post.authorVip"
            class="p-crown"
            hover-class="p-crown-hover"
            role="button"
            aria-label="查看 VIP 会员"
            @click.stop="goVip"
          >
            <OutlineIcon type="crown" :size="24" color="var(--vip-gold)" />
          </view>
        </view>
        <text class="p-time">{{ timeText }}</text>
      </view>
      <view v-if="post.topic" class="p-topic" :style="topicStyle">#{{ post.topic.name }}</view>
      <!-- 关注 / 取消关注：非本人帖子展示；点击切换并即时反映状态（plus→关注 / check→已关注）；
           预览态不展示任何交互件 -->
      <view v-if="!mine && !preview && post.userId" class="p-follow" :class="{ on: following }" hover-class="p-follow-hover" @click.stop="toggleFollow(post.userId)">
        <OutlineIcon :type="following ? 'check' : 'plus'" :size="26" :color="following ? 'var(--text-2)' : 'var(--primary)'" />
        <text class="p-follow-t">{{ following ? "已关注" : "关注" }}</text>
      </view>
      <view v-if="mine && !preview" class="p-del" @click="$emit('remove', post.id)">
        <OutlineIcon type="trash" :size="30" color="var(--text-2)" />
      </view>
    </view>

    <!-- 正文：# + 股票代码 自动解析为可点击标签（全局交互）。正文与附加卡片可共存展示 -->
    <StockText v-if="post.content" :text="post.content || ''" class="p-text" />

    <!-- 持仓卡片（支持一张帖多张持仓）：左收益率主视觉 + 右指标列，底部浮动盈亏。
         单卡与 holdings 包均由 unpackCards 归一化为数组后逐张渲染，视觉完全一致。 -->
    <view v-for="(v, i) in cardViews" :key="(v.card.code || v.card.stock) + '-' + i" class="card-s"
      @click.stop="openStock(v.card.code)">
      <view class="cs-head">
        <text class="cs-tag">持仓</text>
        <text class="cs-title">{{ v.card.stock }}</text>
        <template v-if="v.card.code">
          <text class="mkt-label">{{ marketCharFor(v.card.code) }}</text>
          <text class="cs-code">{{ v.card.code }}</text>
        </template>
        <OutlineIcon class="cs-go" type="chevron-right" :size="26" color="var(--text-3)" />
      </view>
      <view class="cs-body">
        <!-- 四列等宽：收益率 / 成本 / 现价 / 数量，每列 flex:1 均分、细线分隔 -->
        <view class="cs-cell cs-cell-rate">
          <text class="cs-k">收益率</text>
          <text class="cs-rate-v" :style="{ color: v.rateColor }">{{ v.rateText }}</text>
        </view>
        <view v-if="v.card.cost" class="cs-cell">
          <text class="cs-k">成本</text>
          <text class="cs-v">{{ fmt(v.card.cost) }}</text>
        </view>
        <view v-if="v.price" class="cs-cell">
          <text class="cs-k">现价</text>
          <text class="cs-v">{{ fmt(v.price) }}</text>
        </view>
        <view class="cs-cell">
          <text class="cs-k">数量</text>
          <text class="cs-v">{{ fmt(v.card.shares) }} 股</text>
        </view>
      </view>
      <view v-if="v.pnl != null" class="cs-foot">
        <text class="cs-k">浮动盈亏</text>
        <text class="cs-pnl" :style="{ color: (v.pnl ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }">{{ signed(v.pnl ?? 0) }} 元</text>
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
        @click="previewImage(img)"
      />
    </view>

    <!-- 操作栏：点赞 / 回复（预览态隐藏） -->
    <view v-if="!preview" class="p-actions">
      <view :class="['p-act', post.likedByMe ? 'liked' : '']" @click="$emit('like', post.id)">
        <OutlineIcon :type="post.likedByMe ? 'heart-filled' : 'heart'" :size="32" :color="post.likedByMe ? 'var(--up)' : 'var(--text-2)'" />
        <text class="p-act-t" :style="{ color: post.likedByMe ? 'var(--up)' : 'var(--text-2)' }">{{ post.likes || "" }}</text>
      </view>
      <view class="p-act" @click="toggleReply">
        <OutlineIcon type="chatbubble" :size="32" color="var(--text-2)" />
        <text class="p-act-t" :style="{ color: 'var(--text-2)' }">{{ post.replies.length || "" }}</text>
      </view>
    </view>

    <!-- 回复区（预览态隐藏） -->
    <view v-if="!preview && showReply" class="p-replies">
      <view v-for="d in displayReplies" :key="d.id" class="p-reply" @click.stop="onCommentClick(d)">
        <text :class="['pr-name', { 'vip-name': d.authorVip }]" hover-class="pr-name-hover" @click.stop="onNameClick(d)">{{ d.author }}</text>
        <template v-if="d.target">
          <text class="pr-reply-word">回复</text>
          <!-- 仅当目标用户有账号 id 时可点击跳转；旧 @前缀回复没有 userId，降级为普通文本避免「看着能点却跳不了」 -->
          <text
            v-if="d.target.userId"
            class="pr-name"
            hover-class="pr-name-hover"
            @click.stop="onReplyToClick(d.target)"
          >{{ d.target.name }}</text>
          <text v-else class="pr-reply-target">{{ d.target.name }}</text>
        </template>
        <StockText :text="d.body" class="pr-text" />
      </view>
      <!-- 输入区：引用仅与输入框融合为一张卡片（微信风格），发送按钮保持独立在外 -->
      <view class="p-reply-input" @click.stop>
        <view class="pr-input-wrap" :class="{ quoted: !!replyTo }">
          <view v-if="replyTo" class="pr-quote">
            <view class="pr-quote-main">
              <!-- 单行：回复（中性灰，复用评论列表样式）+ 昵称（主色）+ 摘要（灰、省略） -->
              <text class="pr-reply-word">回复</text>
              <text class="pr-quote-name">{{ replyTo }}</text>
              <text v-if="replyQuote" class="pr-quote-txt">{{ replyQuote }}</text>
            </view>
            <view class="pr-quote-x" role="button" aria-label="取消回复" @click.stop="clearReplyTo">
              <OutlineIcon type="close" :size="22" color="var(--text-3)" />
            </view>
          </view>
          <input class="pri-in" v-model="replyText" :placeholder="replyPlaceholder" :maxlength="200" @confirm="sendReply" />
        </view>
        <view class="pri-send" @click="sendReply">
          <OutlineIcon type="send" :size="24" color="#fff" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import StockText from "./StockText.vue";
import UserAvatar from "./UserAvatar.vue";
import { formatRelative, unpackCards, communityRepo, type CommunityPost, type HoldingCard, type Reply } from "@/api/community";
import { fetchSnapshot } from "@/api/quote";
import { topicColor } from "@/utils/avatar";
import { marketCharFor, resolveSecid } from "@/utils/period";
import { openInMarket, goTab } from "@/store/nav";
import { useFollow } from "@/store/follow";
import { useReplyExpansion } from "@/store/replyExpansion";
import { userState } from "@/store/user";

const props = defineProps<{ post: CommunityPost; mine: boolean; preview?: boolean }>();
const emit = defineEmits<{
  (e: "like", id: string): void;
  (e: "reply", id: string, content: string, replyTo?: { name: string; userId?: string | null }): void;
  (e: "remove", id: string): void;
}>();

// 关注 / 取消关注：仅对非本人帖子（且有账号 id）展示。follows 为响应式 uid 集合，
// computed 读取 follows.value 即可随服务端关注切换实时重渲染。
const { follows, toggleFollow } = useFollow();
const following = computed(() => !!props.post.userId && follows.value.has(props.post.userId));

// 是否本人帖子（按账号 id 判定）：点击头像时决定跳「个人资料」还是「公开资料」
const isSelf = computed(
  () => !!userState.loggedIn && !!props.post.userId && props.post.userId === userState.userId
);

/** 头像点击：本人→个人资料页；他人有账号 id→公开资料页；旧帖无 userId→不跳转。预览态不可点。 */
function onAvatarClick() {
  if (props.preview) return;
  const id = props.post.userId;
  if (!id) return; // 旧帖作者无账号 id，无法定位，不作跳转
  if (id === userState.userId) {
    uni.navigateTo({ url: "/pages/profile/edit" });
  } else {
    uni.navigateTo({ url: `/pages/profile/detail?uid=${encodeURIComponent(id)}` });
  }
}

/** 会员金冠点击：进 VIP 会员页（未登录由该页路由守卫拦截跳登录） */
function goVip() {
  uni.navigateTo({ url: "/pages/profile/vip" });
}

// 持仓卡片点击：跳转到该股票的行情页并切换到行情 Tab（market=auto 自动识别沪深港）。
// 与 StockTag 同一范式；预览态不响应（避免干扰编辑）。
function openStock(code?: string) {
  if (props.preview || !code) return;
  openInMarket(code, "auto");
  goTab("market");
}

// 评论区展开态改为全局互斥：仅当前帖子可展开，展开其它自动收起（需求：互斥展开）
const { isReplyOpen, openReply, closeReply } = useReplyExpansion();
const showReply = computed(() => isReplyOpen(props.post.id));
const replyText = ref("");
// 回复目标：点击某条评论后进入回复模式，占位文案变为「回复 昵称…」，
// 并在输入框上方显示引用条明确「正在回复谁」，提交时结构化写入 meta.reply_to
const replyTo = ref<string | null>(null);
const replyToUserId = ref<string | null>(null);
// 被回复评论的正文摘要（引用条展示用），避免用户看不出在回复哪条
const replyQuote = ref("");
const replyPlaceholder = computed(() =>
  replyTo.value ? "回复 " + replyTo.value + "…" : "回复 TA…"
);

/** 清空回复目标（含引用条），回到「回复 TA…」的顶层评论态 */
function clearReplyTo() {
  replyTo.value = null;
  replyToUserId.value = null;
  replyQuote.value = "";
}
// 评论区被互斥收回（切换其它帖 / 折叠）时复位，避免残留上一轮回复态
watch(showReply, (v) => {
  if (!v) clearReplyTo();
});

/**
 * 回复展示视图：把每条评论归一成 { author, target, body }。
 * - target：回复目标（「回复 X」中的 X），优先取结构化 meta.reply_to；旧回复可能仅以
 *   "@X " 前缀形式存在于 content，做兼容解析（此时无 userId，不可点击跳转）。
 * - body：剔除前缀后的纯正文（新回复入库即不带前缀）。
 */
const displayReplies = computed(() => {
  // 同帖作者昵称 → userId：用于给缺失账号 id 的旧回复补全「回复 X」的跳转能力
  const nameToId = new Map<string, string>();
  if (props.post.userId) nameToId.set(props.post.author, props.post.userId);
  for (const r of props.post.replies || []) {
    if (r.userId) nameToId.set(r.author, r.userId);
  }
  return (props.post.replies || []).map((r: Reply) => {
    let target: { name: string; userId?: string | null } | null = null;
    if (r.replyTo && r.replyTo.name) {
      target = { name: r.replyTo.name, userId: r.replyTo.userId ?? null };
    } else {
      const m = /^@(.+?)\s/.exec(r.content || "");
      if (m) target = { name: m[1], userId: null };
    }
    // 本地无 userId 时，尝试用同帖作者映射兜底（覆盖绝大多数「回复帖内用户」场景）
    if (target && !target.userId && target.name) {
      const hit = nameToId.get(target.name);
      if (hit) target.userId = hit;
    }
    const body = target
      ? (r.content || "").replace(/^@(.+?)\s/, "")
      : (r.content || "");
    return { ...r, target, body };
  });
});

/** 卡片根容器点击：仅当点击落在回复区（回复行 / 输入框 / 发送）之外时，复位回复目标，
 *  使占位文案恢复「回复 TA…」。回复区内部各交互元素均已 stop，输入框容器也 stop，不会误触发此处。 */
function onRootClick(e: any) {
  const t = e?.target as HTMLElement | null;
  if (t && typeof (t as any).closest === "function" && (t as any).closest(".p-replies")) return;
  clearReplyTo();
}

/** 点击评论中的昵称 → 跳转该用户资料页（与帖子头像同一范式：本人→编辑页，他人→公开资料）。 */
function onNameClick(r: Reply) {
  if (props.preview) return;
  const id = r.userId;
  if (!id) return; // 旧评论无账号 id，无法定位
  if (id === userState.userId) uni.navigateTo({ url: "/pages/profile/edit" });
  else uni.navigateTo({ url: `/pages/profile/detail?uid=${encodeURIComponent(id)}` });
}

/** 点击「回复 X」里的 X（被回复者昵称）→ 跳转该用户资料页。
 *  本地 userId 缺失时（旧 @前缀 回复）按昵称反查 profiles 兜底，尽量保证可跳转。 */
async function onReplyToClick(t: { name: string; userId?: string | null }) {
  if (props.preview) return;
  let id = t.userId || null;
  if (!id) id = await communityRepo.lookupUserIdByName(t.name);
  if (!id) return; // 实在无法定位（该昵称无对应账号）则不放跳转
  if (id === userState.userId) uni.navigateTo({ url: "/pages/profile/edit" });
  else uni.navigateTo({ url: `/pages/profile/detail?uid=${encodeURIComponent(id)}` });
}

/** 点击某条评论 → 打开评论区并锁定回复目标为该评论作者（支持他人继续回复任意楼层）。 */
function onCommentClick(r: Reply & { body?: string }) {
  openReply(props.post.id);
  replyTo.value = r.author;
  replyToUserId.value = r.userId ?? null;
  // 引用条展示被回复评论的正文（displayReplies 已剔除 @前缀，优先取 body）
  replyQuote.value = String(r.body ?? r.content ?? "").slice(0, 40);
}


// 话题（股票 / 板块）标签配色，便于一眼区分标的归属
const topicStyle = computed(() => {
  const t = props.post.topic;
  if (!t) return {};
  const c = topicColor(t.type);
  return { color: c.fg, background: c.bg };
});

const timeText = computed(() => formatRelative(props.post.createdAt));

// 持仓卡统一归一化：单卡（存量数据）与 holdings 包（多持仓）都还原为数组
const cards = computed<HoldingCard[]>(() => unpackCards(props.post.card));

// ---------- 持仓卡现价实时刷新 ----------
// 按「代码」维度维护实时行情：一张帖可含多张持仓，各自独立刷新；30s 轮询
// （快照接口自带 20s 缓存）。无代码旧数据或行情失败时回退发布时点值，展示不中断。
const livePrices = ref<Record<string, number>>({});
let priceTimer: any = null;
async function refreshPrices() {
  const list = cards.value.filter((x) => x.code);
  if (!list.length) return;
  await Promise.all(
    list.map(async (x) => {
      try {
        const snap = await fetchSnapshot(resolveSecid(x.code!, "auto"));
        if (snap.price) livePrices.value = { ...livePrices.value, [x.code!]: snap.price };
      } catch {
        /* 行情不可得 → 该卡回退发布时点值 */
      }
    })
  );
}
function stopPricePoll() {
  if (priceTimer) {
    clearInterval(priceTimer);
    priceTimer = null;
  }
}
function startPricePoll() {
  stopPricePoll();
  livePrices.value = {};
  if (!cards.value.some((x) => x.code)) return;
  refreshPrices();
  priceTimer = setInterval(refreshPrices, 30000);
}
watch(
  () => props.post.card,
  () => startPricePoll()
);
onMounted(startPricePoll);
onUnmounted(stopPricePoll);

/** 单张持仓的展示视图：现价（实时优先）→ 收益率 → 浮动盈亏，逐卡独立计算 */
interface HoldingView {
  card: HoldingCard;
  price: number;
  rateText: string;
  rateColor: string;
  pnl: number | null;
}
const cardViews = computed<HoldingView[]>(() =>
  cards.value.map((card) => {
    const price = (card.code && livePrices.value[card.code]) || card.price || 0;
    const rate = card.cost && price ? ((price - card.cost) / card.cost) * 100 : card.rate ?? null;
    const pnl = card.cost && price && card.shares ? (price - card.cost) * card.shares : null;
    return {
      card,
      price,
      rateText: rate == null ? "—" : (rate >= 0 ? "+" : "") + rate.toFixed(2) + "%",
      rateColor: rate == null ? "var(--text-2)" : rate >= 0 ? "var(--up)" : "var(--down)",
      pnl,
    };
  })
);

function fmt(n: number): string {
  if (n == null || isNaN(n)) return "-";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
function signed(n: number): string {
  if (n == null || isNaN(n)) return "-";
  return (n >= 0 ? "+" : "") + fmt(n);
}

function toggleReply() {
  if (isReplyOpen(props.post.id)) {
    closeReply();
    replyTo.value = null;
  } else {
    openReply(props.post.id);
  }
}
function sendReply() {
  const v = replyText.value.trim();
  if (!v) return;
  // 回复某条评论时，结构化带上回复目标（meta.reply_to）；正文保持纯净，
  // 展示端据此渲染「回复 X」并支持点击跳转，不再以 "@" 前缀拼进正文。
  const target =
    replyTo.value
      ? { name: replyTo.value, userId: replyToUserId.value }
      : null;
  emit("reply", props.post.id, v, target ?? undefined);
  replyText.value = "";
  clearReplyTo();
}

function previewImage(current: string) {
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
/* 预览态：与正式帖同卡同款，仅去掉外边距（由预览容器控制间距） */
.post.as-preview {
  margin: 0;
}
.p-head {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 14rpx;
}
/* 头像容器：可点击、指针光标 + 悬停缩放反馈，提示「点头像进资料页」 */
.p-avatar {
  flex: none;
  cursor: pointer;
  border-radius: 50%;
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.p-avatar-hover {
  opacity: 0.75;
  transform: scale(0.94);
}
.p-meta {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
/* 作者名 + 会员皇冠：皇冠正常放在昵称右侧（flex 行内跟随，垂直居中，无背景不旋转） */
.p-namerow {
  display: flex;
  align-items: center;
  gap: 6rpx;
  min-width: 0;
}
/* 昵称宽度随内容；预留皇冠宽度（24rpx 图标 + 间距）防止长昵称把它挤出，超长省略（.truncate） */
.p-name {
  flex: 0 1 auto;
  min-width: 0;
  max-width: calc(100% - 34rpx);
  font-size: var(--font-md);
  color: var(--text);
}
/* 皇冠：金色随主题明暗（--vip-gold），正常并排不参与换行；仅会员帖子作者昵称展示、可点击进 VIP 页 */
.p-crown {
  flex: none;
  display: flex;
  align-items: center;
  line-height: 1;
}
.p-crown-hover {
  opacity: 0.7;
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

/* ---------- 附加持仓卡片（市场数据票风格：纯色底 + 描边幽灵标签，
   去掉品牌绿，红/绿只留给涨跌数字，一张帖多张时也不占屏） ---------- */
.card-s {
  margin-top: 8rpx;
  padding: 16rpx 20rpx;
  border-radius: 20rpx;
  background: var(--bg-2);
  border: 1rpx solid var(--border);
  box-shadow: var(--shadow-1);
  cursor: pointer;
}
.cs-head {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 12rpx;
  min-width: 0;
}
.cs-tag {
  font-size: var(--font-xs);
  color: #fff;
  background: var(--primary);
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
  line-height: 1.5;
  flex: none;
}
.cs-title {
  font-size: var(--font-md);
  color: var(--text);
  flex: 1;
  min-width: 0;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cs-code {
  font-size: var(--font-xs);
  color: var(--text-3);
  flex: none;
}
.cs-go {
  flex: none;
  margin-left: auto;
}
/* 主体：收益率 / 成本 / 现价 / 数量 四列等宽（每列 flex:1，细线分隔），
   标签在上、数值在下（与发帖框预览区同构），纵向紧凑 */
.cs-body {
  display: flex;
}
.cs-cell {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  padding: 8rpx 4rpx;
  border-right: 1rpx solid var(--border);
}
.cs-cell:last-child {
  border-right: none;
}
.cs-cell-rate .cs-rate-v {
  font-size: var(--font-md);
  line-height: 1.1;
  letter-spacing: 1rpx;
  display: block;
  width: 100%;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cs-k {
  font-size: var(--font-xs);
  color: var(--text-3);
  flex: none;
}
.cs-v {
  font-size: var(--font-sm);
  color: var(--text);
  display: block;
  width: 100%;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cs-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  margin-top: 12rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid var(--border);
}
.cs-pnl {
  font-size: var(--font-md);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  cursor: pointer;
}
.pr-name-hover {
  opacity: 0.55;
}
.pr-reply-word {
  color: var(--text-2);
  font-size: var(--font-sm);
  margin-right: 6rpx;
}
/* 旧 @前缀回复无 userId：显示为普通文本，不做成可点链接，避免「看着能点却跳不了」 */
.pr-reply-target {
  color: var(--text-2);
  margin-right: 6rpx;
}
.pr-text {
  color: var(--text-2);
  word-break: break-word;
}
/* 输入行：融合卡片（引用 + 输入框）与圆形发送按钮并列，发送按钮不并入卡片 */
.p-reply-input {
  display: flex;
  /* 底部对齐：有引用时融合卡片变高，发送按钮应贴底，而不是垂直居中显得悬空 */
  align-items: flex-end;
  gap: 12rpx;
  margin-top: 12rpx;
}
/* 无引用：一枚药丸输入框；有引用：升级为「引用行 + 输入框」融合卡片（微信风格） */
.pr-input-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 64rpx;
  padding: 0 16rpx;
  background: var(--card-2);
  border-radius: 999rpx;
}
.pr-input-wrap.quoted {
  height: auto;
  flex-direction: column;
  align-items: stretch;
  padding: 8rpx 12rpx;
  border-radius: 20rpx;
}
/* 引用行：输入卡片内的一枚轻量圆角条（单行、微信式）。
   底色比卡片再亮一层形成层次；去掉竖条与通栏分隔线，尽量少占纵向空间 */
.pr-quote {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 8rpx 10rpx;
  margin-bottom: 8rpx;
  background: var(--card);
  border-radius: 12rpx;
}
/* 单行排布：回复 + 昵称 + 摘要同行，摘要占据剩余宽度并省略 */
.pr-quote-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8rpx;
}
/* 昵称用主色强调；「回复」二字为中性灰（复用 .pr-reply-word），避免整行看着都像可点击 */
.pr-quote-name {
  flex: none;
  font-size: var(--font-sm);
  color: var(--primary);
}
/* 被回复评论摘要：与「回复」/昵称同号（--font-sm，仅以更浅的 --text-3 区分层级），单行省略避免撑高输入区 */
.pr-quote-txt {
  flex: 1;
  min-width: 0;
  font-size: var(--font-sm);
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pr-quote-x {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44rpx;
  height: 44rpx;
}
.pr-quote-x:active {
  opacity: 0.5;
}
/* 输入框不自带背景：药丸态由 .pr-input-wrap 提供，卡片态与引用行同属一张卡片 */
.pri-in {
  flex: 1;
  height: 60rpx;
  font-size: var(--font-sm);
  color: var(--text);
  background: transparent;
}
.pri-in::placeholder {
  color: var(--text-2);
}
/* 卡片态（有引用）：输入框不再参与纵向 flex 分配——
   否则 flex:1 的 flex-basis:0 会压缩输入框高度与内距，导致变形、文字贴边 */
.pr-input-wrap.quoted .pri-in {
  flex: none;
  width: 100%;
  padding: 0 6rpx;
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
