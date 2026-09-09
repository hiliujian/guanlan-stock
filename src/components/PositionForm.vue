<template>
  <!-- 设置持仓弹窗（持仓成本/持仓数量均必填）：teleport 到 body —— 避免被任何
       transform/backdrop-filter 祖先变成「相对元素定位」，导致弹窗出现在页面中部。
       行情页报告卡与自选页长按菜单共用此组件 -->
  <teleport to="body">
    <view v-if="visible" ref="maskRef" class="modal-mask" @click.self="close">
      <view class="modal-card">
        <view class="modal-head">
          <text class="modal-title">设置持仓</text>
          <view class="modal-close" @click="close" role="button" aria-label="关闭">
            <OutlineIcon type="close" :size="26" color="var(--text-3)" />
          </view>
        </view>
        <view class="modal-row">
          <text class="modal-k">持仓成本</text>
          <input class="modal-in" type="digit" :value="pfCost" placeholder="元/股（必填）" @input="onPfCost" />
        </view>
        <view class="modal-row">
          <text class="modal-k">持仓数量</text>
          <input class="modal-in" type="number" :value="pfQty" placeholder="股（必填）" @input="onPfQty" />
        </view>
        <view class="modal-actions">
          <view class="modal-btn ghost" @click="clear" role="button" aria-label="清除持仓">清除持仓</view>
          <view class="modal-btn ok" @click="save" role="button" aria-label="保存持仓">保存</view>
        </view>
      </view>
    </view>
  </teleport>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import type { Position } from "@/utils/costBasis";
import { getPosition } from "@/utils/costBasis";

// 数据来源二选一：secid（自选页长按菜单：打开时按股现读存储，避免缓存陈旧）
// 或 position（报告页：由父组件持有持仓状态并响应式传入）
const props = defineProps<{
  secid?: string;
  position?: Position | null;
}>();
const emit = defineEmits<{
  (e: "save", p: Position): void;
  (e: "clear"): void;
}>();

const visible = ref(false);
const pfCost = ref("");
const pfQty = ref("");

function open() {
  const p = props.secid ? getPosition(props.secid) : props.position;
  pfCost.value = p?.cost ? String(p.cost) : "";
  pfQty.value = p?.qty ? String(p.qty) : "";
  visible.value = true;
}
function close() {
  visible.value = false;
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

// 点击遮罩或遮罩外部关闭。均在弹窗可见时挂全局监听
const maskRef = ref<any>(null);
function onDocPointerDown(e: Event) {
  const r = maskRef.value as any;
  const el: HTMLElement | null =
    r instanceof HTMLElement ? r : r?.$el instanceof HTMLElement ? r.$el : null;
  // 遮罩自身（@click.self 已覆盖）或遮罩外区域视为点击外部
  if (el && (e.target as Node) === el) return;
  if (el && !el.contains(e.target as Node)) visible.value = false;
}
watch(visible, (v) => {
  if (v) {
    document.addEventListener("pointerdown", onDocPointerDown, true);
  } else {
    document.removeEventListener("pointerdown", onDocPointerDown, true);
  }
});
onUnmounted(() => {
  document.removeEventListener("pointerdown", onDocPointerDown, true);
});

defineExpose({ open });
</script>
