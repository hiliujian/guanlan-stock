<template>
  <text :class="['price-text', colorClass]" :style="{ fontSize: size + 'rpx', fontWeight: weight }">
    {{ text }}
  </text>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    value: number;
    prev?: number; // 与上一价比较决定颜色
    neutral?: boolean; // 中性展示（价位级数据，不做涨跌着色）
    size?: number;
    weight?: number;
    prefix?: boolean; // 是否显示 +/- 号
    digits?: number;
  }>(),
  { size: 32, weight: 600, prefix: false, digits: 2 }
);

const colorClass = computed(() => {
  if (props.neutral) return "flat";
  const base = props.prev != null ? props.value - props.prev : props.value;
  if (base > 0) return "up";
  if (base < 0) return "down";
  return "flat";
});

const text = computed(() => {
  const v = props.value.toFixed(props.digits);
  if (props.prefix && props.value > 0) return "+" + v;
  if (props.prefix && props.value < 0) return v; // 负号自带
  return v;
});
</script>

<style scoped>
.price-text {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5rpx;
}
.up {
  color: var(--up);
}
.down {
  color: var(--down);
}
.flat {
  color: var(--text);
}
</style>
