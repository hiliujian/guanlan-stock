<template>
  <view>
    <view class="composer glass anim-fade-up">
      <view class="cp-input-wrap">
      <!-- 文本框 + 联想浮层共用定位容器：浮层 absolute 锚定 # 所在行下方，不挤占下方布局 -->
      <view class="cp-area-wrap" ref="wrapRef">
        <!-- 纯文本输入框：auto-height 自动撑高，最多 500 字；areaRef 供表情面板定位光标插入 -->
        <textarea
          ref="areaRef"
          class="cp-area"
          :value="text"
          @input="onInput"
          @keydown="onKeydown"
          placeholder="分享你的看法、复盘或提问… 输入 # 可关联股票"
          maxlength="500"
          :auto-height="true"
        />

        <!-- 表情入口：悬浮输入框右上角（第一行行高区间内），点亮态高亮；
             mousedown.prevent 防止点击夺走输入框焦点丢失光标；
             表情面板常驻文档流出现在输入框与工具栏之间，不与 morph 菜单互斥占位 -->
        <view
          class="cp-emoji-btn"
          @click="toggleEmoji"
          @mousedown.prevent
          role="button"
          :aria-label="emojiOpen ? '收起表情面板' : '打开表情面板'"
        >
          <OutlineIcon type="smile" :size="ICON_SIZE" :color="emojiOpen ? 'var(--primary)' : 'var(--text-2)'" />
        </view>

        <!-- # 股票联想浮层（下拉）：锚定到 # 输入位置正下方悬浮显示 -->
        <view v-if="showSuggest" class="cp-suggest" :style="suggestStyle">
          <view v-if="!suggestions.length" class="cp-suggest-empty">无匹配股票</view>
          <view
            v-for="(s, i) in suggestions"
            :key="s.code"
            :class="['cp-suggest-item', i === activeIndex ? 'active' : '']"
            @click="choose(s)"
            @mouseenter="activeIndex = i"
          >
            <text class="cp-suggest-name">{{ s.name }}</text>
            <view class="cp-suggest-coderow">
              <text class="mkt-label">{{ marketCharFor(s.code) }}</text>
              <text class="cp-suggest-code">{{ s.code }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 已选图片预览：贴在输入框内（文本框下方），点击放大、可单删 -->
      <view v-if="imagePaths.length" class="cp-imgs">
        <view v-for="(p, i) in imagePaths" :key="p" class="cp-img-cell">
          <image class="cp-img" :src="p" mode="aspectFill" @click="previewImages(i)" />
          <view class="cp-img-x" @click.stop="removeImage(i)" role="button" aria-label="移除图片">
            <OutlineIcon type="close" :size="18" color="#fff" />
          </view>
        </view>
      </view>

      <!-- 持仓附件预览（可多张，逐张可移除）：与帖子内持仓卡片同构，收益率随实时行情更新 -->
      <view v-for="(v, i) in holdViews" :key="(v.card.code || v.card.stock) + '-' + i" class="cp-attach">
        <view class="cp-attach-row">
          <text class="cp-attach-tag">持仓</text>
          <text class="cp-attach-name">{{ v.card.stock }}</text>
          <template v-if="v.card.code">
            <text class="mkt-label">{{ marketCharFor(v.card.code) }}</text>
            <text class="cp-attach-code">{{ v.card.code }}</text>
          </template>
          <view class="cp-attach-x" @click="removeHolding(i)" role="button" aria-label="移除持仓">
            <OutlineIcon type="close" :size="20" color="var(--text-2)" />
          </view>
        </view>
        <view class="cp-attach-metrics">
          <view class="cp-attach-cell rate">
            <text class="k">收益率</text>
            <text class="v" :style="{ color: v.rateColor }">{{ v.rateText }}</text>
          </view>
          <view v-if="v.card.cost" class="cp-attach-cell"><text class="k">成本</text><text class="v">{{ fmt(v.card.cost) }}</text></view>
          <view v-if="v.price" class="cp-attach-cell"><text class="k">现价</text><text class="v">{{ fmt(v.price) }}</text></view>
          <view class="cp-attach-cell"><text class="k">数量</text><text class="v">{{ fmt(v.card.shares) }} 股</text></view>
        </view>
      </view>
    </view>

    <!-- 底部工具栏：+ 形变菜单 / 字数计数 / 发布。
         「+」按钮本体通过 width/height/border-radius 过渡平滑展开为附件列表容器（morph，
         非独立弹窗）：文档流内撑高 composer 卡片，不受 PeekSheet transform/overflow 裁剪；
         图标固定原位旋转为 ×，列表项阶梯 delay 依次渐显；再点 × / 空白处 / 外部收拢还原。
         持仓录入态（forming）：同一 morph 容器状态切换为持仓录入 UI（同玻璃底/圆角/阴影/
         动画曲线），附件菜单隐藏、字数 / 发布照旧收拢让位；「返回」恢复附件菜单，
         「确认」生成持仓卡并收拢回「+」与其同级展示。 -->
    <!-- 表情面板（类微信）：出现在输入框与工具栏之间的文档流内，点选即插入光标处；
         mousedown.prevent 防止点面板夺走输入框焦点导致光标丢失 -->
    <view v-if="emojiOpen" class="cp-emoji" @mousedown.prevent>
      <scroll-view scroll-y class="cp-emoji-scroll">
        <view class="cp-emoji-grid">
          <text v-for="em in EMOJIS" :key="em" class="cp-emoji-item" @click="insertEmoji(em)">{{ em }}</text>
        </view>
      </scroll-view>
      <view class="cp-emoji-bar">
        <text class="cp-emoji-tip">点击插入到光标处</text>
        <view class="cp-emoji-del" @click="backspaceEmoji" role="button" aria-label="删除一个字符">
          <OutlineIcon type="backspace" :size="34" color="var(--text)" />
        </view>
      </view>
    </view>

    <view :class="['cp-foot', menuOpen ? 'open' : '', editKind ? 'holding' : '']">
      <view
        ref="morphRef"
        :class="['cp-morph', menuOpen ? 'open' : '', editKind ? 'forming' : '', editKind && savedHoldings.length ? 'has-saved' : '']"
        @click="onMorphTap"
      >
        <!-- + 图标：始终占据按钮原位（56rpx 方位），展开 / 录入态旋转 135° 成为 ×，空间连续。
             开/关切换唯一入口挂在这里（与 svg 直接相邻，与旧版 .cp-plus 同层级，事件必定触发） -->
        <view class="cp-morph-icon" @click="toggleMenu" role="button" :aria-label="editKind ? '退出添加持仓' : menuOpen ? '收起菜单' : '添加附件'">
          <OutlineIcon type="plus" :size="ICON_SIZE" :color="menuOpen || editKind ? 'var(--primary)' : 'var(--text)'" />
        </view>
        <!-- 顶行提示：随状态切换「添加附件 / 添加持仓」 -->
        <text class="cp-morph-hint">{{ editKind ? "添加持仓" : "添加附件" }}</text>
        <!-- 附件菜单（持仓录入态隐藏：同一容器状态切换，非独立容器） -->
        <view v-if="!editKind" class="cp-morph-list">
          <view class="cp-morph-item" @click="onAddImage">
            <OutlineIcon type="camera" :size="ICON_SIZE" color="var(--text)" />
            <text class="cp-morph-t">添加图片</text>
          </view>
          <view class="cp-morph-item" @click="openCard">
            <OutlineIcon type="layers" :size="ICON_SIZE" color="var(--text)" />
            <!-- 一张帖可添加多张持仓：已添加数量直接体现在入口上 -->
            <text class="cp-morph-t">持仓{{ holdings.length ? " · 已添加 " + holdings.length : "" }}</text>
          </view>
        </view>
        <!-- 持仓录入 UI：与附件菜单共用 morph 容器（同玻璃底/圆角/阴影/动画机制）；
             名称/代码 · 成本价 · 持仓数量 同行三输入，收益率由现价实时计算自动展示，无需手填 -->
        <view v-else class="cp-hold">
          <!-- 一键填入：历史持仓（数据库持久化，仅保留数量>0）→ 点击即回填表单 -->
          <view v-if="savedHoldings.length" class="cp-quick">
            <text class="cp-quick-t">一键填入</text>
            <view class="cp-quick-list">
              <view v-for="s in savedHoldings" :key="s.code" class="cp-quick-chip" @click="fillSaved(s)">
                <text class="cp-quick-name">{{ s.name || s.code }}</text>
                <text class="cp-quick-num">{{ fmt(s.shares) }} 股</text>
              </view>
            </view>
          </view>
          <view class="cp-hold-row">
            <view class="cp-hold-stock">
              <input class="cp-hold-in" :value="h.stock" placeholder="名称/代码" @input="onStockInput" />
              <!-- 股票联想浮层：本地即时 + 远程防抖合并；点外部不关闭，
                   仅「选中一项 / 清空输入 / 返回退出」时收起。
                   mousedown 默认行为被阻止：点选不夺走输入框焦点，避免 blur 引发
                   浮层闪烁 / 被误销毁（click 选择逻辑照常）。 -->
              <view v-if="showStockSuggest" class="cp-stock-suggest" @mousedown.prevent>
                <view
                  v-for="(s, i) in stockHits"
                  :key="s.code"
                  :class="['cp-stock-item', i === stockActive ? 'active' : '']"
                  @click="applyStock(s)"
                  @mouseenter="stockActive = i"
                >
                  <text class="cp-stock-name">{{ s.name }}</text>
                  <view class="cp-stock-coderow">
                    <text class="mkt-label">{{ marketCharFor(s.code) }}</text>
                    <text class="cp-stock-code">{{ s.code }}</text>
                  </view>
                </view>
              </view>
            </view>
            <input class="cp-hold-in cp-hold-num" v-model.number="h.cost" type="digit" placeholder="成本价" />
            <input class="cp-hold-in cp-hold-num" v-model.number="h.shares" type="number" placeholder="持仓数量" />
          </view>

          <!-- 现价 + 收益率：选股后自动拉行情，收益率随成本输入实时计算 -->
          <view class="cp-hold-live">
            <template v-if="h.code">
              <text>现价 {{ holdPrice ? fmt(holdPrice) : "…" }}</text>
              <text v-if="holdRateText" :style="{ color: (holdRate ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }">收益率 {{ holdRateText }}</text>
            </template>
            <text v-else>关联股票后自动计算收益率</text>
          </view>

          <view class="cp-card-edit-actions">
            <view class="cp-card-cancel" @click="exitHolding(true)">返回</view>
            <view class="cp-card-ok" @click="confirmCard">确认</view>
          </view>
        </view>
      </view>
      <text class="cp-count">{{ charCount }}/500</text>
      <view :class="['cp-send', canSend && !sending ? '' : 'disabled']" @click="send">
        <OutlineIcon type="send" :size="ICON_SIZE_FILLED" :color="canSend && !sending ? '#fff' : 'rgba(255,255,255,0.6)'" />
        <text class="cp-send-t">发布</text>
      </view>
    </view>
    </view>

    <!-- 发帖框下方：帖子预览（实时同步，复用正式 PostCard 渲染 —— 所见即发布所得；
         文本 / 配图 / 持仓卡含实时行情收益率，与发布后信息流完全同构） -->
    <view class="cp-preview">
      <view class="cp-preview-head">
        <text class="cp-preview-t">帖子预览</text>
      </view>
      <PostCardView v-if="hasPreview" :post="previewPost" mine preview />
      <view v-else class="cp-preview-empty">发布效果将在这里实时呈现</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, onMounted, onUnmounted, watch } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import PostCardView from "./PostCard.vue";
