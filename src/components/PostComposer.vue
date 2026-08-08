<template>
  <view class="composer glass anim-fade-up">
    <!-- 类型切换：文字 / 持仓 / 操作 / 收益 -->
    <view class="cp-tabs">
      <text
        v-for="t in tabs"
        :key="t.key"
        :class="['cp-tab', mode === t.key ? 'active' : '']"
        @click="mode = t.key"
        >{{ t.label }}</text
      >
    </view>

    <!-- 文字动态 -->
    <textarea
      v-if="mode === 'text'"
      class="cp-area"
      v-model="text"
      placeholder="分享你的看法、复盘或提问…"
      maxlength="500"
      :auto-height="true"
    />

    <!-- 文字帖：关联标的（选填，用于社区按股票 / 板块分类） -->
    <view v-if="mode === 'text'" class="cp-topic">
      <text class="cp-topic-lbl">关联标的（选填）</text>
      <view class="cp-topic-sel">
        <text :class="['cp-topic-btn', topicType === 'stock' ? 'on' : '']" @click="topicType = 'stock'">个股</text>
        <text :class="['cp-topic-btn', topicType === 'sector' ? 'on' : '']" @click="topicType = 'sector'">板块</text>
      </view>
      <input class="cp-topic-in" v-model="topicName" placeholder="如 贵州茅台 / 白酒" maxlength="12" />
    </view>

    <!-- 持仓卡片 -->
    <view v-else-if="mode === 'holding'" class="cp-grid">
      <input class="cp-in" v-model="h.stock" placeholder="股票名称" maxlength="12" />
      <input class="cp-in" v-model="h.code" placeholder="代码(可选)" maxlength="10" />
      <input class="cp-in" v-model.number="h.cost" type="digit" placeholder="持仓成本价" />
      <input class="cp-in" v-model.number="h.shares" type="digit" placeholder="持仓股数" />
      <input class="cp-in" v-model.number="h.price" type="digit" placeholder="现价" />
    </view>

    <!-- 操作记录卡片 -->
    <view v-else-if="mode === 'operation'" class="cp-grid">
      <input class="cp-in" v-model="o.stock" placeholder="股票名称" maxlength="12" />
      <input class="cp-in" v-model="o.code" placeholder="代码(可选)" maxlength="10" />
      <view class="cp-side">
        <text :class="['cp-side-btn', o.side === 'buy' ? 'buy' : '']" @click="o.side = 'buy'">买入</text>
        <text :class="['cp-side-btn', o.side === 'sell' ? 'sell' : '']" @click="o.side = 'sell'">卖出</text>
      </view>
      <input class="cp-in" v-model.number="o.price" type="digit" placeholder="成交价" />
      <input class="cp-in" v-model.number="o.shares" type="digit" placeholder="成交股数" />
      <input class="cp-in cp-span2" v-model="o.note" placeholder="操作理由(可选)" maxlength="60" />
    </view>

    <!-- 收益卡片 -->
    <view v-else-if="mode === 'profit'" class="cp-grid">
      <input class="cp-in" v-model="pf.period" placeholder="周期(如 本月/今年)" maxlength="10" />
      <input class="cp-in" v-model.number="pf.totalReturn" type="digit" placeholder="总收益率%" />
      <input class="cp-in" v-model.number="pf.realized" type="digit" placeholder="已实现盈亏(元)" />
      <input class="cp-in" v-model.number="pf.unrealized" type="digit" placeholder="未实现盈亏(元)" />
      <input class="cp-in cp-span2" v-model.number="pf.winRate" type="digit" placeholder="胜率%(可选)" />
    </view>

    <!-- 配图（所有类型通用）：上传前显示本地缩略图，可删除；空时仅显示添加按钮 -->
    <view class="cp-imgs">
      <view v-for="(p, i) in imagePaths" :key="i" class="cp-thumb">
        <image class="cp-thumb-img" :src="p" mode="aspectFill" />
        <view class="cp-thumb-x" @click="removeImage(i)">
          <OutlineIcon type="close" :size="24" color="#fff" />
        </view>
      </view>
      <view v-if="imagePaths.length < MAX_IMAGES" class="cp-thumb cp-add" @click="pickImages">
        <OutlineIcon type="camera" :size="40" color="var(--text-2)" />
      </view>
    </view>

    <!-- 底部：字数 / 发布 -->
    <view class="cp-foot">
      <text class="cp-count">{{ charCount }}/500</text>
      <view :class="['cp-send', canSend ? '' : 'disabled']" @click="send">
        <OutlineIcon type="send" :size="26" :color="canSend ? '#fff' : 'rgba(255,255,255,0.6)'" />
        <text class="cp-send-t">发布</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import type { HoldingCard, OperationCard, ProfitCard, Topic } from "@/api/community";
