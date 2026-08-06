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
            <view class="th c-name">
              <view class="th-tools">
                <view
                  class="th-ic"
                  :class="{ on: reorderMode }"
                  role="button"
                  aria-label="拖拽排序"
                  @click="toggleReorder"
                >
                  <OutlineIcon type="grip" :size="28" :color="reorderMode ? 'var(--primary)' : 'var(--text-3)'" />
                </view>
                <view class="th-ic" role="button" aria-label="列设置" @click="showCols = true">
                  <OutlineIcon type="columns" :size="28" :color="'var(--text-3)'" />
                </view>
              </view>
            </view>
            <view v-if="cols.pct" class="th c-pct" :class="{ active: sortKey === 'pct' }" @click="toggleSort('pct')">
              <text class="th-label">涨跌幅</text>
              <view class="sort-ic">
                <view class="ar up" :class="{ on: sortKey === 'pct' && sortDir === 'asc' }" />
                <view class="ar dn" :class="{ on: sortKey === 'pct' && sortDir === 'desc' }" />
              </view>
            </view>
            <view v-if="cols.price" class="th c-price" :class="{ active: sortKey === 'price' }" @click="toggleSort('price')">
              <text class="th-label">最新</text>
              <view class="sort-ic">
                <view class="ar up" :class="{ on: sortKey === 'price' && sortDir === 'asc' }" />
                <view class="ar dn" :class="{ on: sortKey === 'price' && sortDir === 'desc' }" />
              </view>
            </view>
            <view v-if="cols.chg" class="th c-chg" :class="{ active: sortKey === 'chg' }" @click="toggleSort('chg')">
              <text class="th-label">涨跌额</text>
              <view class="sort-ic">
                <view class="ar up" :class="{ on: sortKey === 'chg' && sortDir === 'asc' }" />
                <view class="ar dn" :class="{ on: sortKey === 'chg' && sortDir === 'desc' }" />
              </view>
            </view>
            <view v-if="cols.open" class="th c-open" :class="{ active: sortKey === 'open' }" @click="toggleSort('open')">
              <text class="th-label">今开</text>
              <view class="sort-ic">
                <view class="ar up" :class="{ on: sortKey === 'open' && sortDir === 'asc' }" />
                <view class="ar dn" :class="{ on: sortKey === 'open' && sortDir === 'desc' }" />
              </view>
            </view>
            <view v-if="cols.amp" class="th c-amp" :class="{ active: sortKey === 'amp' }" @click="toggleSort('amp')">
              <text class="th-label">振幅</text>
              <view class="sort-ic">
                <view class="ar up" :class="{ on: sortKey === 'amp' && sortDir === 'asc' }" />
                <view class="ar dn" :class="{ on: sortKey === 'amp' && sortDir === 'desc' }" />
              </view>
            </view>
            <view v-if="cols.amt" class="th c-amt" :class="{ active: sortKey === 'amt' }" @click="toggleSort('amt')">
              <text class="th-label">成交额</text>
              <view class="sort-ic">
                <view class="ar up" :class="{ on: sortKey === 'amt' && sortDir === 'asc' }" />
                <view class="ar dn" :class="{ on: sortKey === 'amt' && sortDir === 'desc' }" />
              </view>
            </view>
          </view>
          <view class="wl-body">
          <view
            v-for="row in renderRows"
            :key="row.it.code + row.it.market"
            class="tr"
            :class="{ reordering: reorderMode, dragging: dragKey === keyOf(row.it) }"
            @click="onItemClick(row.it)"
            @longpress="onRowLongPress(row.it)"
          >
            <!-- 固定列：拖拽手柄(仅整理模式) + 预警点 + 名称 + (市场徽标 + 代码) -->
            <view class="td c-name" :class="{ 'has-handle': reorderMode }">
              <view
                v-if="reorderMode"
                class="drag-handle"
                :class="{ on: dragKey === keyOf(row.it) }"
                role="button"
                aria-label="拖动排序"
                @click.stop
                @touchstart.stop="onDragStart($event, row.it)"
                @touchmove.stop="onDragMove"
                @touchend.stop="onDragEnd"
                @touchcancel.stop="onDragEnd"
                @mousedown.stop="onDragStart($event, row.it)"
                @mousemove.stop="onDragMove"
                @mouseup.stop="onDragEnd"
                @mouseleave.stop="onDragEnd"
              >
                <OutlineIcon type="grip" :size="30" :color="dragKey === keyOf(row.it) ? 'var(--primary)' : 'var(--text-3)'" />
              </view>
              <view class="t-block">
                <text class="t-name">{{ row.it.name || row.it.code }}</text>
                <view class="t-sub">
                  <text class="t-mkt">{{ row.mkt }}</text>
                  <text class="t-code">{{ row.it.code }}</text>
                </view>
              </view>
            </view>
            <!-- 涨跌幅（独立数值列，与榜单同款样式） -->
            <view v-if="cols.pct" class="td c-pct">
              <text class="st-num" :class="pctCls(row.q)">{{ row.q.loading ? '--' : fmtPct(row.q.pct) }}</text>
            </view>
            <!-- 最新价（独立数值列） -->
            <view v-if="cols.price" class="td c-price">
              <text class="st-num" :class="pctCls(row.q)">{{ row.q.loading ? '--' : fmtPrice(row.q.price) }}</text>
            </view>
            <view v-if="cols.chg" class="td c-chg">
              <text class="st-num" :class="pctCls(row.q)">{{ row.q.loading ? '--' : fmtSigned(row.q.chg) }}</text>
            </view>
            <view v-if="cols.open" class="td c-open">
              <text class="st-num">{{ row.q.loading ? '--' : fmtPrice(row.q.open) }}</text>
            </view>
            <view v-if="cols.amp" class="td c-amp">
              <text class="st-num">{{ row.q.loading ? '--' : ampPct(row.q) }}</text>
            </view>
            <view v-if="cols.amt" class="td c-amt">
              <text class="st-num">{{ row.q.loading ? '--' : fmtAmount(row.q.amount) }}</text>
            </view>
          </view>
          </view>
          </view>
        </scroll-view>

        <!-- 列设置面板：选择展示/隐藏的数据列（本地持久化） -->
        <view v-if="showCols" class="col-mask" @click="showCols = false">
          <view class="col-sheet" @click.stop>
            <view class="col-grip"><view class="col-handle" /></view>
            <view class="col-head">
              <text class="col-title">显示列</text>
              <view class="col-close" role="button" aria-label="关闭" @click="showCols = false">
                <OutlineIcon type="close" :size="28" color="var(--text-2)" />
              </view>
            </view>
            <view class="col-list">
              <view
                v-for="c in colDefs"
                :key="c.key"
                class="col-item"
                :class="{ off: !cols[c.key] }"
                role="button"
                @click="toggleCol(c.key)"
              >
                <text class="col-name">{{ c.label }}</text>
                <view class="col-sw" :class="{ on: cols[c.key] }"><view class="col-knob" /></view>
              </view>
            </view>
            <text class="col-tip">设置仅保存在本机，不影响其他设备</text>
          </view>
        </view>

        <!-- 底部卡片：固定常驻于菜单栏上方(始终可见)，本地展开/收起，无遮罩层 -->
        <view class="rank-peek" :class="{ open: rankOpen, max: rankMax }" :style="rankStyle">
          <view v-if="!rankOpen" class="rp-row" role="button" aria-label="展开榜单" @click="rankOpen = true">
            <text class="rp-top">今日最热</text>
            <view class="rp-main">
              <text class="rp-name">{{ peek ? peek.name : '--' }}</text>
              <text class="rp-code">{{ peek ? peek.code : '--' }}</text>
            </view>
            <view class="rp-right">
              <text class="rp-price" :class="peek ? (peek.chg >= 0 ? 'up' : 'down') : ''">{{ peek && peek.price != null ? fmtPrice(peek.price) : '--' }}</text>
              <text class="rp-pct" :class="peek ? (peek.chg >= 0 ? 'up' : 'down') : ''">{{ peek && peek.pct != null ? fmtPct(peek.pct) : '--' }}</text>
            </view>
            <OutlineIcon class="rp-caret" type="chevron-up" :size="20" color="var(--text-2)" />
          </view>
          <view v-if="rankOpen" class="rp-panel">
            <view class="rs-grip" @touchstart.stop="onGripDown" @touchmove.stop="onGripMove" @touchend.stop="onGripUp" @touchcancel.stop="onGripUp" @mousedown.stop="onGripDown" @mousemove.stop="onGripMove" @mouseup.stop="onGripUp" @mouseleave.stop="onGripUp" @click.stop="onGripTap"><view class="rs-handle" /></view>
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
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted, onActivated, onDeactivated, onUnmounted } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import BackgroundFX from "@/components/BackgroundFX.vue";
import RankView from "@/views/RankView.vue";
import { useWatchlist, removeWatch, setItemGroup, setAlerts, renameGroup, deleteGroup, applyGroupOrder, type WatchItem, type PriceAlert } from "@/store/watchlist";
import { userState } from "@/store/user";
import { openAuth, goTab } from "@/store/nav";
import { fetchSnapshot } from "@/api/quote";
import { fetchStockHeat } from "@/api/heat";
import { resolveSecid, marketCharFor } from "@/utils/period";
import { getMarketStatus } from "@/utils/marketStatus";
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
// 露出卡片预览数据：人气榜第 1 名（与热度榜口径一致：跨用户持有数），并补最新行情
async function loadPeek() {
  const heat = await fetchStockHeat(20);
  if (!heat.length) {
    peek.value = null;
    return;
  }
  const top = heat[0];
  const secid = resolveSecid(top.code, top.market as any);
  try {
    const s = await fetchSnapshot(secid);
    peek.value = { code: top.code, name: top.name, chg: s.chg, pct: s.pct, price: s.price };
  } catch {
    peek.value = { code: top.code, name: top.name, chg: 0, pct: null, price: null };
  }
}

