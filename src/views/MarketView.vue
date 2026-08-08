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
        <view class="glass glass--lg search-unit" :class="{ open: suggestOpen, focused }">
          <view class="search-box">
            <view class="si-field">
              <OutlineIcon type="search" :size="26" color="var(--text-2)" />
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
              <view v-if="code" class="si-clear" role="button" aria-label="清除" @click="clearInput">
                <OutlineIcon type="close" :size="22" color="var(--text-2)" />
              </view>
            </view>
            <button class="btn-primary go" :disabled="loading" @click="run()">
              <view v-if="loading" class="spinner" />
              <text>{{ loading ? "分析中" : "搜索" }}</text>
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
                <text class="sg-name truncate">{{ h.name }}</text>
                <text class="sg-code">{{ h.code }}</text>
              </view>
              <text class="sg-tag">{{ historyMode ? "历史" : mktLabel(h.code) }}</text>
            </view>
          </view>
          </view>
      </view>
      </view><!-- /mk-sticky -->

      <scroll-view class="mk-scroll" scroll-y>
      <view class="mk-body">
      <!-- 空态 -->
      <view v-if="!result" class="empty anim-fade-up">
        <view class="empty-card glass">
          <view class="empty-ic flex-center">
            <OutlineIcon type="search" :size="54" color="var(--primary)" />
          </view>
          <text class="empty-t">开始智能分析</text>
          <text class="empty-s">输入代码或名称，查看行情、K 线与 AI 研判</text>
          <view class="empty-divider" />
          <!-- 热门搜索：后端当日真实搜索行为统计，以标签形式展示（最多 9 个），点击即搜索 -->
          <view class="hot-in">
            <text class="hot-in-title">热门搜索</text>
            <view class="hot-in-tags">
              <StockTag
                v-for="h in hotList"
                :key="h.code"
                :code="h.code"
                :name="h.name"
              />
            </view>
            <text v-if="!hotList.length" class="hot-in-empty">今日暂无搜索热点</text>
          </view>
        </view>
      </view>

      <!-- 结果 -->
      <block v-else>
        <!-- 头部：名称 + 价格 + 自选星标（右上角） -->
        <view class="glass quote-head anim-fade-up">
          <view class="qh-star flex-center" :class="{ on: watched }" @click="toggleWatch">
            <OutlineIcon type="star" :size="30" :color="watched ? 'var(--primary)' : 'var(--text-3)'" />
          </view>
          <view class="qh-left">
            <text class="qh-name">{{ name }}</text>
            <view class="qh-code-row">
              <view class="mkt-tag mkt-label">{{ marketChar }}</view>
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

      <view v-if="result" class="risk-note">
        <OutlineIcon type="info" :size="22" color="var(--text-2)" />
        <text>以上分析仅供参考，不构成任何投资建议</text>
      </view>

      <view class="bottom-pad" />
      </view><!-- /mk-body -->
      </scroll-view>
    </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onDeactivated, onUnmounted, watch, type Component } from "vue";
// 声明可接收的 open-market 监听（父级 pages/index 在 watch 激活时的动态 <component> 绑定，
// 经 KeepAlive 可能透传到本组件）：声明后 Vue 按自定义事件处理，避免 extraneous 告警。
defineEmits<{ (e: "open-market", payload: { code: string; market: string }): void }>();
import OutlineIcon from "@/components/OutlineIcon.vue";
import PriceText from "@/components/PriceText.vue";
import AnalysisCard from "@/components/AnalysisCard.vue";
import BackgroundFX from "@/components/BackgroundFX.vue";
import ReportView from "@/components/ReportView.vue";
import KlineCard from "@/components/KlineCard.vue";
import StockTag from "@/components/StockTag.vue";
import { fetchHotSearches, recordSearch, type HotStock } from "@/api/hot";
import { fetchBundle, fetchSnapshot, fetchNews, searchStocks, localSuggest, type SearchHit, type QuoteBundle, type NewsItem } from "@/api/quote";
import { getMarketStatus } from "@/utils/marketStatus";
import {
  resolveSecid,
  marketFromSecid,
  codeFromSecid,
  marketCharFor,
  type PeriodKey,
  type Market,
} from "@/utils/period";
import { analyze, type AnalysisResult, type MarketContext } from "@/utils/analyzer";
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
      // 实时最新价/昨收（与头部同源 5s 实时快照）：分时模式同步到走势图最后一根，
      // 确保「股票卡片头部」与「实时走势图」显示的最新净值完全同步、同源、实时更新。
      livePrice: realtime.value?.price ?? lastTrendPrice.value,
      livePreClose: realtime.value?.preClose ?? preClose.value,
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
let blurTimer: any = null;

