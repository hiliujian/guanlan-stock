<template>
  <view class="composer glass anim-fade-up">
    <!-- 关联标的（选填）：用于社区按个股 / 板块分类。新设计下与正文 / 附加卡片共存 -->
    <view class="cp-topic">
      <text class="cp-topic-lbl">关联标的（选填）</text>
      <view class="cp-topic-sel">
        <text :class="['cp-topic-btn', topicType === 'stock' ? 'on' : '']" @click="topicType = 'stock'">个股</text>
        <text :class="['cp-topic-btn', topicType === 'sector' ? 'on' : '']" @click="topicType = 'sector'">板块</text>
      </view>
      <input class="cp-topic-in" v-model="topicName" placeholder="如 贵州茅台 / 白酒" maxlength="12" />
    </view>

    <view class="cp-input-wrap">
      <!-- 纯文本输入框：auto-height 自动撑高，最多 500 字 -->
      <textarea
        class="cp-area"
        :value="text"
        @input="onInput"
        @keydown="onKeydown"
        placeholder="分享你的看法、复盘或提问… 输入 # 可关联股票"
        maxlength="500"
        :auto-height="true"
      />

      <!-- # 股票联想浮层（下拉）：支持 #+代码 / #+名称，模糊匹配 + 防抖 + 键盘上下 / 回车 -->
      <view v-if="showSuggest" class="cp-suggest">
        <view v-if="!suggestions.length" class="cp-suggest-empty">无匹配股票</view>
        <view
          v-for="(s, i) in suggestions"
          :key="s.code"
          :class="['cp-suggest-item', i === activeIndex ? 'active' : '']"
          @click="choose(s)"
          @mouseenter="activeIndex = i"
        >
          <text class="cp-suggest-name">{{ s.name }}</text>
          <text class="cp-suggest-code">{{ s.code }}</text>
        </view>
      </view>

      <!-- 附加卡片预览（持仓 / 操作 / 收益）：从 + 菜单添加，作为正文帖的附件 -->
      <view v-if="attach" class="cp-attach">
        <text class="cp-attach-tag">{{ attachKindLabel }}</text>
        <text class="cp-attach-sum">{{ attachSummary }}</text>
        <view class="cp-attach-x" @click="attach = null" role="button" aria-label="移除卡片">
          <OutlineIcon type="close" :size="24" color="#fff" />
        </view>
      </view>

      <!-- 卡片编辑面板（从 + 菜单进入；与正文相互独立，可并存） -->
      <view v-if="editKind" class="cp-card-edit">
        <view class="cp-card-edit-head">
          <text class="cp-card-edit-title">{{ editKindLabel }}</text>
          <view class="cp-card-edit-close" @click="editKind = null" role="button" aria-label="关闭">
            <OutlineIcon type="close" :size="28" color="var(--text-2)" />
          </view>
        </view>
        <view v-if="editKind === 'holding'" class="cp-grid">
          <input class="cp-in" v-model="h.stock" placeholder="股票名称" maxlength="12" />
          <input class="cp-in" v-model="h.code" placeholder="代码(可选)" maxlength="10" />
          <input class="cp-in" v-model.number="h.cost" type="digit" placeholder="持仓成本价" />
          <input class="cp-in" v-model.number="h.shares" type="digit" placeholder="持仓股数" />
          <input class="cp-in cp-span2" v-model.number="h.price" type="digit" placeholder="现价" />
        </view>
        <view v-else-if="editKind === 'operation'" class="cp-grid">
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
        <view v-else class="cp-grid">
          <input class="cp-in" v-model="pf.period" placeholder="周期(如 本月/今年)" maxlength="10" />
          <input class="cp-in" v-model.number="pf.totalReturn" type="digit" placeholder="总收益率%" />
          <input class="cp-in" v-model.number="pf.realized" type="digit" placeholder="已实现盈亏(元)" />
          <input class="cp-in" v-model.number="pf.unrealized" type="digit" placeholder="未实现盈亏(元)" />
          <input class="cp-in cp-span2" v-model.number="pf.winRate" type="digit" placeholder="胜率%(可选)" />
        </view>
        <view class="cp-card-edit-actions">
          <view class="cp-card-cancel" @click="editKind = null">取消</view>
          <view class="cp-card-ok" @click="confirmCard">添加</view>
        </view>
      </view>

      <!-- 配图（与正文通用）：上传前显示本地缩略图，可删除 -->
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
    </view>

    <!-- 底部工具栏：+ 菜单 / 字数计数 / 发布 -->
    <view class="cp-foot">
      <view class="cp-plus" @click="toggleMenu" role="button" aria-label="添加附件">
        <OutlineIcon type="plus" :size="40" :color="menuOpen ? 'var(--primary)' : 'var(--text)'" />
      </view>
      <text class="cp-count">{{ charCount }}/500</text>
      <view :class="['cp-send', canSend ? '' : 'disabled']" @click="send">
        <OutlineIcon type="send" :size="26" :color="canSend ? '#fff' : 'rgba(255,255,255,0.6)'" />
        <text class="cp-send-t">发布</text>
      </view>
    </view>

    <!-- + 操作菜单：添加图片 / 持仓 / 操作 / 收益 -->
    <view v-if="menuOpen" class="cp-menu-mask" @click="menuOpen = false">
      <view class="cp-menu" @click.stop>
        <view class="cp-menu-item" @click="onAddImage">
          <OutlineIcon type="camera" :size="34" color="var(--text)" />
          <text class="cp-menu-t">添加图片</text>
        </view>
        <view class="cp-menu-item" @click="openCard('holding')">
          <OutlineIcon type="layers" :size="34" color="var(--text)" />
          <text class="cp-menu-t">持仓</text>
        </view>
        <view class="cp-menu-item" @click="openCard('operation')">
          <OutlineIcon type="refresh" :size="34" color="var(--text)" />
          <text class="cp-menu-t">操作</text>
        </view>
        <view class="cp-menu-item" @click="openCard('profit')">
          <OutlineIcon type="trophy" :size="34" color="var(--text)" />
          <text class="cp-menu-t">收益</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import type { HoldingCard, OperationCard, ProfitCard, PostCard, Topic } from "@/api/community";