// 切换榜单类型时同步刷新露出卡片的预览
watch(rankTab, () => loadPeek());

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
    // 休市期间个股数据不变：跳过自动刷新（首次加载已完成），开市后下一拍自动恢复
    if (!getMarketStatus().open) return;
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

// ===== 列显隐：本地持久化（wl_cols），默认全显 =====
type ColKey = "pct" | "price" | "chg" | "open" | "amp" | "amt";
const COLS_KEY = "wl_cols";
const colDefs: { key: ColKey; label: string }[] = [
  { key: "pct", label: "涨跌幅" },
  { key: "price", label: "最新" },
  { key: "chg", label: "涨跌额" },
  { key: "open", label: "今开" },
  { key: "amp", label: "振幅" },
  { key: "amt", label: "成交额" },
];
const cols = reactive<Record<ColKey, boolean>>({ pct: true, price: true, chg: true, open: true, amp: true, amt: true });
function loadCols() {
  try {
    const saved = uni.getStorageSync(COLS_KEY);
    if (saved && typeof saved === "object") {
      (Object.keys(cols) as ColKey[]).forEach((k) => {
        if (typeof saved[k] === "boolean") cols[k] = saved[k];
      });
    }
  } catch (_) {}
}
function toggleCol(k: ColKey) {
  cols[k] = !cols[k];
  try {
    uni.setStorageSync(COLS_KEY, { ...cols });
  } catch (_) {}
}
const showCols = ref(false);

