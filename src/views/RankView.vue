<template>
  <view class="rk">
    <view v-if="loading && !rows.length" class="rk-loading">
      <view class="rk-spin" />
      <text class="rk-loading-t">榜单加载中…</text>
    </view>

    <template v-else>
      <view v-if="!rows.length" class="rk-empty glass">
        <OutlineIcon type="star" :size="56" color="var(--primary)" />
        <text class="rk-empty-t">暂无榜单数据</text>
        <text class="rk-empty-s">行情数据源暂不可用，请下拉刷新或稍后重试</text>
      </view>

      <view v-else>
        <view
          v-for="(r, i) in rows"
          :key="r.code + '-' + r.market"
          class="rk-card anim-fade-up"
          :style="{ animationDelay: (i % 8) * 40 + 'ms' }"
          @click="openRow(r)"
        >
          <view class="rk-rank" :class="rankCls(i)">{{ i + 1 }}</view>
          <view class="rk-main">
            <view class="rk-name-row">
              <text class="rk-name">{{ r.name }}</text>
              <view v-if="mode === 'today' && i < 3" class="rk-hot-tag">
                <OutlineIcon type="fire" :size="20" color="var(--primary)" />
                <text>热</text>
              </view>
            </view>
            <view class="rk-code-row">
              <view class="mkt-tag">{{ marketCharFor(r.code, r.market) }}</view>
              <text class="rk-code">{{ r.code }}</text>
            </view>
          </view>
          <view class="rk-right">
            <text class="rk-price" :style="{ color: colorOf(r) }">{{ fmtPrice(r.price) }}</text>
            <text class="rk-pct" :class="clsOf(r)">{{ fmtPct(r.pct) }}</text>
          </view>
          <view class="rk-star" :class="{ on: watched(r) }" @click.stop="toggleWatch(r)" role="button" aria-label="加入自选">
            <OutlineIcon type="star" :size="30" :color="watched(r) ? 'var(--primary)' : 'var(--text-3)'" />
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import { LOCAL_STOCKS, fetchSnapshot } from "@/api/quote";
import { resolveSecid, marketCharFor } from "@/utils/period";
import { fmtPrice, fmtPct } from "@/utils/format";
import { addWatch, removeWatch, isWatched } from "@/store/watchlist";

const props = defineProps<{ mode: "today" | "all" }>();
const emit = defineEmits<{ (e: "open-market", payload: { code: string; market: string }): void }>();

const TODAY_TOP = 20;

interface RankRow {
  code: string;
  market: string;
  name: string;
  price: number | null;
  pct: number | null;
  chg: number;
  loading: boolean;
}

const stock = ref<Record<string, Partial<RankRow>>>({});
const loading = ref(false);

// 排除指数 / ETF（非个股，不参与热榜）
function pool(): { code: string; name: string }[] {
  return LOCAL_STOCKS.filter((h) => h.code !== "000300" && h.code !== "510300");
}

function marketOf(code: string): string {
  if (/^\d{5}$/.test(code)) return "hk";
  if (/^6/.test(code)) return "sh";
  if (/^[03]/.test(code)) return "sz";
  if (/^[489]/.test(code)) return "bj";
  return "sh";
}

const keyOf = (r: { code: string; market: string }) => `${r.code}|${r.market}`;

const baseList = computed(() =>
  pool().map((h) => ({ code: h.code, market: marketOf(h.code), name: h.name }))
);

interface PartialRow {
  code: string;
  market: string;
  name?: string;
  price?: number | null;
  pct?: number | null;
  chg?: number;
  loading?: boolean;
}

const rows = computed(() => {
  const all = baseList.value
    .map((b) => {
      const q = stock.value[keyOf(b)] || {};
      return {
        ...b,
        price: q.price ?? null,
        pct: q.pct ?? null,
        chg: q.chg ?? 0,
        loading: q.loading !== false,
      };
    })
    .sort((a, b) => {
      const ap = a.pct == null ? -Infinity : a.pct;
      const bp = b.pct == null ? -Infinity : b.pct;
      return bp - ap;
    });
  return props.mode === "today" ? all.slice(0, TODAY_TOP) : all;
});

async function load() {
  loading.value = true;
  const tasks = baseList.value.map(async (b) => {
    const k = keyOf(b);
    stock.value[k] = { code: b.code, market: b.market, loading: true };
    try {
      const secid = resolveSecid(b.code, b.market as any);
      const snap = await fetchSnapshot(secid);
      stock.value[k] = {
        code: b.code,
        market: b.market,
        price: snap.price,
        pct: snap.pct,
        chg: snap.chg,
        loading: false,
      };
    } catch {
      stock.value[k] = { code: b.code, market: b.market, loading: false };
    }
  });
  await Promise.allSettled(tasks);
  loading.value = false;
}

