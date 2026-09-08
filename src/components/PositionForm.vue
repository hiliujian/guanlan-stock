<template>
  <!-- 设置持仓弹窗（持仓成本/持仓数量均必填）：teleport 到 body —— 避免被任何
       transform/backdrop-filter 祖先变成「相对元素定位」，导致弹窗出现在页面中部；
       无遮罩、卡片实色背景。行情页报告卡与自选页长按菜单共用此组件 -->
  <teleport to="body">
    <view v-if="visible" ref="maskRef" class="pos-mask">
      <view class="pos-form">
        <view class="pf-head">
          <text class="pf-title">设置持仓</text>
          <view class="pf-close" @click="close" role="button" aria-label="关闭">
            <OutlineIcon type="close" :size="26" color="var(--text-3)" />
          </view>
        </view>
        <view class="pf-row">
          <text class="pf-k">持仓成本</text>
          <input class="pf-in" type="digit" :value="pfCost" placeholder="元/股（必填）" @input="onPfCost" />
        </view>
        <view class="pf-row">
          <text class="pf-k">持仓数量</text>
          <input class="pf-in" type="number" :value="pfQty" placeholder="股（必填）" @input="onPfQty" />
        </view>
        <view class="pf-actions">
          <view class="pf-btn clear" @click="clear" role="button" aria-label="清除持仓">清除持仓</view>
          <view class="pf-btn ok" @click="save" role="button" aria-label="保存持仓">保存</view>
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

// 点击卡片外部区域关闭：teleport 后弹窗在 body 下，捕获阶段判定目标不在子树内即收起
const maskRef = ref<any>(null);
function onDocPointerDown(e: Event) {
  const r = maskRef.value as any;
  const el: HTMLElement | null =
    r instanceof HTMLElement ? r : r?.$el instanceof HTMLElement ? r.$el : null;
  if (el && !el.contains(e.target as Node)) visible.value = false;
}
watch(visible, (v) => {
  if (v) document.addEventListener("pointerdown", onDocPointerDown, true);
  else document.removeEventListener("pointerdown", onDocPointerDown, true);
});
onUnmounted(() => document.removeEventListener("pointerdown", onDocPointerDown, true));

defineExpose({ open });
</script>

<style scoped>
.pos-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.pos-form {
  pointer-events: auto;
  width: min(600rpx, 86vw);
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 24rpx;
  background: #fff; /* 浅色主题纯白卡片；深色主题由下方 :global 覆盖 */
  border: 1rpx solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-2);
}
/* 深色主题（html.theme-dark）：弹窗底色跟随全局深色变量 */
:global(.theme-dark) .pos-form {
  background: var(--bg-2);
}

.pf-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pf-title {
  font-size: var(--font-md);
  color: var(--text);
}
.pf-close {
  flex: none;
  padding: 6rpx;
}
.pf-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.pf-k {
  flex: none;
  width: 140rpx;
  font-size: var(--font-sm);
  color: var(--text-2);
}
.pf-in {
  flex: 1;
  min-width: 0;
  height: 72rpx;
  padding: 0 20rpx;
  font-size: var(--font-sm);
  color: var(--text);
  background: var(--card-2);
  border-radius: 12rpx;
}
.pf-actions {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
}
.pf-btn {
  font-size: var(--font-sm);
  padding: 10rpx 32rpx;
  border-radius: 999rpx;
}
.pf-btn.ok {
  color: #fff;
  background: var(--primary);
}
.pf-btn.clear {
  color: var(--text-2);
  background: var(--card-2);
}
</style>
