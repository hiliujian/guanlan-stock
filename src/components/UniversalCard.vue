<template>
  <!-- 统一底部卡片外壳：所有「停靠在菜单栏上方的底部卡片」共用这一套
       框体结构 / 定位 / 层级 / 生长收缩动效 / 拖拽与点击操作 / 多卡互斥栈，新增卡片直接复用。

       两种用法：
       1) 常驻停靠卡（persistent）：始终就地渲染，折叠态露出 #peek 预览行（76rpx），
          半屏 / 铺满两档展开；ref.expand()/collapse() 控制，emit expand/collapse。
          （自选榜单/操作菜单、行情全球指数、社区发帖器）
       2) 浮层卡（v-model）：teleport 到 body，按 v-model 挂载/播放过渡：
          - variant="menu"：高度随内容，从菜单栏顶部生长（短菜单：帖子操作 / 头像设置）
          - variant="sheet"：半屏固定高，从菜单栏顶部生长，正文内部滚动，支持上拉铺满
            （设置持仓 / 消息中心 / 关注粉丝列表）
       两种浮层进出 / 拖拽收起统一走 height 生长收缩，起点和动效完全一致。 -->
  <teleport to="body" :disabled="persistent">
    <Transition :name="transitionName">
      <view
        v-if="persistent || modelValue"
        class="uc-card"
        :class="cardClass"
        :style="cardStyle"
        @touchstart.stop="onDown"
        @touchmove.stop="onMove"
        @touchend.stop="onUp"
        @touchcancel.stop="onUp"
        @mousedown.stop="onDown"
        @mousemove.stop="onMove"
        @mouseup.stop="onUp"
        @mouseleave.stop="onUp"
      >
        <!-- 顶部拖拽手柄：常驻卡非折叠态 / 浮层打开态显示。
             点击=回退一档（铺满→半屏→收起），与下拉手势同语义；热区按卡片类型给尺寸 -->
        <view v-if="gripVisible" class="uc-grip" @click.stop="onGripClick">
          <view class="uc-handle" />
        </view>

        <!-- 常驻卡折叠态：停靠预览行（整行点击展开） -->
        <view v-if="persistent && stage === 'peek'" class="uc-peek" @click="expand">
          <slot name="peek" />
        </view>

        <!-- 浮层卡标题栏（可选）：居中标题，点击收起；常驻卡各业务面板自带标题栏 -->
        <view v-if="!persistent && title" class="uc-head panel-head" @click="onTopClick">
          <text class="sheet-title">{{ title }}</text>
        </view>

        <!-- 内容区：flex 撑满剩余高度。常驻卡内部滚动由业务 scroll-view 承担；
             浮层 sheet 由外壳统一给正文内部滚动，浮层 menu 高度随内容 -->
        <view v-if="!(persistent && stage === 'peek')" class="uc-body">
          <slot />
        </view>
      </view>
    </Transition>
  </teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, onDeactivated } from "vue";
import { usePreventPageScroll } from "@/composables/usePreventPageScroll";
import { pushSheet, popSheet, sheetLift } from "@/composables/useSheetStack";
import { rpx } from "@/utils/rpx";

const props = withDefaults(
  defineProps<{
    /** 常驻停靠卡：始终渲染（折叠预览 + 半屏 + 铺满），不用 v-model，ref 方法控制 */
    persistent?: boolean;
    /** 浮层卡可见状态（v-model），persistent 模式不使用 */
    modelValue?: boolean;
    /** 浮层卡标题：传入即渲染居中标题栏（点击收起） */
    title?: string;
    /** 浮层形态：menu=随内容高度从菜单栏顶部生长；sheet=半屏固定高、从菜单栏顶部生长、正文可滚 */
    variant?: "menu" | "sheet";
    /** 基础层级；默认 常驻卡 40 / 浮层卡 950，同层多卡由全局卡片栈给置顶增量 */
    zIndex?: number;
  }>(),
  { persistent: false, modelValue: false, title: "", variant: "menu" }
);
const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "expand"): void;
  (e: "collapse"): void;
}>();

