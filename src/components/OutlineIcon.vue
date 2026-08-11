<template>
  <!-- H5：内联 SVG（无需字体，绝不会再出现“图标不显示”） -->
  <svg
    v-if="h5"
    viewBox="0 0 24 24"
    :style="{ color, display: 'inline-block', verticalAlign: 'middle', flex: 'none', width: (size||24)+'rpx', height: (size||24)+'rpx' }"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="outline-icon"
    v-html="svgBody"
    @click="$emit('click')"
  />
  <!-- 微信小程序：回退到 uni-icons 字体图标。
       注意：必须用动态 <component :is> 而非静态 <uni-icons>。
       静态组件标签会被 Vue 提升为模块顶层 resolveComponent("uni-icons")，
       在 H5（未注册 uni-icons）下一加载就报 “Failed to resolve component”。
       改用动态 :is 后，解析延迟到渲染时，H5 走 v-else 永不执行 → 不再告警；
       小程序下才解析 'uni-icons'（那边已注册），跨端能力保留。 -->
  <component
    v-else
    :is="uniIconName"
    :type="type"
    :size="size"
    :color="color"
    class="outline-icon"
    @click="$emit('click')"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  type: string;
  size?: number;
  color?: string;
}>();
defineEmits<{ (e: "click"): void }>();

const h5 = typeof window !== "undefined" && typeof document !== "undefined";
// 仅非 H5（微信小程序等）时使用的回退组件名；H5 走 v-else 永不解析，避免 “uni-icons 未注册” 告警。
const uniIconName = "uni-icons";

// 24x24 outline 图标路径（stroke=currentColor）
const ICONS: Record<string, { body: string; filled?: boolean }> = {
  search: { body: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' },
  close: { body: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>' },
  bars: { body: '<line x1="7" y1="20" x2="7" y2="12"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="17" y1="20" x2="17" y2="9"/>' },
  bell: {
    body: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  },
  plus: { body: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>' },
  minus: { body: '<line x1="5" y1="12" x2="19" y2="12"/>' },
  user: {
    body:
      '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  },
  "arrow-down": { body: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="6 13 12 19 18 13"/>' },
  "arrow-up": { body: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/>' },
  "arrow-left": { body: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="11 6 5 12 11 18"/>' },
  "arrow-right": { body: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/>' },
  gear: {
    body: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  },
  info: {
    body: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.8" fill="currentColor" stroke="none"/>',
  },
  flag: { body: '<line x1="5" y1="21" x2="5" y2="3"/><path d="M5 4h12l-2 4 2 4H5"/>' },
  camera: {
    body: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 7l1.5-3h5L16 7"/>',
  },
  trash: {
    body: '<polyline points="3 6 21 6"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
  },
  person: { body: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>' },
  locked: { body: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>' },
  shield: {
    body: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><polyline points="9 12 11 14 15 9.5"/>',
  },
  // 火焰（实心）：热度列明确使用火焰图标，数值以白字叠加于火焰中心保证可读
  fire: {
    body: '<path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-1 .4-2 1-3 .3 1.5 1.5 1.8 1.5 1.8S10 6 12 3z"/><path d="M12 21a6 6 0 0 0 6-6c0-2-1-3-2-4 0 2-2 3-2 3s3 1 3 4a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2-2 3-2 3s3 1 3 4a6 6 0 0 0 0 0z"/>',
    filled: true,
  },
  star: {
    body: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1.1 6.1L12 17.9 6.5 20.9l1.1-6.1L3.2 9.5l6.1-.9z"/>',
  },
  "star-filled": {
    body: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1.1 6.1L12 17.9 6.5 20.9l1.1-6.1L3.2 9.5l6.1-.9z"/>',
    filled: true,
  },
  pulldown: { body: '<polyline points="6 9 12 15 18 9"/>' },
  "chevron-up": { body: '<polyline points="6 15 12 9 18 15"/>' },
  // 筹码/层级（叠加多层）
  layers: {
    body: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  },
  medal: { body: '<circle cx="12" cy="14" r="6"/><path d="M9 2l3 6 3-6"/>' },
  chatbubble: {
    body: '<path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z"/>',
  },
  color: {
    body: '<polyline points="3 12 7 12 10 4 14 20 17 12 21 12"/>',
  },
  // 拖拽手柄：2×3 圆点，filled
  grip: {
    body: '<circle cx="9" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.5" fill="currentColor" stroke="none"/>',
    filled: true,
  },
  // 刷新 / 重置
  refresh: {
    body: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  },
  // 列设置 / 字段显隐（表格列网格）
  columns: {
    body: '<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/><line x1="3" y1="12" x2="21" y2="12"/>',
  },
  // 资讯 / 新闻（报纸）
  news: {
    body: '<path d="M4 5h13v14H5a1 1 0 0 1-1-1z"/><path d="M17 8h3v11a1 1 0 0 1-1 1h-2"/><line x1="7" y1="8" x2="14" y2="8"/><line x1="7" y1="12" x2="14" y2="12"/><line x1="7" y1="16" x2="11" y2="16"/>',
  },
  // 点赞 / 喜欢（描边）
  heart: {
    body: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
  },
  // 点赞 / 喜欢（填充，已点赞态）
  "heart-filled": {
    body: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
    filled: true,
  },
  // 发送 / 发布（纸飞机）
  send: {
    body: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  },
  // 邮件（信封）
  mail: {
    body: '<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/>',
  },
  // 编辑 / 修改（铅笔）
  edit: {
    body: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  },
  // 眼睛（显示密码）
  eye: {
    body: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  },
  // 眼睛（隐藏密码 / 划线）
  "eye-off": {
    body: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  },
  // 对勾（成功）
  check: {
    body: '<polyline points="20 6 9 17 4 12"/>',
  },
  // 警告（三角感叹号）
  warning: {
    body: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  },
  // 皇冠（股神徽章）
  crown: {
    body: '<path d="M3 7l4.5 4L12 3l4.5 8L21 7l-1.4 12H4.4z"/>',
    filled: true,
  },
  // 奖杯（资深操盘手 / 私募经理徽章）
  trophy: {
    body: '<path d="M8 4h8v4a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 3"/><path d="M16 6h3a3 3 0 0 1-3 3"/><path d="M12 12v4"/><path d="M9 20h6"/><path d="M10 16h4l-1 4h-2z"/>',
    filled: true,
  },
  // 定位（上次登录地点）
  location: {
    body: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  },
  // 时钟（上次登录时间）
  clock: {
    body: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
  },
  // 手机 / 设备（上次登录设备）
  phone: {
    body: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.5-1.5a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z"/>',
  },
  // 金属锭（金/银/铜等大宗商品图标，fill 由外层 currentColor 控制）
  metal: {
    body: '<polygon points="6 8 18 8 20 15 4 15"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="8" y1="8" x2="7" y2="15"/><line x1="16" y1="8" x2="17" y2="15"/>',
  },
  // 原油（水滴）
  oil: {
    body: '<path d="M12 3c3.5 4.5 5.5 7.5 5.5 10.5a5.5 5.5 0 0 1-11 0c0-3 2-6 5.5-10.5z"/>',
  },
};

const svgBody = computed(() => {
  const ic = ICONS[props.type] || ICONS.info;
  const extra = ic.filled ? ' fill="currentColor" stroke="none"' : "";
  return `<g${extra}>${ic.body}</g>`;
});
</script>

<style scoped>
.outline-icon {
  line-height: 1;
}
</style>
