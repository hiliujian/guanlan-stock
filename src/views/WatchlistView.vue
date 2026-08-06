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

    <scroll-view
      class="view-scroll"
      scroll-y
      @scroll="onScroll"
    >
    <view class="wl">
      <BackgroundFX />

      <!-- 自选内容 -->
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

        <!-- 列表：左删除层 + 两行卡片 + 预警铃最右侧居中 -->
        <view
          v-for="(row, i) in rows"
          :key="row.it.code + row.it.market"
          class="wl-row anim-fade-up"
          :class="{ open: openIdx === i, removing: removingIdx === i }"
          :style="{ animationDelay: (i % 8) * 40 + 'ms' }"
        >
          <view class="wl-del" @click="onDel(row.it, i)">
            <OutlineIcon type="trash" :size="28" color="#fff" />
            <text class="wl-del-t">删除</text>
          </view>
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
            <!-- 左列：名称(+分组) / 代码(+市场标签) 两行 -->
            <view class="wl-main">
              <view class="wl-name-row">
                <text class="wl-name">{{ row.it.name || row.it.code }}</text>
                <view v-if="row.it.group" class="grp-chip" @click.stop="moveToGroup(row.it)">
                  <OutlineIcon type="layers" :size="18" color="var(--primary)" />
                  <text>{{ row.it.group }}</text>
                </view>
              </view>
              <view class="wl-code-row">
                <view class="mkt-tag">{{ row.mkt }}</view>
                <text class="wl-code">{{ row.it.code }}</text>
              </view>
            </view>
            <!-- 中间：现价 / 涨跌幅 两行，右对齐 -->
            <view class="wl-right">
              <text class="wl-price" :class="{ 'is-loading': row.q.loading }" :style="{ color: priceColor(row.q) }">
                {{ row.q.loading ? "--" : fmtPrice(row.q.price) }}
              </text>
              <text class="wl-pct" :class="pctCls(row.q)">
                {{ row.q.loading ? "--" : fmtPct(row.q.pct) }}
              </text>
            </view>
            <!-- 最右侧：预警铃铛，垂直居中 -->
            <view class="wl-bell" :class="{ on: hasAlert(row.it) }" @tap.stop="editAlert(row.it)">
              <OutlineIcon type="bell" :size="28" :color="hasAlert(row.it) ? 'var(--primary)' : 'var(--text-3)'" />
            </view>
          </view>
        </view>

        <text v-if="list.length && !rows.length" class="wl-hint">该分组暂无股票</text>
        <text v-if="list.length" class="wl-hint">左滑股票可移除自选</text>

        <view class="bottom-pad" />
      </view>
    </scroll-view>

    <!-- 底部卡片：本地展开/收起（向上动效），自身承载完整榜单，无遮罩层。
         进入页面即渲染（不等数据）；peek 为 null 时显示 -- 占位。 -->
    <view class="rank-peek" :class="{ open: rankOpen }" :style="rankStyle">
      <!-- 收起态：一行「今日最热」摘要，点击展开；数据为 null 时显示 -- 占位 -->
      <view v-if="!rankOpen" class="rp-row" role="button" aria-label="展开榜单" @click="rankOpen = true">
        <text class="rp-top">今日最热</text>
        <view class="rp-main">
          <text class="rp-name">{{ peek ? peek.name : '--' }}</text>
          <text class="rp-code">{{ peek ? peek.code : '' }}</text>
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
          @touchstart="onGripDown" @touchmove="onGripMove" @touchend="onGripUp" @touchcancel="onGripUp"
          @mousedown="onGripDown" @mousemove="onGripMove" @mouseup="onGripUp" @mouseleave="onGripUp"
          @click="onGripTap"
        >
          <view class="rs-handle" />
        </view>
        <view class="rs-tabs">
          <text :class="['rs-tab', rankTab === 'today' ? 'on' : '']" @click="rankTab = 'today'">今日热榜</text>
          <text :class="['rs-tab', rankTab === 'all' ? 'on' : '']" @click="rankTab = 'all'">完整榜单</text>
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
import { fmtPrice, fmtPct } from "@/utils/format";

const emit = defineEmits<{ (e: "open-market", payload: { code: string; market: string }): void }>();

const wl = useWatchlist();
const list = computed(() => wl.items as WatchItem[]);

// 榜单弹层 + 底部露出卡片：默认展示「今日热榜 / 完整榜单」切换
const rankOpen = ref(false);
const rankTab = ref<"today" | "all">("today");

// 露出卡片预览数据：当前选中榜单的第 1 名（一行最热股）
interface PeekRow {
  code: string;
  name: string;
  chg: number;
  pct: number | null;
  price: number | null;
}
const peek = ref<PeekRow | null>(null);

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

