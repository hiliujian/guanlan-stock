<template>
  <view class="market">
    <view class="mk-sticky">
      <!-- 品牌标识 + 市场状态 -->
      <view class="brand-bar anim-fade-up">
        <view class="brand-left">
          <text class="brand-name">观澜</text>
          <text class="brand-sub">智能股票分析</text>
        </view>
        <view class="mk-status" :class="status.cls">
          <view class="ms-dot" />
          <text class="ms-text">{{ status.label }}</text>
        </view>
      </view>

      <!-- 搜索条（与联想列表融为一体的面板） -->
      <view class="search-bar anim-fade-up">
        <view class="search-unit" :class="{ open: suggestOpen }">
          <view class="search-box">
            <OutlineIcon type="search" :size="28" color="var(--text-3)" />
            <input
              class="si"
              v-model="code"
              type="text"
              placeholder="输入代码或名称"
              placeholder-class="ph"
              @input="onInput"
              @focus="onFocus"
              @blur="onBlur"
              @confirm="run()"
            />
            <OutlineIcon
              v-if="code"
              type="close"
              :size="28"
              color="var(--text-3)"
              @click="clearInput"
            />
            <button class="btn-primary go" :disabled="loading" @click="run()">
              <view v-if="loading" class="spinner" />
              <text class="go-t">{{ loading ? "搜索中" : "搜索" }}</text>
            </button>
          </view>
          <!-- 联想面板：随搜索框向下展开，与搜索框同一张卡片，不挤占下方 UI -->
          <view v-if="suggestOpen" class="suggest">
            <view
              v-for="(h, i) in suggestions"
              :key="h.code + i"
              class="sg-item"
              @click="chooseSuggestion(h)"
            >
              <OutlineIcon type="search" :size="26" color="var(--text-3)" class="sg-ic" />
              <view class="sg-main">
                <text class="sg-name">{{ h.name }}</text>
                <text class="sg-code">{{ h.code }}</text>
              </view>
              <text class="sg-tag">{{ mktLabel(h.code) }}</text>
            </view>
          </view>
          </view>
      </view>
      </view><!-- /mk-sticky -->

      <view class="mk-body">
      <!-- 空态 -->
      <view v-if="!result" class="empty anim-fade-up">
        <OutlineIcon type="bars" :size="120" color="var(--border)" />
        <text class="empty-t">输入代码或名称，搜索查看智能分析</text>
        <text class="empty-s">支持 A股 / 港股，输入代码或名称即可自动识别市场并分析</text>
      </view>

      <!-- 结果 -->
      <block v-else>
        <!-- 头部：名称 + 价格 + 自选星标（右上角） -->
        <view class="quote-head anim-fade-up">
          <view class="qh-star" :class="{ on: watched }" @click="toggleWatch">
            <OutlineIcon :type="watched ? 'star-filled' : 'star'" :size="52" :color="watched ? 'var(--up)' : 'var(--text-3)'" />
          </view>
          <view class="qh-left">
            <text class="qh-name">{{ name }}</text>
            <view class="qh-code-row">
              <view class="mkt-tag">{{ marketChar }}</view>
              <text class="qh-code">{{ rawCode }}</text>
            </view>
          </view>
          <view class="qh-right">
            <PriceText :value="dispPrice" :prev="preClose" :size="44" :weight="700" />
            <view class="qh-sub">
              <PriceText :value="chg" :size="24" :prefix="true" />
              <text class="qh-pct" :style="{ color: pctColor }">{{ pctText }}</text>
            </view>
            <text class="qh-live" :class="{ live: status.open }">{{ liveText }}</text>
          </view>
        </view>

        <!-- 周期切换（行情头部下方，随内容一起滚动；交易时段自动刷新） -->
        <view v-if="result" class="period-seg anim-fade-up">
          <text
            v-for="p in periodOrder"
            :key="p"
            :class="['ps', period === p ? 'active' : '']"
            @click="switchPeriod(p)"
            >{{ periodMeta[p].label }}</text
          >
        </view>

        <!-- 蜡烛 + 均线 -->
        <AnalysisCard title="K线 / 均线" icon="bars" :delay="0">
          <KlineChart :opts="candleOpts" :height="320" />
        </AnalysisCard>

        <!-- 成交量 + 主力净流入 -->
        <AnalysisCard title="成交量 / 主力净流入" icon="color" :delay="60">
          <KlineChart :opts="volOpts" :height="220" />
        </AnalysisCard>

        <!-- 分时 -->
        <AnalysisCard v-if="period === 'm'" title="分时走势" icon="pulldown" :delay="60">
          <KlineChart v-if="trends.length" :opts="trendOpts" :height="260" />
          <view v-else class="hint">分时数据暂不可用（不影响其他分析）</view>
        </AnalysisCard>

        <!-- MACD -->
        <AnalysisCard title="MACD" icon="loop" :delay="120">
          <KlineChart :opts="macdOpts" :height="200" />
        </AnalysisCard>

        <!-- 筹码分布 -->
        <AnalysisCard title="筹码分布" icon="medal" :delay="180">
          <KlineChart :opts="chipOpts" :height="240" />
        </AnalysisCard>

        <!-- 白话报告 -->
        <AnalysisCard title="分析报告" icon="chatbubble" :delay="240">
          <ReportView :result="result" />
        </AnalysisCard>

      </block>

      <view class="risk-note">
        <OutlineIcon type="info" :size="22" color="var(--text-3)" />
        <text>以上分析仅供参考，不构成任何投资建议</text>
      </view>

      <view class="bottom-pad" />
      </view><!-- /mk-body -->
    </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onDeactivated, onUnmounted, watch } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import PriceText from "@/components/PriceText.vue";
