<template>
  <view class="app-shell st-page page-col">
    <!-- 自定义导航头（navigationStyle:custom，需自带返回） -->
    <view class="st-head sticky-head">
      <view class="st-back nav-back" hover-class="st-back-hover" @click="back">
        <OutlineIcon type="arrow-left" :size="30" color="var(--text)" />
      </view>
      <text class="st-title nav-title">设置</text>
      <view class="st-head-ph nav-ph" />
    </view>

    <scroll-view class="st-scroll" :scroll-y="!drag.active">
      <!-- 外观 -->
      <view class="st-group">
        <text class="st-group-title">外观</text>
        <view class="st-row">
          <view class="st-row-left">
            <OutlineIcon type="gear" :size="32" color="var(--text-2)" />
            <text class="st-row-label">主题模式</text>
          </view>
          <view class="seg" role="group" aria-label="主题切换">
            <view
              class="seg-i"
              :class="{ active: isDark }"
              role="button"
              :aria-pressed="isDark"
              @click="setTheme('dark')"
            >深色</view>
            <view
              class="seg-i"
              :class="{ active: !isDark }"
              role="button"
              :aria-pressed="!isDark"
              @click="setTheme('light')"
            >浅色</view>
          </view>
        </view>
        <text class="st-row-desc">深色护眼、浅色明亮；切换即时生效并记住你的选择。</text>
      </view>

      <!-- 行情卡片：拖拽排序 + 显隐 -->
      <view class="st-group">
        <text class="st-group-title">行情卡片</text>
        <text class="st-row-desc">拖动左侧手柄调整卡片位置，开关控制是否显示。</text>
        <view
          v-for="(id, idx) in cardOrder"
          :key="id"
          class="cc-row"
          :class="{ dragging: drag.active && drag.origin === idx }"
          :style="rowStyle(idx)"
        >
          <view class="cc-main">
            <view
              class="cc-handle"
              aria-label="拖动排序"
              @touchstart.prevent="startDrag($event, idx)"
              @mousedown.prevent="startDrag($event, idx)"
            >
              <OutlineIcon type="grip" :size="28" color="var(--text-2)" />
            </view>
            <OutlineIcon :type="metaOf(id).icon" :size="30" color="var(--text-2)" />
            <text class="cc-name">{{ metaOf(id).title }}</text>
          </view>
          <view class="cc-ctrls">
            <view
              class="cc-switch"
              :class="{ on: !hidden[id] }"
              hover-class="cc-switch-hover"
              @click="toggleCard(id)"
            >
              <view class="cc-knob" />
            </view>
          </view>
        </view>
      </view>

      <!-- 关于 -->
      <view class="st-group">
        <text class="st-group-title">关于</text>
        <view class="st-row">
          <text class="st-row-label">应用</text>
          <text class="st-row-val">观澜 · 智能股票分析</text>
        </view>
        <view class="st-row">
          <text class="st-row-label">数据来源</text>
          <text class="st-row-val">公开市场行情</text>
        </view>
        <view class="st-row">
          <text class="st-row-label">版本</text>
          <text class="st-row-val">V {{ appVersion }}</text>
        </view>
        <!-- 重置应用：系统设置风格的可点击条目，弹窗确认后恢复默认设置 -->
        <view class="st-reset-row" hover-class="st-reset-row-hover" @click="showReset = true">
          <view class="st-reset-icon">
            <OutlineIcon type="refresh" :size="30" color="var(--primary)" />
          </view>
          <view class="st-reset-main">
            <text class="st-reset-label">重置应用</text>
            <text class="st-reset-sub">恢复默认设置（主题与卡片布局），不影响自选列表</text>
          </view>
          <OutlineIcon type="arrow-right" :size="28" color="var(--text-2)" />
        </view>
      </view>

      <text class="st-foot">观澜 · 让数据说话</text>
    </scroll-view>

    <!-- 重置确认弹窗：自定义样式，替代原生 showModal -->
    <ConfirmDialog
      v-model="showReset"
      title="重置应用"
      message="确定将所有设置恢复为默认吗？此操作不影响你的自选列表。"
      confirm-text="重置"
      cancel-text="取消"
      icon="refresh"
      variant="warn"
      @confirm="doReset"
    />
  </view>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import { isDark, setTheme } from "@/utils/theme";