// 展开档位：常驻卡 peek/half/max；浮层 sheet half/max；浮层 menu 恒 menu（高度随内容）
type Stage = "peek" | "half" | "max" | "menu";
const stage = ref<Stage>(
  props.persistent ? "peek" : props.variant === "sheet" ? "half" : "menu"
);

// ─────────────────────── 全局底部卡片栈：互斥收起 + 置顶增量 ───────────────────────
let sheetId = 0;
function stackJoin() {
  // 已在栈中（已展开时程序化再次 expand，如长按另一行切换操作面板）：先出再入成为最新卡
  if (sheetId) popSheet(sheetId);
  sheetId = pushSheet(forceClose);
}
function stackLeave() {
  if (sheetId) {
    popSheet(sheetId);
    sheetId = 0;
  }
}
// 被更新的卡片顶替：常驻卡折叠回预览，浮层卡关闭
function forceClose() {
  if (props.persistent) collapse();
  else closeOverlay();
}
// 浮层卡：v-model 打开即入栈、关闭即出栈（immediate 兼容挂载即打开）
watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      stage.value = props.variant === "sheet" ? "half" : "menu";
      stackJoin();
    } else {
      stackLeave();
    }
  },
  { immediate: true }
);

// 展开/铺满态锁定背景页面滚动（window 级），折叠/关闭态允许背景正常滚动
const isOpen = computed(() =>
  props.persistent ? stage.value !== "peek" : props.modelValue
);
usePreventPageScroll(() => isOpen.value);

// ─────────────────────── 对外控制方法 ───────────────────────
/** 常驻卡：折叠 → 半屏（已展开时重新入栈成为最新卡）。浮层卡无此用法。 */
function expand() {
  if (!props.persistent) return;
  stackJoin();
  stage.value = "half";
  emit("expand");
}
/** 收起：常驻卡折叠回预览行；浮层卡关闭（v-model=false，播放离场过渡） */
function collapse() {
  if (!props.persistent) {
    closeOverlay();
    return;
  }
  if (stage.value === "peek") return;
  stage.value = "peek";
  stackLeave();
  emit("collapse");
}
function closeOverlay() {
  emit("update:modelValue", false);
}
defineExpose({ expand, collapse });

// tab 切换 / 跳子页（keep-alive 失活）时自动收起：浮层 teleport 到 body 不会随子树隐藏，
// 常驻卡也不应把展开态带到其它页面
onDeactivated(() => {
  if (props.persistent) {
    if (stage.value !== "peek") collapse();
  } else if (props.modelValue) {
    closeOverlay();
  }
});

// 视口测量（拖拽实时增高预览）+ 解析基础层级令牌（--z-card / --z-card-overlay 是层级唯一来源）
const winH = ref(0);
const tabPx = ref(0);
const baseZ = ref(props.zIndex ?? (props.persistent ? 40 : 950));
function measure() {
  try {
    const info: any = (uni as any).getWindowInfo
      ? (uni as any).getWindowInfo()
      : uni.getSystemInfoSync();
    winH.value = info.windowHeight || 0;
    const safe = (info.safeAreaInsets && info.safeAreaInsets.bottom) || 0;
    // 统一走 rpx()：PC 端 uni 把 rpx 基准收敛到 375，windowWidth/750 会放大数倍
    tabPx.value = safe + rpx() * 110; // 110rpx 底部偏移 + 安全区
    if (props.zIndex == null) {
      const token = props.persistent ? "--z-card" : "--z-card-overlay";
      const raw = getComputedStyle(document.documentElement).getPropertyValue(token);
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) baseZ.value = n;
    }
  } catch (_) {}
}
onMounted(() => {
  measure();
  if (typeof window !== "undefined") {
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
  }
});
onUnmounted(() => {
  stackLeave();
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", measure);
    window.removeEventListener("orientationchange", measure);
  }
});

