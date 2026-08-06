<template>
  <view class="wl-page">
    <!-- 头部：固定不随滚动（与社区一致），移出 scroll-view 以保证 H5 上始终吸顶 -->
    <view class="cm-header anim-fade-up">
      <text class="cm-brand">自选</text>
      <view class="cm-right">
        <!-- 当前分组内实时涨/跌个数（随行情实时刷新） -->
        <view class="ud-pill">
          <view class="ud-item">
            <OutlineIcon type="arrow-up" :size="18" color="var(--up)" />
            <text class="ud-num up">{{ upDown.counts.up }}</text>
          </view>
          <view class="ud-item">
            <OutlineIcon type="arrow-down" :size="18" color="var(--down)" />
            <text class="ud-num down">{{ upDown.counts.down }}</text>
          </view>
        </view>
        <view class="cm-me" role="button" aria-label="分组切换" @click="openGroups">
          <view class="cm-avatar" style="background: linear-gradient(135deg, var(--primary), var(--primary-dark, #06a050));">
            <OutlineIcon type="layers" :size="24" color="#fff" />
          </view>
          <text class="cm-name">{{ upDown.currentGroup }}</text>
          <OutlineIcon type="pulldown" :size="18" color="var(--text-2)" />
        </view>
      </view>
    </view>

    <view class="wl">
      <BackgroundFX />

      <!-- 价格预警横幅：当前已触发且未忽略的预警（H5 无系统推送，仅应用内提醒） -->
        <view v-if="alertHits.length" class="alert-banner anim-fade-up">
          <view v-for="a in alertHits" :key="a.key" class="ab-item glass glass--lg" @click="dismissAlert(a.key)">
            <view class="ab-ic">
              <OutlineIcon type="bell" :size="26" color="var(--primary)" />
            </view>
            <text class="ab-txt">{{ a.text }}</text>
            <view class="ab-action">忽略</view>
          </view>
        </view>

        <!-- 空态 -->
        <view v-if="!list.length" class="empty-wrap anim-fade-up">
          <view class="empty-card glass">
            <view class="empty-ic">
              <OutlineIcon type="star" :size="60" color="var(--primary)" />
            </view>
            <text class="empty-t">还没有自选股</text>
            <text class="empty-s">在「行情」页搜索分析后点击星标加入自选，实时价格与价格预警将同步展示在这里。</text>
            <button class="btn-primary empty-btn" @click="goPickMarket">去行情页选股</button>
          </view>
        </view>

        <!-- 自选股表格：全屏铺满 + 固定表头 + 名称列固定(横滑不丢) + 横向滚动 -->
        <scroll-view v-if="rows.length" class="wl-grid" scroll-x scroll-y>
          <view class="wl-rows">
          <view class="wl-thead">
            <view class="th c-name">名称</view>
            <view class="th c-pct" :class="{ active: sortKey === 'pct' }" @click="toggleSort('pct')">
              <text class="th-label">涨跌幅</text>
              <view class="sort-ic">
                <view class="ar up" :class="{ on: sortKey === 'pct' && sortDir === 'asc' }" />
                <view class="ar dn" :class="{ on: sortKey === 'pct' && sortDir === 'desc' }" />
              </view>
            </view>
            <view class="th c-chg" :class="{ active: sortKey === 'chg' }" @click="toggleSort('chg')">
              <text class="th-label">涨跌额</text>
              <view class="sort-ic">
                <view class="ar up" :class="{ on: sortKey === 'chg' && sortDir === 'asc' }" />
                <view class="ar dn" :class="{ on: sortKey === 'chg' && sortDir === 'desc' }" />
              </view>
            </view>
            <view class="th c-open" :class="{ active: sortKey === 'open' }" @click="toggleSort('open')">
              <text class="th-label">今开</text>
              <view class="sort-ic">
                <view class="ar up" :class="{ on: sortKey === 'open' && sortDir === 'asc' }" />
                <view class="ar dn" :class="{ on: sortKey === 'open' && sortDir === 'desc' }" />
              </view>
            </view>
            <view class="th c-amp" :class="{ active: sortKey === 'amp' }" @click="toggleSort('amp')">
              <text class="th-label">振幅</text>
              <view class="sort-ic">
                <view class="ar up" :class="{ on: sortKey === 'amp' && sortDir === 'asc' }" />
                <view class="ar dn" :class="{ on: sortKey === 'amp' && sortDir === 'desc' }" />
              </view>
            </view>
            <view class="th c-amt" :class="{ active: sortKey === 'amt' }" @click="toggleSort('amt')">
              <text class="th-label">成交额</text>
              <view class="sort-ic">
                <view class="ar up" :class="{ on: sortKey === 'amt' && sortDir === 'asc' }" />
                <view class="ar dn" :class="{ on: sortKey === 'amt' && sortDir === 'desc' }" />
              </view>
            </view>
          </view>
          <view
            v-for="row in displayRows"
            :key="row.it.code + row.it.market"
            class="tr"
            @click="onItemClick(row.it)"
            @longpress="onRowLongPress(row.it)"
          >
            <!-- 固定列：预警点 + 名称 + (市场徽标 + 代码) -->
            <view class="td c-name">
              <view class="al-dot" :class="{ on: hasAlert(row.it) }" @click.stop="editAlert(row.it)" />
              <view class="t-block">
                <text class="t-name">{{ row.it.name || row.it.code }}</text>
                <view class="t-sub">
                  <text class="t-mkt">{{ row.mkt }}</text>
                  <text class="t-code">{{ row.it.code }}</text>
                </view>
              </view>
            </view>
            <!-- 涨跌幅：主行(涨跌幅) + 次行(净值/现价) -->
            <view class="td c-pct">
              <text class="c-main" :class="pctCls(row.q)">{{ row.q.loading ? '--' : fmtPct(row.q.pct) }}</text>
              <text class="c-sub">{{ row.q.loading ? '' : fmtPrice(row.q.price) }}</text>
            </view>
            <view class="td c-chg">
              <text class="c-main" :class="pctCls(row.q)">{{ row.q.loading ? '--' : fmtSigned(row.q.chg) }}</text>
            </view>
            <view class="td c-open">
              <text class="c-main">{{ row.q.loading ? '--' : fmtPrice(row.q.open) }}</text>
            </view>
            <view class="td c-amp">
              <text class="c-main">{{ row.q.loading ? '--' : ampPct(row.q) }}</text>
            </view>
            <view class="td c-amt">
              <text class="c-main">{{ row.q.loading ? '--' : fmtAmount(row.q.amount) }}</text>
            </view>
          </view>
          </view>
          <view class="bottom-pad" />
        </scroll-view>

        <text v-if="list.length && !rows.length" class="wl-hint">该分组暂无股票</text>
        <text v-if="rows.length" class="wl-hint">点击查看详情 · 长按操作(删除/移分组/预警) · 可横滑查看更多</text>
      </view>

    <!-- 底部卡片：本地展开/收起（向上动效），自身承载完整榜单，无遮罩层。
         进入页面即渲染（不等数据）；peek 为 null 时显示 -- 占位。 -->
    <view class="rank-peek" :class="{ open: rankOpen, max: rankMax }" :style="rankStyle">
      <!-- 收起态：一行「今日最热」摘要，点击展开；数据为 null 时显示 -- 占位 -->
      <view v-if="!rankOpen" class="rp-row" role="button" aria-label="展开榜单" @click="rankOpen = true">
        <text class="rp-top">今日最热</text>
        <view class="rp-main">
          <view class="rp-sub" v-if="peek">
            <text class="rp-mkt">{{ peekMkt }}</text>
            <text class="rp-code">{{ peek.code }}</text>
          </view>
          <text class="rp-name">{{ peek ? peek.name : '--' }}</text>
        </view>
        <view class="rp-right">
          <text class="rp-price" :class="peek ? (peek.chg >= 0 ? 'up' : 'down') : ''">{{ peek && peek.price != null ? fmtPrice(peek.price) : '--' }}</text>
          <text class="rp-pct" :class="peek ? (peek.chg >= 0 ? 'up' : 'down') : ''">{{ peek && peek.pct != null ? fmtPct(peek.pct) : '--' }}</text>
        </view>
        <OutlineIcon class="rp-caret" type="chevron-up" :size="20" color="var(--text-2)" />
      </view>

      <!-- 展开态：完整榜单（含收起手柄、Tab 切换、榜单列表）-->
      <view v-if="rankOpen" class="rp-panel">
        <view
          class="rs-grip"
          @touchstart.stop="onGripDown" @touchmove.stop="onGripMove" @touchend.stop="onGripUp" @touchcancel.stop="onGripUp"
          @mousedown.stop="onGripDown" @mousemove.stop="onGripMove" @mouseup.stop="onGripUp" @mouseleave.stop="onGripUp"
          @click.stop="onGripTap"
        >
          <view class="rs-handle" />
        </view>
        <view class="rs-tabs">
          <view class="rs-tab" :class="{ on: rankTab === 'today' }" @click="rankTab = 'today'">今日热榜</view>
          <view class="rs-tab" :class="{ on: rankTab === 'all' }" @click="rankTab = 'all'">完整榜单</view>
          <view class="rs-ink" :class="{ right: rankTab === 'all' }"><view class="rs-ink-bar" /></view>
        </view>
        <scroll-view class="rs-body" scroll-y>
          <RankView :mode="rankTab" @open-market="onSheetOpenMarket" />
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted, onActivated, onDeactivated, onUnmounted } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import BackgroundFX from "@/components/BackgroundFX.vue";
import RankView from "@/views/RankView.vue";
import { useWatchlist, removeWatch, setItemGroup, setAlerts, renameGroup, deleteGroup, type WatchItem, type PriceAlert } from "@/store/watchlist";
import { userState } from "@/store/user";
import { openAuth, goTab } from "@/store/nav";
import { LOCAL_STOCKS, fetchSnapshot } from "@/api/quote";
import { resolveSecid, marketCharFor } from "@/utils/period";
import { fmtPrice, fmtPct, fmtSigned, fmtAmount } from "@/utils/format";