import { cardOrder, hidden, metaOf, toggleCard, setOrder, resetCardLayout } from "@/utils/cardLayout";
import { APP_VERSION } from "@/utils/version";
import { usePageGuard } from "@/store/guard";

const appVersion = APP_VERSION;
// 全局页面守卫：设置页未对游客开放 + 未登录 → 跳转登录页
usePageGuard("/pages/settings/settings");
const showReset = ref(false);

function back() {
  uni.navigateBack({ delta: 1 });
}

// 重置应用：弹窗确认后恢复默认设置（主题 + 行情卡片布局）。
// 仅重置偏好类设置，不影响用户的自选列表等个人数据。
function doReset() {
  resetCardLayout();
  setTheme("light");
  uni.showToast({ title: "已恢复默认", icon: "success" });
}

/* 行情卡片拖拽排序：拖动右侧手柄（实为左侧 grip）重排，落点提交顺序 */
const DRAG_THRESHOLD = 4; // px，越过才判定为拖拽，避免误触
const drag = reactive({
  active: false,
  origin: -1,
  target: -1,
  dy: 0,
  rowH: 0,
  startY: 0,
});
let pointerActive = false;

function clientY(e: any): number {
  if (e.touches && e.touches.length) return e.touches[0].clientY;
  if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0].clientY;
  return e.clientY || 0;
}

function startDrag(e: any, idx: number) {
  if (drag.active || pointerActive) return;
  const rowEl = (e.currentTarget as HTMLElement)?.closest?.(".cc-row") as HTMLElement | null;
  drag.rowH = rowEl ? rowEl.getBoundingClientRect().height : 60;
  drag.origin = idx;
  drag.target = idx;
  drag.startY = clientY(e);
  drag.dy = 0;
  drag.active = false;
  pointerActive = true;

  const onMove = (ev: any) => {
    if (!pointerActive) return;
    const dy = clientY(ev) - drag.startY;
    if (!drag.active) {
      if (Math.abs(dy) < DRAG_THRESHOLD) return;
      drag.active = true; // 越过阈值：锁定滚动，进入拖拽
    }
    if (ev.cancelable) ev.preventDefault();
    const n = cardOrder.length;
    drag.dy = dy;
    drag.target = Math.max(0, Math.min(n - 1, drag.origin + Math.round(dy / drag.rowH)));
  };
  const onEnd = () => {
    if (drag.active && drag.target !== drag.origin) {
      const next = [...cardOrder];
      const [moved] = next.splice(drag.origin, 1);
      next.splice(drag.target, 0, moved);
      setOrder(next);
    }
    drag.active = false;
    drag.origin = -1;
    drag.target = -1;
    drag.dy = 0;
    pointerActive = false;
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onEnd);
    window.removeEventListener("touchcancel", onEnd);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onEnd);
  };

  if (e.touches) {
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
  } else {
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
  }
}

// 每行的位移：被拖行跟随手指，兄弟行让位填补空缺
function rowStyle(idx: number) {
  if (!drag.active) return {};
  if (idx === drag.origin) {
    return {
      transform: `translateY(${drag.dy}px) scale(1.03)`,
      transition: "none",
      zIndex: 20,
      boxShadow: "0 10px 26px rgba(0,0,0,.28)",
    };
  }
  if (drag.target > drag.origin && idx > drag.origin && idx <= drag.target) {
    return { transform: `translateY(${-drag.rowH}px)`, transition: "transform .18s ease" };
  }
  if (drag.target < drag.origin && idx >= drag.target && idx < drag.origin) {
    return { transform: `translateY(${drag.rowH}px)`, transition: "transform .18s ease" };
  }
  return {};
}
</script>

