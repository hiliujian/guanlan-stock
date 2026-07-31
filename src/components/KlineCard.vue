<script setup lang="ts">
// 行情图卡片：把「日K / 分时」的分支渲染收拢在此，使 MarketView 的卡片渲染可走
// 统一的 rendererMap（新增分析卡只需在注册表加一项，无需改动 MarketView 模板）。
import StockChart from "./StockChart.vue";

defineProps<{
  period: string;
  trends: any[];
  preClose: number;
  klines: any[];
  height?: number;
}>();
</script>

<template>
  <StockChart
    v-if="period === 'm' && trends.length"
    mode="intraday"
    :trends="trends"
    :pre-close="preClose"
    :height="height ?? 460"
  />
  <view v-else-if="period === 'm'" class="hint">暂无数据</view>
  <StockChart v-else mode="kline" :klines="klines" :height="height ?? 460" />
</template>

<style scoped>
.hint {
  padding: 40rpx 0;
  text-align: center;
  font-size: 24rpx;
  color: var(--text-3);
}
</style>