import { packCard, type CommunityPost, type HoldingCard, type PostCard } from "@/api/community";
import { listMyHoldings, saveHolding, dropHolding, type SavedHolding } from "@/api/holdings";
import { localSuggest, searchStocks, fetchSnapshot, LOCAL_STOCKS, type SearchHit } from "@/api/quote";
import { marketCharFor, resolveSecid } from "@/utils/period";
import { useUser, userState } from "@/store/user";
import { vipActive } from "@/store/level";
import { getMyName } from "@/store/identity";
import { openAuth } from "@/store/nav";
import { uploadPostImage } from "@/api/auth";

// 工具栏图标尺寸：线型图标视觉占比约 70%，统一放大到能与 --font-md(28rpx) 文字视觉匹配，避免看着偏小。
// 线宽不在此覆写：全项目 143 处图标统一走 OutlineIcon 默认的 stroke-width(2)，保持一致。
const ICON_SIZE = 36;
// send 图形几乎占满 24×24 画框（约 83%），而 smile/plus/camera/layers 仅约 75%，
// 同尺寸下视觉会大一号，故按占比缩到 32 使其与其他图标视觉等大。
const ICON_SIZE_FILLED = 32;

const emit = defineEmits<{
  (e: "publish", payload: { content?: string; card?: PostCard; images?: string[] }): void;
}>();

// 正文（单一纯文本框，不再有 Tab 切换）
const text = ref("");

// 附加持仓：一条帖可携带多张（逐张独立展示现价 / 收益率，可单独移除）。
// 提交时由 packCard() 打包：1 张→单卡原结构（兼容存量），多张→holdings 包。
const holdings = ref<HoldingCard[]>([]);
// 卡片编辑面板是否打开（仅持仓一种）
const editKind = ref<"holding" | null>(null);
// + 操作菜单开关
const menuOpen = ref(false);

