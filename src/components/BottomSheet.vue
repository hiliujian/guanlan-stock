<template>
  <teleport to="body">
    <!-- 两种形态共用同一外壳：
         menu（默认，帖子操作 / 头像设置等短菜单）：自屏幕下沿滑入、高度随内容；
         sheet（设置持仓等）：与 PeekSheet 展开态完全同构——固定半屏高、底边停在菜单栏上方、
         以高度生长/收起（从菜单栏顶部长出，而非从屏幕最底部滑入），内容区超高时内部滚动。
         两种形态均无遮罩层、无 × 图标，结构/背景与自选页「今日最热」卡片一致；
         整体可下拉收起（拖拽下移预览，松手超过阈值即收起） -->
    <Transition name="bs-slide">
      <view
        v-if="modelValue"
        class="bs-panel"
        :class="{ sheet: variant === 'sheet' }"
        :style="panelStyle"
        @touchstart.stop="onDown"
        @touchmove.stop="onMove"
        @touchend.stop="onUp"
        @touchcancel.stop="onUp"
        @mousedown.stop="onDown"
        @mousemove.stop="onMove"
        @mouseup.stop="onUp"
        @mouseleave.stop="onUp"
      >
        <view class="bs-grip" @click="onTopClick" />
        <view class="bs-head panel-head" @click="onTopClick">
          <text class="sheet-title">{{ title }}</text>
        </view>
        <view class="bs-body">
          <slot />
        </view>
      </view>
    </Transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, onDeactivated } from "vue";
import { usePreventPageScroll } from "@/composables/usePreventPageScroll";
import { pushSheet, popSheet, sheetLift } from "@/composables/useSheetStack";

const props = withDefaults(
  defineProps<{
    /** 可见状态（v-model） */
    modelValue: boolean;
    /** 标题，空则不渲染标题栏 */
    title?: string;
    /**
     * 形态：
     * - menu（默认）：高度随内容，自屏幕下沿滑入（短菜单：帖子操作 / 头像设置等）
     * - sheet：固定半屏高（与 PeekSheet 展开态等高），从菜单栏顶部高度生长/收起，
     *   正文超高时内部滚动（设置持仓等需要与价格预警/全球指数卡完全一致的场景）
     */
    variant?: "menu" | "sheet";
  }>(),
  { title: "", variant: "menu" }
);

const emit = defineEmits<{ (e: "update:modelValue", v: boolean): void }>();

// 展开时锁定背景页面滚动（window 级），关闭时自动恢复；引用计数保证多弹层安全
usePreventPageScroll(() => props.modelValue);

function close() {
  emit("update:modelValue", false);
}

// 全局底部卡片栈：打开即注册（自动互斥收起其它卡片并取得置顶增量），关闭 / 卸载即出栈
let sheetId = 0;
watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      sheetId = pushSheet(close);
    } else {
      popSheet(sheetId);
      sheetId = 0;
    }
  }
);
onUnmounted(() => popSheet(sheetId));
// tab 切换（keep-alive 失活）时自动收起：弹层 teleport 到 body 不会随子树隐藏，
// 不主动关闭会残留到其它页面之上；与 PeekSheet 的 onDeactivated 收起保持一致。
onDeactivated(() => {
  if (props.modelValue) close();
});

// 下拉收起手势：拖动面板下移预览，松手超过阈值即收起（与 PeekSheet 下拉收起语义一致）
const dragging = ref(false);
const dragY = ref(0);
let startY = 0;

// 拖拽预览偏移：拖拽中实时跟随手指（仅下拉 dy>0），松手后由 base 过渡回弹 / 离开动画接管。
// z-index 始终内联（基础层级 --z-sheet + 栈置顶增量），拖拽态切换 style 对象时层级不丢失。
const panelStyle = computed(() => {
  const zIndex = `calc(var(--z-sheet) + ${sheetId ? sheetLift(sheetId) : 0})`;
  if (!dragging.value || dragY.value <= 0) return { zIndex };
  return {
    zIndex,
    transform: `translateX(-50%) translateY(${dragY.value}px)`,
    transition: "none",
  };
});

function ptY(e: any): number {
  if (e.touches && e.touches[0]) return e.touches[0].clientY;
  if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY;
  return e.clientY || 0;
}

function onDown(e: any) {
  dragging.value = true;
  dragY.value = 0;
  dragMoved = false;
  startY = ptY(e);
}
function onMove(e: any) {
  if (!dragging.value) return;
  const dy = ptY(e) - startY;
  // 仅响应下拉（dy>0）；上滑不做处理，避免误触；方向未成型前不处理
  if (dy <= 0 || dy < 4) {
    dragY.value = 0;
    return;
  }
  // sheet 形态正文可内部滚动：内容已向下滚动（scrollTop>0）时把下拉手势交给原生滚动，
  // 仅在滚动到顶后才接管为卡片下拉收起（与 PeekSheet 内部 scroll-view 的接管规则一致）
  if (props.variant === "sheet") {
    const sc = scrollBodyFromTarget(e);
    if (sc && sc.scrollTop > 0) {
      dragY.value = 0;
      return;
    }
  }
  dragY.value = dy;
  dragMoved = true;
  // 拖拽期间阻止页面级下拉刷新 / 滚动误触发
  if (e.cancelable) {
    try {
      e.preventDefault();
    } catch (_) {}
  }
}