const emit = defineEmits<{ (e: "open-market", payload: { code: string; market: string }): void }>();

const wl = useWatchlist();
const list = computed(() => wl.items as WatchItem[]);

// 榜单弹层 + 底部露出卡片：默认展示「今日热榜 / 完整榜单」切换
const rankOpen = ref(false);
const rankTab = ref<"today" | "all">("today");
// 榜单展开态：是否铺满整页（上拉触发）
const rankMax = ref(false);
// 视口高度与底部占位（px），用于上拉铺满时计算目标高度
const winH = ref(0);
const tabPx = ref(0);
function measureViewport() {
  try {
    const info: any = (uni as any).getWindowInfo ? (uni as any).getWindowInfo() : uni.getSystemInfoSync();
    const w = info.windowWidth || info.screenWidth || 375;
    winH.value = info.windowHeight || 0;
    const safe = (info.safeAreaInsets && info.safeAreaInsets.bottom) || 0;
    tabPx.value = safe + (w / 750) * 110; // 110rpx 底部偏移 + 安全区
  } catch (_) {}
}

// 露出卡片预览数据：当前选中榜单的第 1 名（一行最热股）
interface PeekRow {
  code: string;
  name: string;
  chg: number;
  pct: number | null;
  price: number | null;
}
const peek = ref<PeekRow | null>(null);
// 今日最热卡片：根据代码推断市场徽标(沪/深/港/北)
const peekMkt = computed(() => (peek.value ? marketCharFor(peek.value.code) : ""));