// 联想面板是否展开（同一卡片向下展开，与搜索框融为一体）
const suggestOpen = computed(() => showSuggest.value && suggestions.value.length > 0);

// 输入框是否获得焦点：驱动搜索框「聚焦激活态」绿色高亮，让控件活起来
const focused = ref(false);

// 空态卡片「热门搜索」标签：后端当日真实搜索行为统计，最多 9 个（名称随榜返回，免二次解析）
const hotList = ref<HotStock[]>([]);
async function loadHot() {
  hotList.value = await fetchHotSearches(9);
}

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

// 分时序列最新价（与走势图同源）：头部实时价的回退来源，确保头部与走势图永远同一数值
const lastTrendPrice = computed(() => {
  if (period.value !== "m" || !trends.value.length) return null;
  const p = (trends.value[trends.value.length - 1] as any)?.price;
  return typeof p === "number" && isFinite(p) ? p : null;
});
// 头部展示「实时价」（东方财富实时行情，5s 刷新）；
// 分时视图下若实时快照暂不可用，回退到分时序列最新点（与走势图同源），
// 而非分析用日K收盘价——避免出现「头部=日K收盘、走势图=分时最新」的二次不一致。
const dispPrice = computed(() =>
  realtime.value?.price ?? (period.value === "m" ? lastTrendPrice.value : null) ?? (result.value ? result.value.last.close : 0)
);
const chg = computed(() => dispPrice.value - preClose.value);
// 涨跌幅格式化为两位小数，避免出现 0.07575757575757576% 这种超长小数
const pctText = computed(() =>
  (preClose.value ? (chg.value / preClose.value) * 100 : 0).toFixed(2) + "%"
);
// 涨跌幅着色：复用统一规则——涨红跌绿，持平(0)显示灰色，避免「0.00%」被误染红。
const pctColor = computed(() =>
  chg.value > 0 ? "var(--up)" : chg.value < 0 ? "var(--down)" : "var(--text-2)"
);

// 由当前 secid 推出自选股所需的 code / market（不再需要用户手动选择市场）
const curCode = computed(() => (secid.value ? codeFromSecid(secid.value) : code.value));
const curMarket = computed<Market>(() =>
  secid.value ? marketFromSecid(secid.value) : "auto"
);