// 卡片编辑临时数据：收益率不手填，由现价与成本实时计算（holdPrice）。
// price 为 HoldingCard 必填字段（发布时点现价），表单值以 confirmCard 时的 holdPrice 为准
const h = reactive<HoldingCard>({ kind: "holding", stock: "", code: "", cost: 0, shares: 0, price: 0 });
// 表单内选股后拉到的现价（收益率 = (现价 - 成本) / 成本）
const holdPrice = ref(0);

// ---------------- 一键填入：历史持仓（user_holdings，数据库持久化） ----------------
const savedHoldings = ref<SavedHolding[]>([]);
async function refreshSavedHoldings() {
  savedHoldings.value = await listMyHoldings();
}
// 组件挂载 / 登录态变化时拉取；失败静默降级（列表为空即不展示一键填入）。
// 登出时同样刷新（listMyHoldings 未登录返回空），避免残留上一账号的持仓芯片。
onMounted(() => {
  if (userState.loggedIn) refreshSavedHoldings();
});
watch(
  () => userState.loggedIn,
  () => refreshSavedHoldings()
);

/** 点击历史持仓芯片 → 回填名称 / 代码 / 成本价 / 数量，并拉现价算收益率 */
function fillSaved(s: SavedHolding) {
  h.stock = s.name || s.code;
  h.code = s.code;
  h.cost = s.cost;
  h.shares = s.shares;
  stockHits.value = [];
  holdPrice.value = 0;
  refreshHoldPrice(s.code);
}

/** 本地持仓簿同步：确认后 upsert；移除时删行（数量为 0 由 saveHolding 内部转删除）。
 *  失败静默降级（withTimeout 可能 reject）：持仓簿只是一键填入缓存，不阻塞发帖主流程。 */
async function persistHolding(card: HoldingCard) {
  try {
    await saveHolding({ code: card.code!, name: card.stock, cost: card.cost, shares: card.shares });
    await refreshSavedHoldings();
  } catch {
    /* 写持仓簿失败不提示，不打断发帖 */
  }
}
async function dropSavedHolding(code?: string) {
  if (!code) return;
  try {
    await dropHolding(code);
    await refreshSavedHoldings();
  } catch {
    /* 删行失败同样静默 */
  }
}

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

// 联想浮层定位容器（文本框 wrapper），用于测量 # 的纵向像素坐标
const wrapRef = ref<any>(null);
// 浮层锚定坐标（px，相对 wrapper）；null 时回退到 CSS 的 top:100%（文本框底部）。
// left/right 由 .cp-suggest 的 CSS 提供（0 撑满），内联只补 top。
const suggestPos = ref<{ top: number; left: number } | null>(null);
const suggestStyle = computed(() => {
  if (suggestPos.value) {
    return { top: suggestPos.value.top + "px" };
  }
  return {};
});

/**
 * 用镜像 div 复刻 textarea 排版，测量 # 字符所在行的纵向坐标，
 * 使联想浮层锚定在「# 输入位置」正下方，而非文本框整体底部。
 * 非 H5 环境或测量失败时回退到 CSS 默认（top:100%）。
 */
function caretCoordinates(ta: HTMLTextAreaElement, position: number, textVal: string, wrap: HTMLElement) {
  const div = document.createElement("div");
  const dstyle = div.style as any;
  const cs = window.getComputedStyle(ta);
  const props = [
    "boxSizing", "width", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize", "fontFamily",
    "letterSpacing", "textTransform", "wordSpacing", "textIndent",
  ];
  for (const p of props) dstyle[p] = (cs as any)[p];
  dstyle.position = "absolute";
  dstyle.visibility = "hidden";
  dstyle.whiteSpace = "pre-wrap";
  dstyle.wordWrap = "break-word";
  dstyle.top = "0px";
  dstyle.left = "0px";
  div.textContent = textVal.substring(0, position);
  const span = document.createElement("span");
  span.textContent = textVal.substring(position) || ".";
  div.appendChild(span);
  wrap.appendChild(div);
  const top = span.offsetTop; // 相对 wrapper（position:relative），div 在 wrapper 内且 top/left=0
  const height = parseInt(cs.lineHeight) || span.offsetHeight;
  wrap.removeChild(div);
  return { top, height };
}

function positionSuggest() {
  const val = text.value;
  const lastHash = val.lastIndexOf("#");
  if (lastHash === -1) return;
  const wrapEl = (wrapRef.value as any)?.$el as HTMLElement | undefined;
  if (!wrapEl) return;
  const taEl = wrapEl.querySelector("textarea") as HTMLTextAreaElement | null;
  if (!taEl) return;
  try {
    const c = caretCoordinates(taEl, lastHash, val, wrapEl);
    suggestPos.value = { top: c.top + c.height + 4, left: 0 };
  } catch {
    suggestPos.value = null; // 回退到 CSS 默认（top:100%）
  }
}

function updateHash(val: string) {
  const q = detectHashTag(val);
  activeQuery.value = q;
  if (q === null) {
    suggestions.value = [];
    suggestPos.value = null;
    return;
  }
  positionSuggest();
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
    // 竞态防护：响应期间查询词已变 / 浮层已关闭 → 丢弃本次结果，避免旧结果覆盖新输入
    if (activeQuery.value !== q) return;
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
  suggestPos.value = null;
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
    suggestPos.value = null;
  }
}

// ---------------- 表情面板（类微信：点选插入光标处） ----------------
const areaRef = ref<any>(null);
const emojiOpen = ref(false);
// 常用表情精选（表情 / 手势 / 炒股常用符号），8 列网格滚动展示
const EMOJIS: string[] = [
  "😀","😄","😆","😂","🤣","😊","😇","🙂",
  "😉","😍","🥰","😋","😜","🤪","😎","🥳",
  "😏","🥺","😢","😭","😤","😠","😡","🤯",
  "😳","😔","😞","🥱","😴","🤤","🤔","🫡",
  "🤗","🫢","🤫","🤐","😐","😶","😷","🤒",
  "🤕","🥴","😵","🥵","🥶","😱","👀","🙏",
  "👍","👎","👌","✌️","🤞","🤘","🤙","👏",
  "🙌","🫶","🤝","💪","🫰","✍️","🤳","🤲",
  "❤️","💔","💕","💖","💯","🔥","✨","⭐",
  "🎉","🎊","🎁","🧧","📈","📉","💰","🤑",
];

/** uni-h5 的 <textarea> ref 是组件实例，需解析为原生元素才能读/设光标（同 canvas 解析套路） */
function nativeArea(): HTMLTextAreaElement | null {
  const r = areaRef.value as any;
  if (!r) return null;
  if (r instanceof HTMLTextAreaElement) return r;
  const el = r?.$el as HTMLElement | undefined;
  return el?.querySelector("textarea") ?? null;
}

function toggleEmoji() {
  emojiOpen.value = !emojiOpen.value;
  // 打开表情面板时收起附件菜单，避免两个面板同屏挤占空间
  if (emojiOpen.value && menuOpen.value) closeMenu();
}

