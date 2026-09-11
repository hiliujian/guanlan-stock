<template>
  <!-- 实时价参考条（价格预警 / 设置持仓共用同一套元素）：样式走 global.css 的 .alert-rt 家族；
       有价 → 价格 + 涨跌额·涨跌幅（红涨绿跌）；无价 → 「—」+ 占位文案（获取中/仅供参考） -->
  <view class="alert-rt">
    <text class="alert-rt-label">当前实时价</text>
    <text class="alert-rt-price" :class="trendCls(chg)">{{ price != null ? fmtPrice(price) : '—' }}</text>
    <text class="alert-rt-sub" :class="trendCls(chg)" v-if="price != null && chg != null && pct != null">{{ fmtSigned(chg) }} · {{ fmtPct(pct) }}</text>
    <text class="alert-rt-hint" v-else>{{ hint }}</text>
  </view>
</template>

<script setup lang="ts">
import { fmtPrice, fmtSigned, fmtPct, trendCls } from "@/utils/format";

withDefaults(
  defineProps<{
    /** 最新成交价；null = 暂无行情（展示「—」与占位文案） */
    price?: number | null;
    chg?: number | null;
    pct?: number | null;
    /** 无行情时的占位文案 */
    hint?: string;
  }>(),
  { price: null, chg: null, pct: null, hint: "实时价获取中…" }
);
</script>