// 市场徽标（沪/深/港/北）与纯代码：徽标样式对齐自选股 .mkt-tag，不并入代码文本
const marketChar = computed(() =>
  secid.value ? marketCharFor(codeFromSecid(secid.value), marketFromSecid(secid.value)) : ""
);
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
    run(v.market || "auto", false); // 自动恢复历史查看，不计入今日热搜
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
  // 大盘环境 beta 感知：fetchBundle 已按股票代码自动匹配对应主指数并拉取 K线，
  // 直接透传 marketCtx 即可让「大盘 · 市场环境」面板与协同评分生效。
  const marketCtx: MarketContext | null = b.marketCtx
    ? {
        indexKlines: b.marketCtx.indexKlines,
        indexName: b.marketCtx.indexName,
        indexRealtime: b.marketCtx.indexRealtime,
        upCount: b.marketCtx.upCount,
        downCount: b.marketCtx.downCount,
        sector: b.marketCtx.sector,
      }
    : null;
  result.value = analyze(
    klines.value,
    b.flowMap,
    newsSig.value,
    b.klines.d,
    marketCtx,
    secid.value ? codeFromSecid(secid.value) : undefined
  );
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
  if (suggestTimer) {
    clearTimeout(suggestTimer);
    suggestTimer = null;
  }
  if (blurTimer) {
    clearTimeout(blurTimer);
    blurTimer = null;
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

async function run(forceMarket?: Market, track = true) {
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
    if (track) {
      // 用户主动搜索计入今日热搜（数据供空态卡片「热门搜索」展示，不阻塞搜索流程）
      recordSearch(curCode.value, name.value);
    }
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
      // 极端情况（缓存未建立），回退到单次预取（内部调用）
      await run(undefined, false);
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
  focused.value = true;
  if (!code.value.trim() && history.value.length) {
    historyMode = true;
    suggestions.value = history.value;
    showSuggest.value = true;
  } else if (suggestions.value.length) {
    showSuggest.value = true;
  }
}
function onBlur() {
  // 延迟收起，保证点击建议能被先处理；同时解锁聚焦高亮
  if (blurTimer) clearTimeout(blurTimer);
  blurTimer = setTimeout(() => {
    focused.value = false;
    showSuggest.value = false;
    blurTimer = null;
  }, 200);
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
  loadHot();
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
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0;
}
/* 顶部：品牌 + 搜索 + 周期切换 固定常驻，向下滚动时不被卷走 */
.mk-sticky {
  flex: none;
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
/* 行情主体滚动容器：.tab-host 为固定视口高+overflow:hidden，各 Tab 必须自滚。
   品牌栏/搜索栏(.mk-sticky) 固定顶部不随滚动，命中卡片/报告等在下方独立滚动。 */
.mk-scroll {
  flex: 1;
  min-height: 0;
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
/* 市场状态标识：开盘中(绿) / 午间休市(橙) / 未开盘·已收市·周末休市·节假日休市·临时休市(灰) */
.mk-status {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  font-size: var(--font-xs);
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
  font-size: var(--font-2xl);
  font-weight: 800;
  color: var(--primary);
  letter-spacing: 3rpx;
}
.brand-sub {
  font-size: var(--font-xs);
  color: var(--text-2);
}
.search-bar {
  position: relative;
  z-index: 20;
}
/* 搜索单元：搜索框 + 联想面板共用同一张玻璃卡片，向下展开融为一体 */
.search-unit {
  position: relative;
  /* 玻璃拟态（28rpx 圆角 + 底色/边框/阴影/模糊）由全局 .glass.glass--lg 提供 */
  transition: box-shadow var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
  overflow: visible;
}
/* 聚焦态：卡片边框轻微着色（主要激活指示由 .si-field 描边承担，避免双重高亮） */
.search-unit.focused {
  border-color: rgba(7, 193, 96, 0.4);
}
/* 展开联想：底部直角与联想面板无缝衔接 */
.search-unit.open {
  border-color: rgba(7, 193, 96, 0.4);
  border-radius: 28rpx 28rpx 0 0;
}
.search-box {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 10rpx 10rpx;
  background: transparent;
}
/* 输入区：内凹药丸，与按钮形成「凹陷输入 + 凸起按钮」的视觉层次 */
.si-field {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
  height: 60rpx;
  padding: 0 16rpx;
  background: var(--card-2);
  border-radius: 999rpx;
  border: 2rpx solid transparent;
  transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
/* 聚焦态：输入区描边转为主题色，内凹感更强 */
.search-unit.focused .si-field {
  border-color: var(--primary);
  background: var(--card);
}
/* 展开联想：输入区保持激活描边 */
.search-unit.open .si-field {
  border-color: var(--primary);
}
.si {
  flex: 1;
  min-width: 0;
  height: 100%;
  font-size: var(--font-md);
}
/* 清除键：圆形次表面按钮 */
.si-clear {
  flex: none;
  width: 36rpx;
  height: 36rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--card);
  transition: background var(--dur-fast) var(--ease-out), transform 0.1s var(--ease-out);
}
.si-clear:active {
  background: var(--primary-soft);
  transform: scale(0.9);
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
  font-size: var(--font-xs);
  color: var(--text-3);
  font-weight: 600;
  letter-spacing: 1rpx;
}
.sg-clear {
  font-size: var(--font-xs);
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
  font-size: var(--font-md);
  color: var(--text);
  font-weight: 600;
  /* 截断属性已提升至全局 .truncate */
}
.sg-code {
  font-size: var(--font-xs);
  color: var(--text-2);
}
.sg-tag {
  flex: none;
  font-size: var(--font-xs);
  color: var(--primary);
  background: var(--primary-soft);
  border-radius: var(--radius-sm);
  padding: 4rpx 12rpx;
}
/* 搜索按钮：微信绿药丸，与 .si-field 等高（68rpx），凸起于内凹输入区。
   显式锁定 color:#fff——uni-app <button type="default"> 运行时会注入黑色字体，
   且 :disabled 态可能进一步覆盖，必须在每个状态单独声明白色 */
.btn-primary.go {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  min-height: 0;
  height: 60rpx;
  line-height: 60rpx;
  padding: 0 28rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0) 50%), var(--primary);
  color: #fff;
  box-shadow: var(--shadow-primary-2);
  font-size: var(--font-sm);
  font-weight: 600;
  letter-spacing: 1rpx;
  transition: transform 0.12s var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
/* 聚焦联动：按钮轻微提亮 */
.search-unit.focused .btn-primary.go {
  box-shadow: var(--shadow-primary-2);
}
/* 按压态：轻微回弹 + 加深绿 + 收紧投影 */
.btn-primary.go:active:not(:disabled) {
  transform: scale(0.95);
  background: var(--primary-dark);
  color: #fff;
  box-shadow: var(--shadow-primary-1);
}
/* 加载中：保持绿色 + 转圈，不灰显 */
.btn-primary.go:disabled,
.btn-primary.go[disabled] {
  opacity: 1;
  background: var(--primary-dark);
  color: #fff;
  box-shadow: var(--shadow-primary-2);
}
.spinner {
  width: 24rpx;
  height: 24rpx;
  border: 3rpx solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex: none;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx 24rpx 0;
}
.empty-card {
  width: 100%;
  padding: 48rpx 34rpx 38rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.empty-ic {
  width: 108rpx;
  height: 108rpx;
  border-radius: 50%;
  background: var(--primary-soft);
  margin-bottom: 26rpx;
  /* flex-center 已提升至全局 .flex-center */
}
.empty-t {
  font-size: var(--font-lg);
  font-weight: 700;
  color: var(--text);
}
.empty-s {
  margin-top: 14rpx;
  font-size: var(--font-sm);
  color: var(--text-2);
  line-height: 1.6;
  text-align: center;
}
.empty-divider {
  width: 56rpx;
  height: 6rpx;
  border-radius: 999rpx;
  background: var(--primary);
  margin: 34rpx 0 24rpx;
}
/* 空态卡片内「热门搜索」标签区：与上方提示文案经分割线分隔，自然融入卡片 */
.hot-in {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.hot-in-title {
  font-size: var(--font-sm);
  font-weight: 700;
  color: var(--text);
  margin-bottom: 18rpx;
}
.hot-in-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx 16rpx;
  justify-content: center;
}
.hot-in-empty {
  font-size: var(--font-xs);
  color: var(--text-3);
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
  font-size: var(--font-lg);
  font-weight: 700;
}
.qh-code-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-top: 4rpx;
}
.qh-code {
  font-size: var(--font-xs);
  color: var(--text-2);
}
/* 市场徽标：沪 / 深 / 港 / 北，对齐自选股 .mkt-tag 的经典简洁样式 */
.mkt-tag {
  flex: none;
  /* 布局属性已提升至全局 .mkt-label */
}
/* 自选星标：与自选页热搜榜单图标一致——描边星星 + 圆形底，加入自选时底变 primary-soft */
.qh-star {
  position: absolute;
  top: 50%;
  right: 16rpx;
  transform: translateY(-50%);
  /* 触摸目标 ≥44px（固定 px 保证任意屏不缩水），图标在圈内居中 */
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: var(--card-2);
  transition: transform 0.12s ease, background 0.15s ease;
  /* flex-center 已提升至全局 .flex-center */
}
.qh-star:active {
  transform: translateY(-50%) scale(0.9);
}
.qh-star.on {
  background: var(--primary-soft);
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
  font-size: var(--font-sm);
  font-weight: 600;
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
  font-size: var(--font-xs);
  color: var(--text-2);
  line-height: 1.5;
  text-align: center;
}
</style>