import AnalysisCard from "@/components/AnalysisCard.vue";
import KlineChart from "@/components/KlineChart.vue";
import ReportView from "@/components/ReportView.vue";
import { fetchQuote, fetchTrend, fetchSnapshot, searchStocks, localSuggest, type SearchHit } from "@/api/quote";
import { getMarketStatus } from "@/utils/marketStatus";
import {
  resolveSecid,
  PERIODS,
  PERIOD_ORDER,
  marketFromSecid,
  codeFromSecid,
  type PeriodKey,
  type Market,
} from "@/utils/period";
import { analyze, computeChip, type AnalysisResult } from "@/utils/analyzer";
import { buildCandleOpts, buildVolOpts, buildMacdOpts, buildTrendOpts, buildChipOpts } from "@/utils/chart";
import { addWatch, removeWatch, isWatched, useWatchlist } from "@/store/watchlist";
import { useUser } from "@/store/user";
import { navState } from "@/store/nav";

const periodOrder = PERIOD_ORDER;
const periodMeta = PERIODS;

const code = ref("");
const period = ref<PeriodKey>("d");
const loading = ref(false);
const name = ref("");
const secid = ref("");
const preClose = ref(0);
const klines = ref<any[]>([]);
const flowMap = ref<Record<string, number>>({});
const trends = ref<any[]>([]);
const result = ref<AnalysisResult | null>(null);
const watched = ref(false);
const errMsg = ref("");
const realtime = ref<{ price: number; preClose: number; open?: number; high?: number; low?: number; time?: string } | null>(null);