import { localSuggest, searchStocks, LOCAL_STOCKS, type SearchHit } from "@/api/quote";
import { useUser } from "@/store/user";
import { openAuth } from "@/store/nav";
import { uploadPostImage } from "@/api/auth";

const emit = defineEmits<{
  (e: "publish", payload: { content?: string; card?: PostCard; topic?: Topic; images?: string[] }): void;
}>();

// 正文（单一纯文本框，不再有 Tab 切换）
const text = ref("");
// 关联标的（选填）
const topicType = ref<"stock" | "sector">("stock");
const topicName = ref("");

// 附加卡片（持仓 / 操作 / 收益）：作为正文帖的附件，三者至多一个
const attach = ref<PostCard | null>(null);
// 卡片编辑面板当前类型；null 表示未打开
const editKind = ref<"holding" | "operation" | "profit" | null>(null);
// + 操作菜单开关
const menuOpen = ref(false);

// 卡片编辑临时数据
const h = reactive<HoldingCard>({ kind: "holding", stock: "", code: "", cost: 0, shares: 0, price: 0 });
const o = reactive<OperationCard>({ kind: "operation", stock: "", code: "", side: "buy", price: 0, shares: 0, note: "" });
const pf = reactive<ProfitCard>({ kind: "profit", period: "", totalReturn: 0, realized: 0, unrealized: 0, winRate: undefined });

// ---------------- # 股票联想 ----------------
const activeQuery = ref<string | null>(null); // 当前正在输入的 #标签 查询词（null=未激活）
const suggestions = ref<SearchHit[]>([]);
const activeIndex = ref(0);
let debounceTimer: any = null;

const showSuggest = computed(() => activeQuery.value !== null);

/** 定位文本中「正在输入」的 #标签：最后一个 #，且 # 前为空白或开头、# 后无空白。 */
function detectHashTag(value: string): string | null {
  const lastHash = value.lastIndexOf("#");
  if (lastHash === -1) return null;
  const before = lastHash > 0 ? value[lastHash - 1] : " ";
  if (!/\s/.test(before)) return null; // # 紧贴前字（如 abc#def）→ 非标签
  const after = value.slice(lastHash + 1);
  if (/\s/.test(after)) return null; // 已被空白闭合
  return after;
}

function updateHash(val: string) {
  const q = detectHashTag(val);
  activeQuery.value = q;
  if (q === null) {
    suggestions.value = [];
    return;
  }
  refreshSuggest(q);
}

/** 即时本地模糊匹配 + 防抖异步搜索（东财→降级），合并去重后取前 8 条。 */
function refreshSuggest(q: string) {
  const local = q ? localSuggest(q) : LOCAL_STOCKS;
  suggestions.value = local.slice(0, 8);
  activeIndex.value = 0;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    if (!q) return;
    const remote = await searchStocks(q);
    if (remote.length) {
      const seen = new Set(remote.map((r) => r.code));
      const merged = [...remote, ...local.filter((l) => !seen.has(l.code))].slice(0, 8);
      suggestions.value = merged;
      if (activeIndex.value >= merged.length) activeIndex.value = 0;
    }
  }, 250);
}