onMounted(load);
watch(() => props.mode, load);

function rankCls(i: number): string {
  if (i === 0) return "gold";
  if (i === 1) return "silver";
  if (i === 2) return "bronze";
  return "";
}

function colorOf(r: RankRow): string {
  if (r.chg > 0) return "var(--up)";
  if (r.chg < 0) return "var(--down)";
  return "var(--text)";
}
function clsOf(r: RankRow): string {
  if (r.loading) return "flat";
  if (r.chg > 0) return "up";
  if (r.chg < 0) return "down";
  return "flat";
}

function watched(r: { code: string; market: string }): boolean {
  return isWatched(r.code, r.market);
}

async function toggleWatch(r: RankRow) {
  if (isWatched(r.code, r.market)) {
    await removeWatch(r.code, r.market);
    uni.showToast({ title: "已移除自选", icon: "none" });
    return;
  }
  const res = await addWatch({
    code: r.code,
    market: r.market,
    name: r.name,
    note: "",
    group: "",
  });
  if (res.ok) uni.showToast({ title: "已加入自选", icon: "none" });
  else uni.showToast({ title: res.error || "加入自选失败", icon: "none" });
}

function openRow(r: { code: string; market: string }) {
  emit("open-market", { code: r.code, market: r.market });
}
</script>

<style scoped>
.rk {
  padding: 12rpx 0 0;
}
.rk-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18rpx;
  padding: 80rpx 0 40rpx;
}
.rk-spin {
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  border: 4rpx solid var(--card-2);
  border-top-color: var(--primary);
  animation: rk-rotate 0.8s linear infinite;
}
@keyframes rk-rotate {
  to {
    transform: rotate(360deg);
  }
}
.rk-loading-t {
  font-size: 24rpx;
  color: var(--text-2);
}

/* ===== 卡片 ===== */
.rk-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin: 0 16rpx 14rpx;
  padding: 20rpx 22rpx;
  border-radius: 20rpx;
  background: var(--bg-2);
  border: 1rpx solid var(--border);
  box-shadow: var(--shadow);
}
.rk-card:first-of-type {
  margin-top: 10rpx;
}

.rk-rank {
  flex: none;
  width: 44rpx;
  height: 44rpx;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  font-weight: 700;
  color: var(--text-2);
  background: var(--card-2);
  font-variant-numeric: tabular-nums;
}
.rk-rank.gold {
  color: #fff;
  background: linear-gradient(135deg, #ffb13d, #ff8a00);
  box-shadow: 0 4rpx 14rpx rgba(248, 138, 0, 0.35);
}
.rk-rank.silver {
  color: #fff;
  background: linear-gradient(135deg, #b8c2cc, #8a97a6);
  box-shadow: 0 4rpx 14rpx rgba(138, 151, 166, 0.35);
}
.rk-rank.bronze {
  color: #fff;
  background: linear-gradient(135deg, #d9a06b, #b2763f);
  box-shadow: 0 4rpx 14rpx rgba(178, 118, 63, 0.35);
}

.rk-main {
  flex: 1;
  min-width: 0;
}
.rk-name-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  min-width: 0;
}
.rk-name {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 240rpx;
}
.rk-hot-tag {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 2rpx;
  font-size: 18rpx;
  font-weight: 700;
  color: var(--primary);
  padding: 4rpx 8rpx;
  border-radius: 8rpx;
  background: var(--primary-soft);
}
.rk-code-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-top: 8rpx;
}
.rk-code {
  font-size: 22rpx;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
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

.rk-right {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6rpx;
  text-align: right;
}
.rk-price {
  font-size: 32rpx;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.rk-pct {
  font-size: 24rpx;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.rk-pct.up {
  color: var(--up);
}
.rk-pct.down {
  color: var(--down);
}
.rk-pct.flat {
  color: var(--text-2);
}

.rk-star {
  flex: none;
  width: 52rpx;
  height: 52rpx;
  margin-left: 6rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--card-2);
  transition: transform 0.15s ease;
}
.rk-star:active {
  transform: scale(0.9);
}
.rk-star.on {
  background: var(--primary-soft);
}

.rk-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  margin: 40rpx 24rpx 0;
  padding: 56rpx 40rpx;
}
.rk-empty-t {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--text);
}
.rk-empty-s {
  font-size: 23rpx;
  color: var(--text-2);
  text-align: center;
  line-height: 1.6;
}
</style>