function marketOfCode(code: string): string {
  if (/^\d{5}$/.test(code)) return "hk";
  if (/^6/.test(code)) return "sh";
  if (/^[03]/.test(code)) return "sz";
  if (/^[489]/.test(code)) return "bj";
  return "sh";
}

async function loadPeek(mode: "today" | "all") {
  const pool = LOCAL_STOCKS.filter((h) => h.code !== "000300" && h.code !== "510300");
  const list = await Promise.all(
    pool.map(async (h) => {
      const market = marketOfCode(h.code);
      const secid = resolveSecid(h.code, market as any);
      try {
        const s = await fetchSnapshot(secid);
        return { code: h.code, name: h.name, chg: s.chg, pct: s.pct, price: s.price };
      } catch {
        return { code: h.code, name: h.name, chg: 0, pct: null, price: null };
      }
    })
  );
  const ranked = list.sort((a, b) => (b.pct ?? -Infinity) - (a.pct ?? -Infinity));
  const top = mode === "today" ? ranked.slice(0, 20) : ranked;
  peek.value = top[0]
    ? { code: top[0].code, name: top[0].name, chg: top[0].chg, pct: top[0].pct, price: top[0].price }
    : null;
}

// 切换榜单类型时同步刷新露出卡片的预览
watch(rankTab, (m) => loadPeek(m));

// 分组筛选：默认展示「全部」（含所有分组），通过右上角「分组」切换；分组名从现有自选派生
const selectedGroup = ref<string>("__all__");
const groups = computed(() => {
  const s = new Set<string>();
  for (const it of list.value) if (it.group) s.add(it.group);
  return Array.from(s).sort();
});
const filteredList = computed(() => {
  if (selectedGroup.value === "__all__") return list.value;
  if (selectedGroup.value === "") return list.value.filter((i) => !i.group);
  return list.value.filter((i) => i.group === selectedGroup.value);
});

// 未登录且已配置后端（登录可达）时，进入本页自动跳转登录页（见 onActivated）
const needLogin = computed(() => userState.supabaseEnabled && !userState.loggedIn);

interface Snap {
  price: number;
  chg: number;
  pct: number;
  preClose?: number;
  open?: number;
  high?: number;
  low?: number;
  amount?: number;
  loading: boolean;
  error?: boolean;
}
const EMPTY: Snap = { price: 0, chg: 0, pct: 0, loading: true };

const quotes = reactive<Record<string, Snap>>({});
const keyOf = (it: WatchItem) => `${it.code}|${it.market}`;

// 价格预警：上一轮成功价格（用于穿越检测）+ 已忽略的预警 key
const prevPrices = reactive<Record<string, number>>({});
const dismissed = reactive<Set<string>>(new Set());
const alertHits = ref<{ key: string; code: string; name: string; text: string }[]>([]);

function hasAlert(it: WatchItem): boolean {
  const a = it.alerts;
  return !!(a && (a.above != null || a.below != null));
}

// 自选股实时行情：批量拉取快照（与行情页同口径），填充现价与涨跌幅，并检测价格预警穿越
async function loadQuotes() {
  if (userState.supabaseEnabled && !userState.loggedIn) return;
  const tasks = list.value.map(async (it) => {
    const k = keyOf(it);
    quotes[k] = { ...EMPTY, loading: true };
    try {
      const secid = resolveSecid(it.code, it.market as any);
      const snap = await fetchSnapshot(secid);
      quotes[k] = { ...snap, loading: false };
      detectAlert(it, snap.price);
    } catch {
      quotes[k] = { ...EMPTY, loading: false, error: true };
    }
  });
  await Promise.allSettled(tasks);
  refreshAlertHits();
}

// 穿越检测：与上一轮价格比较，向上突破 / 向下跌破阈值时即时 Toast（H5 无系统推送，仅应用内）
function detectAlert(it: WatchItem, price: number) {
  const a = it.alerts;
  if (!a || !price) return;
  const k = keyOf(it);
  const prev = prevPrices[k];
  if (prev != null && isFinite(prev)) {
    if (a.above != null && prev < a.above && price >= a.above) {
      uni.showToast({ title: `${it.name || it.code} 突破 ${a.above} 元`, icon: "none" });
    }
    if (a.below != null && prev > a.below && price <= a.below) {
      uni.showToast({ title: `${it.name || it.code} 跌破 ${a.below} 元`, icon: "none" });
    }
  }
  prevPrices[k] = price;
}

