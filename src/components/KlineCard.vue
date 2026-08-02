<script setup lang="ts">
// 行情图卡片：把「日K / 分时 / 周K…」的分支渲染收拢在此，使 MarketView 的卡片渲染可走
// 统一的 rendererMap（新增分析卡只需在注册表加一项，无需改动 MarketView 模板）。
//
// 周期切换轴与行情图「合为同一张卡片」：分段控件直接渲染在本卡片顶部、图表上方，
// 而非行情头部下方那个独立的悬浮胶囊。切换周期时分段控件保持常驻（仅图表区转圈），
// 不抢走用户对周期的控制权。
import StockChart from "./StockChart.vue";
import { PERIODS, PERIOD_ORDER, type PeriodKey } from "@/utils/period";
import { computed } from "vue";

const props = defineProps<{
  period: PeriodKey;
  trends: any[];
  preClose: number;
  klines: any[];
  height?: number;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: "pick", p: PeriodKey): void;
}>();

const periodOrder = PERIOD_ORDER;
const periodMeta = PERIODS;

// 周期分段滑动指示条：宽度按段数均分，位移按激活下标平移（纯 CSS calc，响应式）
const indStyle = computed(() => {
  const n = periodOrder.length;
  const i = periodOrder.indexOf(props.period);
  return {
    width: `calc((100% - 12rpx - ${(n - 1) * 8}rpx) / ${n})`,
    transform: `translateX(calc(${i} * (100% + 8rpx)))`,
  };
});

function pick(p: PeriodKey) {
  if (p === props.period) return;
  emit("pick", p);
}
</script>

<template>
  <!-- 周期切换：与行情图同一张卡片，置于图表上方 -->
  <view class="period-seg">
    <view class="ps-ind" :style="indStyle" />
    <text
      v-for="p in periodOrder"
      :key="p"
      :class="['ps', period === p ? 'active' : '']"
      role="button"
      @click="pick(p)"
      >{{ periodMeta[p].label }}</text
    >
  </view>

  <!-- 切换周期时仅图表区转圈，分段控件保持常驻 -->
  <view v-if="loading" class="chart-loading">
    <view class="cl-spin" />
  </view>
  <StockChart
    v-else-if="period === 'm' && trends.length"
    mode="intraday"
    :trends="trends"
    :pre-close="preClose"
    :height="height ?? 460"
    :show-ma="true"
    :show-macd="true"
  />
  <view v-else-if="period === 'm'" class="hint">暂无数据</view>
  <StockChart
    v-else
    mode="kline"
    :klines="klines"
    :height="height ?? 460"
    :show-ma="true"
    :show-macd="true"
  />
</template>

<style scoped>
/* 周期分段控件：与行情图同一张卡片，作为卡片内顶部的一行控件 */
.period-seg {
  position: relative;
  display: flex;
  gap: 8rpx;
  padding: 6rpx;
  margin-bottom: 12rpx;
  background: var(--card-2);
  border-radius: 999rpx;
}
/* 滑动指示条：跟随激活段平移（位移见 indStyle） */
.ps-ind {
  position: absolute;
  top: 6rpx;
  bottom: 6rpx;
  left: 6rpx;
  border-radius: 999rpx;
  background: var(--primary);
  box-shadow: var(--shadow-up);
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 0;
}
.ps {
  position: relative;
  z-index: 1;
  flex: 1;
  /* 触摸目标 ≥44px（移动端可达性规范），用固定 px 保证任意屏都不缩水 */
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 26rpx;
  color: var(--text-2);
  border-radius: 999rpx;
  cursor: pointer;
  transition: color 0.2s ease, background 0.15s ease, transform 0.1s ease;
}
.ps:active {
  background: var(--primary-soft, rgba(99, 102, 241, 0.12));
  transform: scale(0.96);
}
.ps.active {
  color: #fff;
  font-weight: 600;
}
/* 切换周期时的图表区加载态：居中转圈，不替换整张卡片（控件常驻） */
.chart-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200rpx;
  padding: 20rpx 0;
}
.cl-spin {
  width: 44rpx;
  height: 44rpx;
  border: 4rpx solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.hint {
  padding: 40rpx 0;
  text-align: center;
  font-size: 24rpx;
  color: var(--text-3);
}
</style>
