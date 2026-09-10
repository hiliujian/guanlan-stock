<template>
  <view ref="wrapRef" :class="['emoji-wrap', variant]">
    <!-- 表情入口：点亮态主色描边（无底无框，克制风格）；
         mousedown.prevent 防止点击夺走输入框焦点导致光标丢失 -->
    <view
      class="emoji-btn"
      :class="{ active: emojiOpen }"
      @click="toggle"
      @mousedown.prevent
      role="button"
      :aria-label="emojiOpen ? '收起表情面板' : '打开表情面板'"
    >
      <OutlineIcon type="smile" :size="iconSize" :color="emojiOpen ? 'var(--primary)' : 'var(--text-2)'" />
    </view>

    <!-- 表情面板（类微信）：点选即插入光标处；
         mousedown.prevent 防止点面板夺走输入框焦点导致光标丢失。
         统一 teleport 到 body：面板不再受宿主卡片的 overflow 裁剪与 stacking context 限制，
         始终浮动在页面内容、帖子预览与其他卡片之上（层级引用公共 --z-popover）。 -->
    <teleport to="body">
      <view
        v-if="emojiOpen"
        ref="panelRef"
        :class="['emoji-panel', 'escaped', direction]"
        :style="panelStyle"
        @mousedown.prevent
      >
        <scroll-view scroll-y class="emoji-scroll">
          <view class="emoji-grid">
            <text v-for="em in EMOJIS" :key="em" class="emoji-item" @click="insertAndClose(em)">{{ em }}</text>
          </view>
        </scroll-view>
        <view class="emoji-bar">
          <text class="emoji-tip">点击插入到光标处</text>
          <view class="emoji-del" @click="backspaceEmoji" role="button" aria-label="删除一个字符">
            <OutlineIcon type="backspace" :size="34" color="var(--text)" />
          </view>
        </view>
      </view>
    </teleport>
  </view>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";
import { EMOJIS, useEmoji } from "@/composables/useEmoji";
import OutlineIcon from "./OutlineIcon.vue";
import { rpx, shellBounds, clampToShell } from "@/utils/rpx";

const props = withDefaults(
  defineProps<{
    /** 双向绑定的文本，插入表情后同步回父组件 */
    modelValue: string;
    /** 面板展开态（可选 v-model:open 受父组件控制，如发帖展开表情时收起附件菜单）；
     *  未绑定时以内部 emojiOpen 为准 */
    open?: boolean;
    /** 解析出原生 input/textarea 元素，供光标定位插入 */
    getEl: () => HTMLInputElement | HTMLTextAreaElement | null;
    /** float：悬浮输入框右上角（发帖）；inline：跟随输入框行内右侧（回复 / 私信） */
    variant?: "float" | "inline";
    /** 面板展开方向：down 向下（默认）；up 向上（输入条贴容器底部时用，如私信弹层） */
    direction?: "down" | "up";
    maxLength?: number;
    /** 入口图标线宽尺寸，默认 36 与发帖工具栏图标一致 */
    iconSize?: number;
  }>(),
  { variant: "inline", direction: "down", maxLength: undefined, iconSize: 36 }
);

const emit = defineEmits<{
  (e: "update:modelValue", v: string): void;
  (e: "update:open", v: boolean): void;
  (e: "after-insert", v: string): void;
}>();

// 内部镜像：跟随父组件 v-model，同时支撑面板内光标插入后回写
const local = ref(props.modelValue);
watch(
  () => props.modelValue,
  (v) => {
    if (v !== local.value) local.value = v;
  }
);

const { emojiOpen, toggleEmoji, insertEmoji, backspaceEmoji } = useEmoji(props.getEl, local, {
  maxLength: props.maxLength,
  onAfterInsert: (t) => {
    emit("update:modelValue", t);
    emit("after-insert", t);
  },
});

// 点选表情插入后自动收起面板（插入即完成选词，面板无需常驻）；
// backspace 退格不收起，方便连续删字
function insertAndClose(em: string) {
  insertEmoji(em);
  emojiOpen.value = false;
  emit("update:open", false);
}

// 父组件通过 v-model:open 外部控制展开态时（如发帖收起附件菜单联动），同步到内部状态
watch(
  () => props.open,
  (v) => {
    if (v !== undefined && v !== emojiOpen.value) emojiOpen.value = v;
  }
);