// 横幅：列出当前已处于预警区间且未被忽略的项（实时刷新时持续提示，忽略后不再弹出）
function refreshAlertHits() {
  const hits: { key: string; code: string; name: string; text: string }[] = [];
  for (const it of list.value) {
    const a = it.alerts;
    if (!a) continue;
    const q = quotes[keyOf(it)];
    const price = q?.price;
    if (!price) continue;
    if (a.above != null && price >= a.above && !dismissed.has(keyOf(it) + "_up")) {
      hits.push({ key: keyOf(it) + "_up", code: it.code, name: it.name || it.code, text: `${it.name || it.code} 已突破 ${a.above} 元（现价 ${price}）` });
    }
    if (a.below != null && price <= a.below && !dismissed.has(keyOf(it) + "_down")) {
      hits.push({ key: keyOf(it) + "_down", code: it.code, name: it.name || it.code, text: `${it.name || it.code} 已跌破 ${a.below} 元（现价 ${price}）` });
    }
  }
  alertHits.value = hits;
}
function dismissAlert(key: string) {
  dismissed.add(key);
  alertHits.value = alertHits.value.filter((h) => h.key !== key);
}

// 设置价格预警：高于 / 低于 / 清除（H5 无系统推送，触发后在自选页以横幅 + Toast 提醒）
function editAlert(it: WatchItem) {
  const a = it.alerts || {};
  uni.showActionSheet({
    itemList: ["设置高于预警", "设置低于预警", "清除预警"],
    success: (res) => {
      if (res.tapIndex === 2) {
        setAlerts(it.code, it.market, undefined);
        uni.showToast({ title: "已清除预警", icon: "none" });
        return;
      }
      const dir: "above" | "below" = res.tapIndex === 0 ? "above" : "below";
      const cur = a[dir];
      uni.showModal({
        title: dir === "above" ? "高于此价提醒" : "低于此价提醒",
        editable: true,
        placeholderText: "输入价格，如 12.5",
        content: cur != null ? String(cur) : "",
        success: (r) => {
          if (!r.confirm) return;
          const v = parseFloat(r.content ?? "");
          const next: PriceAlert = { ...a };
          next[dir] = isFinite(v) ? v : null;
          setAlerts(it.code, it.market, next.above == null && next.below == null ? undefined : next);
        },
      });
    },
  });
}

// 空态按钮：跳转到行情 tab 选股
function goPickMarket() {
  goTab("market");
}

// 新建分组：命名后选择将某只现有自选并入，保证分组可持久化（避免出现空分组）
function createGroupFlow() {
  if (!list.value.length) {
    uni.showToast({ title: "请先在行情页添加自选股", icon: "none" });
    return;
  }
  uni.showModal({
    title: "新建分组",
    editable: true,
    placeholderText: "分组名",
    content: "",
    success: (r) => {
      if (!r.confirm || !r.content?.trim()) return;
      const name = r.content.trim();
      if (groups.value.includes(name)) {
        uni.showToast({ title: "分组已存在", icon: "none" });
        return;
      }
      const opts = list.value.map((i) => i.name || i.code);
      uni.showActionSheet({
        itemList: opts,
        success: (res) => {
          const it = list.value[res.tapIndex];
          if (it) {
            setItemGroup(it.code, it.market, name);
            selectedGroup.value = name;
          }
          uni.showToast({ title: `已创建「${name}」`, icon: "none" });
        },
      });
    },
  });
}

// 分组管理入口：右上角「分组」pill 点击后，可切换分组（默认即「全部」）、新建分组、
// 将股票移入分组、或管理既有分组（重命名/删除）
function openGroups() {
  const items: string[] = [];
  const acts: { kind: "all" | "group" | "new" | "move" | "manage"; g?: string }[] = [];
  items.push("全部");
  acts.push({ kind: "all" });
  for (const g of groups.value) {
    items.push(g);
    acts.push({ kind: "group", g });
  }
  items.push("新建分组");
  acts.push({ kind: "new" });
  items.push("将股票移入分组");
  acts.push({ kind: "move" });
  if (groups.value.length) {
    items.push("管理分组");
    acts.push({ kind: "manage" });
  }
  uni.showActionSheet({
    itemList: items,
    success: (res) => {
      const act = acts[res.tapIndex];
      if (!act) return;
      if (act.kind === "all") selectedGroup.value = "__all__";
      else if (act.kind === "group" && act.g != null) selectedGroup.value = act.g;
      else if (act.kind === "new") createGroupFlow();
      else if (act.kind === "move") moveStockToGroup();
      else {
        uni.showActionSheet({
          itemList: groups.value.map((g) => `管理「${g}」`),
          success: (r2) => manageGroup(groups.value[r2.tapIndex]),
        });
      }
    },
  });
}

// 将某只自选股移入指定分组（目标可选默认 / 既有分组 / 新建分组）
function moveStockToGroup() {
  if (!list.value.length) {
    uni.showToast({ title: "还没有自选股", icon: "none" });
    return;
  }
  const stocks = list.value.map((i) => `${i.name || i.code}`);
  uni.showActionSheet({
    itemList: stocks,
    success: (r) => {
      const it = list.value[r.tapIndex];
      if (!it) return;
      const targets = ["默认", ...groups.value];
      uni.showActionSheet({
        itemList: [...targets, "新建分组…"],
        success: (r2) => {
          if (r2.tapIndex < targets.length) {
            const grp = r2.tapIndex === 0 ? "" : groups.value[r2.tapIndex - 1];
            setItemGroup(it.code, it.market, grp);
            selectedGroup.value = grp;
            uni.showToast({ title: `已移入${grp || "默认"}`, icon: "none" });
          } else {
            uni.showModal({
              title: "新建分组",
              editable: true,
              placeholderText: "分组名",
              content: "",
              success: (m) => {
                const name = m.content?.trim();
                if (m.confirm && name) {
                  setItemGroup(it.code, it.market, name);
                  selectedGroup.value = name;
                  uni.showToast({ title: `已创建「${name}」`, icon: "none" });
                }
              },
            });
          }
        },
      });
    },
  });
}