// ─────────────────────── 拖拽手势：下拉收起 / 上拉铺满 ───────────────────────
const dragging = ref(false);
const dragUp = ref(false);
const dragY = ref(0);
let startY = 0;
// 手势开始时卡片的自然高度（上拉/下拉以此为基准伸缩，与进出场生长动画一致）
let naturalHeight = 0;
// 浮层卡区分「真点击」与「拖了一下松手回弹」（点击标题栏/手柄才收起）
let dragMoved = false;
// 手势起点的内部滚动状态（锁定本次手势，避免中途抖动）
let scrollAtTop = true;
let scrollAtBottom = true;

// 内联样式：基础层级 + 卡片栈置顶增量；拖拽中实时预览高度伸缩（上拉增高 / 下拉收缩，不走位移）
const cardStyle = computed(() => {
  const base = props.zIndex ?? baseZ.value;
  const zIndex = base + (sheetId ? sheetLift(sheetId) : 0);
  if (!dragging.value || Math.abs(dragY.value) < 4) return { zIndex };
  // 统一高度伸缩：上拉增高（阻尼超铺满）、下拉收缩，与进出场生长动画同一起点
  const h = naturalHeight - dragY.value; // dragY 上拉为负→h 增大，下拉为正→h 减小
  if (dragUp.value) {
    const maxH = winH.value - tabPx.value;
    const finalH = h > maxH ? maxH + (h - maxH) * 0.2 : h;
    return { zIndex, height: `${finalH}px`, maxHeight: `${finalH}px`, transition: "none" };
  }
  return { zIndex, height: `${Math.max(0, h)}px`, maxHeight: `${Math.max(0, h)}px`, transition: "none" };
});

const cardClass = computed(() => {
  const cls = [props.persistent ? "uc-dock" : `uc-overlay uc-${props.variant}`];
  if (stage.value === "peek") cls.push("uc-card--peek");
  else if (stage.value === "half") cls.push("uc-card--half");
  else if (stage.value === "max") cls.push("uc-card--max");
  return cls;
});
const gripVisible = computed(() => !(props.persistent && stage.value === "peek"));
// 常驻卡无 enter/leave（档位切换走高度 class 过渡）；浮层统一走 max-height 生长/收缩
const transitionName = computed(() => (props.persistent ? "" : "uc-grow"));

