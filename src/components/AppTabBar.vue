<template>
  <view class="tabbar">
    <view
      v-for="t in tabs"
      :key="t.key"
      :class="['tab', current === t.key ? 'active' : '']"
      @click="onTap(t.key)"
    >
      <view class="tab-icon-wrap">
        <OutlineIcon :type="current === t.key ? t.iconActive : t.icon" :size="44" :color="iconColor(t)" />
      </view>
      <text class="tab-label" :style="{ color: labelColor(t) }">{{ t.label }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import OutlineIcon from "./OutlineIcon.vue";
import type { TabKey } from "@/config/app";

export interface TabDef {
  key: TabKey;
  label: string;
  icon: string;
  iconActive: string;
}

// tabs 由上层按系统配置（menus 显隐）传入，组件本身不感知模块开关
const props = defineProps<{ tabs: TabDef[]; current: TabKey }>();
const emit = defineEmits<{ (e: "change", key: TabKey): void }>();

function onTap(key: TabKey) {
  if (key !== props.current) emit("change", key);
}
function iconColor(t: TabDef) {
  return t.key === props.current ? "var(--primary)" : "var(--text-2)";
}
function labelColor(t: TabDef) {
  return t.key === props.current ? "var(--primary)" : "var(--text-2)";
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
  background: var(--tabbar-bg);
  backdrop-filter: blur(20rpx) saturate(150%);
  -webkit-backdrop-filter: blur(20rpx) saturate(150%);
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
  font-size: var(--font-xs);
  transition: color 0.2s ease, font-weight 0.2s ease;
}
.tab.active .tab-label {
  font-weight: 600;
}
</style>