// 下拉刷新（页面级 onPullDownRefresh，见 index.vue）：
// index 是注册 page，其 onPullDownRefresh 会路由到当前 tab 视图的 refresh()；
// 自选页此处复载行情。榜单卡片是 fixed 浮层，其拖拽手柄已 stopPropagation，
// 不会把「下拉收起 / 上拉铺满」手势冒泡到页面级刷新，避免误触发 loading。
async function onRefresh() {
  await loadQuotesSafe();
}
defineExpose({ refresh: () => onRefresh() });

// 自动刷新心跳：非后台常驻，离开页面即停
let loadingQuotes = false;
let pollTimer: any = null;
const POLL_MS = 15000;
async function loadQuotesSafe() {
  if (loadingQuotes) return;
  loadingQuotes = true;
  try {
    await loadQuotes();
  } finally {
    loadingQuotes = false;
  }
}
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (needLogin.value || !list.value.length) return;
    loadQuotesSafe();
  }, POLL_MS);
}
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

const rows = computed(() =>
  filteredList.value.map((it) => ({
    it,
    q: quotes[keyOf(it)] || EMPTY,
    mkt: marketCharFor(it.code, it.market),
  }))
);

// 表头排序：点击列头切换 升/降序；null(加载中) 始终排末尾（名称列固定，不参与排序）
type SortKey = "pct" | "chg" | "open" | "amp" | "amt" | "";
const sortKey = ref<SortKey>("");
const sortDir = ref<"asc" | "desc">("desc");
function toggleSort(key: SortKey) {
  if (!key) return;
  if (sortKey.value === key) sortDir.value = sortDir.value === "desc" ? "asc" : "desc";
  else {
    sortKey.value = key;
    sortDir.value = "desc";
  }
}
function sortVal(q: Snap, k: Exclude<SortKey, "">): number | null {
  if (q.loading) return null;
  switch (k) {
    case "pct": return q.pct ?? null;
    case "chg": return q.chg ?? null;
    case "open": return q.open ?? null;
    case "amp":
      return q.high != null && q.low != null && q.preClose ? ((q.high - q.low) / q.preClose) * 100 : null;
    case "amt": return q.amount ?? null;
  }
  return null;
}
const displayRows = computed(() => {
  const arr = rows.value;
  const k = sortKey.value;
  if (!k) return arr;
  const dir = sortDir.value === "desc" ? -1 : 1;
  return [...arr].sort((a, b) => {
    let cmp = 0;
    const va = sortVal(a.q, k);
    const vb = sortVal(b.q, k);
    if (va == null && vb == null) cmp = 0;
    else if (va == null) cmp = 1;
    else if (vb == null) cmp = -1;
    else cmp = va - vb;
    return cmp * dir;
  });
});

// 顶部右侧：当前分组名（默认「全部」）+ 当前分组内实时涨/跌个股个数（随行情刷新）
const upDown = computed(() => {
  const g = selectedGroup.value;
  const currentGroup = !g || g === "__all__" ? "全部" : g;
  let up = 0;
  let down = 0;
  for (const r of rows.value) {
    if (r.q.loading) continue;
    if (r.q.chg > 0) up++;
    else if (r.q.chg < 0) down++;
  }
  return { currentGroup, counts: { up, down } };
});

function pctCls(q: Snap): string {
  if (q.loading) return "flat";
  if (q.chg > 0) return "up";
  if (q.chg < 0) return "down";
  return "flat";
}
// 振幅%（(最高-最低)/昨收）
function ampPct(q: Snap): string {
  if (q.loading || !q.preClose || q.preClose === 0 || q.high == null || q.low == null) return "--";
  return (((q.high - q.low) / q.preClose) * 100).toFixed(2) + "%";
}

// 榜单弹层：点击热榜股票跳转行情页并关闭弹层
function onSheetOpenMarket(p: { code: string; market: string }) {
  closeRank();
  emit("open-market", p);
}
// 关闭榜单弹层
function closeRank() {
  rankOpen.value = false;
  rankMax.value = false;
}