/** 点选表情：插入到当前光标处并让光标落在表情之后（同步 # 联想解析） */
function insertEmoji(em: string) {
  const ta = nativeArea();
  const pos = ta ? (ta.selectionStart ?? text.value.length) : text.value.length;
  const next = text.value.slice(0, pos) + em + text.value.slice(pos);
  if (next.length > 500) {
    uni.showToast({ title: "最多 500 字", icon: "none" });
    return;
  }
  text.value = next;
  updateHash(next);
  nextTick(() => {
    const t = nativeArea();
    if (t) {
      t.focus();
      const p = pos + em.length;
      t.setSelectionRange(p, p);
    }
  });
}

/** 表情面板退格：按 Unicode 码点（而非 UTF-16 单元）删除光标前一个字符，emoji 不被截半 */
function backspaceEmoji() {
  if (!text.value.length) return;
  const ta = nativeArea();
  const pos = ta ? (ta.selectionStart ?? text.value.length) : text.value.length;
  if (pos === 0) return;
  const before = Array.from(text.value.slice(0, pos));
  before.pop();
  const head = before.join("");
  const next = head + text.value.slice(pos);
  text.value = next;
  updateHash(next);
  nextTick(() => {
    const t = nativeArea();
    if (t) {
      t.focus();
      t.setSelectionRange(head.length, head.length);
    }
  });
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
function previewImages(i: number) {
  uni.previewImage({ current: imagePaths.value[i], urls: imagePaths.value });
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

// ---------------- 持仓表单：股票检索 / 完整代码自动解析 ----------------
const stockHits = ref<SearchHit[]>([]);
const stockActive = ref(0);
const showStockSuggest = computed(() => stockHits.value.length > 0);
let stockDebounce: any = null;

/** 从输入中提取纯数字代码主体（去掉 sh/sz/bj/hk 前缀与 .SH/.SZ/.BJ/.HK 后缀） */
function codeDigits(raw: string): string {
  return (raw || "")
    .trim()
    .toUpperCase()
    .replace(/^(SH|SZ|BJ|HK)/, "")
    .replace(/\.(SH|SZ|BJ|HK)$/, "")
    .replace(/[^0-9]/g, "");
}

/**
 * 完整代码本地解析：仅当输入「像完整代码」（主体 6 位 A 股 / 5 位港股，可带市场前后缀）
 * 且本地股票池精确命中时返回结果；解析失败返回 null，调用方不作处理（不提示、不清输入）。
 */
function parseFullCodeLocal(raw: string): SearchHit | null {
  const s = (raw || "").trim().toUpperCase();
  if (!/^((SH|SZ|BJ|HK))?\d{5,6}(\.(SH|SZ|BJ|HK))?$/.test(s)) return null;
  const digits = codeDigits(s);
  return LOCAL_STOCKS.find((x) => x.code === digits) || null;
}

/** 回填解析 / 选中结果：名称进输入框，代码入表单关联，并拉现价供收益率实时计算 */
function applyStock(s: SearchHit) {
  h.stock = s.name;
  h.code = s.code;
  stockHits.value = [];
  refreshHoldPrice(s.code);
}

/** 选股后拉取现价（收益率实时计算的基准）；失败置 0，界面按「…」降级。
 *  竞态防护：响应期间已切换 / 清除关联股票（h.code 变化）则丢弃，避免旧股现价覆盖新股。 */
async function refreshHoldPrice(code: string) {
  holdPrice.value = 0;
  try {
    const snap = await fetchSnapshot(resolveSecid(code, "auto"));
    if (h.code === code) holdPrice.value = snap.price || 0;
  } catch {
    /* 行情不可得 → 收益率暂不可算 */
  }
}

function onStockInput(e: any) {
  const val = String(e?.detail?.value ?? e?.target?.value ?? "");
  h.stock = val;
  if (stockDebounce) clearTimeout(stockDebounce);
  // 手输改动先解除已关联代码，重新解析 / 选中后再回填
  h.code = "";
  holdPrice.value = 0;
  const v = val.trim();
  if (!v) {
    stockHits.value = [];
    return;
  }
  // 完整代码 → 本地立即解析；本地未命中不拦截，继续走联想（远程精确命中再回填）
  const localParsed = parseFullCodeLocal(v);
  if (localParsed) {
    applyStock(localParsed);
    return;
  }
  const local = localSuggest(v);
  stockHits.value = local.slice(0, 8);
  stockActive.value = 0;
  stockDebounce = setTimeout(async () => {
    const remote = await searchStocks(v);
    // 竞态防护：响应期间输入已变 / 清空 / 退出录入 → 丢弃本次结果
    if (h.stock.trim() !== v) return;
    if (!remote.length) return;
    const digits = codeDigits(v);
    const exact = digits ? remote.find((r) => r.code === digits) : null;
    if (exact) {
      applyStock(exact);
      return;
    }
    const seen = new Set(remote.map((r) => r.code));
    stockHits.value = [...remote, ...local.filter((l) => !seen.has(l.code))].slice(0, 8);
    if (stockActive.value >= stockHits.value.length) stockActive.value = 0;
  }, 250);
}

// ---------------- + 形变菜单 / 卡片编辑 ----------------
// 点击形变菜单以外区域自动收拢（无遮罩）：document 捕获阶段监听，落点不在 .cp-morph 内则关闭
let outsideHandler: ((e: Event) => void) | null = null;
function addOutside() {
  if (outsideHandler || typeof document === "undefined") return;
  outsideHandler = (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (!t || (t.closest && t.closest(".cp-morph"))) return;
    closeMenu();
  };
  document.addEventListener("pointerdown", outsideHandler, true);
}
function removeOutside() {
  if (outsideHandler) {
    document.removeEventListener("pointerdown", outsideHandler, true);
    outsideHandler = null;
  }
}

/** 统一收拢入口：关菜单 + 移除全局监听（收拢动画由 CSS 过渡自动反向播放） */
function closeMenu() {
  menuOpen.value = false;
  removeOutside();
}
/**
 * 抑制窗口（ms 时间戳）：同一次点击先触发图标/列表项 handler（浅层，必达），
 * 再冒泡到容器 handler 时不允许反向操作（开→瞬间关 / 关→瞬间重开），
 * 规避 uni-app H5 下嵌套 uni-view 事件冒泡/target 语义不确定的问题。
 */
let suppressUntil = 0;
// 形变容器元素引用（展开后用于滚入可视区）
const morphRef = ref<any>(null);

/** 展开后把面板滚入可视区：卡片在 PeekSheet 滚动区内，避免展开部分落在可视区外看着像「没反应」 */
function scrollMorphIntoView() {
  try {
    const el = (morphRef.value as any)?.$el as HTMLElement | undefined;
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  } catch {
    /* 非 H5 / 不支持时忽略 */
  }
}
/** 「+ / ×」切换入口（挂在 .cp-morph-icon 上，与图标 svg 直接相邻，事件可靠触发） */
function toggleMenu() {
  suppressUntil = Date.now() + 400;
  // 持仓录入态点 ×：取消录入并收拢回「+」
  if (editKind.value) {
    exitHolding(false);
    return;
  }
  if (menuOpen.value) {
    closeMenu();
    return;
  }
  menuOpen.value = true;
  emojiOpen.value = false; // 打开附件菜单时收起表情面板（两个面板互斥）
  addOutside();
  nextTick(scrollMorphIntoView);
}
/** 展开态点容器空白处收拢（列表项 / × 已由各自 handler 处理并被抑制窗口跳过）。
 *  持仓录入态不收拢：退出仅经「返回 / 确认 / ×」显式操作。 */
function onMorphTap() {
  if (Date.now() < suppressUntil) return;
  if (editKind.value) return;
  if (menuOpen.value) closeMenu();
}
onUnmounted(removeOutside);
function onAddImage() {
  suppressUntil = Date.now() + 400;
  closeMenu();
  pickImages();
}
/** 从附件菜单进入持仓录入：同一 morph 容器状态切换为录入 UI（不新增独立容器） */
function openCard() {
  resetHolding();
  stockHits.value = [];
  editKind.value = "holding";
  // 菜单列表让位给录入 UI（morph 保持展开 → forming），并解除外部点击收拢
  menuOpen.value = false;
  removeOutside();
  suppressUntil = Date.now() + 400;
  nextTick(scrollMorphIntoView);
}
/**
 * 退出持仓录入：backToMenu=true 恢复「添加附件」菜单（返回 / 确认后继续添加）；
 * false 收拢回「+」（点 × 取消）。
 * 抑制窗口同样生效：否则本次点击冒泡到容器 handler 会把刚恢复的菜单立刻收拢
 * （表现为「点了返回却直接收起」）。
 */
function exitHolding(backToMenu: boolean) {
  suppressUntil = Date.now() + 400;
  editKind.value = null;
  resetHolding();
  stockHits.value = [];
  if (backToMenu) {
    menuOpen.value = true;
    addOutside();
    nextTick(scrollMorphIntoView);
  } else {
    closeMenu();
  }
}
/** 移除单张持仓（其余保留）；同时从数据库持仓簿删除该条，保证数据与用户当前持仓一致 */
function removeHolding(i: number) {
  const c = holdings.value[i];
  holdings.value.splice(i, 1);
  if (c?.code) dropSavedHolding(c.code);
}
/**
 * 确认持仓：校验股票 / 成本价 / 数量 → 追加到持仓列表（同一代码视为修改该张），
 * 随后回到「添加附件」菜单，可继续添加下一张持仓或图片。
 * 收益率不入库为手填值：由现价与成本实时计算（PostCard 与预览同源）。
 */
async function confirmCard() {
  if (!h.code) {
    uni.showToast({ title: "请先从联想中选择股票", icon: "none" });
    return;
  }
  if (!h.cost) {
    uni.showToast({ title: "请填写成本价", icon: "none" });
    return;
  }
  if (!h.shares) {
    uni.showToast({ title: "请填写持仓数量", icon: "none" });
    return;
  }
  const card: HoldingCard = {
    kind: "holding",
    stock: h.stock.trim() || h.code!,
    code: h.code,
    cost: Number(h.cost) || 0,
    shares: Number(h.shares) || 0,
    price: holdPrice.value || 0,
    rate: holdRate.value == null ? undefined : Number(holdRate.value.toFixed(2)),
  };
  const idx = card.code ? holdings.value.findIndex((x) => x.code === card.code) : -1;
  if (idx >= 0) holdings.value.splice(idx, 1, card);
  else holdings.value = [...holdings.value, card];
  // 持久化到持仓簿（一键填入数据源）；失败不阻塞发帖
  persistHolding(card);
  // 回到「添加附件」：支持连续添加多张持仓
  exitHolding(true);
  // 立即刷新现价 → 收益率由实时价算出（失败不阻塞，price 保持录入时点值）
  await refreshHoldPrices();
}

// 表单内收益率：现价 + 已输成本 → 实时计算（成本未输时不显示）
const holdRate = computed<number | null>(() => {
  if (!holdPrice.value || !h.cost) return null;
  return ((holdPrice.value - h.cost) / h.cost) * 100;
});
const holdRateText = computed(() =>
  holdRate.value == null ? "" : (holdRate.value >= 0 ? "+" : "") + holdRate.value.toFixed(2) + "%"
);

// 附件持仓卡现价轮询：按「代码」维度刷新（可多张持仓），30s 一轮，
// 收益率由现价与成本实时重算；行情缺失时回退发布时点快照值。
const holdPrices = ref<Record<string, number>>({});
let holdTimer: any = null;
function stopHoldPoll() {
  if (holdTimer) {
    clearInterval(holdTimer);
    holdTimer = null;
  }
}
async function refreshHoldPrices() {
  const list = holdings.value.filter((x) => x.code);
  if (!list.length) return;
  await Promise.all(
    list.map(async (x) => {
      try {
        const snap = await fetchSnapshot(resolveSecid(x.code!, "auto"));
        if (snap.price) holdPrices.value = { ...holdPrices.value, [x.code!]: snap.price };
      } catch {
        /* 行情不可得 → 该张回退录入时点价 */
      }
    })
  );
}
function startHoldPoll() {
  stopHoldPoll();
  if (!holdings.value.some((x) => x.code)) return;
  refreshHoldPrices();
  holdTimer = setInterval(refreshHoldPrices, 30000);
}
// 依据持仓代码集合增删决定轮询起停（价格变化不触发重启，避免抖动）
watch(
  () => holdings.value.map((x) => x.code || "").join(","),
  (keys) => (keys ? startHoldPoll() : stopHoldPoll())
);
onUnmounted(stopHoldPoll);

/** 附件持仓展示视图：现价（实时优先）→ 收益率（实时口径，与发布后一致） */
const holdViews = computed(() =>
  holdings.value.map((card) => {
    const price = (card.code && holdPrices.value[card.code]) || card.price || 0;
    const rate = card.cost && price ? ((price - card.cost) / card.cost) * 100 : card.rate ?? null;
    return {
      card,
      price,
      rateText: rate == null ? "—" : (rate >= 0 ? "+" : "") + rate.toFixed(2) + "%",
      rateColor: rate == null ? "var(--text-2)" : rate >= 0 ? "var(--up)" : "var(--down)",
    };
  })
);

// ---------------- 帖子预览（发帖框下方，实时所见即所得） ----------------
// 复用正式 PostCard 渲染（preview 模式隐藏交互件）：文本 / 配图 / 持仓卡与发布后信息流
// 完全同构；持仓卡现价 / 收益率由 PostCard 自身行情轮询驱动，预览即最终效果。
// 提交 / 预览共用同一打包结果：预览所见即发布所得
const packedCard = computed(() => packCard(holdings.value));
const hasPreview = computed(
  () => !!(text.value.trim() || imagePaths.value.length || holdings.value.length)
);
const previewPost = computed<CommunityPost>(() => ({
  id: "__preview__",
  type: packedCard.value ? "card" : "text",
  author: getMyName(),
  userId: userState.userId || null,
  authorAvatarUrl: userState.profile?.avatar_url || "",
  authorFrame: userState.profile?.avatar_frame || "",
  authorUsername: userState.profile?.username || "",
  authorVip: vipActive(userState.profile?.vip, userState.profile?.vip_expires_at),
  createdAt: Date.now(),
  content: text.value.trim() || undefined,
  card: packedCard.value,
  images: imagePaths.value.length ? [...imagePaths.value] : undefined,
  likes: 0,
  likedByMe: false,
  replies: [],
}));

const charCount = computed(() => text.value.length);
const canSend = computed(
  () => text.value.trim().length > 0 || holdings.value.length > 0 || imagePaths.value.length > 0
);
// 发布进行中标记：防双击重复提交（图片上传为异步，期间 canSend 仍为真）
const sending = ref(false);

async function send() {
  if (sending.value) return;
  if (!useUser().loggedIn) {
    uni.showToast({ title: "请先登录后再发布", icon: "none" });
    openAuth("login");
    return;
  }
  if (!canSend.value) return;
  sending.value = true;
  try {
    const uploaded = await uploadImages();
    if (uploaded === null) return;
    emit("publish", {
      content: text.value.trim() || undefined,
      card: packedCard.value,
      images: uploaded.length ? uploaded : undefined,
    });
    // 复位（含表情面板：发布完成回到干净输入态）
    text.value = "";
    imagePaths.value = [];
    holdings.value = [];
    holdPrices.value = {};
    editKind.value = null;
    emojiOpen.value = false;
    resetHolding();
    stockHits.value = [];
    activeQuery.value = null;
    suggestions.value = [];
    clearDraft(); // 发布成功即清除草稿，避免下次进入误恢复
  } finally {
    sending.value = false;
  }
}

function resetHolding() {
  h.stock = "";
  h.code = "";
  h.cost = 0;
  h.shares = 0;
  h.price = 0;
  holdPrice.value = 0;
}

// ---------------- 草稿本地持久化（防手滑滑走 / 刷新 / 切后台丢失） ----------------
// 仅持久化正文 + 持仓：图片为 uni 临时路径，刷新后失效，不入库草稿。
// key 含 userId：避免同设备多账号串稿；游客以 guest 占位键区分。
const DRAFT_BASE = "gl_composer_draft";
function draftKey(): string {
  return DRAFT_BASE + "_" + (userState.userId || "guest");
}
interface ComposerDraft {
  text: string;
  holdings: HoldingCard[];
}
let draftTimer: any = null;
function clearDraft() {
  try {
    uni.removeStorageSync(draftKey());
  } catch {
    /* 忽略：无键或存储不可用 */
  }
}
function saveDraft() {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    // 正文与持仓皆空 → 视为无草稿，清掉残留键（如刚发布完触发）
    if (!text.value.trim() && !holdings.value.length) {
      clearDraft();
      return;
    }
    try {
      const d: ComposerDraft = { text: text.value, holdings: holdings.value };
      uni.setStorageSync(draftKey(), JSON.stringify(d));
    } catch {
      /* 草稿写入失败不干扰正常发帖 */
    }
  }, 400);
}
function loadDraft(): ComposerDraft | null {
  try {
    const raw = uni.getStorageSync(draftKey());
    if (!raw) return null;
    const d = JSON.parse(raw) as ComposerDraft;
    if (!d || (!d.text && (!d.holdings || !d.holdings.length))) return null;
    return d;
  } catch {
    return null;
  }
}

