<template>
  <view class="app-shell">
    <transition name="tab-fade" mode="out-in">
      <keep-alive>
        <component :is="currentComp" :key="current" @open-market="onOpenMarket" />
      </keep-alive>
    </transition>

    <AppTabBar :current="current" @change="onChange" />

    <AuthCallback />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, markRaw, onMounted, watch } from "vue";
import MarketView from "@/views/MarketView.vue";
import WatchlistView from "@/views/WatchlistView.vue";
import CommunityView from "@/components/CommunityView.vue";
import ProfileView from "@/views/ProfileView.vue";
import AppTabBar from "@/components/AppTabBar.vue";
import AuthCallback from "@/components/AuthCallback.vue";
import { useUser } from "@/store/user";
import { initWatchlist } from "@/store/watchlist";
import { openInMarket, navTab, goTab } from "@/store/nav";
import { handleCallback } from "@/store/authFlow";

const current = ref(0);
const comps = markRaw([MarketView, WatchlistView, CommunityView, ProfileView]);
const currentComp = computed(() => comps[current.value]);
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
