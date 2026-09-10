<template>
  <!-- 设置持仓：与「编辑价格预警」一致的底部弹层卡片样式（复用 BottomSheet 外壳 + 全局 grp/alert 样式），
       teleport 到 body，确保层级高于底部导航栏；保留当前实时价作录入成本参考。
       行情页报告卡与自选页长按菜单共用此组件，所有入口统一这一套底部弹层。 -->
  <BottomSheet v-model="visible" title="设置持仓">
    <!-- 实时价参考：进入即拉取最新成交价（按 secid），行情页无 secid 时回退到传入的参考价 -->
    <view class="alert-rt" v-if="refPrice != null">
      <text class="alert-rt-label">当前实时价</text>
      <text class="alert-rt-price" :class="trendCls(refChg)">{{ fmtPrice(refPrice) }}</text>
      <text class="alert-rt-sub" :class="trendCls(refChg)" v-if="refChg != null && refPct != null">{{ fmtSigned(refChg) }} · {{ fmtPct(refPct) }}</text>
      <text class="alert-rt-hint" v-else>仅供参考</text>
    </view>

    <view class="pf-fields">
      <view class="pf-field">
        <text class="pf-k">持仓成本（元/股）</text>
        <input class="alert-input" type="digit" :value="pfCost" placeholder="必填，如 12.50" @input="onPfCost" />
      </view>
      <view class="pf-field">
        <text class="pf-k">持仓数量（股）</text>
        <input class="alert-input" type="number" :value="pfQty" placeholder="必填，如 1000" @input="onPfQty" />
      </view>
    </view>

    <view class="grp-foot">
      <view class="grp-btn danger" role="button" aria-label="清除持仓" @click="clear">清除持仓</view>
      <view class="grp-btn primary" role="button" aria-label="保存持仓" @click="save">保存</view>
    </view>
  </BottomSheet>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import BottomSheet from "./BottomSheet.vue";
import { fetchSnapshot, type SnapResult } from "@/api/quote";
import { fmtPrice, fmtSigned, fmtPct, trendCls } from "@/utils/format";
import type { Position } from "@/utils/costBasis";
import { getPosition } from "@/utils/costBasis";

// 数据来源二选一：secid（自选页长按菜单：打开时按股现读存储，避免缓存陈旧）
// 或 position（报告页：由父组件持有持仓状态并响应式传入）
const props = defineProps<{
  secid?: string;
  position?: Position | null;
  /** 行情页无 secid 时的参考价（分析报告当前价） */
  refPrice?: number | null;
}>();
const emit = defineEmits<{
  (e: "save", p: Position): void;
  (e: "clear"): void;
}>();

const visible = ref(false);
const pfCost = ref("");
const pfQty = ref("");

// 实时价参考（进入弹层即拉取；无 secid 时回退到传入参考价）
const live = ref<SnapResult | null>(null);
const refPrice = computed<number | null>(() => {
  if (live.value && live.value.price) return live.value.price;
  if (props.refPrice != null) return props.refPrice;
  return null;
});
const refChg = computed<number | null>(() => (live.value ? live.value.chg ?? null : null));
const refPct = computed<number | null>(() => (live.value ? live.value.pct ?? null : null));

async function loadRef() {
  live.value = null;
  if (props.secid) {
    try {
      const s = await fetchSnapshot(props.secid);
      if (s && s.price) live.value = s;
    } catch {
      live.value = null;
    }
  }
}

function open() {
  const p = props.secid ? getPosition(props.secid) : props.position;
  pfCost.value = p?.cost ? String(p.cost) : "";
  pfQty.value = p?.qty ? String(p.qty) : "";
  visible.value = true;
  loadRef();
}
function onPfCost(e: any) {
  pfCost.value = String(e?.detail?.value ?? "");
}
function onPfQty(e: any) {
  pfQty.value = String(e?.detail?.value ?? "");
}
function save() {
  // 两项均必填（与社区发帖持仓卡对齐）：成本驱动持仓状态双视角，数量供盈亏与发帖持仓卡回填
  const c = parseFloat(pfCost.value);
  const qty = parseInt(pfQty.value, 10);
  if (!Number.isFinite(c) || c <= 0) {
    uni.showToast({ title: "请填写持仓成本", icon: "none" });
    return;
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    uni.showToast({ title: "请填写持仓数量", icon: "none" });
    return;
  }
  emit("save", { cost: c, qty });
  visible.value = false;
}
function clear() {
  emit("clear");
  pfCost.value = "";
  pfQty.value = "";
  visible.value = false;
}

defineExpose({ open });
</script>

<style scoped>
/* 两个录入字段：输入框直接复用全局 .alert-input（与「编辑价格预警」内联输入框同尺寸/同字号）；
   字段标签与预警卡选项标题同为 font-md，保证两张卡片字号层级一致。 */
.pf-fields {
  padding: 6rpx 0 4rpx;
}
.pf-field {
  padding: 10rpx 26rpx 14rpx;
}
.pf-k {
  display: block;
  font-size: var(--font-md);
  color: var(--text);
  margin-bottom: 10rpx;
}
</style>
