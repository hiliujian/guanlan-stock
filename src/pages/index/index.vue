<template>
  <view class="app-shell">
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
import { useUser } from "@/store/user";
import { initWatchlist } from "@/store/watchlist";
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

// 配置驱动的 Tab 列表（响应式：远程关闭某模块后自动从底部导航消失）
const tabKeys = computed(() => enabledTabs());
const tabs = computed(() => tabKeys.value.map((k) => TAB_DEFS[k]));
const currentComp = computed(() => COMP_REGISTRY[currentKey.value]);
// 当前 tab 对应的页面标识，供 AnnouncementOverlay 匹配公告的 pages 字段
const pageKey = computed(() => currentKey.value);
// 持有当前激活 tab 的组件实例，供页面级下拉刷新路由到对应 refresh 方法
const tabRef = ref<any>(null);
useUser(); // 初始化用户态（含登录态监听），无需持有返回值

// 与 navTab 双向同步：其他页（如「我的」菜单）调用 goTab 时切换到对应 Tab
watch(
  () => navTab.currentKey,
  (k) => {
    if (k !== currentKey.value) currentKey.value = k;
  }
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

onMounted(() => {
  // 处理邮件确认回调：若以确认链接打开应用，自动验证并进入已登录态
  handleCallback();
});

// 页面级下拉刷新（index 是注册 page，可触发 onPullDownRefresh）：
// - 行情：路由到 MarketView.refresh()（全量刷新图表+资讯）
// - 自选：自选用内部 scroll-view 的 refresher 自行处理，这里跳过避免双触发
// - 社区：路由到 CommunityView.refresh()（重载帖子列表）
// - 我的：无刷新目标，直接收尾
onPullDownRefresh(async () => {
  try {
    if (currentKey.value === "market" && tabRef.value?.refresh) await tabRef.value.refresh();
    else if (currentKey.value === "community" && tabRef.value?.refresh) await tabRef.value.refresh();
  } finally {
    uni.stopPullDownRefresh();
  }
});

function onChange(key: TabKey) {
  // goTab 不再强制登录：未登录访问「自选 / 社区」由各页自身渲染「未登录」空态
  goTab(key);
}
function onOpenMarket(payload: { code: string; market: string }) {
  openInMarket(payload.code, payload.market as any);
  currentKey.value = "market";
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