// 点击面板外任意位置自动收起：document 捕获阶段监听，目标不在本组件根内即关闭
const wrapRef = ref<any>(null);
/** 入口 / 面板原生元素（uni 组件需取 $el） */
function elOf(r: any): HTMLElement | null {
  return r instanceof HTMLElement ? r : (r?.$el instanceof HTMLElement ? r.$el : null);
}
// ---- 脱离宿主的浮层定位：teleport 到 body 后，按入口按钮视口坐标换算 fixed 位置 ----
const panelRef = ref<any>(null);
const panelStyle = ref<Record<string, string>>({});
function measure() {
  const el = elOf(wrapRef.value);
  if (!el || typeof window === "undefined") return;
  const rect = el.getBoundingClientRect();
  const u = rpx(); // uni rpx → px（PC 端基准自动收敛，勿用 innerWidth/750）
  const gap = 8 * u;
  // 宽度同时受外壳约束：PC 端 .app-shell 仅 480px，按视口 86% 算会撑出页面边界
  const w = Math.min(420 * u, shellBounds().width - 16 * u);
  // 右对齐入口，并夹进外壳内（左右各留 8rpx 安全边距）
  const left = clampToShell(rect.right - w, w);
  panelStyle.value =
    props.direction === "up"
      ? { left: `${left}px`, bottom: `${window.innerHeight - rect.top + gap}px`, width: `${w}px` }
      : { left: `${left}px`, top: `${rect.bottom + gap}px`, width: `${w}px` };
}

function onDocPointerDown(e: Event) {
  if (!emojiOpen.value) return;
  const root = elOf(wrapRef.value);
  const panel = elOf(panelRef.value);
  // 面板已 teleport 到 body，不再被入口容器包含，需单独判定，否则点面板即误判为"点外部"而关闭
  const inside =
    (root ? root.contains(e.target as Node) : false) || (panel ? panel.contains(e.target as Node) : false);
  if (!inside) {
    emojiOpen.value = false;
    emit("update:open", false);
  }
}
watch(emojiOpen, (v) => {
  if (v) {
    measure();
    document.addEventListener("pointerdown", onDocPointerDown, true);
  } else document.removeEventListener("pointerdown", onDocPointerDown, true);
});
onUnmounted(() => document.removeEventListener("pointerdown", onDocPointerDown, true));

function toggle() {
  toggleEmoji();
  emit("update:open", emojiOpen.value);
}
</script>

<style scoped>
/* 入口容器：inline 时跟随输入框行内右侧；float 时悬浮输入框右上角 */
.emoji-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: none;
}
.emoji-wrap.float {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 22;
}
.emoji-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48rpx;
  height: 48rpx;
  border-radius: 999rpx;
  transition: background var(--dur-fast) var(--ease-out);
}
.emoji-btn:active {
  background: var(--primary-soft);
}
/* 面板：相对入口容器定位，向下展开成浮层；up 时改向上展开（输入条贴底场景）。
   浮层悬浮在任意内容之上，--card-2 是近透明色需实色打底：--bg 垫底 + --card-2 薄染 */
.emoji-panel {
  position: absolute;
  top: calc(100% + 8rpx);
  right: 0;
  z-index: 30;
  width: min(420rpx, 86vw);
  padding: 10rpx 12rpx 8rpx;
  border-radius: 20rpx;
  background-color: var(--bg);
  background-image: linear-gradient(var(--card-2), var(--card-2));
  border: 1rpx solid var(--border);
  box-shadow: var(--shadow-2);
  animation: emojiIn 0.24s var(--ease-out) both;
}
.emoji-panel.up {
  top: auto;
  bottom: calc(100% + 8rpx);
}
/* 脱离宿主（teleport 到 body）：改为视口固定定位，坐标由 JS 按入口位置换算成 px。
   层级引用公共 --z-popover，保证始终高于页面内容 / 帖子预览 / 其他卡片，
   不再依赖宿主卡片的层叠上下文（也无需再给宿主卡临时抬 z-index）。 */
.emoji-panel.escaped {
  position: fixed;
  right: auto;
  z-index: var(--z-popover);
}
.emoji-panel.escaped.up {
  top: auto;
}
@keyframes emojiIn {
  from {
    opacity: 0;
    transform: translateY(10rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.emoji-scroll {
  max-height: 320rpx;
}
.emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2rpx;
}
.emoji-item {
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 表情字号取 --font-lg（32）：与正文（--font-md 28）紧贴一档，插入正文前后视觉比例一致；
     点选热区仍由 64rpx 格子保证 */
  font-size: var(--font-lg);
  line-height: 1;
  border-radius: 12rpx;
  transition: background var(--dur-fast) var(--ease-out);
}
.emoji-item:active {
  background: var(--primary-soft);
}
.emoji-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 6rpx;
}
.emoji-tip {
  font-size: var(--font-xs);
  color: var(--text-3);
}
.emoji-del {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  border-radius: 999rpx;
}
.emoji-del:active {
  background: var(--primary-soft);
}
</style>
