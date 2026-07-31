<template>
  <scroll-view class="view-scroll" scroll-y @scroll="onScroll">
    <view class="wl">
      <BackgroundFX />
      <view class="wl-head anim-fade-up">
        <text class="wl-title">自选股</text>
        <text class="wl-count">{{ list.length }} 只</text>
      </view>

      <view v-if="!list.length" class="empty anim-fade-up">
        <OutlineIcon type="bars" :size="72" color="var(--border)" />
        <text class="empty-t">还没有自选股</text>
        <text class="empty-s">在「行情」页分析后点击「加入自选」即可同步到这里</text>
      </view>

      <view
        v-for="(row, i) in rows"
        :key="row.it.code + row.it.market"
        class="wl-row anim-fade-up"
        :class="{ open: openIdx === i, removing: removingIdx === i }"
      >
        <!-- 左滑揭示的删除按钮：圆角红色，露出即点即删 -->
        <view class="wl-del" @click="onDel(row.it, i)">
          <OutlineIcon type="trash" :size="30" color="#fff" />
          <text class="wl-del-t">删除</text>
        </view>
        <!-- 可滑动行本体：左滑露出删除按钮，回弹/点击行体收起；点击跳转行情 -->
        <view
          class="wl-item"
          :class="{ 'no-trans': dragIdx === i, removing: removingIdx === i }"
          :style="{ transform: 'translateX(' + (offsets[i] || 0) + 'px)' }"
          @touchstart="onDown($event, i)"
          @touchmove="onMove($event, i)"
          @touchend="onUp($event, i, row.it)"
          @mousedown="onDown($event, i)"
          @mousemove="onMove($event, i)"
          @mouseup="onUp($event, i, row.it)"
          @mouseleave="onUp($event, i, row.it)"
          @click="onItemClick(row.it, i)"
        >
          <view class="wl-main">
            <view class="wl-name-row">
              <text class="wl-name">{{ row.it.name || row.it.code }}</text>
            </view>
            <view class="wl-code-row">
              <view class="mkt-tag">{{ row.mkt }}</view>
              <text class="wl-code">{{ row.it.code }}</text>
            </view>
          </view>
          <view class="wl-right">
            <text class="wl-price" :class="{ 'is-loading': row.q.loading }" :style="{ color: priceColor(row.q) }">
              {{ row.q.loading ? "--" : fmtPrice(row.q.price) }}
            </text>
            <text class="wl-pct" :class="pctCls(row.q)">
              {{ row.q.loading ? "--" : fmtPct(row.q.pct) }}
            </text>
          </view>
        </view>
      </view>

      <text v-if="list.length" class="wl-hint">左滑股票可移除自选</text>

      <view class="bottom-pad" />
    </view>
  </scroll-view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted, onActivated } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import BackgroundFX from "@/components/BackgroundFX.vue";
import { useWatchlist, removeWatch, type WatchItem } from "@/store/watchlist";
import { fetchSnapshot } from "@/api/quote";
import { resolveSecid } from "@/utils/period";
import { fmtPrice, fmtPct } from "@/utils/format";

const emit = defineEmits<{ (e: "open-market", payload: { code: string; market: string }): void }>();

const wl = useWatchlist();
const list = computed(() => wl.items as WatchItem[]);

interface Snap {
  price: number;
  chg: number;
  pct: number;
  loading: boolean;
  error?: boolean;
}
const EMPTY: Snap = { price: 0, chg: 0, pct: 0, loading: true };

const quotes = reactive<Record<string, Snap>>({});
const keyOf = (it: WatchItem) => `${it.code}|${it.market}`;

// 自选股实时行情：批量拉取快照（与行情页同口径），填充现价与涨跌幅
async function loadQuotes() {
  const tasks = list.value.map(async (it) => {
    const k = keyOf(it);
    quotes[k] = { ...EMPTY, loading: true };
    try {
      const secid = resolveSecid(it.code, it.market as any);
      const snap = await fetchSnapshot(secid);
      quotes[k] = { ...snap, loading: false };
    } catch {
      quotes[k] = { ...EMPTY, loading: false, error: true };
    }
  });
  await Promise.allSettled(tasks);
}