// 实时刷新指示：最后更新时间（让用户直观看到行情在不断刷新）
const lastUpdated = ref("");
function nowHMS(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 搜索联想
const suggestions = ref<SearchHit[]>([]);
const showSuggest = ref(false);
const chosen = ref<SearchHit | null>(null);
let suggestTimer: any = null;

// 联想面板是否展开（同一卡片向下展开，与搜索框融为一体）
const suggestOpen = computed(() => showSuggest.value && suggestions.value.length > 0);

// 由代码推断市场标签（仅用于展示，市场实际由 resolveSecid 规则识别）
function mktLabel(code: string): string {
  const c = (code || "").trim();
  if (/^\d{5}$/.test(c)) return "港股";
  if (/^6/.test(c)) return "沪A";
  if (/^[03]/.test(c)) return "深A";
  if (/^[48]/.test(c)) return "京A";
  return "股票";
}

const watchState = useWatchlist();
useUser();

// 头部展示「实时价」（东方财富实时行情），未拿到实时价时回退到分析用的收盘价
const dispPrice = computed(() =>
  realtime.value?.price ?? (result.value ? result.value.last.close : 0)
);
const chg = computed(() => dispPrice.value - preClose.value);
// 涨跌幅格式化为两位小数，避免出现 0.07575757575757576% 这种超长小数
const pctText = computed(() =>
  (preClose.value ? (chg.value / preClose.value) * 100 : 0).toFixed(2) + "%"
);
const pctColor = computed(() => (chg.value >= 0 ? "var(--up)" : "var(--down)"));

// 由当前 secid 推出自选股所需的 code / market（不再需要用户手动选择市场）
const curCode = computed(() => (secid.value ? codeFromSecid(secid.value) : code.value));
const curMarket = computed<Market>(() =>
  secid.value ? marketFromSecid(secid.value) : "auto"
);

// 市场徽标（沪/深/港/北）与纯代码：徽标样式对齐自选股 .mkt-tag，不并入代码文本
const MKT_CHAR: Record<string, string> = { sh: "沪", sz: "深", bj: "北", hk: "港", auto: "" };
const marketChar = computed(() => {
  if (!secid.value) return "";
  return MKT_CHAR[marketFromSecid(secid.value)] || "股";
});
const rawCode = computed(() => (secid.value ? codeFromSecid(secid.value) : ""));

// ---------------- 市场状态 + 实时刷新 ----------------
const status = ref(getMarketStatus(curMarket.value));
const refreshing = ref(false);
let tickTimer: any = null;
let tickCount = 0;

function updateStatus() {
  status.value = getMarketStatus(curMarket.value);
}

// 实时刷新指示文案（让用户直观看到行情在持续刷新）
const liveText = computed(() => {
  if (refreshing.value) return "刷新中…";
  if (lastUpdated.value) return "实时 · " + lastUpdated.value;
  return status.value.open ? "实时行情 · 交易中" : "非交易时段";
});

// 自动保存 / 恢复「最近查看」的股票（localStorage，冷启动也能恢复，
// 配合 <keep-alive> 实现切到自选/我的再返回时数据不丢失）
const LAST_KEY = "guanlan:lastStock";
function saveLastViewed() {
  try {
    uni.setStorageSync(LAST_KEY, {
      secid: secid.value,
      code: curCode.value,
      market: curMarket.value,
      name: name.value,
      period: period.value,
    });
  } catch {
    /* 忽略存储异常 */
  }
}
function loadLastViewed(): boolean {
  try {
    const v = uni.getStorageSync(LAST_KEY);
    if (!v || !v.code) return false;
    period.value = v.period || "d";
    code.value = v.code;
    chosen.value = { code: v.code, name: v.name || "" };
    run(v.market || "auto");
    return true;
  } catch {
    return false;
  }
}

// 轻量刷新：仅更新头部实时价/昨收（每 5s，交易时段）
async function refreshLight() {
  if (!secid.value) return;
  const snap = await fetchSnapshot(secid.value);
  realtime.value = {
    price: snap.price,
    preClose: snap.preClose,
    open: snap.open,
    high: snap.high,
    low: snap.low,
    time: snap.time,
  };
  preClose.value = snap.preClose;
  lastUpdated.value = nowHMS();
}

// 全量刷新：重抓 K线/资金流/分时并重新分析（每 ~60s，交易时段）
async function refreshFull() {
  if (!secid.value) return;
  const q = await fetchQuote(secid.value, period.value);
  klines.value = q.klines;
  flowMap.value = q.flowMap;
  preClose.value = q.preClose;
  realtime.value = q.realtime;
  if (period.value === "m") {
    const t = await fetchTrend(secid.value);
    trends.value = t.trends;
  } else {
    trends.value = [];
  }
  result.value = analyze(q.klines, q.flowMap);
}

// 统一心跳：每 5s 刷新一次状态标识；交易时段内刷新行情（轻量为主，周期性全量）
async function onTick() {
  updateStatus();
  if (!secid.value || loading.value || refreshing.value) return;
  if (!status.value.open) return; // 非交易时段不拉取，避免无谓请求
  refreshing.value = true;
  try {
    await refreshLight();
    tickCount++;
    if (tickCount % 12 === 0) await refreshFull(); // ~60s 全量刷新图表
  } catch {
    /* 忽略单次刷新失败，下一拍重试 */
  } finally {
    refreshing.value = false;
  }
}

function startTimers() {
  updateStatus();
  if (tickTimer) return;
  tickTimer = setInterval(onTick, 5000);
}
function stopTimers() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

const candleOpts = computed(() => (result.value ? buildCandleOpts(klines.value, result.value) : null));
const volOpts = computed(() =>
  result.value ? buildVolOpts(klines.value, flowMap.value, period.value !== "m") : null
);
const macdOpts = computed(() => (result.value ? buildMacdOpts(klines.value) : null));
const trendOpts = computed(() => (trends.value.length ? buildTrendOpts(trends.value) : null));
const chipOpts = computed(() => (klines.value.length ? buildChipOpts(computeChip(klines.value)) : null));

async function run(forceMarket?: Market) {
  errMsg.value = "";
  const kw = code.value.trim();
  if (!kw) {
    uni.showToast({ title: "请输入股票代码或名称", icon: "none" });
    return;
  }
  loading.value = true;
  try {
    let sid = "";
    if (chosen.value) {
      // 用户从联想里点选了某只，直接用其代码自动识别市场
      sid = resolveSecid(chosen.value.code, "auto");
      code.value = chosen.value.code;
    } else if (forceMarket && forceMarket !== "auto") {
      // 从「自选」跳转过来，沿用之前保存的市场
      sid = resolveSecid(kw, forceMarket);
    } else {
      const digits = kw.replace(/[^0-9]/g, "");
      if (digits.length >= 3) {
        // 纯数字代码：规则自动识别市场（沪/深/港/京），无需手动选择
        sid = resolveSecid(kw, "auto");
      } else {
        // 可能是名称/缩写：调搜索接口解析，失败则提示
        const hits = await searchStocks(kw);
        if (hits.length) {
          chosen.value = hits[0];
          sid = resolveSecid(hits[0].code, "auto");
          code.value = hits[0].code;
        } else {
          throw new Error("未找到该股票，请检查代码或名称");
        }
      }
    }
    secid.value = sid;
    const q = await fetchQuote(sid, period.value);
    klines.value = q.klines;
    name.value = q.name;
    flowMap.value = q.flowMap;
    preClose.value = q.preClose;
    realtime.value = q.realtime;
    if (period.value === "m") {
      const t = await fetchTrend(secid.value);
      trends.value = t.trends;
    } else {
      trends.value = [];
    }
    result.value = analyze(q.klines, q.flowMap);
    watched.value = isWatched(curCode.value, curMarket.value);
    saveLastViewed();
  } catch (e: any) {
    uni.showToast({ title: e?.message || "请求失败", icon: "none" });
  } finally {
    loading.value = false;
    suggestions.value = [];
    showSuggest.value = false;
  }
}

async function switchPeriod(p: PeriodKey) {
  if (p === period.value) return;
  period.value = p;
  if (!secid.value) return;
  loading.value = true;
  try {
    const q = await fetchQuote(secid.value, p);
    klines.value = q.klines;
    flowMap.value = q.flowMap;
    realtime.value = q.realtime;
    if (p === "m") {
      const t = await fetchTrend(secid.value);
      trends.value = t.trends;
    } else {
      trends.value = [];
    }
    result.value = analyze(q.klines, q.flowMap);
    watched.value = isWatched(curCode.value, curMarket.value);
    saveLastViewed();
  } catch (e: any) {
    uni.showToast({ title: e?.message || "切换失败", icon: "none" });
  } finally {
    loading.value = false;
  }
}

async function toggleWatch() {
  if (!result.value) return;
  if (watched.value) {
    await removeWatch(curCode.value, curMarket.value);
    watched.value = false;
    uni.showToast({ title: "已移除自选", icon: "none" });
  } else {
    const r = await addWatch({
      code: curCode.value,
      market: curMarket.value,
      name: name.value,
      note: "",
    });
    if (r.ok) {
      watched.value = true;
      uni.showToast({ title: "已加入自选", icon: "success" });
    } else {
      uni.showToast({ title: r.error || "加入失败", icon: "none" });
    }
  }
}

// 搜索联想（名称/代码；网络不可用时不显示）
function onInput() {
  chosen.value = null;
  showSuggest.value = false;
  const kw = code.value.trim();
  if (suggestTimer) clearTimeout(suggestTimer);
  if (!kw) {
    suggestions.value = [];
    return;
  }
  // 本地池即时出，保证输入马上有提示列表（不被网络超时拖住）
  const local = localSuggest(kw);
  suggestions.value = local;
  showSuggest.value = local.length > 0;
  suggestTimer = setTimeout(async () => {
    const net = await searchStocks(kw).catch(() => []);
    // 输入已变则丢弃这次过期结果
    if (code.value.trim() !== kw) return;
    const seen = new Set<string>();
    const merged: SearchHit[] = [];
    for (const h of [...net, ...local]) {
      if (h.code && !seen.has(h.code)) {
        seen.add(h.code);
        merged.push(h);
      }
      if (merged.length >= 8) break;
    }
    suggestions.value = merged;
    showSuggest.value = merged.length > 0;
  }, 300);
}
function onFocus() {
  if (suggestions.value.length) showSuggest.value = true;
}
function onBlur() {
  // 延迟收起，保证点击建议能被先处理
  setTimeout(() => (showSuggest.value = false), 200);
}
function chooseSuggestion(h: SearchHit) {
  chosen.value = h;
  code.value = h.code;
  showSuggest.value = false;
  suggestions.value = [];
  run();
}
function clearInput() {
  code.value = "";
  chosen.value = null;
  suggestions.value = [];
  showSuggest.value = false;
}

// 从「自选」页点击某只股票跳转过来时，自动带入代码开始分析
watch(
  () => navState.pendingCode,
  (c) => {
    if (c) {
      code.value = c;
      chosen.value = null;
      run(navState.pendingMarket);
    }
  }
);

onMounted(() => {
  // 仅当从「自选」页跳转过来（带 pendingCode）时才自动搜索；
  // 否则若本地有最近查看记录则恢复该股票，保证切回行情页不丢数据、冷启动也能恢复。
  if (navState.pendingCode) {
    code.value = navState.pendingCode;
    chosen.value = null;
    run(navState.pendingMarket);
  } else if (!result.value) {
    loadLastViewed();
  }
  // 关键修复：启动实时刷新心跳。onActivated 在 transition+keep-alive 包裹下
  // 首次激活不一定可靠触发，故在 onMounted 也启动（startTimers 幂等，不会重复建定时器）。
  startTimers();
});

// <keep-alive> 缓存：切到自选/我的再返回时组件不销毁，状态天然保留；
// 仅在「行情」为当前可见页时跑心跳（刷新行情 + 状态标识），离开即暂停，省请求。
onActivated(() => {
  startTimers();
});
onDeactivated(() => {
  stopTimers();
});
onUnmounted(() => {
  stopTimers();
});
</script>

<style scoped>
.market {
  padding: 0;
}
/* 顶部：品牌 + 搜索 + 周期切换 固定常驻，向下滚动时不被卷走 */
.mk-sticky {
  position: sticky;
  top: 0;
  z-index: 30;
  background: var(--bg);
  padding: 12rpx 18rpx 8rpx;
  box-shadow: 0 6rpx 16rpx rgba(0, 0, 0, 0.05);
}
.mk-body {
  padding: 0 18rpx;
}
/* 品牌标识：APP 统一名称「观澜」，置于行情首页顶部 */
.brand-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14rpx;
  padding: 6rpx 8rpx 14rpx;
}
.brand-left {
  display: flex;
  align-items: baseline;
  gap: 14rpx;
  min-width: 0;
}
/* 市场状态标识：开盘中(绿) / 午间休市(橙) / 未开盘·已收市·周末休市(灰) */
.mk-status {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
  flex: none;
}
.ms-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: currentColor;
}
.ms-text {
  color: inherit;
}
.mk-status.ms-open {
  color: var(--primary);
  background: rgba(7, 193, 96, 0.1);
}
.mk-status.ms-lunch {
  color: #fa9e0d;
  background: rgba(250, 158, 13, 0.12);
}
.mk-status.ms-closed {
  color: var(--text-3);
  background: var(--card-2);
}
.brand-name {
  font-size: 42rpx;
  font-weight: 800;
  color: var(--primary);
  letter-spacing: 3rpx;
}
.brand-sub {
  font-size: 22rpx;
  color: var(--text-3);
}
.search-bar {
  position: relative;
  z-index: 20;
  margin-bottom: 18rpx;
}
/* 搜索单元：搜索框 + 联想面板 共用同一张卡片，向下展开即「融为一体」 */
.search-unit {
  position: relative;
  background: var(--card);
  border-radius: 28rpx;
  box-shadow: var(--shadow);
  transition: box-shadow 0.2s ease;
  overflow: visible;
}
/* 展开联想时：顶部圆角保留、底部直角，与下方面板无缝衔接 + 绿色高亮 */
.search-unit.open {
  border-radius: 28rpx 28rpx 0 0;
  box-shadow: var(--shadow), 0 0 0 4rpx rgba(7, 193, 96, 0.12);
}
.search-box {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 12rpx 12rpx 26rpx;
  background: transparent;
}
.si {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
}
.ph {
  color: var(--text-3);
}
/* 联想面板：随搜索框向下展开，同一卡片底色，不挤占下方 UI（绝对浮层） */
.suggest {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--card);
  border-radius: 0 0 28rpx 28rpx;
  border-top: 1rpx solid var(--border);
  box-shadow: 0 14rpx 30rpx rgba(0, 0, 0, 0.14);
  overflow: hidden;
  z-index: 60;
  max-height: 540rpx;
  overflow-y: auto;
}
.sg-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 26rpx;
  border-bottom: 1rpx solid var(--border);
}
.sg-item:last-child {
  border-bottom: none;
  border-radius: 0 0 28rpx 28rpx;
}
.sg-item:active {
  background: var(--card-2);
}
.sg-ic {
  flex: none;
}
.sg-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}
.sg-name {
  font-size: 28rpx;
  color: var(--text);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sg-code {
  font-size: 22rpx;
  color: var(--text-3);
}
.sg-tag {
  flex: none;
  font-size: 20rpx;
  color: var(--primary);
  background: rgba(7, 193, 96, 0.1);
  border-radius: 8rpx;
  padding: 4rpx 12rpx;
}
.go {
  flex: 0 0 auto;
  height: 64rpx;
  line-height: 64rpx;
  padding: 0 34rpx;
  font-size: 27rpx;
  font-weight: 600;
  margin-left: 6rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  box-shadow: 0 4rpx 14rpx rgba(7, 193, 96, 0.28);
  transition: transform 0.12s ease, background 0.2s ease, box-shadow 0.2s ease;
}
/* 点击/按压态：轻微回弹 + 加深绿，给出明确反馈 */
.go:active:not(:disabled) {
  transform: scale(0.93);
  background: var(--primary-dark);
  box-shadow: 0 2rpx 8rpx rgba(6, 164, 84, 0.34);
}
/* 加载中：保持绿色 + 转圈，不灰显、不崩溃。
   关键：仅改变背景色（加深绿），阴影与「搜索」常态保持一致，避免样式错位 */
.go:disabled,
.go[disabled] {
  opacity: 1;
  background: var(--primary-dark);
  box-shadow: 0 4rpx 14rpx rgba(7, 193, 96, 0.28);
}
.go-t {
  color: #fff;
}
.spinner {
  width: 26rpx;
  height: 26rpx;
  border: 3rpx solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex: none;
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
}

.quote-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  /* 右侧预留更大星标空间，避免价格与星标重叠 */
  padding: 18rpx 100rpx 18rpx 22rpx;
  margin-bottom: 14rpx;
}
.qh-name {
  font-size: 34rpx;
  font-weight: 700;
}
.qh-code-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-top: 4rpx;
}
.qh-code {
  font-size: 22rpx;
  color: var(--text-3);
}
/* 市场徽标：沪 / 深 / 港 / 北，对齐自选股 .mkt-tag 的经典简洁样式 */
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
.qh-live {
  display: inline-block;
  margin-top: 6rpx;
  font-size: 20rpx;
  color: var(--text-3);
}
.qh-live.live {
  color: var(--primary);
}
/* 自选星标：名称卡片右上角，纯图标、无背景色块；
   加入自选时仅改变星星图标颜色（灰 -> 绿），不渲染背景 */
