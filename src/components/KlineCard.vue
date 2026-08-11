<script setup lang="ts">
// 行情图卡片：把「日K / 分时 / 周K…」的分支渲染收拢在此，使 MarketView 的卡片渲染可走
// 统一的 rendererMap（新增分析卡只需在注册表加一项，无需改动 MarketView 模板）。
//
// 周期切换轴与行情图「合为同一张卡片」：分段控件直接渲染在本卡片顶部、图表上方，
// 切换周期时分段控件保持常驻（仅图表区转圈），不抢走用户对周期的控制权。
// 行情图「图表设置」齿轮（年K 末尾）：点击展开内联面板，含「辅助线(均线 MA)」与「智能画线(压力/支撑/趋势/关键区间)」两组开关。
import StockChart from "./StockChart.vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import { PERIODS, PERIOD_ORDER, type PeriodKey } from "@/utils/period";
import { auxConfig } from "@/store/chartAux";
import { maConfig, MA_PERIODS } from "@/store/chartMa";
import { computed, ref } from "vue";

const props = defineProps<{
  period: PeriodKey;
  trends: any[];
  preClose: number;
  klines: any[];
  height?: number;
  loading?: boolean;
  /** 实时最新价（与头部同源 5s 快照），分时模式同步到走势图最后一根，确保与卡片一致 */
  livePrice?: number;
  livePreClose?: number;
  /** 当前股票代码：透传给 StockChart 用于看盘画线按股票持久化 */
  code?: string;
  /** 是否显示看盘画线工具栏（仅行情页主图启用） */
  showTools?: boolean;
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

// ---- 图表设置抽屉（齿轮点开）----
// 含两组：① 辅助线 = 均线 MA（MA5/MA10/MA20/MA60，逐周期独立开关）
//        ② 智能画线 = 系统自动标注的压力/支撑/趋势/关键区间
const auxOpen = ref(false);
type AuxKey = "pressure" | "support" | "trend" | "zone";
const auxItems: { key: AuxKey; label: string; desc: string }[] = [
  { key: "pressure", label: "压力线", desc: "红色虚线：上方阻力位" },
  { key: "support", label: "支撑线", desc: "绿色虚线：下方支撑位" },
  { key: "trend", label: "趋势线", desc: "蓝色箭头：上行 / 下行方向" },
  { key: "zone", label: "关键区间", desc: "阻力与支撑之间的阴影带" },
];
function toggleAux(key: AuxKey) {
  auxConfig[key] = !auxConfig[key];
}
function closeAux() {
  auxOpen.value = false;
}
// 辅助线（均线）开关：MA5/MA10/MA20/MA60 各自独立控制
const maItems = MA_PERIODS;
function toggleMa(key: keyof typeof maConfig) {
  maConfig[key] = !maConfig[key];
}
// 齿轮高亮：任一 MA 或智能画线开启即高亮（反映「图表设置」里有内容开着）
const gearOn = computed(
  () => auxConfig.enabled || maConfig.ma5 || maConfig.ma10 || maConfig.ma20 || maConfig.ma60
);
</script>

<template>
  <!-- 周期切换 + 辅助线设置：与行情图同一张卡片，置于图表上方 -->
  <view class="period-bar">
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
    <!-- 年K 末尾的设置齿轮：点击展开「图表设置」面板（辅助线 MA + 智能画线） -->
    <view
      class="period-gear"
      :class="{ on: gearOn }"
      role="button"
      @click="auxOpen = true"
    >
      <OutlineIcon type="gear" :size="30" :color="gearOn ? 'var(--primary)' : 'var(--text-2)'" />
    </view>
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
    :live-price="livePrice"
    :live-pre-close="livePreClose"
    :code="code"
    :show-tools="showTools"
    :auto-draw="showTools"
    :aux-config="auxConfig"
    :ma-config="maConfig"
  />
  <view v-else-if="period === 'm'" class="hint">暂无数据</view>
  <StockChart
    v-else
    mode="kline"
    :period="period"
    :klines="klines"
    :height="height ?? 460"
    :show-ma="true"
    :show-macd="true"
    :code="code"
    :show-tools="showTools"
    :auto-draw="showTools"
    :aux-config="auxConfig"
    :ma-config="maConfig"
  />

  <!-- 图表设置：内联展开面板（无遮罩、文档流内，保证永不超出可视区域，点击齿轮展开、可收起） -->
  <view v-if="auxOpen" class="aux-panel anim-rise-soft">
    <view class="aux-head">
      <text class="aux-title">图表设置</text>
      <view class="aux-close" role="button" @click="closeAux">
        <OutlineIcon type="close" :size="32" color="var(--text-2)" />
      </view>
    </view>

    <!-- 分组一：辅助线 = 均线 MA（逐周期独立开关） -->
    <text class="aux-group">辅助线</text>
    <view v-for="it in maItems" :key="it.key" class="aux-row">
      <view class="aux-left">
        <text class="aux-label">{{ it.label }}</text>
        <text class="aux-desc">{{ it.period }} 日移动平均线</text>
      </view>
      <view
        class="cc-switch"
        :class="{ on: maConfig[it.key] }"
        hover-class="cc-switch-hover"
        role="button"
        @click="toggleMa(it.key)"
      >
        <view class="cc-knob" />
      </view>
    </view>

    <view class="aux-sep" />

    <!-- 分组二：智能画线 = 系统自动标注的压力 / 支撑 / 趋势 / 关键区间 -->
    <text class="aux-group">智能画线</text>
    <view class="aux-row">
      <view class="aux-left">
        <text class="aux-label">智能画线</text>
        <text class="aux-desc">系统自动标注的压力 / 支撑 / 趋势与关键区间</text>
      </view>
      <view
        class="cc-switch"
        :class="{ on: auxConfig.enabled }"
        hover-class="cc-switch-hover"
        role="button"
        @click="auxConfig.enabled = !auxConfig.enabled"
      >
        <view class="cc-knob" />
      </view>
    </view>
    <view v-for="it in auxItems" :key="it.key" class="aux-row">
      <view class="aux-left">
        <text class="aux-label">{{ it.label }}</text>
        <text class="aux-desc">{{ it.desc }}</text>
      </view>
      <view
        class="cc-switch"
        :class="{ on: auxConfig[it.key] }"
        hover-class="cc-switch-hover"
        role="button"
        @click="toggleAux(it.key)"
      >
        <view class="cc-knob" />
      </view>
    </view>
  </view>
</template>

<style scoped>
/* 周期 + 设置：同一行，与行情图同一张卡片，作为卡片内顶部的一行控件 */
.period-bar {
  display: flex;
  align-items: stretch;
  gap: 10rpx;
  margin-bottom: 12rpx;
}
/* 周期分段控件：药丸底（--card-2），内部 5 段均分 */
.period-seg {
  position: relative;
  flex: 1;
  display: flex;
  gap: 8rpx;
  padding: 6rpx;
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
  /* 高度与搜索按钮统一为 60rpx（固定 height，避免 UA 默认最小高度膨胀导致两者不一致）；
     flex 居中保证文字垂直对齐，滑动指示条 .ps-ind(top/bottom:6rpx) 自动跟随 */
  height: 60rpx;
  line-height: 60rpx;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: var(--font-sm);
  color: var(--text-2);
  border-radius: 999rpx;
  cursor: pointer;
  transition: color 0.2s ease, background 0.15s ease, transform 0.1s ease;
}
.ps:active {
  background: var(--primary-soft);
  transform: scale(0.96);
}
.ps.active {
  color: #fff;
  letter-spacing: 0.5rpx;
}
/* 设置齿轮：与分段控件同款药丸，置于年K 末尾；总开关开启时图标显主色，关闭时显次级灰 */
.period-gear {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  background: var(--card-2);
  border-radius: 999rpx;
  color: var(--text-2);
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease, color 0.2s ease;
}
.period-gear:active {
  background: var(--primary-soft);
  transform: scale(0.94);
}
/* 切换到图表区的加载态：居中转圈，不替换整张卡片（控件常驻） */
.chart-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200rpx;
  padding: 20rpx 0;
}
/* .cl-spin 已提升至全局（见 global.css） */
.hint {
  padding: 40rpx 0;
  text-align: center;
  font-size: var(--font-sm);
  color: var(--text-2);
}