// 市场标识：沪 / 深 / 港 / 北（中性灰色小标签，经典简洁）
const MKT_PREFIX: Record<string, string> = { sh: "沪", sz: "深", bj: "北", hk: "港", auto: "" };
function mktChar(it: WatchItem): string {
  let m = it.market;
  const c = it.code;
  if (!m || m === "auto") {
    if (/^\d{5}$/.test(c)) m = "hk";
    else if (/^6/.test(c)) m = "sh";
    else if (/^[03]/.test(c)) m = "sz";
    else if (/^[48]/.test(c)) m = "bj";
    else m = "sh";
  }
  return MKT_PREFIX[m] || "股";
}

const rows = computed(() =>
  list.value.map((it) => ({ it, q: quotes[keyOf(it)] || EMPTY, mkt: mktChar(it) }))
);

// 现价颜色：跟随涨跌（平盘用主文字色）
function priceColor(q: Snap): string {
  if (q.chg > 0) return "var(--up)";
  if (q.chg < 0) return "var(--down)";
  return "var(--text)";
}
// 涨跌幅文本配色：直接跟随涨跌方向（涨红 / 跌绿 / 平灰），保持简洁
function pctCls(q: Snap): string {
  if (q.loading) return "flat";
  if (q.chg > 0) return "up";
  if (q.chg < 0) return "down";
  return "flat";
}

onMounted(loadQuotes);
// keep-alive 下返回该页不会重新挂载，故在每次激活时刷新自选实时行情
onActivated(loadQuotes);
// 列表增删后重新拉取（key 串变化即触发）
watch(
  () => list.value.map(keyOf).join(","),
  () => loadQuotes()
);

// ===== 左滑删除（iOS 风格：果冻阻尼 + 弹簧回弹；滑到底自动删除，也可点红色按钮删除）=====
// 删除按钮宽度用 rpx 表达（与 CSS 的 150rpx 完全一致），再换算成 px 用于 transform，
// 避免「逻辑 150px / 视觉 75px」错位导致滑不到位、看似删不掉。
function rpx2px(rpx: number): number {
  const w = typeof window !== "undefined" && window.innerWidth ? window.innerWidth : 375;
  return Math.round((rpx / 750) * w);
}
const DEL_W = rpx2px(150); // 删除按钮宽度(px)，与 .wl-del 的 150rpx 对齐
const OPEN_TRIGGER = Math.round(DEL_W * 0.42); // 松手时左滑超过此距离即展开删除按钮
const DELETE_TRIGGER = -DEL_W * 0.99; // 滑到完整展开(含一点阻力区)即视为「滑到底」，松手自动删除
const dragIdx = ref(-1); // 当前正在拖动的行（拖动时取消过渡，跟手）
const openIdx = ref(-1); // 当前已展开删除按钮的行（-1 表示无）
const removingIdx = ref(-1); // 正在执行删除飞出动画的行
const offsets = reactive<Record<number, number>>({}); // 各行实时横向位移(px)
const suppressClick = ref(false); // 拖动结束后抑制误触发的 click
let startX = 0;
let startY = 0;
let baseOffset = 0; // 手势起点时的横向位移（已展开时从 -DEL_W 起步）
let lockDir: "" | "h" | "v" = ""; // 方向锁定：横向滑动才接管，纵向交还页面滚动
let lastX = 0;
let lastT = 0;
let lastTouch = 0;
let activePointer = "";

function ptX(e: any): number {
  if (e.touches && e.touches[0]) return e.touches[0].clientX;
  if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientX;
  return e.clientX || 0;
}
function ptY(e: any): number {
  if (e.touches && e.touches[0]) return e.touches[0].clientY;
  if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY;
  return e.clientY || 0;
}

// 果冻阻尼：超过完整展开(-DEL_W)或顶到原始位置(0)后施加阻力，越拉越重，像拽橡皮筋
function withResistance(target: number): number {
  const LEFT_MAX = -DEL_W * 1.7; // 左向最大拉出（用于「滑到底」判定）
  if (target < -DEL_W) {
    const over = target + DEL_W; // 负值
    target = -DEL_W + over * 0.32;
    if (target < LEFT_MAX) target = LEFT_MAX;
  } else if (target > 0) {
    target = target * 0.32; // 右向（推回原位）阻尼
  }
  return target;
}