.qh-star {
  position: absolute;
  top: 14rpx;
  right: 16rpx;
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: transparent;
  transition: transform 0.12s ease;
}
.qh-star:active {
  transform: scale(0.9);
}
.qh-right {
  text-align: right;
}
.qh-sub {
  display: flex;
  align-items: center;
  gap: 12rpx;
  justify-content: flex-end;
  margin-top: 4rpx;
}
.qh-pct {
  font-size: 24rpx;
  font-weight: 600;
}

.period-seg {
  display: flex;
  gap: 8rpx;
  background: var(--card);
  border-radius: 999rpx;
  padding: 6rpx;
  margin-bottom: 14rpx;
  box-shadow: var(--shadow);
}
.ps {
  flex: 1;
  text-align: center;
  padding: 11rpx 0;
  font-size: 26rpx;
  color: var(--text-2);
  border-radius: 999rpx;
  transition: all 0.2s ease;
}
.ps.active {
  background: var(--primary);
  color: #fff;
  font-weight: 600;
}

.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  border-radius: 999rpx;
}
/* uni-app 默认给 button 加了一个方角 ::after 描边，会戳在圆角外，
   表现为「背景超出圆角」。统一去掉，保证按钮是干净的胶囊形。 */
.btn-primary::after {
  border: none;
}
.btn-t {
  color: #fff;
}
.is-added {
  background: var(--card-2);
  border: 1rpx solid var(--border);
}
.is-added .btn-t {
  color: var(--text-2);
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
.hint {
  padding: 40rpx 0;
  text-align: center;
  font-size: 24rpx;
  color: var(--text-3);
}
</style>
