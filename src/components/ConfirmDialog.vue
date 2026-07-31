<template>
  <view v-if="modelValue" class="cd-mask mask-blur" @click.self="onCancel">
    <view class="cd-card" role="dialog" aria-modal="true">
      <view class="cd-icon" :style="{ background: tintBg, color: tintColor }">
        <OutlineIcon :type="icon" :size="34" :color="tintColor" />
      </view>
      <text class="cd-title">{{ title }}</text>
      <text class="cd-msg">{{ message }}</text>
      <view class="cd-actions">
        <view class="cd-btn cd-cancel" hover-class="cd-cancel-hover" @click="onCancel">
          {{ cancelText }}
        </view>
        <view class="cd-btn cd-ok" :style="{ background: tintColor }" hover-class="cd-ok-hover" @click="onConfirm">
          {{ confirmText }}
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import OutlineIcon from "./OutlineIcon.vue";

const props = defineProps<{
  modelValue: boolean;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  icon?: string;
  variant?: "primary" | "warn" | "danger";
}>();
const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "confirm"): void;
  (e: "cancel"): void;
}>();

const PRESET: Record<string, { color: string; bg: string }> = {
  primary: { color: "#07c160", bg: "rgba(7,193,96,0.12)" },
  warn: { color: "#ff9500", bg: "rgba(255,149,0,0.14)" },
  danger: { color: "#ff3b30", bg: "rgba(255,59,48,0.14)" },
};

const v = props.variant || "primary";
const tintColor = (PRESET[v] || PRESET.primary).color;
const tintBg = (PRESET[v] || PRESET.primary).bg;

function close() {
  emit("update:modelValue", false);
}
function onCancel() {
  close();
  emit("cancel");
}
function onConfirm() {
  close();
  emit("confirm");
}
</script>

<style scoped>
.cd-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  /* 轻模糊由全局 .mask-blur 提供 */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60rpx;
  animation: cdMaskIn 0.2s ease both;
}
@keyframes cdMaskIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.cd-card {
  width: 100%;
  max-width: 560rpx;
  box-sizing: border-box;
  background: var(--card);
  border-radius: 32rpx;
  padding: 48rpx 40rpx 32rpx;
  box-shadow: 0 24rpx 64rpx rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: cdCardIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes cdCardIn {
  from {
    opacity: 0;
    transform: translateY(28rpx) scale(0.94);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.cd-icon {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 26rpx;
}
.cd-title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--text);
  text-align: center;
}
.cd-msg {
  font-size: 27rpx;
  color: var(--text-2);
  line-height: 1.7;
  text-align: center;
  margin-top: 16rpx;
}
.cd-actions {
  display: flex;
  gap: 20rpx;
  width: 100%;
  margin-top: 40rpx;
}
.cd-btn {
  flex: 1;
  height: 86rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
  font-weight: 600;
  transition: transform 0.12s ease, filter 0.18s ease;
}
.cd-btn:active {
  transform: scale(0.97);
}
.cd-cancel {
  background: var(--card-2);
  color: var(--text-2);
  border: 1rpx solid var(--border);
}
.cd-cancel-hover {
  filter: brightness(0.96);
}
.cd-ok {
  color: #fff;
}
.cd-ok-hover {
  filter: brightness(1.08);
}
</style>
