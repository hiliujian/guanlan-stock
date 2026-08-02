<template>
  <view class="market">
    <BackgroundFX />
    <view class="mk-sticky">
      <!-- 品牌标识 + 市场状态 -->
      <view class="brand-bar anim-fade-up">
        <view class="brand-left">
          <text class="brand-name anim-glow">观澜</text>
          <text class="brand-sub">智能股票分析</text>
        </view>
        <view class="mk-status" :class="status.cls">
          <view class="ms-dot" />
          <text class="ms-text">{{ status.label }}</text>
        </view>
      </view>

      <!-- 搜索条（与联想列表融为一体的面板） -->
      <view class="search-bar anim-fade-up">
        <view class="glass glass--lg search-unit" :class="{ open: suggestOpen }">
          <view class="search-box">
            <OutlineIcon type="search" :size="28" color="var(--text-2)" />
            <input
              class="si"
              v-model="code"
              type="text"
              placeholder="输入代码或名称"
              placeholder-class="ph"
              confirm-type="search"
              @input="onInput"
              @focus="onFocus"
              @blur="onBlur"
              @confirm="run()"
            />
            <OutlineIcon
              v-if="code"
              type="close"
              :size="28"
              color="var(--text-2)"
              @click="clearInput"
            />
            <button class="btn-primary go" :disabled="loading" @click="run()">
              <view v-if="loading" class="spinner" />
              <text class="go-t">{{ loading ? "分析中" : "搜索" }}</text>
            </button>
          </view>
          <!-- 联想面板：随搜索框向下展开，与搜索框同一张卡片，不挤占下方 UI -->
          <view v-if="suggestOpen" class="suggest">
            <view v-if="historyMode" class="sg-head">
              <text class="sg-head-t">最近搜索</text>
              <text class="sg-clear" @click.stop="clearHistory">清除</text>
            </view>
            <view
              v-for="(h, i) in suggestions"
              :key="h.code + i"
              class="sg-item"
              @click="chooseSuggestion(h)"
            >
              <OutlineIcon type="search" :size="26" color="var(--text-2)" class="sg-ic" />
              <view class="sg-main">
                <text class="sg-name">{{ h.name }}</text>
                <text class="sg-code">{{ h.code }}</text>
              </view>
              <text class="sg-tag">{{ historyMode ? "历史" : mktLabel(h.code) }}</text>
            </view>
          </view>
          </view>
      </view>
      </view><!-- /mk-sticky -->

      <view class="mk-body">
      <!-- 空态 -->
      <view v-if="!result" class="empty anim-fade-up">
        <OutlineIcon type="bars" :size="96" color="var(--border)" />
        <text class="empty-t">输入代码或名称，搜索查看智能分析</text>
      </view>

      <!-- 结果 -->
      <block v-else>
        <!-- 头部：名称 + 价格 + 自选星标（右上角） -->
        <view class="glass quote-head anim-fade-up">
          <view class="qh-star" :class="{ on: watched }" @click="toggleWatch">
            <OutlineIcon :type="watched ? 'star-filled' : 'star'" :size="52" :color="watched ? 'var(--up)' : 'var(--text-2)'" />
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
          </view>
        </view>

        <!-- 行情卡片：顺序与显隐由「设置 → 行情卡片」控制。
             周期切换轴已并入「行情图」卡片内部（见 KlineCard），不再单独悬浮于此。 -->
        <AnalysisCard
          v-for="(c, idx) in displayCards"
          :key="c.id"
          :title="cardTitle(c)"
          :icon="c.icon"
          :delay="idx * 60"
        >
          <component
            :is="CARD_RENDERERS[c.id].comp"
            v-bind="CARD_RENDERERS[c.id].props()"
          />
        </AnalysisCard>

      </block>

      <view class="risk-note">
        <OutlineIcon type="info" :size="22" color="var(--text-2)" />
        <text>以上分析仅供参考，不构成任何投资建议</text>
      </view>

      <view class="bottom-pad" />
      </view><!-- /mk-body -->
    </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onDeactivated, onUnmounted, watch, defineExpose, type Component } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import PriceText from "@/components/PriceText.vue";
