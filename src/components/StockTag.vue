<template>
  <view class="stag" role="button" :aria-label="'查看 ' + display" @click="onTap">
    <text class="stag-h">#</text><text class="stag-n">{{ display }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { LOCAL_STOCKS, searchStocks } from "@/api/quote";
import { openInMarket, goTab } from "@/store/nav";

const props = defineProps<{ code: string; name?: string }>();

// 展示名：优先用外部传入的名称；未传则先显示代码，挂载后异步解析为名称。
const display = ref(props.name || props.code);

// 名称解析缓存（按纯数字键），避免同代码重复联网。
const _nameCache = new Map<string, string>();

async function resolveName(code: string): Promise<string> {
  const digits = (code || "").replace(/[^0-9]/g, "");
  if (!digits) return code;
  const cached = _nameCache.get(digits);
  if (cached) return cached;
  // 本地内置股票池优先（零网络、即时）
  const local = LOCAL_STOCKS.find((h) => h.code === digits);
  if (local) {
    _nameCache.set(digits, local.name);
    return local.name;
  }
  // 兜底：联网搜索解析名称（失败保留代码）
  const hits = await searchStocks(code).catch(() => [] as typeof LOCAL_STOCKS);
  const hit =
    hits.find((h) => (h.code || "").replace(/[^0-9]/g, "") === digits) || hits[0];
  const name = hit?.name || code;
  _nameCache.set(digits, name);
  return name;
}

onMounted(async () => {
  if (!props.name) display.value = await resolveName(props.code);
});

// 点击：跳转到行情页并触发对应代码的搜索（全局生效，不依赖所在页面）。
function onTap() {
  openInMarket(props.code, "auto");
  goTab("market");
}
</script>

<style scoped>
.stag {
  display: inline-flex;
  align-items: center;
  gap: 1rpx;
  padding: 10rpx 22rpx;
  border-radius: 999rpx;
  background: var(--primary-soft);
  color: var(--primary);
  font-size: var(--font-sm);
  font-weight: 400;
  line-height: 1.2;
  white-space: nowrap;
  transition: transform 0.12s ease, background 0.15s ease, color 0.15s ease;
}
.stag:active {
  transform: scale(0.94);
  background: var(--primary);
  color: #fff;
}
.stag-h {
  font-weight: 400;
  opacity: 0.85;
}
</style>