onMounted(() => {
  const d = loadDraft();
  if (!d) return;
  text.value = d.text || "";
  holdings.value = d.holdings || [];
  if (holdings.value.length) startHoldPoll(); // 恢复持仓后拉现价刷新收益率
  uni.showToast({ title: "已恢复上次草稿", icon: "none" });
});
// 正文 / 持仓变化即落盘（deep 监听持仓 splice 等就地修改）
watch([text, holdings], saveDraft, { deep: true });

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
.cp-area {
  width: 100%;
  min-height: 108rpx;
  /* 输入文字与帖子正文（PostCard .p-text）完全同号同行高：font-md / 1.6，输入即所见 */
  font-size: var(--font-md);
  line-height: 1.6;
  color: var(--text);
  background: transparent;
  /* 右侧让位给悬浮的表情入口（盒 48 + 8 间距），首行文字不被图标遮挡 */
  padding: 4rpx 56rpx 4rpx 2rpx;
}
/* placeholder 与持仓表单输入框（.cp-hold-in::placeholder）同色，随主题切换 */
.cp-area::placeholder {
  color: var(--text-2);
}

/* 文本框定位容器：联想浮层据此 absolute 锚定，不挤占下方布局 */
.cp-area-wrap {
  position: relative;
}

/* # 联想浮层 / 持仓表单联想浮层：同构下拉，样式共用一套（仅层级与最大高度不同）。
   悬浮在输入框下方，覆盖下方卡片 / 工具栏，不撑高布局 */
