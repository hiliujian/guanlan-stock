<template>
  <view class="tabbar">
    <view
      v-for="(t, i) in tabs"
      :key="t.key"
      :class="['tab', current === i ? 'active' : '']"
      @click="onTap(i)"
    >
      <view class="tab-icon-wrap">
        <OutlineIcon :type="current === i ? t.iconActive : t.icon" :size="44" :color="iconColor(i)" />
      </view>
      <text class="tab-label" :style="{ color: labelColor(i) }">{{ t.label }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import OutlineIcon from "./OutlineIcon.vue";

interface Tab {
  key: string;
  label: string;
  icon: string;
  iconActive: string;
}
const tabs: Tab[] = [
  { key: "market", label: "行情", icon: "bars", iconActive: "bars" },
  { key: "watch", label: "自选", icon: "star", iconActive: "star-filled" },
  { key: "profile", label: "我的", icon: "person", iconActive: "person-filled" },
];

const props = defineProps<{ current: number }>();
const emit = defineEmits<{ (e: "change", index: number): void }>();

function onTap(i: number) {
  if (i !== props.current) emit("change", i);
}
function iconColor(i: number) {
  return i === props.current ? "var(--primary)" : "var(--text-3)";
}
function labelColor(i: number) {
  return i === props.current ? "var(--primary)" : "var(--text-3)";
}
</script>

<style scoped>
.tabbar {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 0;
  width: 100%;
  max-width: 480px;
  height: calc(110rpx + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(20rpx);
  -webkit-backdrop-filter: blur(20rpx);
  border-top: 1rpx solid var(--border);
  display: flex;
  z-index: 900;
}
.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  transition: transform 0.18s ease;
}
.tab:active {
  transform: scale(0.92);
}
.tab-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 48rpx;
  transition: transform 0.2s ease;
}
.tab.active .tab-icon-wrap {
  transform: translateY(-2rpx);
}
.tab-label {
  font-size: 22rpx;
  transition: color 0.2s ease, font-weight 0.2s ease;
}
.tab.active .tab-label {
  font-weight: 600;
}
</style>