// 下拉刷新：自选列表复载行情（由页面级下拉刷新 onPullDownRefresh 触发，见 index.vue）
async function onRefresh() {
  await loadQuotesSafe();
}
// 暴露给页面级下拉刷新（index.vue onPullDownRefresh 路由到此，避免 scroll-view 与页面级双 loading）
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

// 现价颜色：跟随涨跌（平盘用主文字色）
function priceColor(q: Snap): string {
  if (q.chg > 0) return "var(--up)";
  if (q.chg < 0) return "var(--down)";
  return "var(--text)";
}
function pctCls(q: Snap): string {
  if (q.loading) return "flat";
  if (q.chg > 0) return "up";
  if (q.chg < 0) return "down";
  return "flat";
}

// 榜单弹层：点击热榜股票跳转行情页并关闭弹层
function onSheetOpenMarket(p: { code: string; market: string }) {
  closeRank();
  emit("open-market", p);
}
// 关闭榜单弹层
function closeRank() {
  rankOpen.value = false;
}

// 拖拽缩回：面板顶部手柄区支持「下拉收起」，配合 height/transform 过渡实现平滑动效
const dragY = ref(0);
const dragging = ref(false);
let gripStartY = 0;
let gripMoved = false;
const rankStyle = computed(() =>
  dragging.value
    ? { transform: `translateX(-50%) translateY(${dragY.value}px)`, transition: "none" }
    : {}
);
function onGripDown(e: any) {
  dragging.value = true;
  dragY.value = 0;
  gripMoved = false;
  gripStartY = ptY(e);
}
function onGripMove(e: any) {
  if (!dragging.value) return;
  const dy = ptY(e) - gripStartY;
  // 仅允许向下拖拽收起；上滑加阻尼，避免误触影响面板内滚动
  dragY.value = dy < 0 ? dy * 0.2 : dy;
  if (Math.abs(dragY.value) > 4) gripMoved = true;
  if (dy > 0 && e.cancelable) {
    try {
      e.preventDefault();
    } catch (_) {}
  }
}
function onGripUp() {
  if (!dragging.value) return;
  const dy = dragY.value;
  dragging.value = false;
  dragY.value = 0;
  if (dy > 80) closeRank(); // 下拉超过阈值即收起
}
function onGripTap() {
  if (gripMoved) {
    gripMoved = false;
    return; // 拖拽结束后不触发点击收起，避免重复动作
  }
  closeRank();
}

