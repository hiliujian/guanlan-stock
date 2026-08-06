<template>
  <view v-if="modelValue" class="as-mask mask-blur" @click.self="onCancel">
    <view class="as-sheet" role="dialog" aria-modal="true">
      <view class="as-grip" />
      <text v-if="title" class="as-title">{{ title }}</text>
      <scroll-view scroll-y class="as-scroll">
        <view
          v-for="(it, idx) in items"
          :key="it.key ?? idx"
          class="as-item"
          :class="{ active: it.active, accent: it.accent === 'primary', danger: it.accent === 'danger' }"
          hover-class="as-item-hover"
          @click="onSelect(it, idx)"
        >
          <OutlineIcon v-if="it.icon" :type="it.icon" :size="34" :color="iconColor(it)" class="as-ic" />
          <text class="as-label">{{ it.label }}</text>
          <OutlineIcon v-if="it.active" type="check" :size="30" color="var(--primary)" class="as-check" />
        </view>
      </scroll-view>
      <view class="as-foot">
        <view class="as-cancel" hover-class="as-cancel-hover" @click="onCancel">{{ cancelText }}</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import OutlineIcon from "./OutlineIcon.vue";
import type { ActionSheetItem } from "./action-sheet-types";

const props = defineProps<{
  modelValue: boolean;
  title?: string;
  items: ActionSheetItem[];
  cancelText?: string;
}>();
const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "select", payload: { item: ActionSheetItem; index: number }): void;
  (e: "cancel"): void;
}>();

function iconColor(it: ActionSheetItem): string {
  if (it.active) return "var(--primary)";
  if (it.accent === "danger") return "#ff3b30";
  if (it.accent === "primary") return "var(--primary)";
  return "var(--text-3)";
}
function onSelect(item: ActionSheetItem, index: number) {
  emit("update:modelValue", false);
  emit("select", { item, index });
}
function onCancel() {
  emit("update:modelValue", false);
  emit("cancel");
}
</script>

<style scoped>
.as-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
  animation: asMaskIn 0.18s ease both;
}
@keyframes asMaskIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.as-sheet {
  width: 100%;
  max-width: 480px;
  box-sizing: border-box;
  background: var(--card);
  border-radius: 28rpx 28rpx 0 0;
  padding: 10rpx 24rpx calc(env(safe-area-inset-bottom) + 20rpx);
  box-shadow: 0 -8rpx 30rpx rgba(0, 0, 0, 0.25);
  border-top: 1rpx solid var(--border);
  animation: asSheetIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes asSheetIn {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
/* 顶部拖拽手柄：与列设置 / 热榜弹窗同款，强化「底部弹出层」视觉一致性 */
.as-grip {
  flex: none;
  width: 56rpx;
  height: 6rpx;
  border-radius: 999rpx;
  background: var(--card-2);
  margin: 8rpx auto 6rpx;
}
.as-title {
  display: block;
  text-align: center;
  font-size: 26rpx;
  color: var(--text-2);
  padding: 10rpx 0 6rpx;
}
.as-scroll {
  max-height: 56vh;
}
.as-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-height: 92rpx;
  padding: 0 14rpx;
  border-radius: 16rpx;
  cursor: pointer;
  transition: background 0.12s ease;
}
.as-item:not(:last-child) {
  border-bottom: 1rpx solid var(--border);
}
.as-item-hover {
  background: var(--card-2);
}
.as-ic {
  flex: none;
}
.as-label {
  flex: 1;
  font-size: 30rpx;
  color: var(--text);
  line-height: 1.3;
}
.as-item.active .as-label {
  color: var(--primary);
  font-weight: 600;
}
.as-item.accent .as-label {
  color: var(--primary);
}
.as-item.danger .as-label {
  color: #ff3b30;
}
.as-check {
  flex: none;
}
.as-foot {
  padding-top: 16rpx;
}
.as-cancel {
  height: 88rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--card-2);
  border: 1rpx solid var(--border);
  color: var(--text-2);
  font-size: 30rpx;
  transition: filter 0.18s ease, transform 0.12s ease;
}
.as-cancel-hover {
  filter: brightness(0.96);
}
</style>