.cp-suggest,
.cp-stock-suggest {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 8rpx;
  overflow-y: auto;
  background: var(--bg-2);
  border: 1rpx solid var(--border);
  border-radius: 16rpx;
  box-shadow: var(--shadow-pop);
}
.cp-suggest {
  z-index: 20;
  max-height: 360rpx;
}
.cp-stock-suggest {
  z-index: 25;
  max-height: 320rpx;
}
.cp-suggest-empty {
  padding: 18rpx;
  text-align: center;
  font-size: var(--font-xs);
  color: var(--text-2);
}
/* 联想条目（两个浮层同构）：名称居左、代码行居右，键盘 active 高亮 */
.cp-suggest-item,
.cp-stock-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14rpx;
  padding: 14rpx 18rpx;
  border-bottom: 1rpx solid var(--border);
  cursor: pointer;
  transition: background 0.12s ease;
}
.cp-suggest-item:last-child,
.cp-stock-item:last-child {
  border-bottom: none;
}
.cp-suggest-item.active,
.cp-stock-item.active {
  background: var(--primary-soft);
}
.cp-suggest-name,
.cp-stock-name {
  font-size: var(--font-sm);
  color: var(--text);
}
/* 代码行：沪深港徽标（复用全局 .mkt-label）+ 代码，同行右对齐 */
.cp-suggest-coderow,
.cp-stock-coderow {
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex: none;
}
.cp-suggest-code,
.cp-stock-code {
  font-size: var(--font-xs);
  color: var(--text-2);
}