/** 选中联想项：把正文中的「#查询词」整体替换为「#代码 」，并关闭浮层。 */
function choose(s: SearchHit) {
  if (activeQuery.value === null) return;
  const val = text.value;
  const lastHash = val.lastIndexOf("#");
  if (lastHash === -1) return;
  const q = detectHashTag(val) ?? "";
  const newVal = val.slice(0, lastHash) + "#" + s.code + " " + val.slice(lastHash + 1 + q.length);
  text.value = newVal;
  activeQuery.value = null;
  suggestions.value = [];
  activeIndex.value = 0;
}

function moveActive(dir: number) {
  if (!suggestions.value.length) return;
  let i = activeIndex.value + dir;
  if (i < 0) i = suggestions.value.length - 1;
  if (i >= suggestions.value.length) i = 0;
  activeIndex.value = i;
}

function onInput(e: any) {
  const val = e?.detail?.value ?? e?.target?.value ?? text.value;
  text.value = val;
  updateHash(val);
}

function onKeydown(e: any) {
  if (activeQuery.value === null) return;
  const key = e?.key;
  if (key === "ArrowDown") {
    if (e.preventDefault) e.preventDefault();
    moveActive(1);
  } else if (key === "ArrowUp") {
    if (e.preventDefault) e.preventDefault();
    moveActive(-1);
  } else if (key === "Enter") {
    if (suggestions.value.length && activeIndex.value < suggestions.value.length) {
      if (e.preventDefault) e.preventDefault();
      choose(suggestions.value[activeIndex.value]);
    }
  } else if (key === "Escape") {
    activeQuery.value = null;
    suggestions.value = [];
  }
}

// ---------------- 配图 ----------------
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

// ---------------- + 菜单 / 卡片编辑 ----------------
function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}
function onAddImage() {
  menuOpen.value = false;
  pickImages();
}
function openCard(kind: "holding" | "operation" | "profit") {
  if (kind === "holding") resetHolding();
  else if (kind === "operation") resetOperation();
  else resetProfit();
  editKind.value = kind;
  menuOpen.value = false;
}
function confirmCard() {
  const k = editKind.value;
  if (!k) return;
  if (k === "holding") {
    if (!(h.stock && h.cost && h.shares && h.price)) {
      uni.showToast({ title: "请填写完整持仓信息", icon: "none" });
      return;
    }
    attach.value = { ...h, code: h.code || undefined };
  } else if (k === "operation") {
    if (!(o.stock && o.price && o.shares)) {
      uni.showToast({ title: "请填写完整操作信息", icon: "none" });
      return;
    }
    attach.value = { ...o, code: o.code || undefined, note: o.note || undefined };
  } else {
    if (!(pf.period && (pf.totalReturn || pf.realized || pf.unrealized))) {
      uni.showToast({ title: "请填写完整收益信息", icon: "none" });
      return;
    }
    attach.value = { ...pf, winRate: pf.winRate || undefined };
  }
  editKind.value = null;
  menuOpen.value = false;
}

// 附加卡片展示标签 / 摘要
const attachKindLabel = computed(() => {
  const c = attach.value as any;
  if (!c) return "";
  if (c.kind === "holding") return "持仓";
  if (c.kind === "operation") return "操作";
  if (c.kind === "profit") return "收益";
  return "";
});
const attachSummary = computed(() => {
  const c = attach.value as any;
  if (!c) return "";
  if (c.kind === "holding") return `${c.stock} 成本${fmt(c.cost)} 现价${fmt(c.price)}`;
  if (c.kind === "operation") return `${c.side === "buy" ? "买入" : "卖出"} ${c.stock} @${fmt(c.price)} ${fmt(c.shares)}股`;
  if (c.kind === "profit") return `${c.period} 收益率${c.totalReturn}%`;
  return "";
});
const editKindLabel = computed(() => {
  const k = editKind.value;
  if (k === "holding") return "添加持仓卡片";
  if (k === "operation") return "添加操作卡片";
  if (k === "profit") return "添加收益卡片";
  return "";
});

const charCount = computed(() => text.value.length);
const canSend = computed(
  () => text.value.trim().length > 0 || !!attach.value || imagePaths.value.length > 0
);