import { useUser } from "@/store/user";
import { openAuth } from "@/store/nav";
import { uploadPostImage } from "@/api/auth";

const emit = defineEmits<{
  (e: "publish-text", content: string, topic?: Topic, images?: string[]): void;
  (e: "publish-card", card: HoldingCard | OperationCard | ProfitCard, images?: string[]): void;
}>();

type Mode = "text" | "holding" | "operation" | "profit";
const tabs: { key: Mode; label: string }[] = [
  { key: "text", label: "文字" },
  { key: "holding", label: "持仓" },
  { key: "operation", label: "操作" },
  { key: "profit", label: "收益" },
];
const mode = ref<Mode>("text");

const text = ref("");
// 文字帖关联标的（选填）：用于社区按个股 / 板块分类
const topicType = ref<"stock" | "sector">("stock");
const topicName = ref("");
const h = reactive<HoldingCard>({ kind: "holding", stock: "", cost: 0, shares: 0, price: 0 });
const o = reactive<OperationCard>({ kind: "operation", stock: "", code: "", side: "buy", price: 0, shares: 0, note: "" });
const pf = reactive<ProfitCard>({ kind: "profit", period: "", totalReturn: 0, realized: 0, unrealized: 0, winRate: undefined });

// 配图：本地临时路径（用于预览），发布时上传换取公链；所有类型通用
const imagePaths = ref<string[]>([]);
const MAX_IMAGES = 9;
function pickImages() {
  uni.chooseImage({
    count: MAX_IMAGES - imagePaths.value.length,
    sizeType: ["compressed"],
    success: (res) => {
      for (const p of res.tempFilePaths) {
        if (imagePaths.value.length >= MAX_IMAGES) break;
        imagePaths.value.push(p);
      }
    },
  });
}
function removeImage(i: number) {
  imagePaths.value.splice(i, 1);
}
// 上传全部配图；任一失败返回 null（保留用户输入，不发布）
async function uploadImages(): Promise<string[] | null> {
  if (!imagePaths.value.length) return [];
  const urls: string[] = [];
  for (const p of imagePaths.value) {
    const r = uploadPostImage(p);
    const res = await r;
    if (!res.url) {
      uni.showToast({ title: res.error || "图片上传失败", icon: "none" });
      return null;
    }
    urls.push(res.url);
  }
  return urls;
}

const charCount = computed(() => (mode.value === "text" ? text.value.length : 0));

const canSend = computed(() => {
  if (mode.value === "text") return text.value.trim().length > 0;
  if (mode.value === "holding") return !!(h.stock && h.cost && h.shares && h.price);
  if (mode.value === "operation") return !!(o.stock && o.price && o.shares);
  if (mode.value === "profit") return !!(pf.period && (pf.totalReturn || pf.realized || pf.unrealized));
  return false;
});

async function send() {
  // 后端已收紧为「仅登录用户可发帖」：未登录先引导登录，避免 RLS 报错
  if (!useUser().loggedIn) {
    uni.showToast({ title: "请先登录后再发布", icon: "none" });
    openAuth("login");
    return;
  }
  if (!canSend.value) return;
  // 先上传配图（失败则保留输入不发布）
  const uploaded = await uploadImages();
  if (uploaded === null) return;
  if (mode.value === "text") {
    const name = topicName.value.trim();
    const topic: Topic | undefined = name ? { type: topicType.value, name } : undefined;
    emit("publish-text", text.value, topic, uploaded);
    text.value = "";
    topicName.value = "";
    imagePaths.value = [];
  } else if (mode.value === "holding") {
    emit("publish-card", { ...h, code: h.code || undefined }, uploaded);
    resetHolding();
    imagePaths.value = [];
  } else if (mode.value === "operation") {
    emit("publish-card", { ...o, code: o.code || undefined, note: o.note || undefined }, uploaded);
    resetOperation();
    imagePaths.value = [];
  } else {
    emit("publish-card", { ...pf, winRate: pf.winRate || undefined }, uploaded);
    resetProfit();
    imagePaths.value = [];
  }
  // 发布后回到文字，符合"大多数动态是聊天"的使用习惯
  mode.value = "text";
}