function ptY(e: any): number {
  if (e.touches && e.touches[0]) return e.touches[0].clientY;
  if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY;
  return e.clientY || 0;
}
// 表单输入元素内手势不接管，避免影响文本选择 / 编辑
function isFormField(el: any): boolean {
  const t = (el && el.tagName) || "";
  return t === "INPUT" || t === "TEXTAREA" || (el && el.isContentEditable);
}
// 触摸点所在的可滚动容器：业务 uni scroll-view，或 sheet 浮层自身的正文滚动区
function findScrollEl(target: any): HTMLElement | null {
  let node: HTMLElement | null = target;
  while (node && node !== document.documentElement && node !== document.body) {
    if (
      node.classList &&
      (node.classList.contains("uni-scroll-view") || node.classList.contains("uc-body")) &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function onDown(e: any) {
  if (isFormField(e.target)) return;
  // 记录卡片当前高度作为拖拽伸缩基准（sheet=半屏/menu=内容高/常驻卡=档位高）
  naturalHeight = (e.currentTarget && e.currentTarget.offsetHeight) || 0;
  dragging.value = true;
  dragY.value = 0;
  dragUp.value = false;
  dragMoved = false;
  startY = ptY(e);
  const sc = findScrollEl(e.target);
  if (sc) {
    scrollAtTop = sc.scrollTop <= 0;
    scrollAtBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1;
  } else {
    scrollAtTop = true;
    scrollAtBottom = true;
  }
}
function onMove(e: any) {
  if (!dragging.value) return;
  const dy = ptY(e) - startY;
  if (Math.abs(dy) < 4) return;
  const upward = dy < 0;
  const downward = dy > 0;
  if (!props.persistent && props.variant === "menu") {
    // 短菜单：整卡都是下拉区（内部无纵向滚动），上滑不处理
    if (upward) {
      dragY.value = 0;
      return;
    }
  } else {
    // 常驻卡 / sheet 浮层：内部列表滚到顶才接管下拉、滚到底才接管上拉，否则放行原生滚动
    const hijack = downward ? scrollAtTop : scrollAtBottom;
    if (!hijack) {
      dragging.value = false;
      dragY.value = 0;
      return;
    }
  }
  dragY.value = dy;
  dragUp.value = upward;
  dragMoved = true;
  if (e.cancelable) {
    try {
      e.preventDefault();
    } catch (_) {}
  }
}
function onUp() {
  if (!dragging.value) return;
  dragging.value = false;
  const dy = dragY.value;
  dragY.value = 0;
  // 位移 <10px 的纯点击不切档（避免空白误触），点击收起由手柄/标题栏的 click 负责
  if (Math.abs(dy) < 10) return;

  if (props.persistent) {
    // 常驻卡：上拉 折叠→半屏→铺满；下拉 铺满→半屏→折叠
    if (dy < 0) {
      if (stage.value === "peek") {
        stackJoin();
        stage.value = "half";
        emit("expand");
      } else if (stage.value === "half") {
        stage.value = "max";
      }
    } else if (stage.value === "max") {
      stage.value = "half";
    } else {
      collapse();
    }
    return;
  }
  // 浮层卡：位移超过 70px 才切档，否则回弹归位（菜单 / sheet 同一阈值）
  const THRESHOLD = 70;
  if (dy <= -THRESHOLD && props.variant === "sheet" && stage.value === "half") {
    stage.value = "max";
  } else if (dy >= THRESHOLD) {
    if (stage.value === "max") stage.value = "half";
    else closeOverlay();
  }
}
// 手柄点击：常驻卡 max→半屏 / 半屏→折叠；浮层卡 max→半屏 / 其余→关闭
function onGripClick() {
  if (props.persistent) {
    if (stage.value === "max") stage.value = "half";
    else collapse();
    return;
  }
  if (dragMoved) {
    dragMoved = false;
    return;
  }
  if (stage.value === "max") stage.value = "half";
  else closeOverlay();
}
// 浮层标题栏点击收起（拖拽回弹的松手 click 忽略）
function onTopClick() {
  if (dragMoved) {
    dragMoved = false;
    return;
  }
  closeOverlay();
}
</script>

<style scoped>
/* ============ 统一底部卡片：框体（定位 / 尺寸 / 圆角 / 背景 / 阴影 全卡片唯一来源） ============ */
.uc-card {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  /* 底边统一停在菜单栏（110rpx + 安全区）上方，不贴屏幕底、不压 tabbar */
  bottom: calc(env(safe-area-inset-bottom) + 110rpx);
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 22rpx 22rpx 0 0;
  background: var(--tabbar-bg);
  backdrop-filter: blur(20rpx) saturate(150%);
  -webkit-backdrop-filter: blur(20rpx) saturate(150%);
  border-top: 1rpx solid var(--border);
  box-shadow: var(--shadow-sheet);
  /* 档位切换 / 拖拽回弹 / 浮层生长收缩共用同一节奏 */
  transition:
    height var(--dur) var(--ease-out),
    max-height var(--dur) var(--ease-out),
    transform var(--dur) var(--ease-out);
}
/* 常驻卡首次挂载的入场：轻微抬升 + 淡入（浮层卡的进出由 Transition 接管）。
   fill 用 backwards 而非 both：both 会把 to 帧 transform 永久钉在最高优先级，
   拖拽时内联 translateY 永不生效；backwards 结束后 transform 归还基础规则。 */
.uc-dock {
  animation: uc-in 0.26s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}
@keyframes uc-in {
  from {
    transform: translateX(-50%) translateY(24rpx);
    opacity: 0;
  }
  to {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
}

/* ============ 高度档位（常驻卡 3 档；sheet 浮层用 half/max；menu 浮层高度随内容） ============
   max-height 与 height 同值：浮层进出时 max-height 从 0 → 档位高 过渡，
   使 sheet（固定高）和 menu（auto 高）共用同一套 max-height 生长动画 */
.uc-card--peek {
  height: 76rpx;
}
.uc-card--half {
  height: calc(50vh - 110rpx - env(safe-area-inset-bottom));
  max-height: calc(50vh - 110rpx - env(safe-area-inset-bottom));
}
.uc-card--max {
  height: calc(100vh - 110rpx - env(safe-area-inset-bottom));
  max-height: calc(100vh - 110rpx - env(safe-area-inset-bottom));
}

/* 浮层手势策略：短菜单整卡可下拉（无内部纵向滚动）；sheet 正文 pan-y 原生滚动，
   仅手柄 / 标题栏保留卡片手势；常驻卡手柄单独 touch-action:none，其余交给滚动接管判断 */
.uc-overlay.uc-menu {
  /* menu 高度随内容但不超过铺满高度；max-height 供浮层进出 max-height 生长过渡 */
  max-height: calc(100vh - 110rpx - env(safe-area-inset-bottom));
  touch-action: none;
}
.uc-overlay.uc-sheet {
  touch-action: pan-y;
}
.uc-sheet .uc-grip,
.uc-sheet .uc-head {
  touch-action: none;
}

/* 折叠预览行容器：固定 76rpx 高的横向 flex（业务行样式见全局 .peek-row 等） */
.uc-peek {
  flex: none;
  height: 76rpx;
  display: flex;
  align-items: center;
}
/* 内容区：flex 撑满；常驻卡无内边距（各业务面板自控），浮层两种形态分别给边距/滚动 */
.uc-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.uc-menu .uc-body {
  padding: 8rpx 24rpx calc(36rpx + env(safe-area-inset-bottom));
  -webkit-overflow-scrolling: touch;
}
.uc-sheet .uc-body {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  /* 底部安全区由内容内的按钮行（.grp-foot 自带 safe padding）收尾，避免双层安全区空白 */
  padding: 8rpx 24rpx 0;
}

/* 顶部手柄：常驻卡为整行宽热区（26rpx 高）；浮层卡为 56rpx 居中视觉条 */
.uc-grip {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.uc-dock .uc-grip {
  width: 100%;
  height: 26rpx;
  margin-bottom: 4rpx;
  cursor: grab;
  touch-action: none;
}
.uc-dock .uc-grip:active {
  cursor: grabbing;
}
.uc-overlay .uc-grip {
  width: 56rpx;
  height: 6rpx;
  margin: 10rpx auto 4rpx;
}
.uc-handle {
  width: 56rpx;
  height: 6rpx;
  border-radius: 999rpx;
  background: var(--card-2);
}
/* 浮层标题栏：复用全局 .panel-head 的 padding/下框线，居中标题 */
.uc-head {
  flex: none;
  justify-content: center;
  height: 72rpx;
}

/* ============ 浮层进出场过渡（常驻卡档位切换不走 Transition） ============
   统一 max-height 生长：menu（auto 高）和 sheet（固定高）共用同一套动画。
   - sheet：height=max-height=档位高，max-height 从 0→档位高 过渡驱动生长
   - menu：height=auto（无法过渡），max-height 从 0→铺满高 过渡驱动生长
     （内容高 < max-height 时实际显示为内容高，max-height 超过内容高后即到位） */
.uc-grow-enter-active,
.uc-grow-leave-active {
  transition: max-height var(--dur) var(--ease-out), transform var(--dur) var(--ease-out);
}
.uc-grow-enter-from,
.uc-grow-leave-to {
  max-height: 0;
  transform: translateX(-50%);
}
</style>
