<script setup lang="ts">
// 行情图卡片：把「日K / 分时 / 周K…」的分支渲染收拢在此，使 MarketView 的卡片渲染可走
// 统一的 rendererMap（新增分析卡只需在注册表加一项，无需改动 MarketView 模板）。
//
// 周期切换轴与行情图「合为同一张卡片」：分段控件直接渲染在本卡片顶部、图表上方，
// 切换周期时分段控件保持常驻（仅图表区转圈），不抢走用户对周期的控制权。
// 周期条右侧工具簇：画板(pen，淡入/淡出看盘画线工具栏) + 设置(gear，点击在图标下弹出开关列表)。
// 设置弹层含两组：① 辅助线 = 均线 MA（MA5/MA10/MA20/MA60，逐周期独立开关）
//        ② 智能标注 = 系统自动标注的压力/支撑/趋势/关键区间
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
//        ② 智能标注 = 系统自动标注的压力/支撑/趋势/关键区间（各线独立开关，无总开关）
const auxOpen = ref(false);
// 看盘画线工具栏开关：画板图标控制，淡入/淡出 StockChart 的 kc-tools
const toolsOpen = ref(false);
// 画板 / 设置 互斥：同一时刻仅一个弹层可见，点开其一先收起另一个
function toggleTools() {
  const next = !toolsOpen.value;
  toolsOpen.value = next;
  if (next) auxOpen.value = false;
}
function toggleAuxOpen() {
  const next = !auxOpen.value;
  auxOpen.value = next;
  if (next) toolsOpen.value = false;
}
type AuxKey = "pressure" | "support" | "trend" | "zone";
const auxItems: { key: AuxKey; label: string; desc: string; color: string }[] = [
  { key: "pressure", label: "压力线", desc: "红色虚线：上方阻力位", color: "#ef232a" },
  { key: "support", label: "支撑线", desc: "绿色虚线：下方支撑位", color: "#09b07a" },
  { key: "trend", label: "趋势线", desc: "蓝色箭头：上行 / 下行方向", color: "#2f74ff" },
  { key: "zone", label: "关键区间", desc: "阻力与支撑之间的阴影带", color: "rgba(108,122,145,0.55)" },
];
function toggleAux(key: AuxKey) {
  auxConfig[key] = !auxConfig[key];
}
// 辅助线（均线）开关：MA5/MA10/MA20/MA60 各自独立控制
const maItems = MA_PERIODS;
// 与图表 MA 线颜色一致（见 StockChart INDICATOR_LINE_COLORS 顺序：MA5橙/MA10蓝/MA20紫/MA60绿）
const MA_COLORS = ["#f5a623", "#1c9cf0", "#9b59b6", "#2ecc71", "#e11d74"];
function toggleMa(key: keyof typeof maConfig) {
  maConfig[key] = !maConfig[key];
}
</script>