/* 辅助线设置：内联展开面板（无遮罩、文档流内，保证永不超出可视区域） */
.aux-panel {
  margin-bottom: 12rpx;
  padding: 8rpx 20rpx 14rpx;
  background: var(--card);
  border: 1rpx solid var(--border);
  border-radius: 20rpx;
  box-shadow: var(--shadow-2);
}
.aux-head {
  flex: none;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 76rpx;
  margin: 0 -20rpx 6rpx;
  padding: 0 20rpx;
  border-bottom: 1rpx solid var(--border);
}
.aux-title {
  font-size: var(--font-lg);
  font-weight: 600;
  color: var(--text);
}
.aux-close {
  position: absolute;
  right: 8rpx;
  top: 50%;
  transform: translateY(-50%);
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  border-radius: 50%;
  cursor: pointer;
}
.aux-close:active {
  background: var(--card-2);
}
/* 辅助线设置面板内的行布局 */
.aux-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  min-height: 98rpx;
}
.aux-left {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  min-width: 0;
}
.aux-label {
  font-size: var(--font-md);
  color: var(--text);
}
.aux-desc {
  font-size: var(--font-xs);
  color: var(--text-2);
  line-height: 1.4;
}
.aux-sep {
  height: 1rpx;
  background: var(--border);
  margin: 6rpx 0;
}
/* 设置面板内的分组标题（辅助线 / 智能画线），与全局分组标题风格一致 */
.aux-group {
  display: block;
  margin: 12rpx 0 4rpx;
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: 0.5rpx;
}
</style>