// 按下：记录起点与初始位移；过滤触摸后浏览器模拟的 mouse 事件
function onDown(e: any, i: number) {
  const isTouch = !!e.type && e.type.indexOf("touch") === 0;
  if (isTouch) lastTouch = Date.now();
  if (!isTouch && Date.now() - lastTouch < 600) return; // 触摸后的模拟 mouse 忽略
  activePointer = isTouch ? "touch" : "mouse";
  startX = ptX(e);
  startY = ptY(e);
  baseOffset = offsets[i] || 0;
  lastX = startX;
  lastT = Date.now();
  lockDir = "";
  suppressClick.value = false;
  dragIdx.value = i;
}

// 移动：先判定方向——横向接管并阻止页面滚动劫持；纵向直接交还滚动并退出滑动
function onMove(e: any, i: number) {
  if (dragIdx.value !== i) return;
  const isTouch = !!e.type && e.type.indexOf("touch") === 0;
  if (!isTouch && Date.now() - lastTouch < 600) return;
  if (activePointer === "mouse" && e.buttons === 0) {
    dragIdx.value = -1;
    return;
  }
  const x = ptX(e);
  const y = ptY(e);
  const dx = x - startX;
  const dy = y - startY;
  if (lockDir === "") {
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      lockDir = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
    }
  }
  if (lockDir === "v") {
    dragIdx.value = -1; // 纵向：交还页面滚动，退出滑动
    return;
  }
  if (lockDir === "h") {
    if (isTouch && e.cancelable) {
      try {
        e.preventDefault();
      } catch (_) {}
    }
    offsets[i] = withResistance(baseOffset + dx);
    lastX = x;
    lastT = Date.now();
    if (Math.abs(dx) > 6) suppressClick.value = true;
  }
}

// 抬起：滑到底(进入阻力区)或快速左滑 → 直接删除；超过 OPEN_TRIGGER → 展开按钮；否则收起
function onUp(e: any, i: number, it: WatchItem) {
  if (dragIdx.value !== i) return;
  dragIdx.value = -1;
  if (lockDir !== "h") return;
  const x = ptX(e);
  const now = Date.now();
  const dt = Math.max(1, now - lastT);
  const vx = (x - lastX) / dt; // 左滑为负(px/ms)
  const final = offsets[i] || 0;
  if (final <= DELETE_TRIGGER || (vx < -0.6 && final <= -OPEN_TRIGGER)) {
    triggerDelete(i, it);
  } else if (final <= -OPEN_TRIGGER) {
    openRow(i);
  } else {
    closeRow(i);
  }
}

// 展开某行：先收起其它已展开的行，再滑开本行露出删除按钮
function openRow(i: number) {
  for (const k of Object.keys(offsets)) {
    const key = Number(k);
    if (key !== i) offsets[key] = 0;
  }
  offsets[i] = -DEL_W;
  openIdx.value = i;
}
function closeRow(i: number) {
  offsets[i] = 0;
  if (openIdx.value === i) openIdx.value = -1;
}
// 滚动时收起所有展开行（拖动 / 删除动画进行中不打断）
function closeAll() {
  if (dragIdx.value !== -1 || removingIdx.value !== -1) return;
  for (const k of Object.keys(offsets)) offsets[Number(k)] = 0;
  openIdx.value = -1;
}
function onScroll() {
  closeAll();
}

// 点击行体：已展开则收起（不跳转），否则跳转行情；拖动误触被 suppressClick 拦截
function onItemClick(it: WatchItem, i: number) {
  if (openIdx.value === i) {
    closeRow(i);
    return;
  }
  if (suppressClick.value) {
    suppressClick.value = false;
    return;
  }
  emit("open-market", { code: it.code, market: it.market });
}

// 点击删除按钮：触发飞出 + 移除
function onDel(it: WatchItem, i: number) {
  if (removingIdx.value === i) return;
  triggerDelete(i, it);
}

// 删除动画：行体飞出屏幕左侧并淡出，结束后真正移除数据
function triggerDelete(i: number, it: WatchItem) {
  removingIdx.value = i;
  offsets[i] = -DEL_W * 3; // 远超屏幕，配合过渡平滑飞出
  setTimeout(() => {
    doRemove(it);
    delete offsets[i];
    removingIdx.value = -1;
  }, 320);
}

function doRemove(it: WatchItem) {
  removeWatch(it.code, it.market);
  uni.showToast({ title: "已移除", icon: "none" });
}
</script>

<style scoped>
.view-scroll {
  height: 100%;
}
.wl {
  padding: 4rpx 0 0;
}
/* 头部：标题 + 计数，简洁一行 */
.wl-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 12rpx 24rpx 18rpx;
}
.wl-title {
  font-size: 38rpx;
  font-weight: 800;
  letter-spacing: 1rpx;
}
.wl-count {
  font-size: 24rpx;
  color: var(--text-2);
}