// ===== 自定义排序（拖拽手柄） =====
const reorderMode = ref(false);
function toggleReorder() {
  reorderMode.value = !reorderMode.value;
  // 进入整理模式：先捕获「当前可见顺序」(可能正处于列排序态) 作为拖拽基准，
  // 再清除列排序——避免「先点表头排序、再拖拽」时列表跳变、拖拽位置不生效。
  if (reorderMode.value) {
    manualOrder.value = renderRows.value.map((r) => keyOf(r.it));
    sortKey.value = "";
  }
}

// 可见顺序（键序列），拖拽时实时重排；默认随 displayRows（按分组 + sort_order）
const manualOrder = ref<string[]>([]);
watch(
  () => displayRows.value.map((r) => keyOf(r.it)).slice().sort().join(","),
  () => {
    manualOrder.value = displayRows.value.map((r) => keyOf(r.it));
  }
);
// 渲染行：列排序优先；否则按手动顺序（拖拽结果）
const renderRows = computed(() => {
  if (sortKey.value) return displayRows.value;
  const idx = new Map(manualOrder.value.map((k, i) => [k, i]));
  return displayRows.value
    .slice()
    .sort((a, b) => (idx.get(keyOf(a.it)) ?? 0) - (idx.get(keyOf(b.it)) ?? 0));
});

