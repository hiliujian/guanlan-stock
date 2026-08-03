<template>
  <view class="app-shell">
    <transition name="tab-fade" mode="out-in">
      <keep-alive>
        <component :is="currentComp" :key="current" ref="tabRef" @open-market="onOpenMarket" />
      </keep-alive>
    </transition>

    <AppTabBar :current="current" @change="onChange" />

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
import AppTabBar from "@/components/AppTabBar.vue";
import AuthCallback from "@/components/AuthCallback.vue";
import AnnouncementOverlay from "@/components/AnnouncementOverlay.vue";
import { useUser } from "@/store/user";
import { initWatchlist } from "@/store/watchlist";
import { openInMarket, navTab, goTab } from "@/store/nav";
import { handleCallback } from "@/store/authFlow";

const current = ref(0);
const comps = markRaw([MarketView, WatchlistView, CommunityView, ProfileView]);
const currentComp = computed(() => comps[current.value]);
// 当前 tab 对应的页面标识，供 AnnouncementOverlay 匹配公告的 pages 字段
const pageKeys = ["market", "watchlist", "community", "profile"];
const pageKey = computed(() => pageKeys[current.value] || "*");
// 持有当前激活 tab 的组件实例，供页面级下拉刷新路由到对应 refresh 方法
const tabRef = ref<any>(null);
useUser(); // 初始化用户态（含登录态监听），无需持有返回值

// 与 navTab 双向同步：其他页（如「我的」菜单）调用 goTab 时切换到对应 Tab
watch(
  () => navTab.current,
  (i) => {
    if (i !== current.value) current.value = i;
  }
);

// 打开即用：启动即初始化用户态与自选（未登录走本地降级，无门禁）
initWatchlist();

onMounted(() => {
  // 处理邮件确认回调：若以确认链接打开应用，自动验证并进入已登录态
  handleCallback();
});

// 页面级下拉刷新（index 是注册 page，可触发 onPullDownRefresh）：
// - 行情 tab(0)：路由到 MarketView.refresh()（全量刷新图表+资讯）
// - 自选 tab(1)：自选用内部 scroll-view 的 refresher 自行处理，这里跳过避免双触发
// - 社区 tab(2)：路由到 CommunityView.refresh()（重载帖子列表）
// - 我的 tab(3)：无刷新目标，直接收尾
onPullDownRefresh(async () => {
  try {
    if (current.value === 0 && tabRef.value?.refresh) await tabRef.value.refresh();
    else if (current.value === 2 && tabRef.value?.refresh) await tabRef.value.refresh();
  } finally {
    uni.stopPullDownRefresh();
  }
});

function onChange(i: number) {
  // goTab 不再强制登录：未登录访问「自选 / 社区」由各页自身渲染「未登录」空态
  goTab(i);
}
function onOpenMarket(payload: { code: string; market: string }) {
  openInMarket(payload.code, payload.market as any);
  current.value = 0;
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