<template>
  <!-- 周期切换 + 工具簇（画板/设置）：与行情图同一张卡片，置于图表上方 -->
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
    <!-- 工具簇：画板(自定义画线，淡入淡出工具栏) + 设置(齿轮，图标下弹出开关列表) -->
    <view class="tool-cluster">
      <view
        class="kline-tool-btn"
        :class="{ on: toolsOpen }"
        role="button"
        @click="toggleTools"
      >
        <OutlineIcon type="pen" :size="30" :color="toolsOpen ? 'var(--primary)' : 'var(--text-2)'" />
      </view>
      <view
        class="kline-tool-btn"
        :class="{ on: auxOpen }"
        role="button"
        @click="toggleAuxOpen"
      >
        <OutlineIcon type="gear" :size="30" :color="auxOpen ? 'var(--primary)' : 'var(--text-2)'" />
      </view>
      <!-- 设置弹层：锚定工具簇下方、图标右侧对齐；无遮罩、文档流内，永不超出可视区域 -->
      <view v-if="auxOpen" class="aux-pop anim-rise-soft">
        <view class="aux-pop-head">
          <text class="aux-pop-title">图表设置</text>
          <view class="aux-pop-close" role="button" @click="auxOpen = false">
            <OutlineIcon type="close" :size="30" color="var(--text-2)" />
          </view>
        </view>

        <!-- 分组一：辅助线 = 均线 MA（逐周期独立开关） -->
        <text class="aux-group">辅助线</text>
        <view v-for="(it, mi) in maItems" :key="it.key" class="aux-row">
          <view class="aux-left">
            <view class="aux-name-line">
              <view class="aux-color-dot" :style="{ background: MA_COLORS[mi] }"></view>
              <text class="aux-label">{{ it.label }}</text>
            </view>
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

        <!-- 分组二：智能标注 = 系统自动标注的压力 / 支撑 / 趋势 / 关键区间（各线独立开关） -->
        <text class="aux-group">智能标注</text>
        <view v-for="it in auxItems" :key="it.key" class="aux-row">
          <view class="aux-left">
            <view class="aux-name-line">
              <view class="aux-color-dot" :style="{ background: it.color }"></view>
              <text class="aux-label">{{ it.label }}</text>
            </view>
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
    :tools-open="toolsOpen"
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
    :tools-open="toolsOpen"
    :aux-config="auxConfig"
    :ma-config="maConfig"
  />
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
/* 工具簇：画板 + 设置，与分段控件同款药丸底，置于周期条右侧；position:relative 供设置弹层锚定 */
.tool-cluster {
  position: relative;
  z-index: 30;
  flex: none;
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 6rpx;
  background: var(--card-2);
  border-radius: 999rpx;
}
/* 工具簇内的单个图标按钮（画板 / 设置），与分段控件高度一致（60rpx） */
.kline-tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60rpx;
  height: 60rpx;
  color: var(--text-2);
  border-radius: 999rpx;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease, color 0.2s ease;
}
.kline-tool-btn:active {
  background: var(--primary-soft);
  transform: scale(0.94);
}
/* 工具开启态：浅绿底 + 主色图标（与分段控件 active 风格统一） */
.kline-tool-btn.on {
  background: var(--primary-soft);
  color: var(--primary);
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

/* 设置弹层：锚定工具簇下方、图标右侧对齐；玻璃卡 + 浮层阴影，无遮罩（避免被 Tab transform 钉死） */
.aux-pop {
  position: absolute;
  top: calc(100% + 8rpx);
  right: 0;
  z-index: 31;
  width: 384rpx;
  max-width: 72vw;
  max-height: 66vh;
  overflow-y: auto;
  padding: 0 20rpx 14rpx;
  background: var(--tabbar-bg);
  backdrop-filter: blur(20rpx);
  -webkit-backdrop-filter: blur(20rpx);
  border: 1rpx solid var(--border);
  border-radius: 20rpx;
  box-shadow: var(--shadow-sheet);
}
.aux-pop-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 66rpx;
  margin: 0 -20rpx 4rpx;
  padding: 0 20rpx;
  background: var(--tabbar-bg);
  backdrop-filter: blur(20rpx);
  -webkit-backdrop-filter: blur(20rpx);
  border-bottom: 1rpx solid var(--border);
}
.aux-pop-title {
  font-size: var(--font-md);
  color: var(--text);
}
.aux-pop-close {
  position: absolute;
  right: 4rpx;
  top: 50%;
  transform: translateY(-50%);
  width: 52rpx;
  height: 52rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  border-radius: 50%;
  cursor: pointer;
}
.aux-pop-close:active {
  background: var(--card-2);
}
/* 辅助线设置面板内的行布局 */
.aux-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14rpx;
  min-height: 84rpx;
}
.aux-left {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}
.aux-label {
  font-size: var(--font-sm);
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
/* 设置面板内的分组标题（辅助线 / 智能标注），与全局分组标题风格一致 */
.aux-group {
  display: block;
  margin: 12rpx 0 4rpx;
  font-size: var(--font-xs);
  color: var(--text-2);
  letter-spacing: 0.5rpx;
}
/* 设置弹层内的开关缩小（仅作用于本面板，不影响全局 .cc-switch） */
.aux-pop .cc-switch {
  width: 72rpx;
  height: 40rpx;
}
.aux-pop .cc-knob {
  top: 3rpx;
  left: 3rpx;
  width: 32rpx;
  height: 32rpx;
}
.aux-pop .cc-switch.on .cc-knob {
  transform: translateX(34rpx);
}
/* 智能标注行：颜色圆点 + 名称 同行，描述文字另起一行 */
.aux-name-line {
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.aux-color-dot {
  flex: none;
  width: 18rpx;
  height: 18rpx;
  border-radius: 50%;
}
</style>
