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
  <!-- 微信小程序：回退到 uni-icons 字体图标 -->
  <uni-icons
    v-else
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

// 24x24 outline 图标路径（stroke=currentColor）
const ICONS: Record<string, { body: string; filled?: boolean }> = {
  search: { body: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' },
  close: { body: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>' },
  bars: { body: '<line x1="7" y1="20" x2="7" y2="12"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="17" y1="20" x2="17" y2="9"/>' },
  plus: { body: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>' },
  "arrow-down": { body: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="6 13 12 19 18 13"/>' },
  "arrow-right": { body: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/>' },
  "arrowright": { body: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/>' },
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
  fire: {
    body: '<path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-1 .4-2 1-3 .3 1.5 1.5 1.8 1.5 1.8S10 6 12 3z"/><path d="M12 21a6 6 0 0 0 6-6c0-2-1-3-2-4 0 2-2 3-2 3s3 1 3 4a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2-2 3-2 3s3 1 3 4a6 6 0 0 0 0 0z" opacity="0"/>',
  },
  star: {
    body: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1.1 6.1L12 17.9 6.5 20.9l1.1-6.1L3.2 9.5l6.1-.9z"/>',
  },
  "star-filled": {
    body: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1.1 6.1L12 17.9 6.5 20.9l1.1-6.1L3.2 9.5l6.1-.9z"/>',
    filled: true,
  },
  pulldown: { body: '<polyline points="6 9 12 15 18 9"/>' },
  loop: {
    body: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.5 9a9 9 0 0 1 14.8-3.4L23 10M1 14l4.7 4.4A9 9 0 0 0 20.5 15"/>',
  },
  medal: { body: '<circle cx="12" cy="14" r="6"/><path d="M9 2l3 6 3-6"/>' },
  chatbubble: {
    body: '<path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z"/>',
  },
  color: {
    body: '<polyline points="3 12 7 12 10 4 14 20 17 12 21 12"/>',
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