// 拖拽手势：面板顶部手柄区支持「下拉收起 / 上拉铺满」，配合 height/transform 过渡动效
const dragY = ref(0);
const dragging = ref(false);
const dragUp = ref(false);
let gripStartY = 0;
let gripMoved = false;
const rankStyle = computed(() => {
  if (!dragging.value) return {};
  if (dragUp.value) {
    // 上拉：实时增高预览（直到铺满整页）
    const base = winH.value * 0.62;
    const maxH = Math.max(base, winH.value - tabPx.value);
    let h = base - dragY.value; // dragY 为负（上拉），h 增大
    if (h > maxH) h = maxH + (h - maxH) * 0.2; // 超过铺满后加阻尼
    return { height: `${h}px`, transition: "none" };
  }
  // 下拉：整体下移预览，松手后收起
  return { transform: `translateX(-50%) translateY(${dragY.value}px)`, transition: "none" };
});
// 取触摸/鼠标事件的 Y 坐标（榜单卡片拖拽手势使用）
function ptY(e: any): number {
  if (e.touches && e.touches[0]) return e.touches[0].clientY;
  if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY;
  return e.clientY || 0;
}
function onGripDown(e: any) {
  dragging.value = true;
  dragY.value = 0;
  dragUp.value = false;
  gripMoved = false;
  gripStartY = ptY(e);
}
function onGripMove(e: any) {
  if (!dragging.value) return;
  const dy = ptY(e) - gripStartY;
  dragY.value = dy;
  dragUp.value = dy < 0;
  if (Math.abs(dy) > 4) gripMoved = true;
  // 拖拽期间阻止页面级下拉刷新 / 页面滚动误触发
  if (e.cancelable) {
    try {
      e.preventDefault();
    } catch (_) {}
  }
}
function onGripUp() {
  if (!dragging.value) return;
  dragging.value = false;
  const dy = dragY.value;
  const wasUp = dragUp.value;
  dragY.value = 0;
  if (wasUp) {
    if (rankMax.value) {
      // 已铺满：下拉超过阈值回退到半屏
      if (dy > 80) rankMax.value = false;
    } else if (-dy > 64) {
      // 半屏：上拉超过阈值铺满整页
      rankMax.value = true;
    }
  } else {
    if (rankMax.value) {
      // 铺满：下拉先回退到半屏
      rankMax.value = false;
    } else if (dy > 80) {
      // 半屏：下拉收起
      closeRank();
    }
  }
}
function onGripTap() {
  if (gripMoved) {
    gripMoved = false;
    return; // 拖拽结束后不触发点击，避免重复动作
  }
  closeRank();
}

onMounted(() => {
  measureViewport();
  if (typeof window !== "undefined") {
    window.addEventListener("resize", measureViewport);
    window.addEventListener("orientationchange", measureViewport);
  }
  if (!needLogin.value) loadQuotesSafe();
  loadPeek(rankTab.value);
});
onActivated(() => {
  if (needLogin.value) {
    openAuth("login");
    return;
  }
  loadQuotesSafe();
  startPolling();
});
onDeactivated(stopPolling);
onUnmounted(() => {
  stopPolling();
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", measureViewport);
    window.removeEventListener("orientationchange", measureViewport);
  }
});
watch(
  () => userState.loggedIn,
  (li) => {
    if (li) {
      loadQuotesSafe();
      startPolling();
    } else {
      stopPolling();
    }
  }
);
watch(
  () => list.value.map(keyOf).join(","),
  () => loadQuotesSafe()
);

// ===== 自选股表格交互：点击行打开个股；长按行弹出操作菜单（删除/移分组/预警） =====
function onItemClick(it: WatchItem) {
  emit("open-market", { code: it.code, market: it.market });
}

function doRemove(it: WatchItem) {
  removeWatch(it.code, it.market);
  uni.showToast({ title: "已移除", icon: "none" });
}

// 长按行：弹出操作菜单
function onRowLongPress(it: WatchItem) {
  uni.showActionSheet({
    itemList: ["编辑价格预警", "移入分组", "删除自选"],
    success: (res) => {
      const idx = res.tapIndex;
      if (idx === 0) editAlert(it);
      else if (idx === 1) showMoveGroup(it);
      else if (idx === 2) doRemove(it);
    },
  });
}

// 移入其他分组（含新建分组）
function showMoveGroup(it: WatchItem) {
  const others = groups.value.filter((g) => g !== it.group);
  const itemList = [...others, "+ 新建分组…"];
  uni.showActionSheet({
    itemList,
    success: (res) => {
      const idx = res.tapIndex;
      if (idx < others.length) {
        setItemGroup(it.code, it.market, others[idx]);
      } else {
        uni.showModal({
          title: "新建分组",
          editable: true,
          placeholderText: "分组名",
          content: "",
          success: (r) => {
            if (r.confirm && r.content?.trim()) setItemGroup(it.code, it.market, r.content.trim());
          },
        });
      }
    },
  });
}

function manageGroup(g: string) {
  uni.showActionSheet({
    itemList: ["重命名", "删除（组内项归入默认）"],
    success: (res) => {
      if (res.tapIndex === 0) {
        uni.showModal({
          title: "重命名分组",
          editable: true,
          content: g,
          success: (r) => {
            const v = r.content?.trim();
            if (r.confirm && v && v !== g) renameGroup(g, v);
          },
        });
      } else {
        uni.showModal({
          title: "删除分组",
          content: `确认删除「${g}」？组内股票将归入默认分组`,
          success: (r) => {
            if (r.confirm) deleteGroup(g);
          },
        });
      }
    },
  });
}
</script>

<style scoped>
/* 页面 = 顶部固定头部 + 可滚动内容区（flex 纵向布局，头部天然不随滚动） */
.wl-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.wl {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
}

