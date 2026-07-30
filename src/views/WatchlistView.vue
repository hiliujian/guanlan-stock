<template>
  <scroll-view class="view-scroll" scroll-y>
    <view class="wl">
      <view class="wl-head anim-fade-up">
        <text class="wl-title">自选股</text>
        <text class="wl-count">{{ list.length }} 只</text>
      </view>

      <view v-if="!list.length" class="empty anim-fade-up">
        <OutlineIcon type="star" :size="64" color="var(--border)" />
        <text class="empty-t">还没有自选股</text>
        <text class="empty-s">在「行情」页分析后点击「加入自选」即可同步到这里</text>
      </view>

      <view
        v-for="(row, i) in rows"
        :key="row.it.code + row.it.market"
        class="wl-item card anim-rise"
        :style="{ animationDelay: i * 50 + 'ms' }"
        @click="$emit('open-market', { code: row.it.code, market: row.it.market })"
      >
        <OutlineIcon
          type="star-filled"
          :size="52"
          color="var(--up)"
          class="wl-star"
          @click.stop="remove(row.it)"
        />
        <view class="wl-main">
          <view class="wl-top">
            <text class="wl-name">{{ row.it.name || row.it.code }}</text>
            <view class="mkt-dot" :class="row.dot" />
            <text class="wl-code">{{ row.it.code }}</text>
          </view>
          <view class="wl-price-row">
            <text class="wl-price" :style="{ color: priceColor(row.q) }">
              {{ row.q.loading ? "--" : fmtPrice(row.q.price) }}
            </text>
            <text class="wl-pct" :style="{ color: pctColor(row.q) }">
              {{ row.q.loading ? "--" : fmtPct(row.q.pct) }}
            </text>
            <text class="wl-trend" :style="{ color: trendColor(row.q) }">
              {{ row.q.loading ? "--" : trendState(row.q.pct) }}
            </text>
          </view>
          <text v-if="row.it.note" class="wl-note">{{ row.it.note }}</text>
        </view>
      </view>

      <view class="risk-note">
        <OutlineIcon type="info" :size="22" color="var(--text-3)" />
        <text>以上分析仅供参考，不构成任何投资建议</text>
      </view>

      <view class="bottom-pad" />
    </view>
  </scroll-view>
</template>

<script setup lang="ts">
import { computed, reactive, watch, onMounted } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import { useWatchlist, removeWatch, type WatchItem } from "@/store/watchlist";
import { fetchSnapshot } from "@/api/quote";
import { resolveSecid } from "@/utils/period";
import { fmtPrice, fmtPct } from "@/utils/format";

const emit = defineEmits<{ (e: "open-market", payload: { code: string; market: string }): void }>();

const wl = useWatchlist();
const list = computed(() => wl.items as WatchItem[]);

interface Snap {
  price: number;
  preClose: number;
  chg: number;
  pct: number;
  vol: number;
  amount: number;
  loading: boolean;
  error?: boolean;
}
const EMPTY: Snap = { price: 0, preClose: 0, chg: 0, pct: 0, vol: 0, amount: 0, loading: true };

const quotes = reactive<Record<string, Snap>>({});
const keyOf = (it: WatchItem) => `${it.code}|${it.market}`;

// 自选股实时行情：批量拉取快照（与行情页同口径），填充涨跌幅/涨跌额/成交量/趋势
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

// 市场标识：用彩色圆点图标（红=沪 / 蓝=深 / 橙=港 / 紫=京），纯图形「一个图标」形式
const MKT_DOT: Record<string, string> = {
  sh: "dot-sh",
  sz: "dot-sz",
  hk: "dot-hk",
  bj: "dot-bj",
};
function mktDotCls(it: WatchItem): string {
  let m = it.market;
  const c = it.code;
  if (!m || m === "auto") {
    if (/^\d{5}$/.test(c)) m = "hk";
    else if (/^6/.test(c)) m = "sh";
    else if (/^[03]/.test(c)) m = "sz";
    else if (/^[48]/.test(c)) m = "bj";
    else m = "sh";
  }
  return MKT_DOT[m] || "dot-sh";
}