// 拖拽状态（仅单分组视图可拖拽；"全部"视图隐藏手柄）
const dragKey = ref<string | null>(null);
let dragStartY = 0;
let rowHpx = 0;
let dragMoved = false;
function dragPtY(e: any): number {
  if (e.touches && e.touches[0]) return e.touches[0].clientY;
  if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY;
  return e.clientY || 0;
}
function onDragStart(e: any, it: WatchItem) {
  if (sortKey.value) sortKey.value = ""; // 拖拽即自定义顺序，清除列排序
  dragKey.value = keyOf(it);
  dragStartY = dragPtY(e);
  dragMoved = false;
  try {
    const info: any = (uni as any).getWindowInfo ? (uni as any).getWindowInfo() : uni.getSystemInfoSync();
    const w = info.windowWidth || 375;
    rowHpx = (w / 750) * 104; // .td 行高 104rpx → px
  } catch (_) {
    rowHpx = 50;
  }
  if (e.cancelable) {
    try {
      e.preventDefault();
    } catch (_) {}
  }
}
function onDragMove(e: any) {
  if (!dragKey.value) return;
  const dy = dragPtY(e) - dragStartY;
  if (Math.abs(dy) > 4) dragMoved = true;
  const arr = manualOrder.value;
  const from = arr.indexOf(dragKey.value);
  if (from < 0) return;
  let to = from + Math.round(dy / rowHpx);
  to = Math.max(0, Math.min(arr.length - 1, to));
  if (to !== from) {
    const next = arr.slice();
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    manualOrder.value = next;
    dragStartY = dragPtY(e); // 锚点重置，下一步以新位置为基准
  }
  if (e.cancelable) {
    try {
      e.preventDefault();
    } catch (_) {}
  }
}
function onDragEnd() {
  if (!dragKey.value) return;
  dragKey.value = null;
  if (dragMoved) {
    // “全部”视图按整个列表排序（group 传 "*"，store 内忽略分组维度整体重排）
    const group = selectedGroup.value === "__all__" ? "*" : selectedGroup.value;
    applyGroupOrder(group, manualOrder.value);
  }
}

// 表头排序：点击列头切换 升/降序；null(加载中) 始终排末尾（名称列固定，不参与排序）
type SortKey = "pct" | "price" | "chg" | "open" | "amp" | "amt" | "";
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
    case "price": return q.price ?? null;
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
  if (q.loading) return "st-flat";
  if (q.chg > 0) return "st-up";
  if (q.chg < 0) return "st-down";
  return "st-flat";
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
  loadCols();
  if (typeof window !== "undefined") {
    window.addEventListener("resize", measureViewport);
    window.addEventListener("orientationchange", measureViewport);
  }
  if (!needLogin.value) loadQuotesSafe();
  loadPeek();
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
  if (reorderMode.value) return; // 整理顺序模式下禁用点击跳转
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
@import "../styles/stock-table.css";
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
  /* 内容区底边精确落在「今日最热」卡片顶沿：卡片固定位于菜单栏上方，
     距视口底 = 菜单栏110rpx + 卡片76rpx + 安全区 = 186rpx+safe。
     这样表格(scroll-view) 高度 = 顶栏底 → 卡片顶，末行紧贴卡片、无预留空白。 */
  padding: 0 0 calc(env(safe-area-inset-bottom) + 186rpx);
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
  font-size: 22rpx;
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
}
/* scroll-view 真实内容容器：H5 下为 .uni-scroll-view-content，组件默认 height:100%。
   这里改 height:auto + min-height:100% 并设为纵向 flex：
   - 内容不足一屏：容器撑满视口高，.wl-rows 内 .tr:first-of-type 的 margin-top:auto
     把整组行顶到容器底部 → 末行紧贴固定卡片（底边已在 .wl 处裁剪到卡片顶沿），空白
     自然转移到首行之上；
   - 内容超一屏：容器随内容增高，margin-top:auto 归零，正常从上往下滚动。 */