async function send() {
  if (!useUser().loggedIn) {
    uni.showToast({ title: "请先登录后再发布", icon: "none" });
    openAuth("login");
    return;
  }
  if (!canSend.value) return;
  const uploaded = await uploadImages();
  if (uploaded === null) return;
  const name = topicName.value.trim();
  const topic: Topic | undefined = name ? { type: topicType.value, name } : undefined;
  emit("publish", {
    content: text.value.trim() || undefined,
    card: attach.value || undefined,
    topic,
    images: uploaded.length ? uploaded : undefined,
  });
  // 复位
  text.value = "";
  topicName.value = "";
  imagePaths.value = [];
  attach.value = null;
  editKind.value = null;
  resetHolding();
  resetOperation();
  resetProfit();
  activeQuery.value = null;
  suggestions.value = [];
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

function fmt(n: number): string {
  if (n == null || isNaN(n)) return "-";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
</script>

<style scoped>
.composer {
  /* 顶部留白对齐行情「股票卡片 → 标题」间距(14rpx)，避免评论框紧贴并顶进社区 header */
  margin: 14rpx 18rpx 14rpx;
  padding: 18rpx;
  border-radius: var(--radius);
  position: relative;
}
.cp-topic {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 14rpx;
  padding-bottom: 14rpx;
  border-bottom: 1rpx solid var(--border);
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
.cp-input-wrap {
  position: relative;
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

/* # 联想浮层 */
.cp-suggest {
  margin-top: 8rpx;
  max-height: 360rpx;
  overflow-y: auto;
  background: var(--card);
  border: 1rpx solid var(--border);
  border-radius: 16rpx;
  box-shadow: var(--shadow-pop);
}
.cp-suggest-empty {
  padding: 20rpx;
  text-align: center;
  font-size: var(--font-sm);
  color: var(--text-2);
}
.cp-suggest-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 16rpx 20rpx;
  border-bottom: 1rpx solid var(--border);
  transition: background 0.12s ease;
}
.cp-suggest-item:last-child {
  border-bottom: none;
}
.cp-suggest-item.active {
  background: var(--primary-soft);
}
.cp-suggest-name {
  font-size: var(--font-md);
  color: var(--text);
}
.cp-suggest-code {
  font-size: var(--font-xs);
  color: var(--text-2);
}

/* 附加卡片预览 */
.cp-attach {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-top: 12rpx;
  padding: 14rpx 16rpx;
  border-radius: 14rpx;
  background: var(--card-2);
  border: 1rpx solid var(--border);
  border-left: 6rpx solid var(--primary);
}
.cp-attach-tag {
  font-size: var(--font-xs);
  color: #fff;
  background: var(--primary);
  padding: 4rpx 14rpx;
  border-radius: 8rpx;
  flex: none;
}
.cp-attach-sum {
  flex: 1;
  min-width: 0;
  font-size: var(--font-sm);
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp-attach-x {
  flex: none;
  width: 40rpx;
  height: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
}

/* 卡片编辑面板 */
.cp-card-edit {
  margin-top: 12rpx;
  padding: 16rpx;
  border-radius: 16rpx;
  background: var(--card-2);
  border: 1rpx solid var(--border);
}
.cp-card-edit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14rpx;
}
.cp-card-edit-title {
  font-size: var(--font-md);
  color: var(--text);
}
.cp-card-edit-close {
  padding: 6rpx;
}
.cp-card-edit-actions {
  display: flex;
  gap: 14rpx;
  margin-top: 14rpx;
}
.cp-card-cancel,
.cp-card-ok {
  flex: 1;
  height: 72rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  font-size: var(--font-sm);
  transition: transform 0.15s ease, opacity 0.2s ease;
}
.cp-card-cancel {
  color: var(--text-2);
  background: var(--card);
  box-shadow: inset 0 0 0 1rpx var(--border);
}
.cp-card-ok {
  color: #fff;
  background: var(--primary);
}
.cp-card-ok:active {
  transform: scale(0.96);
}

/* 卡片字段网格（持仓 / 操作 / 收益共用） */
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
  background: var(--card);
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
  border-radius: 14rpx;
  color: var(--text-2);
  background: var(--card);
  border: 2rpx solid transparent;
  transition: all 0.18s ease;
}
.cp-side-btn.buy {
  color: var(--up);
  border-color: var(--up);
  background: rgba(239, 35, 42, 0.1);
}
.cp-side-btn.sell {
  color: var(--down);
  border-color: var(--down);
  background: rgba(9, 176, 122, 0.1);
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
  border: 1rpx solid var(--border);
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
  border: 1rpx dashed var(--border);
}

/* 底部工具栏 */
.cp-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16rpx;
}
.cp-plus {
  flex: none;
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--card-2);
  box-shadow: inset 0 0 0 1rpx var(--border);
  transition: transform 0.12s ease, background 0.18s ease;
}
.cp-plus:active {
  transform: scale(0.92);
}
.cp-count {
  flex: 1;
  text-align: center;
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
  color: #fff;
}

/* + 操作菜单 */
.cp-menu-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.04);
  z-index: 40;
}
.cp-menu {
  position: absolute;
  left: 18rpx;
  bottom: 96rpx;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  padding: 10rpx;
  background: var(--card);
  border: 1rpx solid var(--border);
  border-radius: 18rpx;
  box-shadow: var(--shadow-pop);
}
.cp-menu-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 18rpx 26rpx;
  border-radius: 12rpx;
  transition: background 0.12s ease;
}
.cp-menu-item:active {
  background: var(--primary-soft);
}
.cp-menu-t {
  font-size: var(--font-md);
  color: var(--text);
}
</style>