<style scoped>
/* .st-page 布局属性已提升至全局 .page-col */
/* 自定义导航头：返回 + 标题居中 + 右侧占位保持对称 */
/* .st-head 布局属性已提升至全局 .sticky-head */
/* .st-back 布局属性已提升至全局 .nav-back */
.st-back-hover {
  background: var(--card-2);
}
/* .st-title 布局属性已提升至全局 .nav-title */
/* .st-head-ph 布局属性已提升至全局 .nav-ph */
.st-page {
  background: var(--bg);
}
.st-scroll {
  flex: 1;
  height: 100%;
  box-sizing: border-box;
}
.st-group {
  padding: 12rpx 20rpx 18rpx;
  background: var(--card);
  border-top: 16rpx solid var(--bg);
}
.st-group:first-of-type {
  border-top: none;
}
/* 重置应用：系统设置风格的可点击条目（整行可点） */
.st-reset-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin: 16rpx -20rpx -18rpx;
  padding: 24rpx 20rpx;
  border-top: 1rpx solid var(--border);
  transition: background 0.18s ease, transform 0.1s ease;
}
.st-reset-row-hover {
  background: var(--card-2);
}
.st-reset-row:active {
  transform: scale(0.992);
}
.st-reset-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 58rpx;
  height: 58rpx;
  border-radius: 14rpx;
  background: rgba(7, 193, 96, 0.12);
  flex-shrink: 0;
}
.st-reset-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.st-reset-label {
  font-size: var(--font-md);
  color: var(--text);
  line-height: 1.3;
}
.st-reset-sub {
  font-size: var(--font-xs);
  color: var(--text-2);
  line-height: 1.4;
}
/* 单张卡片设置行：左侧手柄+名称 + 右侧开关 */
.cc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 0;
  border-top: 1rpx solid var(--border);
  transition: transform 0.2s ease;
}
.cc-row:first-of-type {
  border-top: none;
}
.cc-row.dragging {
  position: relative;
}
.cc-main {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-width: 0;
}
.cc-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48rpx;
  height: 48rpx;
  margin-right: 4rpx;
  border-radius: 10rpx;
  touch-action: none;
  cursor: grab;
  transition: background 0.18s ease;
}
.cc-handle:active {
  background: var(--card-2);
  cursor: grabbing;
}
.cc-name {
  font-size: var(--font-md);
  color: var(--text);
}
.cc-ctrls {
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex: none;
}
/* iOS 风格开关 */
.cc-switch {
  position: relative;
  width: 92rpx;
  height: 52rpx;
  border-radius: 999rpx;
  background: var(--card-2);
  border: 1rpx solid var(--border);
  transition: background 0.22s ease;
}
.cc-switch.on {
  background: var(--primary);
  border-color: var(--primary);
}
.cc-knob {
  position: absolute;
  top: 4rpx;
  left: 4rpx;
  width: 42rpx;
  height: 42rpx;
  border-radius: 50%;
  background: #fff;
  box-shadow: var(--shadow-1);
  transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}
.cc-switch.on .cc-knob {
  transform: translateX(40rpx);
}
.cc-switch-hover {
  opacity: 0.85;
}
.st-group-title {
  display: block;
  font-size: var(--font-sm);
  color: var(--text-3);
  margin: 8rpx 0 14rpx;
}
.st-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8rpx 12rpx;
  min-height: 72rpx;
}
.st-row-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-width: 0;
}
.st-row-label {
  font-size: var(--font-md);
  color: var(--text);
  flex-shrink: 0;
}
.st-row-val {
  font-size: var(--font-md);
  color: var(--text-2);
  text-align: right;
  min-width: 0;
  flex: 1 1 auto;
}
.st-row-desc {
  display: block;
  font-size: var(--font-xs);
  color: var(--text-2);
  line-height: 1.6;
  margin-top: 10rpx;
}
.st-foot {
  display: block;
  text-align: center;
  font-size: var(--font-xs);
  color: var(--text-2);
  line-height: 1.5;
  padding: 8rpx 0 0;
}
/* 主题分段控件（与「我的」原外观切换一致） */
.seg {
  display: inline-flex;
  padding: 4rpx;
  background: var(--card-2);
  border: 1rpx solid var(--border);
  border-radius: 999rpx;
  flex-shrink: 0;
  margin-left: auto;
}
.seg-i {
  padding: 12rpx 28rpx;
  font-size: var(--font-sm);
  color: var(--text-2);
  border-radius: 999rpx;
  transition: background 0.2s ease, color 0.2s ease;
  cursor: pointer;
}
.seg-i.active {
  background: var(--primary);
  color: #fff;
}
</style>
