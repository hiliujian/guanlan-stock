<template>
  <view class="app-shell tab-host">
    <transition name="tab-fade" mode="out-in">
      <keep-alive>
        <component
        :is="currentComp"
        :key="currentKey"
        ref="tabRef"
        v-on="currentKey === 'watch' ? { 'open-market': onOpenMarket } : {}"
      />
      </keep-alive>
    </transition>

    <AppTabBar :tabs="tabs" :current="currentKey" @change="onChange" />

    <!-- 通知公告：根据当前 tab 匹配公告的 pages 字段，展示弹窗/横幅/轻提示 -->
    <AnnouncementOverlay :current-page="pageKey" />

    <AuthCallback />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, markRaw, onMounted, watch } from "vue";
import { onPullDownRefresh } from "@dcloudio/uni-app";
import MarketView from "@/views/MarketView.vue";
import WatchlistView from "@/views/WatchlistView.vue";
import CommunityView from "@/components/CommunityView.vue";
import ProfileView from "@/views/ProfileView.vue";
import AppTabBar, { type TabDef } from "@/components/AppTabBar.vue";
import AuthCallback from "@/components/AuthCallback.vue";
import AnnouncementOverlay from "@/components/AnnouncementOverlay.vue";
import type { TabKey } from "@/config/app";
import { enabledTabs } from "@/store/appConfig";
import { showInMenu } from "@/store/access";
import { useUser, userState } from "@/store/user";
import { initWatchlist } from "@/store/watchlist";
import { initMessageRealtime } from "@/store/community";
import { openInMarket, navTab, goTab } from "@/store/nav";
import { handleCallback } from "@/store/authFlow";

const currentKey = ref<TabKey>("market");

// Tab 元信息（key / 文案 / 图标）。是否展示由系统配置（menus）决定，见 tabs computed
const TAB_DEFS: Record<TabKey, TabDef> = {
  market: { key: "market", label: "行情", icon: "bars", iconActive: "bars" },
  watch: { key: "watch", label: "自选", icon: "star", iconActive: "star-filled" },
  community: { key: "community", label: "社区", icon: "chatbubble", iconActive: "chatbubble" },
  profile: { key: "profile", label: "我的", icon: "person", iconActive: "person" },
};
// 视图注册表：与 TabKey 一一对应，仅渲染被启用的 Tab
const COMP_REGISTRY: Record<TabKey, any> = {
  market: markRaw(MarketView),
  watch: markRaw(WatchlistView),
  community: markRaw(CommunityView),
  profile: markRaw(ProfileView),
};

// 配置驱动的 Tab 列表：远程关闭某模块（menus）或白名单 show_in_menu=false 时，自动从底部导航消失
// （showInMenu 取 page_access 表字段，与 menus 双维度控制；默认种子均 true，当前无视觉变化）
const tabKeys = computed(() => enabledTabs().filter((k) => showInMenu(k)));
const tabs = computed(() => tabKeys.value.map((k) => TAB_DEFS[k]));
const currentComp = computed(() => COMP_REGISTRY[currentKey.value]);
// 当前 tab 对应的页面标识，供 AnnouncementOverlay 匹配公告的 pages 字段
const pageKey = computed(() => currentKey.value);
// 持有当前激活 tab 的组件实例，供页面级下拉刷新路由到对应 refresh 方法
const tabRef = ref<any>(null);
useUser(); // 初始化用户态（含登录态监听），无需持有返回值

// 与 navTab 双向同步：其他页（如「我的」菜单 / 认证页守卫重定向）调用 goTab 时切换到对应 Tab
// immediate: 首页创建即反映全局当前 tab（如已登录访问登录页被守卫 reLaunch 回「我的」时，
// 需在 setup 阶段就把 currentKey 同步为 profile，否则会停在默认 market tab）
watch(
  () => navTab.currentKey,
  (k) => {
    if (k !== currentKey.value) currentKey.value = k;
  },
  { immediate: true }
);
// 兜底：当前 Tab 被远程配置关闭时回退到首个可用 Tab
watch(
  tabKeys,
  (keys) => {
    if (!keys.includes(currentKey.value)) currentKey.value = keys[0] || "market";
  },
  { immediate: true }
);

// 打开即用：启动即初始化用户态与自选（未登录走本地降级，无门禁）
initWatchlist();
// 消息中心实时订阅：启动即尝试建立（未登录时内部自动退订，登录态恢复后由下方 watch 补建）
initMessageRealtime();

// 关键修复：登录态恢复 / 切换（含冷启动时 Supabase 从 storage 异步恢复会话、以及登出）
// 后，自选数据源会随之切换 cloud/local。setup 里那次 initWatchlist() 只能覆盖首帧，
// 若当时会话尚未恢复，登录后自选会一直停留在本地/空。这里监听 loggedIn 变化重新初始化，
// 保证「重新登录后自选与分组」从云端正常持久化恢复。
watch(
  () => userState.loggedIn,
  () => {
    initWatchlist();
    initMessageRealtime(); // 登录态变化（含登出）时同步建/退订实时频道
  }
);

onMounted(() => {
  // 处理邮件确认回调：若以确认链接打开应用，自动验证并进入已登录态
  handleCallback();
});

// 页面级下拉刷新（index 是注册 page，可触发 onPullDownRefresh）：
// - 行情：路由到 MarketView.refresh()（全量刷新图表+资讯）
// - 自选：路由到 WatchlistView.refresh()（复载自选行情；自选不再用 scroll-view refresher，避免双 loading）
// - 社区：路由到 CommunityView.refresh()（重载帖子列表）
// - 我的：路由到 ProfileView.refresh()（重载个人资料 + 社区帖子，刷新我的帖子/赞过计数）
// 下拉刷新安全兜底：给每个 tab 的 refresh() 套一层硬超时（Promise.race），
// 避免任一 tab 的刷新 Promise 在网络异常时永不 settle，导致页面级 loading 动画
// （下拉刷新指示器）一直转、无法关闭。无论成功/失败/超时，最终都收起 loading。
function safeRefresh(fn: (() => Promise<unknown>) | undefined, ms = 12000): Promise<void> {
  if (!fn) return Promise.resolve();
  return Promise.race([
    Promise.resolve().then(fn).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]);
}

onPullDownRefresh(async () => {
  try {
    if (currentKey.value === "market") await safeRefresh(tabRef.value?.refresh);
    else if (currentKey.value === "watch") await safeRefresh(tabRef.value?.refresh);
    else if (currentKey.value === "community") await safeRefresh(tabRef.value?.refresh);
    else if (currentKey.value === "profile") await safeRefresh(tabRef.value?.refresh);
  } finally {
    uni.stopPullDownRefresh();
  }
});

function onChange(key: TabKey) {
  // goTab 已内置白名单拦截：未登录访问受限 Tab 会跳转登录页（见 src/store/nav.ts）
  goTab(key);
}
function onOpenMarket(payload: { code: string; market: string }) {
  openInMarket(payload.code, payload.market as any);
  // 必须通过 goTab 同步 navTab.currentKey，否则后续点「自选」时 goTab 赋相同值不触发
  // watcher，currentKey 卡在 market 切不回去（此前直接赋值 currentKey 漏同步 navTab）。
  goTab("market");
}
</script>

<style>
.tab-fade-enter-active,
.tab-fade-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.tab-fade-enter-from {
  opacity: 0;
  transform: translateY(14rpx);
}
.tab-fade-leave-to {
  opacity: 0;
  transform: translateY(-14rpx);
}
</style>