function resetHolding() {
  h.stock = "";
  h.code = "";
  h.cost = 0;
  h.shares = 0;
  h.price = 0;
}
function resetOperation() {
  o.stock = "";
  o.code = "";
  o.side = "buy";
  o.price = 0;
  o.shares = 0;
  o.note = "";
}
function resetProfit() {
  pf.period = "";
  pf.totalReturn = 0;
  pf.realized = 0;
  pf.unrealized = 0;
  pf.winRate = undefined;
}
</script>

<style scoped>
.composer {
  /* 顶部留白对齐行情「股票卡片 → 标题」间距(14rpx)，避免评论框紧贴并顶进社区 header */
  margin: 14rpx 18rpx 14rpx;
  padding: 18rpx;
  border-radius: var(--radius);
}
.cp-tabs {
  display: flex;
  gap: 8rpx;
  background: var(--card-2);
  border-radius: 999rpx;
  padding: 6rpx;
  margin-bottom: 16rpx;
}
.cp-tab {
  flex: 1;
  text-align: center;
  font-size: var(--font-sm);
  font-weight: 600;
  padding: 12rpx 0;
  border-radius: 999rpx;
  color: var(--text-2);
  transition: background 0.18s ease, color 0.18s ease;
}
.cp-tab.active {
  background: var(--primary);
  color: #fff;
}
.cp-area {
  width: 100%;
  min-height: 120rpx;
  font-size: var(--font-md);
  line-height: 1.5;
  color: var(--text);
  background: transparent;
  padding: 4rpx 2rpx;
}
.cp-topic {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 14rpx;
  padding-top: 14rpx;
  border-top: 1rpx solid var(--border);
}
.cp-topic-lbl {
  font-size: var(--font-xs);
  color: var(--text-2);
  flex: none;
}
.cp-topic-sel {
  display: flex;
  gap: 8rpx;
  flex: none;
}
.cp-topic-btn {
  padding: 8rpx 18rpx;
  font-size: var(--font-xs);
  font-weight: 600;
  border-radius: 999rpx;
  color: var(--text-2);
  background: var(--card-2);
  border: 2rpx solid transparent;
  transition: all 0.18s ease;
}
.cp-topic-btn.on {
  color: var(--primary);
  border-color: var(--primary);
  background: rgba(7, 193, 96, 0.1);
}
.cp-topic-in {
  flex: 1;
  height: 60rpx;
  min-width: 0;
  padding: 0 18rpx;
  font-size: var(--font-sm);
  color: var(--text);
  background: var(--card-2);
  border-radius: 14rpx;
}
.cp-topic-in::placeholder {
  color: var(--text-2);
}
.cp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12rpx;
}
.cp-in {
  height: 70rpx;
  padding: 0 18rpx;
  font-size: var(--font-sm);
  color: var(--text);
  background: var(--card-2);
  border-radius: 14rpx;
}
.cp-in::placeholder {
  color: var(--text-2);
}
.cp-span2 {
  grid-column: 1 / 3;
}
.cp-side {
  display: flex;
  gap: 12rpx;
  align-items: center;
}
.cp-side-btn {
  flex: 1;
  height: 70rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-sm);
  font-weight: 600;
  border-radius: 14rpx;
  color: var(--text-2);
  background: var(--card-2);
  border: 2rpx solid transparent;
  transition: all 0.18s ease;
}
.cp-side-btn.buy {
  color: var(--up);
  border-color: var(--up);
  background: rgba(255, 91, 91, 0.1);
}
.cp-side-btn.sell {
  color: var(--down);
  border-color: var(--down);
  background: rgba(31, 216, 116, 0.1);
}
.cp-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16rpx;
}

/* 配图托盘 */
.cp-imgs {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}
.cp-thumb {
  position: relative;
  width: 150rpx;
  height: 150rpx;
  border-radius: 14rpx;
  overflow: hidden;
  background: var(--card-2);
  border: 2rpx solid var(--border);
}
.cp-thumb-img {
  width: 100%;
  height: 100%;
}
.cp-thumb-x {
  position: absolute;
  top: 4rpx;
  right: 4rpx;
  width: 40rpx;
  height: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
}
.cp-thumb-x:active {
  background: rgba(0, 0, 0, 0.7);
}
.cp-add {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx dashed var(--border);
}
.cp-count {
  font-size: var(--font-xs);
  color: var(--text-2);
}
.cp-send {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx 26rpx;
  border-radius: 999rpx;
  background: var(--primary);
  transition: transform 0.15s ease, opacity 0.2s ease;
}
.cp-send:active {
  transform: scale(0.94);
}
.cp-send.disabled {
  opacity: 0.5;
}
.cp-send-t {
  font-size: var(--font-sm);
  font-weight: 700;
  color: #fff;
}
</style>