// 从手势目标向上找正文滚动容器（.bs-body）；menu 形态无内部滚动，恒返回 null
function scrollBodyFromTarget(e: any): HTMLElement | null {
  let t: HTMLElement | null = e.target as HTMLElement;
  while (t && !t.classList?.contains("bs-panel")) {
    if (t.classList?.contains("bs-body")) return t;
    t = t.parentElement;
  }
  return null;
}
function onUp() {
  if (!dragging.value) return;
  const dy = dragY.value;
  dragging.value = false;
  dragY.value = 0;
  // 位移超过阈值（约 70px）才认定为下拉收起；否则回弹归位（不触发关闭）
  if (dy > 70) close();
}

// 顶部（手柄 + 标题栏）点击收起：与 PeekSheet「点击手柄收起」同语义。
// 拖拽回弹（位移超阈值但未达收起线）不算点击：松手仍会派发 click，
// 用 dragMoved 标记区分「真点击」与「拖了一下松手」，避免小幅下拉松手卡片却被收起。
let dragMoved = false;

function onTopClick() {
  if (dragMoved) {
    dragMoved = false;
    return;
  }
  close();
}
</script>

<style scoped>
/* 面板：固定底部、玻璃质感（与自选页「今日最热」卡片一致的半透明背景 + 毛玻璃）、
   仅顶部圆角、浅阴影；无遮罩层，弹出/收起仅靠面板动画。 */
.bs-panel {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  /* 底部间距与 PeekSheet 底部卡片（.peek-card）完全一致：菜单栏（110rpx + 安全区）上方统一向上弹出，
     不再贴死视口底部盖住 tabbar —— 帖子操作菜单 / 设置持仓 / 头像设置等所有 BottomSheet 同步对齐 */
  bottom: calc(env(safe-area-inset-bottom) + 110rpx);
  /* 公共层级 --z-sheet(950)：高于底部导航栏(--z-tabbar 900)，低于确认弹层(--z-dialog)/居中模态(--z-modal) */
  z-index: var(--z-sheet);
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  /* 高度生长动效期间裁掉超出的正文（与 .peek-card 一致 overflow:hidden） */
  overflow: hidden;
  background: var(--tabbar-bg);
  backdrop-filter: blur(20rpx) saturate(150%);
  -webkit-backdrop-filter: blur(20rpx) saturate(150%);
  border-top: 1rpx solid var(--border);
  border-radius: 22rpx 22rpx 0 0;
  box-shadow: var(--shadow-sheet);
  /* menu 形态：整张面板都是拖拽区（无纵向滚动内容），touch-action:none 阻止浏览器把下拉当成
     页面滚动/橡皮筋；sheet 形态在下方覆盖为 pan-y，仅手柄/标题栏保留整卡下拉 */
  touch-action: none;
  /* 拖拽松手回弹 / 入场动画复用同一缓动；height 供 sheet 形态生长/收起 */
  transition:
    transform var(--dur) var(--ease-out),
    height var(--dur) var(--ease-out);
}
/* sheet 形态：高度与 PeekSheet .expanded 完全一致（半屏，底边同样停在菜单栏上方），
   展开=从菜单栏顶部向上生长、收起=向下缩回菜单栏顶部，与价格预警/全球指数等卡片同构 */
.bs-panel.sheet {
  height: calc(50vh - 110rpx - env(safe-area-inset-bottom));
  touch-action: pan-y;
}
.bs-panel.sheet .bs-grip,
.bs-panel.sheet .bs-head {
  touch-action: none;
}
/* 顶部拖拽手柄（视觉装饰，与 PeekSheet 手柄位置统一：距顶约 10rpx） */
.bs-grip {
  flex: none;
  width: 56rpx;
  height: 6rpx;
  border-radius: 999rpx;
  background: var(--card-2);
  margin: 10rpx auto 4rpx;
}
/* 复用全局 .panel-head 的 padding 与下框线；仅保留底部弹窗特有的居中标题与更高头部高度 */
.bs-head {
  flex: none;
  justify-content: center;
  height: 72rpx;
}
/* 标题排版复用全局 .sheet-title（font-md / 500 / text-2），与分组面板标题统一，不再重复硬编码 */
.bs-body {
  flex: 1;
  min-height: 0;
  padding: 8rpx 24rpx calc(36rpx + env(safe-area-inset-bottom));
  -webkit-overflow-scrolling: touch;
}
/* sheet 形态：正文纵向撑满剩余高度并内部滚动（超高内容不再把卡片顶出屏幕）；
   底部安全区间距交给内容自身的 .grp-foot（已含 safe padding），避免双层安全区空白 */
.bs-panel.sheet .bs-body {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding-bottom: 0;
}

/* menu 形态动效：纯位移滑入滑出，复用同一时长 --dur(0.32s) 与缓动 --ease-out，不带淡入淡出。
   面板 bottom 停在 tabbar 上方（110rpx + 安全区），故收起位需下移「自身高度 + 底部间距」
   才能完全没入屏幕下沿，展开则自该位置滑回。保留居中 translateX(-50%)。 */
.bs-slide-enter-active,
.bs-slide-leave-active {
  transition:
    transform var(--dur) var(--ease-out),
    height var(--dur) var(--ease-out);
}
.bs-slide-enter-from,
.bs-slide-leave-to {
  transform: translateX(-50%) translateY(calc(100% + 110rpx + env(safe-area-inset-bottom)));
}
/* sheet 形态动效：与 PeekSheet 展开/收起同款高度过渡——底边锚在菜单栏顶部不动，
   高度在 0 ↔ 半屏之间生长/收缩；不做纵向位移（视觉即从菜单栏顶部长出/缩回） */
.bs-slide-enter-from.sheet,
.bs-slide-leave-to.sheet {
  height: 0;
  transform: translateX(-50%);
}
</style>