onMounted(() => {
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
onUnmounted(stopPolling);
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

// ===== 左滑删除（方向锁定 + 果冻阻尼 + 回弹展开；滑到底自动删除，也可点红色按钮删除）=====
function rpx2px(rpx: number): number {
  const w = typeof window !== "undefined" && window.innerWidth ? window.innerWidth : 375;
  return Math.round((rpx / 750) * w);
}
const DEL_W = rpx2px(150);
const OPEN_TRIGGER = Math.round(DEL_W * 0.42);
const DELETE_TRIGGER = -DEL_W * 0.99;
const dragIdx = ref(-1);
const openIdx = ref(-1);
const removingIdx = ref(-1);
const offsets = reactive<Record<number, number>>({});
const suppressClick = ref(false);
let startX = 0;
let startY = 0;
let baseOffset = 0;
let lockDir: "" | "h" | "v" = "";
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

function withResistance(target: number): number {
  const LEFT_MAX = -DEL_W * 1.7;
  if (target < -DEL_W) {
    const over = target + DEL_W;
    target = -DEL_W + over * 0.32;
    if (target < LEFT_MAX) target = LEFT_MAX;
  } else if (target > 0) {
    target = target * 0.32;
  }
  return target;
}

function onDown(e: any, i: number) {
  const isTouch = !!e.type && e.type.indexOf("touch") === 0;
  if (isTouch) lastTouch = Date.now();
  if (!isTouch && Date.now() - lastTouch < 600) return;
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
    dragIdx.value = -1;
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

function onUp(e: any, i: number, it: WatchItem) {
  if (dragIdx.value !== i) return;
  dragIdx.value = -1;
  if (lockDir !== "h") return;
  const x = ptX(e);
  const now = Date.now();
  const dt = Math.max(1, now - lastT);
  const vx = (x - lastX) / dt;
  const final = offsets[i] || 0;
  if (final <= DELETE_TRIGGER || (vx < -0.6 && final <= -OPEN_TRIGGER)) {
    triggerDelete(i, it);
  } else if (final <= -OPEN_TRIGGER) {
    openRow(i);
  } else {
    closeRow(i);
  }
}

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
function closeAll() {
  if (dragIdx.value !== -1 || removingIdx.value !== -1) return;
  for (const k of Object.keys(offsets)) offsets[Number(k)] = 0;
  openIdx.value = -1;
}
function onScroll() {
  closeAll();
}

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

function onDel(it: WatchItem, i: number) {
  if (removingIdx.value === i) return;
  triggerDelete(i, it);
}

function triggerDelete(i: number, it: WatchItem) {
  removingIdx.value = i;
  offsets[i] = -DEL_W * 3;
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

// 移动股票到其他分组（含新建分组）
function moveToGroup(it: WatchItem) {
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
.view-scroll {
  flex: 1;
  min-height: 0;
  height: auto;
}
.wl {
  padding: 18rpx 0 0;
}

/* ===== 头部（固定不随滚动；与社区 CommunityView 视觉一致） ===== */
.cm-header {
  flex: none;
  position: relative;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12rpx 22rpx 14rpx;
  background: var(--sticky-bg);
  backdrop-filter: blur(16rpx) saturate(140%);
  -webkit-backdrop-filter: blur(16rpx) saturate(140%);
  box-shadow: var(--sticky-shadow);
}
.cm-brand {
  font-size: 40rpx;
  font-weight: 800;
  letter-spacing: 2rpx;
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
  font-size: 24rpx;
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

/* ===== 列表行：外层红底裁切单卡片；静止时盖住红底，左滑露出删除区 ===== */
.wl-row {
  position: relative;
  margin: 0 16rpx 14rpx;
  border-radius: 20rpx;
  overflow: hidden;
  background: linear-gradient(135deg, #ff5b5b, #e5484d);
  box-shadow: var(--shadow);
  max-height: 164rpx;
  transition: max-height 0.3s ease 0.06s;
}
.wl-row.removing {
  max-height: 0;
}
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
  background: rgba(0, 0, 0, 0.12);
}
.wl-del-t {
  font-size: 24rpx;
  font-weight: 600;
}

.wl-item {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 20rpx;
  min-height: 132rpx;
  padding: 24rpx 22rpx;
  background: var(--bg-2);
  border: 1rpx solid var(--border);
  border-top: none;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.wl-row.open .wl-item {
  transition: transform 0.46s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.wl-item.no-trans {
  transition: none;
}
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
  gap: 12rpx;
  min-width: 0;
}
.wl-name {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text);
  max-width: 280rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wl-code-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-top: 10rpx;
}
.wl-code {
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
.grp-chip {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4rpx;
  max-width: 160rpx;
  font-size: 18rpx;
  line-height: 1;
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
  color: var(--primary);
  background: var(--primary-soft);
  overflow: hidden;
  white-space: nowrap;
}
.grp-chip text {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 中间列：现价 + 涨跌幅右对齐 */
.wl-right {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6rpx;
  text-align: right;
}
.wl-price {
  font-size: 34rpx;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
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

/* 最右侧：预警铃铛，垂直居中 */
.wl-bell {
  flex: none;
  width: 60rpx;
  height: 60rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--card-2);
  transition: all 0.15s ease;
}
.wl-bell.on {
  background: var(--primary-soft);
}

/* ===== 轻提示 ===== */
.wl-hint {
  display: block;
  font-size: 22rpx;
  color: var(--text-2);
  text-align: center;
  padding: 8rpx 0 0;
}
.bottom-pad {
  /* 预留底部被菜单栏 + 今日最热卡片占用的高度，避免内容被卡片遮挡 */
  height: calc(env(safe-area-inset-bottom) + 216rpx);
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
  align-items: baseline;
  gap: 10rpx;
  overflow: hidden;
}
.rp-name {
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
/* 顶部拖拽区：比视觉手柄更大，便于下拉收起；touch-action:none 保证手势用于拖拽而非滚动 */
.rs-grip {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 44rpx;
  cursor: grab;
  touch-action: none;
}
.rs-grip:active {
  cursor: grabbing;
}
.rs-handle {
  width: 68rpx;
  height: 8rpx;
  border-radius: 999rpx;
  background: var(--card-2);
}
.rs-tabs {
  flex: none;
  display: flex;
  gap: 10rpx;
  margin: 8rpx 24rpx 6rpx;
  padding: 8rpx;
  border-radius: 999rpx;
  background: var(--card-2);
  border: 1rpx solid var(--border);
}
.rs-tab {
  flex: 1;
  text-align: center;
  font-size: 25rpx;
  font-weight: 600;
  color: var(--text-2);
  padding: 14rpx 0;
  border-radius: 999rpx;
  transition: all 0.2s ease;
}
.rs-tab.on {
  color: #fff;
  background: var(--primary);
  box-shadow: var(--shadow-up);
}
.rs-body {
  flex: 1;
  min-height: 0;
  padding: 4rpx 0 0;
}
</style>