/* ===== 头部（固定不随滚动；与社区 CommunityView 视觉一致） ===== */
.cm-header {
  flex: none;
  position: relative;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 18rpx 10rpx;
  background: var(--sticky-bg);
  backdrop-filter: blur(16rpx) saturate(140%);
  -webkit-backdrop-filter: blur(16rpx) saturate(140%);
  box-shadow: var(--sticky-shadow);
}
.cm-brand {
  font-size: 30rpx;
  font-weight: 700;
  letter-spacing: 1rpx;
  color: var(--text);
}
.cm-right {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
/* 实时涨/跌个股数 pill */
.ud-pill {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: var(--card-2);
}
.ud-item {
  display: flex;
  align-items: center;
  gap: 4rpx;
}
.ud-num {
  font-size: 20rpx;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.ud-num.up {
  color: var(--up);
}
.ud-num.down {
  color: var(--down);
}
.cm-me {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background: var(--card-2);
}
.cm-avatar {
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  overflow: hidden;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cm-name {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--text);
  max-width: 120rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 价格预警横幅 ===== */
.alert-banner {
  margin: 8rpx 16rpx 4rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.ab-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 18rpx 18rpx 18rpx 26rpx;
  background: linear-gradient(135deg, var(--primary-soft), transparent 62%);
  border: 1rpx solid var(--primary-soft);
  overflow: hidden;
}
.ab-item::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 8rpx;
  background: linear-gradient(180deg, var(--primary), rgba(7, 193, 96, 0.35));
}
.ab-ic {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: var(--primary-soft);
}
.ab-txt {
  flex: 1;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
}
.ab-action {
  flex: none;
  font-size: 22rpx;
  font-weight: 600;
  color: var(--primary);
  padding: 8rpx 22rpx;
  border-radius: 999rpx;
  background: var(--card-2);
  border: 1rpx solid var(--border);
}

/* ===== 空态 ===== */
.empty-wrap {
  padding: 40rpx 24rpx 0;
}
.empty-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  padding: 56rpx 40rpx;
  margin: 0 12rpx;
}
.empty-ic {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: var(--primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 6rpx;
}
.empty-t {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text);
}
.empty-s {
  font-size: 24rpx;
  color: var(--text-2);
  text-align: center;
  line-height: 1.7;
  padding: 0 20rpx;
}
.empty-btn {
  margin-top: 18rpx;
  padding: 0 56rpx;
}

/* ===== 自选股表格：全屏铺满 + 固定表头 + 名称列固定(横滑不丢) + 横向滚动 ===== */
.wl-grid {
  flex: 1;
  min-height: 0;
  width: 100%;
  background: var(--bg-2);
  display: flex;
  flex-direction: column;
}
.wl-thead,
.tr {
  display: flex;
  align-items: stretch;
  width: max-content;
  min-width: 100%;
}
.wl-thead {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--bg-2);
  /* 表头上下边框，样式与底部今日最热卡片边框一致（1rpx solid var(--tabbar-border)） */
  border-top: 1rpx solid var(--tabbar-border);
  border-bottom: 1rpx solid var(--tabbar-border);
}
.th {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 84rpx;
  padding: 0 18rpx;
  font-size: 28rpx;
  font-weight: 400;
  color: var(--text);
  text-align: right;
  cursor: pointer;
}
/* 表头名称列：与数据列同为固定列（左上角最高层级），背景同数据行；左内边距与数据行对齐(16rpx) */
.th.c-name {
  justify-content: flex-start;
  text-align: left;
  position: sticky;
  left: 0;
  z-index: 6;
  background: var(--bg-2);
  padding: 0 18rpx 0 12rpx;
}
/* 表头可排序：箭头指示 + 激活态高亮 */
.th-label {
  white-space: nowrap;
}
.sort-ic {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4rpx;
  margin-left: 4rpx;
  width: 16rpx;
}
.sort-ic .ar {
  width: 0;
  height: 0;
  border-left: 5rpx solid transparent;
  border-right: 5rpx solid transparent;
}
.sort-ic .ar.up {
  border-bottom: 6rpx solid var(--text-3);
}
.sort-ic .ar.dn {
  border-top: 6rpx solid var(--text-3);
}
.th.active .sort-ic .ar.up.on {
  border-bottom-color: var(--primary);
}
.th.active .sort-ic .ar.dn.on {
  border-top-color: var(--primary);
}
.th.active .sort-ic {
  color: var(--primary);
}
.tr {
  background: var(--bg-2);
}
.tr:active {
  background: var(--card-2);
}
.tr:active .c-name {
  background: var(--card-2);
}
.td {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 4rpx;
  height: 104rpx;
  padding: 0 18rpx;
  overflow: hidden;
  font-size: 26rpx;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
/* 固定名称列：横向滚动时始终可见 + 内容左对齐 */
.c-name {
  position: sticky;
  left: 0;
  z-index: 2;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 6rpx;
  width: 190rpx;
  padding: 0 12rpx 0 12rpx;
  text-align: left;
  background: var(--bg-2);
}
/* 列宽（合计 > 屏宽 → 横向滚动） */
.c-pct  { width: 150rpx; }
.c-chg  { width: 150rpx; }
.c-open { width: 130rpx; }
.c-amp  { width: 120rpx; }
.c-amt  { width: 150rpx; }
/* 名称列内部 */
.t-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  min-width: 0;
}
.t-name {
  font-size: 28rpx;
  font-weight: 400;
  color: var(--text);
  max-width: 150rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.25;
}
.t-sub {
  display: flex;
  align-items: center;
  gap: 6rpx;
  margin-top: 4rpx;
}
.t-mkt {
  flex: none;
  font-size: 18rpx;
  line-height: 1;
  padding: 2rpx 6rpx;
  border-radius: 6rpx;
  color: var(--text-2);
  background: var(--card-2);
  border: 1rpx solid var(--border);
}
.t-code {
  font-size: 20rpx;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  max-width: 130rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 数值单元格：主行(大) + 次行(小) */
.c-main {
  font-size: 27rpx;
  font-weight: 500;
  line-height: 1.2;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.c-sub {
  font-size: 20rpx;
  color: var(--text-2);
  line-height: 1.2;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.al-dot {
  position: absolute;
  left: 4rpx;
  top: 50%;
  transform: translateY(-50%);
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  border: 1rpx solid var(--border);
  background: transparent;
}
.al-dot.on {
  background: var(--primary);
  border-color: var(--primary);
}
/* 涨跌色 */
.up { color: var(--up); }
.down { color: var(--down); }
.flat { color: var(--text-2); }

/* ===== 轻提示 ===== */
.wl-hint {
  display: block;
  font-size: 22rpx;
  color: var(--text-2);
  text-align: center;
  padding: 8rpx 0 0;
}
/* 内容容器：min-height 撑满滚动区，使底部留白始终钉在滚动区最底部（不随内容浮动产生空白块） */
/* 内容包裹层 .wl-rows 不再设置 min-height:100%，避免内容不足一屏时拉伸出“行尾→卡片”间的空白 */
.bottom-pad {
  /* 固定占位：预留卡片(76rpx)+tabbar(110rpx) 高度，末行不被遮挡；
     margin-top:auto 使内容不足一屏时占位退到最底(被卡片遮挡)，内容超屏时在末尾预留卡片高度 */
  flex: none;
  margin-top: auto;
  height: calc(env(safe-area-inset-bottom) + 186rpx);
}

/* ===== 底部卡片：本地展开/收起（向上动效），自身承载完整榜单，无遮罩层 ===== */
.rank-peek {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(env(safe-area-inset-bottom) + 110rpx);
  width: 100%;
  max-width: 480px;
  height: 76rpx;
  z-index: 40;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 22rpx 22rpx 0 0;
  background: var(--tabbar-bg);
  backdrop-filter: blur(20rpx) saturate(150%);
  -webkit-backdrop-filter: blur(20rpx) saturate(150%);
  border-top: 1rpx solid var(--tabbar-border);
  transition: height var(--dur) var(--ease-out), transform var(--dur) var(--ease-out);
}
.rank-peek.open {
  height: 62vh;
}
/* 上拉铺满整页：从视口顶部到底部菜单栏之上（高度过渡由 --dur 控制） */
.rank-peek.max {
  height: calc(100vh - 110rpx - env(safe-area-inset-bottom));
}
/* 收起态一行 */
.rp-row {
  flex: none;
  height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  padding: 0 28rpx;
  cursor: pointer;
}
.rp-row:active {
  background: var(--card-2);
}
.rp-caret {
  flex: none;
}
.rp-top {
  flex: none;
  font-size: 22rpx;
  color: var(--text-3);
}
.rp-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10rpx;
  overflow: hidden;
}
.rp-name {
  font-size: 22rpx;
  color: var(--text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rp-sub {
  display: flex;
  align-items: center;
  gap: 6rpx;
  min-width: 0;
  overflow: hidden;
}
.rp-mkt {
  flex: none;
  font-size: 18rpx;
  line-height: 1;
  padding: 2rpx 6rpx;
  border-radius: 6rpx;
  color: var(--text-2);
  background: var(--card-2);
  border: 1rpx solid var(--border);
}
.rp-code {
  flex: none;
  font-size: 22rpx;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.rp-right {
  flex: none;
  display: flex;
  align-items: baseline;
  gap: 10rpx;
}
.rp-price {
  font-size: 24rpx;
  font-variant-numeric: tabular-nums;
}
.rp-price.up,
.rp-pct.up {
  color: var(--up);
}
.rp-price.down,
.rp-pct.down {
  color: var(--down);
}
.rp-pct {
  flex: none;
  font-size: 24rpx;
  font-variant-numeric: tabular-nums;
}

/* ===== 展开态：榜单面板 ===== */
.rp-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* 顶部拖拽区：比视觉手柄稍大便于下拉收起；touch-action:none 保证手势用于拖拽而非滚动 */
.rs-grip {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 26rpx;
  cursor: grab;
  touch-action: none;
}
.rs-grip:active {
  cursor: grabbing;
}
.rs-handle {
  width: 56rpx;
  height: 6rpx;
  border-radius: 999rpx;
  background: var(--card-2);
}
.rs-tabs {
  position: relative;
  flex: none;
  display: flex;
  margin: 2rpx 24rpx 0;
  padding: 0 0 8rpx;
  border-bottom: 1rpx solid var(--border);
}
.rs-tab {
  flex: 1;
  text-align: center;
  font-size: 23rpx;
  font-weight: 500;
  color: var(--text-2);
  padding: 2rpx 0;
  cursor: pointer;
  transition: color 0.2s ease;
}
.rs-tab.on {
  color: var(--primary);
  font-weight: 700;
}
.rs-ink {
  position: absolute;
  left: 0;
  bottom: -1rpx;
  width: 50%;
  display: flex;
  justify-content: center;
  transition: transform 0.28s var(--ease-out);
}
.rs-ink.right {
  transform: translateX(100%);
}
.rs-ink-bar {
  width: 46rpx;
  height: 4rpx;
  border-radius: 999rpx;
  background: var(--primary);
}
.rs-body {
  flex: 1;
  min-height: 0;
  padding: 4rpx 0 0;
}
</style>