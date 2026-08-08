<template>
  <view class="stext">
    <template v-for="seg in segments" :key="seg.code || seg.text">
      <StockTag v-if="seg.code" :code="seg.code" />
      <text v-else>{{ seg.text }}</text>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import StockTag from "./StockTag.vue";

const props = defineProps<{ text: string }>();

interface Seg {
  code?: string;
  text?: string;
}

// 匹配 #+股票代码：可选市场前缀（SH/SZ/BJ/HK）+ 5~6 位数字（A股6位 / 港股5位）。
// 仅匹配足够长的数字串，避免把普通短数字（如 #123）误判为股票代码。
const RE = /#((?:SH|SZ|BJ|HK)?\d{5,6})/gi;

const segments = computed<Seg[]>(() => {
  const out: Seg[] = [];
  const str = props.text || "";
  if (!str) return out;
  RE.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(str))) {
    if (m.index > last) out.push({ text: str.slice(last, m.index) });
    out.push({ code: m[1] });
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push({ text: str.slice(last) });
  return out;
});
</script>

<style scoped>
/* 行内渲染：普通文本与股票标签在同一行流式排布，长文本自动换行。
   字体/颜色由调用方透传的 class（如 .p-text / .pr-text）决定。 */
.stext {
  display: inline;
  line-height: 1.6;
  word-break: break-word;
}
</style>
