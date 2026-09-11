<template>
  <!-- 设置持仓：统一底部卡片 sheet 形态。
       内部字段行 / 输入框 / 按钮全部复用 global.css 的底部弹层通用家族
       （.grp-list / .grp-item / .grp-label / .alert-edit / .alert-input / .grp-foot / .grp-btn），
       与「价格预警」面板逐项同源——同样的 88rpx 行高、26rpx 左右内边距、同尺寸输入框。
       body-flush：去掉 sheet 正文容器（.uc-body）的横向内边距，避免与内容自身 26rpx 叠加成 50rpx
       （价格预警在常驻卡里正文无内边距，故必须让浮层也同样贴齐，左缘才对得上）。
       保留当前实时价作录入成本参考；行情页报告卡与自选页长按菜单共用此组件。 -->
  <UniversalCard v-model="visible" title="设置持仓" variant="sheet" body-flush>
    <!-- 实时价参考：与价格预警面板共用 LivePriceBar 同一元素（同代码/同逻辑/同样式，
         同样不覆盖 hint 以对齐预警面板的默认无数据态「实时价获取中…」） -->
    <LivePriceBar :price="refPrice" :chg="refChg" :pct="refPct" />

    <scroll-view class="grp-body" scroll-y>
      <view class="grp-list">
        <view class="grp-item pos-row">
          <OutlineIcon type="portfolio" :size="28" color="var(--text-2)" />
          <text class="grp-label">持仓成本（元/股）</text>
        </view>
        <view class="alert-edit">
          <input class="alert-input" type="digit" :value="pfCost" :placeholder="costPlaceholder" @input="onPfCost" />
        </view>

        <view class="grp-item pos-row">
          <OutlineIcon type="layers" :size="28" color="var(--text-2)" />
          <text class="grp-label">持仓数量（股）</text>
        </view>
        <view class="alert-edit">
          <input class="alert-input" type="number" :value="pfQty" placeholder="必填，如 1000" @input="onPfQty" />
        </view>
      </view>
    </scroll-view>

    <view class="grp-foot">
      <view class="grp-btn danger" role="button" aria-label="清除持仓" @click="clear">清除持仓</view>
      <view class="grp-btn primary" role="button" aria-label="保存持仓" @click="save">保存</view>
    </view>
  </UniversalCard>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import UniversalCard from "./UniversalCard.vue";
import LivePriceBar from "./LivePriceBar.vue";
import OutlineIcon from "./OutlineIcon.vue";
import { fetchSnapshot, type SnapResult } from "@/api/quote";
import { fmtPrice } from "@/utils/format";
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

// 成本录入占位符：取到实时价时直接给「如 ¥当前价」作锚点，否则回退通用示例
const costPlaceholder = computed(() =>
  refPrice.value != null ? `必填，如 ¥${fmtPrice(refPrice.value)}` : "必填，如 12.50"
);

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
/* 字段标签行沿用 .grp-item 的行高（88rpx）与内边距（0 26rpx），与价格预警卡的选项行完全一致；
   这两行是静态字段名而非可点选项，故去掉手型与按下高亮，避免误以为可点 */
.grp-item.pos-row {
  cursor: default;
}
.grp-item.pos-row:active {
  background: transparent;
}
</style>
