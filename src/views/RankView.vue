<template>
  <view class="rk">
    <view v-if="loading && !rows.length" class="rk-loading">
      <view class="rk-spin" />
      <text class="rk-loading-t">榜单加载中…</text>
    </view>

    <template v-else>
      <view v-if="!rows.length" class="rk-empty glass">
        <OutlineIcon type="star" :size="56" color="var(--primary)" />
        <text class="empty-title">暂无数据</text>
        <text class="rk-empty-s">还没有足够的自选股人气数据，快去行情页添加人气股吧</text>
      </view>

      <view v-else class="rk-table">
        <!-- 表头 -->
        <view class="rk-thead">
          <text class="rh rank">排名</text>
          <text class="rh name">股票</text>
          <text class="rh price">最新价</text>
          <text class="rh pct">涨跌幅</text>
          <view class="rh heat">
            <text>热度</text>
          </view>
          <text class="rh star-head">自选</text>
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
            <text class="rn truncate">{{ r.name || r.code }}</text>
            <view class="rc">
              <text class="rm">{{ marketCharFor(r.code, r.market) }}</text>
              <text class="rcode">{{ r.code }}</text>
            </view>
          </view>
          <text class="rh price st-num" :class="'st-' + clsOf(r)">{{ fmtPrice(r.price) }}</text>
          <text class="rh pct st-num" :class="'st-' + clsOf(r)">{{ fmtPct(r.pct) }}</text>
          <view class="rh heat">
            <view class="heat-flame">
              <OutlineIcon type="fire" :size="30" color="#ff5722" />
              <text class="heat-num">{{ r.heat }}</text>
            </view>
          </view>
          <view class="rh star" :class="{ on: watched(r) }" @click.stop="toggleWatch(r)" role="button" aria-label="加入自选">
            <OutlineIcon type="star" :size="30" :color="watched(r) ? 'var(--primary)' : 'var(--text-3)'" />
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script lang="ts">
// 模块级装载逻辑：与组件实例解耦，供「进入自选页预加载热榜」（WatchlistView onMounted
// 调 preloadRank）与组件 load() 共用同一份取数代码，杜绝两处实现漂移。
import { fetchSnapshot } from "@/api/quote";
import { fetchStockHeat } from "@/api/heat";
import { resolveSecid, marketCharFor } from "@/utils/period";
import { staleGet, staleSet } from "@/utils/staleCache";

export interface RankRow {
  code: string;
  market: string;
  name: string;
  heat: number;
  price: number | null;
  pct: number | null;
  chg: number;
}

// 组件实例外的短效缓存：预加载结果在这里，面板打开时命中即零等待上屏
const rankCache: Record<string, RankRow[] | undefined> = {};
const rankFetchedAt: Record<string, number> = {};

async function loadRankRows(mode: "today" | "all"): Promise<RankRow[]> {
  // 热度榜：跨用户自选聚合（人气）。
  //   today 模式（今日热榜）→ 仅统计当日（北京时间）新增自选行为，真实反映今日热度；
  //   all 模式（完整榜单）  → 统计历史累计持有人数。
  // 二者后端各自独立聚合；today 为空时 UI 显示「暂无数据」，不会兜底完整榜单。
  const today = mode === "today";
  const heat = await fetchStockHeat(mode === "all" ? 100 : 20, today);
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
  return res
    .filter((r): r is PromiseFulfilledResult<RankRow> => r.status === "fulfilled")
    .map((r) => r.value);
}

/** 进入自选页时预热今日热榜数据（后台静默，失败无感）；60s 节流防切页刷量 */
export function preloadRank(mode: "today" | "all" = "today"): void {
  const now = Date.now();
  if (rankCache[mode]?.length && now - (rankFetchedAt[mode] || 0) < 60000) return;
  rankFetchedAt[mode] = now;
  loadRankRows(mode)
    .then((rows) => {
      if (rows.length) {
        rankCache[mode] = rows;
        staleSet("rank:" + mode, rows);
      }
    })
    .catch(() => {
      /* 预加载失败无感，面板打开时组件照常拉取 */
    });
}
</script>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import { fmtPrice, fmtPct, trendCls } from "@/utils/format";
import { addWatch, removeWatch, isWatched } from "@/store/watchlist";

const props = defineProps<{ mode: "today" | "all" }>();
const emit = defineEmits<{ (e: "open-market", payload: { code: string; market: string }): void }>();

const rows = ref<RankRow[]>(staleGet<RankRow[]>("rank:" + props.mode) ?? []);
const loading = ref(false);

async function load() {
  loading.value = true;
  // 预加载缓存命中：直接上屏（打开面板零等待），随后仍后台刷新最新数据
  const cached = rankCache[props.mode];
  if (cached?.length) rows.value = cached;
  const fresh = await loadRankRows(props.mode);
  // 刷新容错：热度接口读失败会伪装成空数组——已有榜单时保留旧榜单（允许数据延迟），
  // 首次为空正常显示「暂无数据」
  if (!fresh.length && rows.value.length) {
    loading.value = false;
    return;
  }
  rows.value = fresh;
  rankCache[props.mode] = fresh;
  // 成功加载后保留到 stale 缓存（按 mode 分键）：切换 tab / 实例重建先展示旧榜单再覆盖
  staleSet("rank:" + props.mode, rows.value);
  loading.value = false;
}