import AnalysisCard from "@/components/AnalysisCard.vue";
import BackgroundFX from "@/components/BackgroundFX.vue";
import ReportView from "@/components/ReportView.vue";
import KlineCard from "@/components/KlineCard.vue";
import { fetchBundle, fetchSnapshot, fetchNews, searchStocks, localSuggest, type SearchHit, type QuoteBundle, type NewsItem } from "@/api/quote";
import { getMarketStatus } from "@/utils/marketStatus";
import {
  resolveSecid,
  marketFromSecid,
  codeFromSecid,
  type PeriodKey,
  type Market,
} from "@/utils/period";
import { analyze, type AnalysisResult } from "@/utils/analyzer";
import { scoreNews, filterNews, type NewsSignal } from "@/utils/newsSentiment";
import { visibleMarketCards, type MarketCardMeta, type CardId } from "@/utils/cardLayout";
import { addWatch, removeWatch, isWatched } from "@/store/watchlist";
import { useUser } from "@/store/user";
import { navState, openAuth } from "@/store/nav";

const code = ref("");
const period = ref<PeriodKey>("d");
const loading = ref(false); // 仅「搜索」动作使用，控制搜索按钮的「分析中」态（点击后拉数据+算指标+出报告）
const switching = ref(false); // 仅「切换周期」使用，避免误占用搜索按钮的加载态
const name = ref("");
const secid = ref("");
const preClose = ref(0);
const klines = ref<any[]>([]);
const trends = ref<any[]>([]);
// 预取缓存：一次联网拿全部分时/K线/资金流，切换周期直接读缓存，不再重复请求
const bundle = ref<QuoteBundle | null>(null);
const result = ref<AnalysisResult | null>(null);
// 关联资讯：与行情包并行获取；原始条目 + 量化情绪信号，注入 analyze 与 ReportView
const news = ref<NewsItem[]>([]);
const newsSig = ref<NewsSignal | null>(null);
// 星星状态直接读自选 store（响应式）：在自选页增删后，行情页（keep-alive 常驻）自动同步，
// 不再依赖 run()/switchPeriod() 里的手动赋值。
const watched = computed(() => isWatched(curCode.value, curMarket.value));
const errMsg = ref("");
const realtime = ref<{ price: number; preClose: number; open?: number; high?: number; low?: number; time?: string } | null>(null);

// 卡片渲染注册表：新增分析卡只需在此加一项（comp + props 工厂），
// MarketView 模板无需再写 v-if 分支，彻底解耦「卡片种类」与「渲染逻辑」。
const CARD_RENDERERS: Record<CardId, { comp: Component; props: () => Record<string, any> }> = {
  kline: {
    comp: KlineCard,
    props: () => ({
      period: period.value,
      trends: trends.value,
      preClose: preClose.value,
      klines: klines.value,
      height: 460,
      loading: switching.value,
      onPick: switchPeriod,
    }),
  },
  report: {
    comp: ReportView,
    props: () => ({
      result: result.value,
      news: news.value,
      newsSignal: newsSig.value,
    }),
  },
};

// 搜索联想
const suggestions = ref<SearchHit[]>([]);
const showSuggest = ref(false);
const chosen = ref<SearchHit | null>(null);
let suggestTimer: any = null;

// 联想面板是否展开（同一卡片向下展开，与搜索框融为一体）
const suggestOpen = computed(() => showSuggest.value && suggestions.value.length > 0);