const rows = computed(() =>
  list.value.map((it) => ({ it, q: quotes[keyOf(it)] || EMPTY, dot: mktDotCls(it) }))
);

function priceColor(q: Snap): string {
  if (q.chg > 0) return "var(--up)";
  if (q.chg < 0) return "var(--down)";
  return "var(--text)";
}
function pctColor(q: Snap): string {
  if (q.pct > 0) return "var(--up)";
  if (q.pct < 0) return "var(--down)";
  return "var(--text-2)";
}
function trendState(pct: number): string {
  if (pct > 3) return "强势";
  if (pct > 0) return "上涨";
  if (pct === 0) return "平盘";
  if (pct > -3) return "下跌";
  return "弱势";
}
function trendColor(q: Snap): string {
  if (q.pct > 0) return "var(--up)";
  if (q.pct < 0) return "var(--down)";
  return "var(--text-2)";
}

onMounted(loadQuotes);
// 列表增删后重新拉取（key 串变化即触发）
watch(
  () => list.value.map(keyOf).join(","),
  () => loadQuotes()
);

async function remove(it: WatchItem) {
  uni.showModal({
    title: "移除自选",
    content: `确定移除 ${it.name || it.code}？`,
    success: async (r) => {
      if (r.confirm) {
        await removeWatch(it.code, it.market);
        uni.showToast({ title: "已移除", icon: "none" });
      }
    },
  });
}
</script>

<style scoped>
.view-scroll {
  height: 100%;
}
.wl {
  padding: 18rpx 18rpx 0;
}
.wl-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 8rpx 8rpx 16rpx;
}
.wl-title {
  font-size: 38rpx;
  font-weight: 700;
}
.wl-count {
  font-size: 24rpx;
  color: var(--text-3);
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  padding: 120rpx 0;
}
.empty-t {
  font-size: 30rpx;
  color: var(--text-2);
  font-weight: 500;
}
.empty-s {
  font-size: 24rpx;
  color: var(--text-3);
  text-align: center;
  padding: 0 60rpx;
  line-height: 1.6;
}
.wl-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14rpx;
  padding: 20rpx 22rpx;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}
.wl-item:active {
  transform: scale(0.985);
  box-shadow: var(--shadow-up);
}
.wl-main {
  flex: 1;
  min-width: 0;
}
.wl-top {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.wl-name {
  font-size: 30rpx;
  font-weight: 600;
  max-width: 300rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wl-code {
  font-size: 22rpx;
  color: var(--text-3);
  flex: none;
}
/* 左侧大星标：点击取消自选（带确认弹窗） */
.wl-star {
  flex: none;
  align-self: center;
  margin-right: 8rpx;
}
/* 市场标识：彩色圆点图标（纯图形，一个图标形式） */
.mkt-dot {
  flex: none;
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  margin-right: 4rpx;
}
.dot-sh { background: #e64545; }
.dot-sz { background: #1a73e8; }
.dot-hk { background: #f0a020; }
.dot-bj { background: #6a5acd; }
.wl-price-row {
  display: flex;
  align-items: baseline;
  gap: 14rpx;
  margin-top: 6rpx;
}
.wl-price {
  font-size: 30rpx;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.wl-pct {
  font-size: 24rpx;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.wl-trend {
  font-size: 22rpx;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.wl-note {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bottom-pad {
  /* 留出底部导航栏高度，避免末尾内容被 tab 栏遮挡 */
  height: 140rpx;
}
.risk-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  margin: 0 8rpx;
  padding: 8rpx 0 0;
  font-size: 22rpx;
  color: var(--text-3);
  line-height: 1.5;
  text-align: center;
}
</style>