/* 已选图片预览（输入框内，文本框下方）：3 列网格，点击放大、右上角单删 */
.cp-imgs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10rpx;
  margin-top: 12rpx;
}
.cp-img-cell {
  position: relative;
}
.cp-img {
  width: 100%;
  height: 180rpx;
  border-radius: 12rpx;
  background: var(--card-2);
}
.cp-img-x {
  position: absolute;
  top: 8rpx;
  right: 8rpx;
  width: 36rpx;
  height: 36rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
}

/* 持仓附件预览（确认后显示）：与帖子内持仓卡片同构的紧凑版 */
/* 与帖子内持仓卡（.card-s）完全同构：市场数据票风格（纯色底+描边幽灵标签+浅阴影） */
.cp-attach {
  margin-top: 12rpx;
  padding: 16rpx 20rpx;
  border-radius: 20rpx;
  background: var(--bg-2);
  border: 1rpx solid var(--border);
  box-shadow: var(--shadow-1);
}
.cp-attach-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  min-width: 0;
}
.cp-attach-tag {
  font-size: var(--font-xs);
  color: #fff;
  background: var(--primary);
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
  line-height: 1.5;
  flex: none;
}
.cp-attach-name {
  font-size: var(--font-md);
  color: var(--text);
  flex: 1;
  min-width: 0;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp-attach-code {
  font-size: var(--font-xs);
  color: var(--text-3);
  flex: none;
}
.cp-attach-x {
  flex: none;
  margin-left: auto;
  padding: 6rpx;
}
/* 与帖子内持仓卡（.card-s .cs-body）同构：四列等宽、细线分隔、标签在上数值在下，
   保证预览 = 发布后 */
.cp-attach-metrics {
  display: flex;
  margin-top: 12rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid var(--border);
}
.cp-attach-cell {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  padding: 8rpx 4rpx;
  border-right: 1rpx solid var(--border);
}
.cp-attach-cell:last-child {
  border-right: none;
}
.cp-attach-cell .k {
  font-size: var(--font-xs);
  color: var(--text-3);
  flex: none;
}
.cp-attach-cell .v {
  font-size: var(--font-sm);
  color: var(--text);
  display: block;
  width: 100%;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp-attach-cell.rate .v {
  font-size: var(--font-md);
  line-height: 1.1;
  letter-spacing: 1rpx;
}

/* 持仓录入 UI：与附件菜单共用 morph 容器（同底/圆角/阴影/内留白），绝对定位铺满顶行以下 */
.cp-hold {
  position: absolute;
  top: 56rpx;
  left: var(--cp-inset);
  right: var(--cp-inset);
  bottom: var(--cp-inset);
  display: flex;
  flex-direction: column;
  /* 入场：与 morph 列表项渐显同位移同曲线，视觉语言一致 */
  animation: cp-hold-in 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
@keyframes cp-hold-in {
  from {
    opacity: 0;
    transform: translateY(10rpx);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.cp-hold-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
/* 股票输入占主宽并承载联想浮层定位 */
.cp-hold-stock {
  position: relative;
  flex: 1;
  min-width: 0;
}
/* 输入框：高度 / 圆角 / 行内 padding 与菜单列表项（.cp-morph-item）对齐 */
.cp-hold-in {
  box-sizing: border-box;
  height: 74rpx;
  padding: 0 var(--cp-item-pad);
  font-size: var(--font-sm);
  color: var(--text);
  background: var(--card);
  border-radius: 12rpx;
  min-width: 0;
}
.cp-hold-stock .cp-hold-in {
  width: 100%;
}
.cp-hold-num {
  flex: none;
  width: 176rpx;
}
.cp-hold-in::placeholder {
  color: var(--text-2);
}
/* 现价 / 收益率 实时行：选股自动拉行情，收益率随成本输入即时重算；
   padding 与菜单行对齐，保证文字与菜单项 / 输入框内文字同一左边界 */
.cp-hold-live {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-top: 12rpx;
  padding: 0 var(--cp-item-pad);
  font-size: var(--font-xs);
  color: var(--text-2);
}
/* 一键填入：历史持仓芯片行（横向可滚动），复用主色系药丸 */
.cp-quick {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 10rpx;
}
.cp-quick-t {
  flex: none;
  font-size: var(--font-xs);
  color: var(--text-3);
}
.cp-quick-list {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 8rpx;
  overflow-x: auto;
  scrollbar-width: none;
}
.cp-quick-chip {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6rpx;
  height: 44rpx;
  padding: 0 16rpx;
  border-radius: 999rpx;
  background: var(--primary-soft);
}
.cp-quick-name {
  font-size: var(--font-xs);
  color: var(--text);
  max-width: 160rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp-quick-num {
  font-size: var(--font-xs);
  color: var(--text-2);
  flex: none;
}
.cp-card-edit-actions {
  display: flex;
  gap: 14rpx;
  margin-top: 14rpx;
}
.cp-card-cancel,
.cp-card-ok {
  flex: 1;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  font-size: var(--font-xs);
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

/* 底部工具栏 */
.cp-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16rpx;
}
/* 表情入口：悬浮输入框右上角（第一行行高区间内）的裸图标按钮，点亮态主色描边
   （无底无框，克制风格）；不再占用底部工具栏位置 */
.cp-emoji-btn {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 22;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 按钮盒贴合第一行行高（28×1.6≈45 + 4 padding ≈ 48）；图标 28rpx 与正文（--font-md）完全同号 */
  width: 48rpx;
  height: 48rpx;
  border-radius: 999rpx;
  transition: background var(--dur-fast) var(--ease-out);
}
.cp-emoji-btn:active {
  background: var(--primary-soft);
}
/* 表情面板（类微信）：文档流内展开（非弹窗），铺在输入框与工具栏之间 */
.cp-emoji {
  margin-top: 14rpx;
  padding: 10rpx 12rpx 8rpx;
  border-radius: 20rpx;
  background: var(--card-2);
  border: 1rpx solid var(--border);
  animation: cpEmojiIn 0.24s var(--ease-out) both;
}
@keyframes cpEmojiIn {
  from {
    opacity: 0;
    transform: translateY(10rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.cp-emoji-scroll {
  max-height: 320rpx;
}
.cp-emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2rpx;
}
.cp-emoji-item {
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 表情字号取 --font-lg（32）：与正文（--font-md 28）紧贴一档，插入正文前后视觉比例一致；
     点选热区仍由 64rpx 格子保证 */
  font-size: var(--font-lg);
  line-height: 1;
  border-radius: 12rpx;
  transition: background var(--dur-fast) var(--ease-out);
}
.cp-emoji-item:active {
  background: var(--primary-soft);
}
.cp-emoji-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 6rpx;
}
.cp-emoji-tip {
  font-size: var(--font-xs);
  color: var(--text-3);
}
.cp-emoji-del {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  border-radius: 999rpx;
}
.cp-emoji-del:active {
  background: var(--primary-soft);
}
/* 展开时字数/发布让位：宽度+透明度同步过渡（与形变同曲线同时长），避免被容器挤压产生跳变 */
.cp-foot.open .cp-count,
.cp-foot.open .cp-send,
/* 持仓录入态同展开态：字数 / 发布一并收拢让位，仅显示录入面板 */
.cp-foot.holding .cp-count,
.cp-foot.holding .cp-send {
  max-width: 0;
  min-width: 0;
  padding: 0;
  gap: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}

/* 「+」形变菜单：按钮本体展开为附件列表容器（morph，无独立弹窗）。
   width/height/border-radius 同曲线过渡驱动形变，overflow:hidden 收拢时裁掉列表；
   展开宽 100% 高 216rpx（顶行 56 + 2×74 项 + 间隔 4 + 底 8），文档流内撑高卡片。
   收拢态即一枚「裸 +」：无背景、无描边（底与描边只在展开 / 录入态出现）；
   --cp-inset / --cp-item-pad：面板内留白与行内 padding 的单一来源，
   保证「添加附件」列表与「添加持仓」录入面板的边距、行高、圆角完全对齐。 */
.cp-morph {
  --cp-inset: 8rpx;
  --cp-item-pad: 18rpx;
  position: relative;
  flex: none;
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: transparent;
  box-shadow: none;
  overflow: hidden;
  transition:
    width 0.32s cubic-bezier(0.4, 0, 0.2, 1),
    height 0.32s cubic-bezier(0.4, 0, 0.2, 1),
    border-radius 0.32s cubic-bezier(0.4, 0, 0.2, 1),
    background 0.32s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.32s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.12s ease;
}
/* 按压反馈只作用于收拢态的「+」圆钮；展开 / 录入态面板不做缩放，
   否则点面板任意处都会整块缩一下（视觉「跳动」）。 */
.cp-morph:not(.open):not(.forming):active {
  transform: scale(0.92);
}
/* 展开 / 录入态共用不透明面板底 + 全宽 + 18rpx 圆角：浮层与内容不被后方卡片穿透（联想列表同此口径） */
.cp-morph.open,
.cp-morph.forming {
  width: 100%;
  background: var(--bg-2);
  border-radius: 18rpx;
  box-shadow: inset 0 0 0 1rpx var(--border), var(--shadow-pop);
}
.cp-morph.open {
  /* 56 顶行 + 2×74 列表项 + 1×4 间隔 + 8 底部留白 */
  height: 216rpx;
}
/* 持仓录入态（forming）：同一 morph 容器切换为录入 UI —— 同底/圆角/阴影/过渡曲线；
   放开 overflow 让股票联想浮层可溢出面板显示（退出态立即恢复 hidden 供收拢裁剪）。
   has-saved：存在历史持仓时多出一行「一键填入」，面板相应增高。 */
.cp-morph.forming {
  /* 56 顶行 + 输入行 74 + 实时行 30 + 操作行 64 + 间隔 26 + 底 8 */
  height: 258rpx;
  overflow: visible;
}
.cp-morph.forming.has-saved {
  /* 258 + 一键填入行（44 芯片 + 10 下间距） */
  height: 312rpx;
}
.cp-morph.forming .cp-morph-icon {
  transform: rotate(135deg);
}
.cp-morph.forming .cp-morph-hint {
  opacity: 1;
  transform: none;
}
/* + 图标固定在按钮原位（56rpx 方位），展开时旋转 135° 成为 ×，保持空间连续性 */
.cp-morph-icon {
  position: absolute;
  top: 0;
  left: 0;
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.32s cubic-bezier(0.4, 0, 0.2, 1);
}
.cp-morph.open .cp-morph-icon {
  transform: rotate(135deg);
}
/* 展开态顶行提示文案：收拢时被容器 overflow:hidden 裁掉，展开时随列表渐显 */
.cp-morph-hint {
  position: absolute;
  top: 0;
  left: 64rpx;
  height: 56rpx;
  line-height: 56rpx;
  font-size: var(--font-md);
  color: var(--text-2);
  white-space: nowrap;
  opacity: 0;
  transform: translateX(-8rpx);
  pointer-events: none;
  transition: opacity 0.24s ease 0.1s, transform 0.24s ease 0.1s;
}
.cp-morph.open .cp-morph-hint {
  opacity: 1;
  transform: none;
}
.cp-morph-list {
  position: absolute;
  top: 56rpx;
  left: var(--cp-inset);
  right: var(--cp-inset);
  bottom: var(--cp-inset);
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
/* 列表项：展开时按 nth-child 阶梯 delay 依次渐显（delay 只写在 .open 态，
   收拢时 delay 归零 → 整体同时淡出，与容器收缩同步，反向自然） */
.cp-morph-item {
  display: flex;
  align-items: center;
  gap: 14rpx;
  height: 74rpx;
  padding: 0 18rpx;
  border-radius: 12rpx;
  opacity: 0;
  transform: translateY(10rpx);
  pointer-events: none;
  transition: opacity 0.24s ease, transform 0.24s ease;
}
.cp-morph.open .cp-morph-item {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.cp-morph.open .cp-morph-item:nth-child(1) { transition-delay: 80ms; }
.cp-morph.open .cp-morph-item:nth-child(2) { transition-delay: 140ms; }
.cp-morph-item:active {
  background: var(--primary-soft);
}
.cp-morph-t {
  font-size: var(--font-md);
  color: var(--text);
}
.cp-count {
  flex: 1;
  max-width: 400rpx;
  text-align: center;
  font-size: var(--font-md);
  color: var(--text-2);
  transition: max-width 0.32s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s ease;
}
.cp-send {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  max-width: 300rpx;
  padding: 10rpx 20rpx;
  border-radius: 999rpx;
  background: var(--primary);
  transition:
    max-width 0.32s cubic-bezier(0.4, 0, 0.2, 1),
    padding 0.32s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.18s ease,
    transform 0.15s ease;
}
.cp-send:active {
  transform: scale(0.94);
}
.cp-send.disabled {
  opacity: 0.5;
}
.cp-send-t {
  font-size: var(--font-md);
  color: #fff;
}

/* ---------- 帖子预览（发帖框下方，实时所见即所得） ---------- */
.cp-preview {
  margin: 14rpx 18rpx 0;
}
/* 头部只剩标题一行：不再需要 flex/gap（原副标题已移除） */
.cp-preview-head {
  padding: 0 4rpx 12rpx;
}
.cp-preview-t {
  font-size: var(--font-xs);
  color: var(--text-2);
}
/* 空状态：轻量占位，玻璃卡片风格与 composer 一致 */
.cp-preview-empty {
  padding: 44rpx 0;
  text-align: center;
  /* 与输入框正文（.cp-area）完全同号同行高，所见即统一 */
  font-size: var(--font-md);
  line-height: 1.6;
  color: var(--text-2);
  background: var(--card-2);
  border-radius: var(--radius);
  box-shadow: inset 0 0 0 1rpx var(--border);
}
</style>