.wl-grid :deep(.uni-scroll-view-content) {
  height: auto;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
.wl-thead,
.tr {
  flex: none;
  display: flex;
  align-items: stretch;
  width: max-content;
  min-width: 100%;
}
/* 行容器：填满内容区高度；列表不足一屏时，内部 .wl-body 的 auto 外边距把行顶到底部 */
.wl-rows {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* 数据行包裹层：占据表头以下、卡片顶沿以上的全部空间。
   - 内容不足一屏：flex:1 填满容器高度，.tr:first-of-type 的 margin-top:auto 把整组
     行顶到该层底部，末行紧贴卡片顶沿，空白转移到首行之上（末行与卡片之间无空白）。
   - 内容超一屏：min-height:0 允许本层被内容撑高并溢出，由外层 scroll-view 滚动，
     滚到底时末行正好停在卡片上方、全部可见。 */
.wl-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.wl-body > .tr:first-of-type {
  margin-top: auto;
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
/* 表头名称列：与数据列同为固定列（左上角最高层级），背景同数据行；左内边距与顶部栏一致(18rpx) */
.th.c-name {
  justify-content: flex-start;
  text-align: left;
  position: sticky;
  left: 0;
  z-index: 6;
  background: var(--bg-2);
  padding: 0 18rpx 0 18rpx;
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
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
/* 固定名称列：横向滚动时始终可见 + 内容左对齐；左padding与顶部栏一致(18rpx) */
.c-name {
  position: sticky;
  left: 0;
  z-index: 2;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 6rpx;
  width: 200rpx;
  padding: 0 10rpx 0 18rpx;
  text-align: left;
  background: var(--bg-2);
}
/* 列宽（合计 > 屏宽 → 横向滚动） */
.c-pct  { width: 150rpx; }
.c-price { width: 150rpx; }
.c-chg  { width: 150rpx; }
.c-open { width: 130rpx; }
.c-amp  { width: 120rpx; }
.c-amt  { width: 180rpx; }
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
  max-width: 160rpx;
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
  max-width: 92rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* ===== 底部卡片：固定常驻于菜单栏上方(始终可见)，本地展开/收起，无遮罩层 ===== */
/* 仅 border-top 与表格表头边框同款，无阴影 */
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
/* 代码紧挨名称显示（不再被 flex:1 推到最右）；名称超长时省略号截断 */
.rp-name {
  flex: none;
  max-width: 220rpx;
  min-width: 0;
  font-size: 22rpx;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* ===== 名称表头工具图标（拖动排序 / 列设置） ===== */
.th-tools {
  display: flex;
  align-items: center;
  gap: 2rpx;
  margin-left: 6rpx;
}
.th-ic {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44rpx;
  height: 44rpx;
  cursor: pointer;
}

/* ===== 行内拖动手柄（常驻，仅单分组视图显示） ===== */
.drag-handle {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40rpx;
  height: 56rpx;
  margin-left: -6rpx;
  cursor: grab;
  touch-action: none;
}
.drag-handle:active {
  cursor: grabbing;
}
.tr.reordering .td {
  cursor: grabbing;
}
.tr.dragging {
  background: var(--primary-soft);
}
.tr.dragging .c-name {
  background: var(--primary-soft);
}

/* ===== 列设置面板（底部弹出） ===== */
.col-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.col-sheet {
  width: 100%;
  max-width: 480px;
  background: var(--tabbar-bg);
  backdrop-filter: blur(20rpx) saturate(150%);
  -webkit-backdrop-filter: blur(20rpx) saturate(150%);
  border-radius: 22rpx 22rpx 0 0;
  padding: 12rpx 24rpx calc(env(safe-area-inset-bottom) + 24rpx);
  box-shadow: 0 -8rpx 30rpx rgba(0, 0, 0, 0.25);
}
/* 顶部拖拽手柄：与热榜弹窗(rank-peek)同款，强化「底部弹出层」视觉一致性 */
.col-grip {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 26rpx;
  margin-bottom: 4rpx;
  cursor: grab;
  touch-action: none;
}
.col-grip:active {
  cursor: grabbing;
}
.col-handle {
  width: 56rpx;
  height: 6rpx;
  border-radius: 999rpx;
  background: var(--card-2);
}
.col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.col-title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--text);
}
.col-close {
  flex: none;
  width: 44rpx;
  height: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.col-list {
  margin-top: 16rpx;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.col-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22rpx 16rpx;
  border-radius: 14rpx;
  background: var(--card-2);
  cursor: pointer;
}
.col-item.off {
  opacity: 0.55;
}
.col-name {
  font-size: 28rpx;
  color: var(--text);
}
.col-sw {
  position: relative;
  width: 80rpx;
  height: 44rpx;
  border-radius: 999rpx;
  background: var(--border);
  transition: background 0.2s ease;
}
.col-sw.on {
  background: var(--primary);
}
.col-knob {
  position: absolute;
  top: 4rpx;
  left: 4rpx;
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s ease;
}
.col-sw.on .col-knob {
  transform: translateX(36rpx);
}
.col-tip {
  margin-top: 16rpx;
  font-size: 20rpx;
  color: var(--text-3);
  text-align: center;
}
</style>