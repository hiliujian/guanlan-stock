<template>
  <view class="rk">
    <view v-if="loading && !rows.length" class="rk-loading">
      <view class="rk-spin" />
      <text class="rk-loading-t">榜单加载中…</text>
    </view>

    <template v-else>
      <view v-if="!rows.length" class="rk-empty glass">
        <OutlineIcon type="star" :size="56" color="var(--primary)" />
        <text class="rk-empty-t">暂无数据</text>
        <text class="rk-empty-s">还没有足够的自选股人气数据，快去行情页添加人气股吧</text>
      </view>

      <view v-else class="rk-table">
        <!-- 表头 -->
        <view class="rk-thead">
          <text class="rh rank">排名</text>
          <text class="rh name">名称</text>
          <text class="rh heat">热度</text>
          <text class="rh price">最新价</text>
          <text class="rh pct">涨跌幅</text>
          <view class="rh star" />
        </view>
        <!-- 数据行 -->
        <view
          v-for="(r, i) in rows"
          :key="r.code + '-' + r.market"
          class="rk-row anim-fade-up"
          :style="{ animationDelay: (i % 8) * 40 + 'ms' }"
          @click="openRow(r)"
        >
          <text class="rh rank" :class="rankCls(i)">{{ i + 1 }}</text>
          <view class="rh name">
            <text class="rn">{{ r.name || r.code }}</text>
            <view class="rc">
              <text class="rm">{{ marketCharFor(r.code, r.market) }}</text>
              <text class="rcode">{{ r.code }}</text>
            </view>
          </view>
          <text class="rh heat st-num">{{ r.heat }}</text>
          <text class="rh price st-num" :class="'st-' + clsOf(r)">{{ fmtPrice(r.price) }}</text>
          <text class="rh pct st-num" :class="'st-' + clsOf(r)">{{ fmtPct(r.pct) }}</text>
          <view class="rh star" :class="{ on: watched(r) }" @click.stop="toggleWatch(r)" role="button" aria-label="加入自选">
            <OutlineIcon type="star" :size="30" :color="watched(r) ? 'var(--primary)' : 'var(--text-3)'" />
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import { fetchSnapshot } from "@/api/quote";
import { fetchStockHeat } from "@/api/heat";
import { resolveSecid, marketCharFor } from "@/utils/period";
import { fmtPrice, fmtPct } from "@/utils/format";
import { addWatch, removeWatch, isWatched } from "@/store/watchlist";

const props = defineProps<{ mode: "today" | "all" }>();
const emit = defineEmits<{ (e: "open-market", payload: { code: string; market: string }): void }>();

interface RankRow {
  code: string;
  market: string;
  name: string;
  heat: number;
  price: number | null;
  pct: number | null;
  chg: number;
}

const rows = ref<RankRow[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  // 热度榜：跨用户自选持有数聚合（人气），按热度降序
  const heat = await fetchStockHeat(props.mode === "all" ? 100 : 20);
  const tasks = heat.map(async (h) => {
    const secid = resolveSecid(h.code, h.market as any);
    try {
      const s = await fetchSnapshot(secid);
      return { ...h, price: s.price, pct: s.pct, chg: s.chg } as RankRow;
    } catch {
      return { ...h, price: null, pct: null, chg: 0 } as RankRow;
    }
  });
  const res = await Promise.allSettled(tasks);
  rows.value = res
    .filter((r): r is PromiseFulfilledResult<RankRow> => r.status === "fulfilled")
    .map((r) => r.value);
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

function clsOf(r: RankRow): string {
  if (r.price == null || r.pct == null) return "flat";
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
@import "../styles/stock-table.css";
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

/* ===== 表格 ===== */
.rk-table {
  display: flex;
  flex-direction: column;
}
.rk-thead,
.rk-row {
  display: flex;
  align-items: center;
  padding: 0 20rpx;
}
.rk-thead {
  height: 64rpx;
  border-bottom: 1rpx solid var(--tabbar-border);
}
.rk-thead .rh {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--text-2);
}
.rk-row {
  min-height: 96rpx;
  border-bottom: 1rpx solid var(--border);
}
.rk-row:active {
  background: var(--card-2);
}

.rh {
  flex: none;
  font-variant-numeric: tabular-nums;
}
.rh.rank {
  width: 56rpx;
  font-size: 26rpx;
  font-weight: 700;
  color: var(--text-2);
  text-align: center;
}
.rh.rank.gold {
  color: #ff8a00;
}
.rh.rank.silver {
  color: #8a97a6;
}
.rh.rank.bronze {
  color: #b2763f;
}
.rh.name {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6rpx;
  margin-right: 10rpx;
}
.rn {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--text);
  max-width: 220rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rc {
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.rm {
  font-size: 18rpx;
  line-height: 1;
  padding: 2rpx 6rpx;
  border-radius: 6rpx;
  color: var(--text-2);
  background: var(--card-2);
  border: 1rpx solid var(--border);
}
.rcode {
  font-size: 20rpx;
  color: var(--text-3);
}
.rh.heat {
  width: 110rpx;
  text-align: right;
  font-weight: 700;
  color: var(--primary);
}
.rh.price {
  width: 150rpx;
  text-align: right;
}
.rh.pct {
  width: 130rpx;
  text-align: right;
}
.rh.star {
  flex: none;
  width: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}
.rh.star.on {
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