onMounted(load);
// 切换榜单模式：优先预加载缓存，其次 stale 缓存（无则清空，避免旧 mode 数据串台），再拉新数据
watch(
  () => props.mode,
  (m) => {
    const cached = rankCache[m];
    rows.value = cached?.length ? cached : staleGet<RankRow[]>("rank:" + m) ?? [];
    load();
  }
);

function rankCls(i: number): string {
  if (i === 0) return "gold";
  if (i === 1) return "silver";
  if (i === 2) return "bronze";
  return "";
}

// 缺失 → flat 灰色（"--" 占位）；真实 0 涨跌 → 无涨跌色（回落 .st-num 的 --text 黑）；
// 否则按 chg 涨跌着色。与自选股表(pctCls)共用同一套「占位符灰、0 中性、有值才分涨跌」逻辑。
function clsOf(r: RankRow): string {
  if (r.price == null || r.pct == null) return "flat";
  const t = trendCls(r.chg);
  return t === "flat" ? "" : t;
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
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12rpx 0 0;
}
.rk-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18rpx;
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
  font-size: var(--font-sm);
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
  height: 72rpx;
  border-bottom: 1rpx solid var(--border);
}
/* 表头统一规范（与自选表头 .th 共用同一套 token）：font-md(28rpx) / 400 / --text-2
   —— 字号比正文大一号、颜色用次级文本(淡一点)，全站表格表头保持一致 */
.rk-thead .rh {
  font-size: var(--font-md);
  font-weight: 400;
  color: var(--text-2);
}
/* 表头排名列：仅做居中；显式声明字号/字重/颜色与表头统一，
   避免被数据行 .rh.rank 的奖牌高亮(30rpx/800/彩色) 样式污染表头 */
.rk-thead .rh.rank {
  font-size: var(--font-md);
  font-weight: 400;
  color: var(--text-2);
  text-align: center;
}
.rk-row {
  min-height: 96rpx;
}
.rk-row:active {
  background: var(--card-2);
}

.rh {
  flex: none;
  font-variant-numeric: tabular-nums;
}
/* 排名数字：参考主流热搜榜风格——前三名用红/橙/黄加粗高亮，其余用灰色 */
.rh.rank {
  width: 72rpx;
  font-size: var(--font-md);
  font-weight: 800;
  color: var(--text-3);
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.rh.rank.gold {
  color: #ff4d4f;
}
.rh.rank.silver {
  color: #ff9f43;
}
.rh.rank.bronze {
  color: #ffc53d;
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
  font-size: var(--font-md);
  font-weight: 400;
  color: var(--text);
  max-width: 220rpx;
  /* 截断属性已提升至全局 .truncate */
}
.rc {
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.rm {
  font-size: var(--font-xs);
  line-height: 1;
  padding: 2rpx 6rpx;
  border-radius: 6rpx;
  color: var(--text-2);
  background: var(--card-2);
  border: 1rpx solid var(--border);
}
.rcode {
  font-size: var(--font-xs);
  color: var(--text-3);
}
/* 热度：火焰图标(OutlineIcon fire 实心) + 热度值并排，值用火焰橙红保证清晰可读 */
.rh.heat {
  width: 150rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.heat-flame {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  line-height: 1;
}
.heat-num {
  font-size: var(--font-xs);
  font-weight: 400;
  color: #ff5722;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
/* 最新价 / 涨跌幅 / 热度 三列等宽(150rpx) */
.rh.price {
  width: 150rpx;
  text-align: right;
}
.rh.pct {
  width: 150rpx;
  text-align: right;
}
/* 表头星星占位：本列显示「自选」列名，与数据行星标列同宽对齐 */
.rh.star-head {
  flex: none;
  width: 64rpx;
  text-align: center;
}
/* 自选星星：列宽 64rpx 仅用于对齐表头「自选」；圆底尺寸/形状/背景与行情页 .qh-star 完全一致 */
.rh.star {
  flex: none;
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  background: transparent;
  transition: transform 0.12s ease;
}
/* 圆底：52x52 正圆，背景 --card-2，on 态 --primary-soft，与行情页 .qh-star 一致 */
.rh.star::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: var(--card-2);
  transition: background 0.15s ease;
  z-index: 0;
}
/* 图标在圆底之上 */
.rh.star > * {
  position: relative;
  z-index: 1;
}
.rh.star:active {
  transform: scale(0.9);
}
.rh.star.on::before {
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
/* 空态占位「暂无数据」统一采用次级文字色（--text-2），不喧宾夺主 */
.empty-title {
  color: var(--text-2);
}
</style>
