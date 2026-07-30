<template>
  <view class="app-shell">
    <transition name="tab-fade" mode="out-in">
      <keep-alive>
        <component :is="currentComp" :key="current" @open-market="onOpenMarket" />
      </keep-alive>
    </transition>

    <AppTabBar :current="current" @change="onChange" />

    <AuthModal :visible="navState.authVisible" @close="closeAuth" @success="onAuthSuccess" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, markRaw } from "vue";
import MarketView from "@/views/MarketView.vue";
import WatchlistView from "@/views/WatchlistView.vue";
import ProfileView from "@/views/ProfileView.vue";
import AppTabBar from "@/components/AppTabBar.vue";
import AuthModal from "@/components/AuthModal.vue";
import { useUser, refreshProfile } from "@/store/user";
import { initWatchlist } from "@/store/watchlist";
import { navState, openInMarket, closeAuth } from "@/store/nav";

const current = ref(0);
const comps = markRaw([MarketView, WatchlistView, ProfileView]);
const currentComp = computed(() => comps[current.value]);

// 打开即用：启动即初始化用户态与自选（未登录走本地降级，无门禁）
useUser();
initWatchlist();

function onChange(i: number) {
  current.value = i;
}
function onOpenMarket(payload: { code: string; market: string }) {
  openInMarket(payload.code, payload.market as any);
  current.value = 0;
}
function onAuthSuccess() {
  refreshProfile();
  initWatchlist();
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