/* 空态 */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  padding: 130rpx 0;
}
.empty-t {
  font-size: 30rpx;
  color: var(--text-2);
  font-weight: 500;
}
.empty-s {
  font-size: 24rpx;
  color: var(--text-2);
  text-align: center;
  padding: 0 60rpx;
  line-height: 1.6;
}

/* 行容器：圆角 + 裁切；底色即「删除」红色——静止时整张不透明卡片盖住它，
   左滑才露出右侧红色操作区，与卡片浑然一体（红色是卡片的一部分，而非外挂按钮）。 */
.wl-row {
  position: relative;
  margin: 0 16rpx 14rpx;
  border-radius: 18rpx;
  overflow: hidden;
  background: linear-gradient(135deg, #ff5b5b, #e23b3b);
  max-height: 160rpx;
  transition: max-height 0.3s ease 0.06s;
}
.wl-row:first-of-type {
  margin-top: 10rpx;
}
/* 删除动画：行坍缩到 0，配合行体飞出形成顺滑的整体退场 */
.wl-row.removing {
  max-height: 0;
}

/* 删除操作区：固定在右侧，底色由行容器（红）透出，仅承载图标 + 文字；
   左缘为直边，与滑开的卡片右缘严丝合缝衔接，不露缝、不露线。 */
.wl-del {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 150rpx;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  color: #fff;
  background: transparent;
  transition: background 0.15s ease;
}
.wl-del:active {
  background: rgba(0, 0, 0, 0.1);
}
.wl-del-t {
  font-size: 24rpx;
  font-weight: 600;
}

/* 行体：不透明实色卡片（完全遮盖后方红色，静止时不露红）。
   关键点：卡片「不设自身圆角」，完全交由外层 .wl-row 的 overflow:hidden + 18rpx 裁切。
   若卡片也设 18rpx（与行同心同半径），四角抗锯齿会在子像素缝隙漏出红底，形成
   「四个角隐约透红」的瑕疵；去掉卡片圆角后，卡片以矩形填满行，被裁成统一圆角，
   红底被整片盖住。左滑时卡片右缘为直边，与露出的红色平直衔接，角落不再挖红缺口。 */
.wl-item {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26rpx 24rpx;
  background: var(--bg-2);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
/* 展开时用回弹曲线（带轻微过冲），手感更「弹」；收起用上面的平滑动画 */
.wl-row.open .wl-item {
  transition: transform 0.46s cubic-bezier(0.34, 1.56, 0.64, 1);
}
/* 拖动中关闭过渡，跟手 */
.wl-item.no-trans {
  transition: none;
}
/* 删除飞出：行体快速滑出屏幕左侧并淡出 */
.wl-item.removing {
  opacity: 0;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.22s ease;
}

.wl-main {
  flex: 1;
  min-width: 0;
}
.wl-name-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.wl-name {
  font-size: 31rpx;
  font-weight: 600;
  max-width: 320rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wl-code-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-top: 6rpx;
}
.wl-code {
  font-size: 22rpx;
  color: var(--text-2);
}
/* 市场标识：中性灰色小标签（沪 / 深 / 港 / 北），经典简洁 */
.mkt-tag {
  flex: none;
  font-size: 18rpx;
  line-height: 1;
  padding: 4rpx 10rpx;
  border-radius: 6rpx;
  color: var(--text-2);
  background: var(--card-2);
  border: 1rpx solid var(--border);
}

/* 右侧：现价 + 涨跌幅，右对齐成列 */
.wl-right {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6rpx;
  text-align: right;
}
.wl-price {
  font-size: 33rpx;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.wl-price.is-loading {
  opacity: 0.5;
}
.wl-pct {
  font-size: 25rpx;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.wl-pct.up {
  color: var(--up);
}
.wl-pct.down {
  color: var(--down);
}
.wl-pct.flat {
  color: var(--text-2);
}

/* 轻提示 */
.wl-hint {
  display: block;
  font-size: 22rpx;
  color: var(--text-2);
  text-align: center;
  padding: 26rpx 0 0;
}
.bottom-pad {
  /* 留出底部导航栏高度，避免末尾内容被 tab 栏遮挡 */
  height: 140rpx;
}
</style>