// 最近搜索历史：本地存储、去重、上限 10、可清除；空输入聚焦时作为联想展示
const HISTORY_KEY = "stock_analyzer_search_history";
const history = ref<SearchHit[]>([]);
let historyMode = false;
function loadHistory() {
  try {
    history.value = uni.getStorageSync(HISTORY_KEY) || [];
  } catch {
    history.value = [];
  }
}
function pushHistory(h: SearchHit) {
  if (!h || !h.code) return;
  const next = [h, ...history.value.filter((x) => x.code !== h.code)].slice(0, 10);
  history.value = next;
  try {
    uni.setStorageSync(HISTORY_KEY, next);
  } catch {
    /* ignore */
  }
}
function clearHistory() {
  history.value = [];
  historyMode = false;
  try {
    uni.removeStorageSync(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}

// 由代码推断市场标签（仅用于展示，市场实际由 resolveSecid 规则识别）
function mktLabel(code: string): string {
  const c = (code || "").trim();
  if (/^\d{5}$/.test(c)) return "港股";
  if (/^6/.test(c)) return "沪A";
  if (/^[03]/.test(c)) return "深A";
  if (/^[48]/.test(c)) return "京A";
  return "股票";
}

const user = useUser();

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
    run(v.market || "auto", false); // 自动恢复历史查看，不弹窗
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
}

// 从预取缓存取数并设置当前周期视图（纯本地，瞬时切换，无联网等待）
function applyPeriod(p: PeriodKey) {
  const b = bundle.value;
  if (!b) return;
  if (p === "m") {
    // 分时视图：用日 K 做技术分析，分时序列单独展示
    klines.value = b.klines.d;
    trends.value = b.trends;
  } else {
    klines.value = b.klines[p] || [];
    trends.value = [];
  }
  // 资金流（主力净流入）按日期累计，与图表周期解耦：分时/日/周/月视图都展示同一组
  // 「近 5/10/20 日」数据。此前分时视图强行传 {} 会导致「主力净流入 暂无数据」，已移除。
  result.value = analyze(klines.value, b.flowMap, newsSig.value, b.klines.d);
}

// 全量刷新：重新预取并覆盖缓存（每 ~60s，交易时段），随后从新缓存刷新当前视图
async function refreshFull() {
  if (!secid.value) return;
  const b = await fetchBundle(secid.value);
  bundle.value = b;
  name.value = b.name || chosen.value?.name || name.value || curCode.value;
  preClose.value = b.preClose;
  realtime.value = b.realtime;
  // 关联资讯：先取行情拿到确切公司名，再按「代码 + 公司名」双关键词抓取，
  // 经「多维严格关联（代码/全称/核心词/简称）+ 时效（最近3天）」过滤后注入情绪量化。
  const n = await fetchNews(secid.value, name.value).catch(() => [] as NewsItem[]);
  const filtered = filterNews(n, { code: curCode.value, name: name.value });
  news.value = filtered;
  newsSig.value = scoreNews(filtered);
  applyPeriod(period.value);
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

// 行情图卡片标题固定为「行情图」；具体周期（分时/日K/周K…）由卡片内分段控件展示，
// 不再在标题与分段控件间重复表达。
function cardTitle(c: MarketCardMeta): string {
  if (c.id === "kline") return "行情图";
  return c.title;
}

// 可见卡片直接由「设置 → 行情卡片」驱动（行情图已合并 K线/分时/量/MACD/筹码于单图，
// 分析报告独立成卡），无需再折叠。周期切换轴已并入「行情图」卡片内部（见 KlineCard）。
const displayCards = visibleMarketCards;

async function run(forceMarket?: Market, userInitiated = true) {
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
    // 行情包与关联资讯：先取行情拿到确切公司名，再按「代码 + 公司名」双关键词抓取资讯，
    // 经量化情绪得分后注入 analyze，与量价/资金协同研判。
    const b = await fetchBundle(sid);
    bundle.value = b;
    // 优先用接口返回的名字；实时接口降级（push2 不可用）时名字为空，回退到
    // 联想选择/历史记录/代码，避免头部股票名变空白。
    name.value = b.name || chosen.value?.name || name.value || curCode.value;
    pushHistory({ code: curCode.value, name: name.value });
    preClose.value = b.preClose;
    realtime.value = b.realtime;
    // 关联资讯：先做「多维严格关联 + 时效（最近3天）」过滤，所有 scope 统一校验相关性，
    // 确保展示与情绪量化因子都只基于「对当前股票相关的近期资讯」；过滤后再计算情绪信号。
    const n = await fetchNews(sid, name.value).catch(() => [] as NewsItem[]);
    const filtered = filterNews(n, { code: curCode.value, name: name.value });
    news.value = filtered;
    newsSig.value = scoreNews(filtered);
    applyPeriod(period.value); // 从缓存装配当前周期，切换无需再等联网
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
  if (p === period.value || switching.value) return;
  period.value = p;
  if (!secid.value) return;
  switching.value = true;
  try {
    if (!bundle.value) {
      // 极端情况（缓存未建立），回退到单次预取（内部调用，不弹窗）
      await run(undefined, false);
      return;
    }
    applyPeriod(p); // 纯本地，瞬时切换，无联网等待
    saveLastViewed();
  } catch (e: any) {
    uni.showToast({ title: e?.message || "切换失败", icon: "none" });
  } finally {
    switching.value = false;
  }
}

async function toggleWatch() {
  if (!result.value) return;
  // 自选功能需登录：未登录游客直接跳转登录页（与自选页门禁一致），避免「加了却看不到」
  if (!user.loggedIn && user.supabaseEnabled) {
    openAuth("login");
    return;
  }
  if (watched.value) {
    await removeWatch(curCode.value, curMarket.value);
    uni.showToast({ title: "已移除自选", icon: "none" });
  } else {
    const r = await addWatch({
      code: curCode.value,
      market: curMarket.value,
      name: name.value,
      note: "",
    });
    if (r.ok) {
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
    // 空输入：展示最近搜索历史
    historyMode = history.value.length > 0;
    suggestions.value = history.value;
    showSuggest.value = historyMode;
    return;
  }
  historyMode = false;
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
  if (!code.value.trim() && history.value.length) {
    historyMode = true;
    suggestions.value = history.value;
    showSuggest.value = true;
  } else if (suggestions.value.length) {
    showSuggest.value = true;
  }
}
function onBlur() {
  // 延迟收起，保证点击建议能被先处理
  setTimeout(() => (showSuggest.value = false), 200);
}
function chooseSuggestion(h: SearchHit) {
  chosen.value = h;
  code.value = h.code;
  historyMode = false;
  showSuggest.value = false;
  suggestions.value = [];
  pushHistory(h);
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
  loadHistory();
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

// 暴露给页面级下拉刷新（index.vue onPullDownRefresh 路由到此）：全量刷新图表与资讯
defineExpose({ refresh: () => refreshFull() });
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
  background: var(--sticky-bg);
  backdrop-filter: blur(16rpx) saturate(140%);
  -webkit-backdrop-filter: blur(16rpx) saturate(140%);
  padding: 12rpx 18rpx 8rpx;
  box-shadow: var(--sticky-shadow);
}
.mk-body {
  padding: 18rpx 18rpx 0;
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
  color: var(--text-2);
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
  color: var(--text-2);
}
.search-bar {
  position: relative;
  z-index: 20;
  margin-bottom: 0;
}
/* 搜索单元：搜索框 + 联想面板 共用同一张卡片，向下展开即「融为一体」 */
.search-unit {
  position: relative;
  /* 玻璃拟态（含 28rpx 圆角）由全局 .glass.glass--lg 提供 */
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
  color: var(--text-2);
}
/* 联想面板：随搜索框向下展开，同一卡片底色，不挤占下方 UI（绝对浮层） */
.suggest {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--suggest-bg);
  border-radius: 0 0 28rpx 28rpx;
  box-shadow: var(--suggest-shadow);
  backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  overflow: hidden;
  z-index: 60;
  max-height: 540rpx;
  overflow-y: auto;
  padding: 12rpx;
}
/* 最近搜索头部：标题 + 清除，轻量不抢戏 */
.sg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 20rpx 14rpx;
}
.sg-head-t {
  font-size: 22rpx;
  color: var(--text-3);
  font-weight: 600;
  letter-spacing: 1rpx;
}
.sg-clear {
  font-size: 22rpx;
  color: var(--text-2);
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
}
.sg-clear:active {
  background: var(--card-2);
}
.sg-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 18rpx 20rpx;
  margin-bottom: 10rpx;
  background: var(--card-2);
  border-radius: var(--radius-sm);
  transition: background 0.15s ease, transform 0.12s ease;
}
.sg-item:last-child {
  margin-bottom: 0;
}
.sg-item:active {
  background: var(--card);
  transform: scale(0.985);
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
  color: var(--text-2);
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
  /* 触摸目标 ≥44px；高度用 min-height 自适应内容，避免固定 rpx 在窄屏缩水 */
  min-height: 44px;
  padding: 0 30rpx;
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
/* 搜索按钮：覆盖全局 .btn-primary 的药丸(999rpx)/88rpx，恢复长扁低位样式。
   避免高按钮把整行搜索框撑高；min-height:0 抵消 UA 默认最小高度跨浏览器膨胀 */
.btn-primary.go {
  min-height: 0;
  height: 60rpx;
  line-height: 60rpx;
  padding: 0 26rpx;
  border-radius: 12rpx;
  font-size: 26rpx;
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
.quote-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 玻璃拟态由全局 .glass 提供，此处仅保留卡片专属内边距 */
  /* 右侧预留更大星标空间，避免价格与星标重叠 */
  padding: 18rpx 96rpx 18rpx 18rpx;
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
  color: var(--text-2);
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
/* 自选星标：相对卡片垂直居中（右侧），纯图标、无背景色块；
   加入自选时仅改变星星图标颜色（灰 -> 绿），不渲染背景 */
.qh-star {
  position: absolute;
  top: 50%;
  right: 16rpx;
  transform: translateY(-50%);
  /* 触摸目标 ≥44px（固定 px 保证任意屏不缩水），图标在圈内居中 */
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: transparent;
  transition: transform 0.12s ease;
}
.qh-star:active {
  transform: translateY(-50%) scale(0.9);
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

.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  border-radius: 999rpx;
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
  color: var(--text-2);
  line-height: 1.5;
  text-align: center;
}
</style>
