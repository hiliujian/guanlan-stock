<template>
  <view class="chart-box" :style="{ height: boxH + 'px' }">
    <view ref="el" class="echart-el" :style="{ height: boxH + 'px' }"></view>
    <view v-if="!ready && !errorMsg" class="chart-empty">
      <text>加载中…</text>
    </view>
    <view v-if="errorMsg" class="chart-error">
      <text>{{ errorMsg }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import * as echarts from "echarts";

const props = withDefaults(
  defineProps<{
    opts: any;
    height?: number; // 以 rpx 传入：随手机宽度自适应（不同手机比例一致），桌面端用 MAX_PX 封顶防爆
  }>(),
  { height: 440 }
);

// 高度按视口宽度换算（rpx：750rpx = 屏宽），这样不同手机上比例一致（自适应）；
// 但宽屏桌面预览会把图拉得巨大，故用 MAX_PX 封顶。
function rpx2px(rpx: number): number {
  const w = typeof window !== "undefined" && window.innerWidth ? window.innerWidth : 375;
  return Math.round((rpx / 750) * w);
}
const MAX_PX = 420;
const boxH = Math.min(rpx2px(props.height), MAX_PX);

const el = ref<any>(null);
const ready = ref(false);
const errorMsg = ref("");
let chart: any = null;
let ro: ResizeObserver | null = null;
let retryTimer: any = null;
let tries = 0;

// 关键修复：uni-app H5 下 ref 指向 <view> 拿到的是组件代理，不是 DOM 元素。
// 必须穿透到 $el 才能拿到真实节点（否则 clientWidth/observe 全部失效 → 图表永远不画）。
function dom(): HTMLElement | null {
  const r = el.value as any;
  if (!r) return null;
  if (typeof Element !== "undefined" && r instanceof Element) return r as HTMLElement;
  if (r && r.$el && r.$el instanceof Element) return r.$el as HTMLElement;
  return null;
}

// 仅在容器拿到真实宽高时才 init，避免 0 尺寸导致 init 失败 / 画布空白。
function tryInit(): boolean {
  if (chart) return true;
  const node = dom();
  if (!node) return false;
  const w = node.clientWidth || node.offsetWidth || 0;
  const h = node.clientHeight || node.offsetHeight || 0;
  if (!w || !h) return false; // 还没布局好，等下一帧 / 重试定时器 再试
  try {
    chart = echarts.init(node);
    ready.value = true;
    return true;
  } catch (e: any) {
    errorMsg.value = "图表初始化失败：" + (e && e.message ? e.message : "未知错误");
    return false;
  }
}

function draw() {
  // 数据还没准备好，保持加载态（重试定时器会再次进来，数据到位即画）
  if (!props.opts) return;
  if (!chart && !tryInit()) return; // 容器尺寸未就绪，等重试
  try {
    // notMerge=true：每次 setOption 完整替换，切股/切周期都不会残留旧数据
    chart.setOption(props.opts, true);
  } catch (e: any) {
    errorMsg.value = "图表渲染失败：" + (e && e.message ? e.message : "未知错误");
  }
}

// 兜底重试：onMounted / watch 任一时序错过，只要数据到位且尺寸就绪就一定能画出来。
function startRetry() {
  if (retryTimer) return;
  retryTimer = setInterval(() => {
    tries++;
    if (chart || errorMsg.value) {
      stopRetry();
      return;
    }
    const node = dom();
    // 数据或尺寸任一未就绪就继续等（最多 ~8s）
    if (props.opts && node && (node.clientWidth || node.offsetWidth)) {
      draw();
      if (chart || errorMsg.value) stopRetry();
    }
    if (tries > 60) stopRetry();
  }, 120);
}
function stopRetry() {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
}

function onResize() {
  const node = dom();
  if (!chart) {
    if (node) {
      tryInit() && draw();
    }
    return;
  }
  chart.resize();
}

onMounted(async () => {
  await nextTick();
  draw();
  startRetry();
  // 监听容器尺寸变化：必须拿到真实 DOM 元素才能 observe，否则抛错。
  if (typeof window !== "undefined" && window.ResizeObserver) {
    ro = new ResizeObserver(() => onResize());
    const node = dom();
    if (node && typeof node.nodeType === "number") {
      try {
        ro.observe(node);
      } catch (e) {
        // 极少数环境 observe 失败也不影响初次绘制，忽略。
      }
    }
  }
  window.addEventListener("resize", onResize);
});

// opts 变化（切股 / 切周期 / 数据加载完成）→ 重新绘制
watch(
  () => props.opts,
  () => draw(),
  { deep: false }
);

onBeforeUnmount(() => {
  stopRetry();
  const node = dom();
  if (ro && node) {
    try {
      ro.unobserve(node);
    } catch (e) {}
    ro.disconnect();
  }
  window.removeEventListener("resize", onResize);
  if (chart) {
    chart.dispose();
    chart = null;
  }
});
</script>

<style scoped>
.chart-box {
  width: 100%;
  position: relative;
  background: var(--card);
  border-radius: var(--radius-sm);
}
.echart-el {
  width: 100%;
}
.chart-empty,
.chart-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  font-size: 24rpx;
}
.chart-error {
  color: var(--up);
  padding: 0 24rpx;
  text-align: center;
}
</style>
