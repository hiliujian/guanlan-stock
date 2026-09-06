<template>
  <view :class="['emoji-wrap', variant]">
    <!-- 表情入口：点亮态主色描边（无底无框，克制风格）；
         mousedown.prevent 防止点击夺走输入框焦点导致光标丢失 -->
    <view
      class="emoji-btn"
      :class="{ active: open }"
      @click="toggle"
      @mousedown.prevent
      role="button"
      :aria-label="open ? '收起表情面板' : '打开表情面板'"
    >
      <OutlineIcon type="smile" :size="iconSize" :color="open ? 'var(--primary)' : 'var(--text-2)'" />
    </view>

    <!-- 表情面板（类微信）：点选即插入光标处；
         mousedown.prevent 防止点面板夺走输入框焦点导致光标丢失 -->
    <view v-if="open" class="emoji-panel" @mousedown.prevent>
      <scroll-view scroll-y class="emoji-scroll">
        <view class="emoji-grid">
          <text v-for="em in EMOJIS" :key="em" class="emoji-item" @click="onSelect(em)">{{ em }}</text>
        </view>
      </scroll-view>
      <view class="emoji-bar">
        <text class="emoji-tip">点击插入到光标处</text>
        <view class="emoji-del" @click="onBackspace" role="button" aria-label="删除一个字符">
          <OutlineIcon type="backspace" :size="34" color="var(--text)" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { EMOJIS, useEmoji } from "@/composables/useEmoji";
import OutlineIcon from "./OutlineIcon.vue";

const props = withDefaults(
  defineProps<{
    /** 双向绑定的文本，插入表情后同步回父组件 */
    modelValue: string;
    /** 面板展开态（支持 v-model:open 受父组件控制，如发帖展开表情时收起附件菜单） */
    open?: boolean;
    /** 解析出原生 input/textarea 元素，供光标定位插入 */
    getEl: () => HTMLInputElement | HTMLTextAreaElement | null;
    /** float：悬浮输入框右上角（发帖）；inline：跟随输入框行内右侧（回复 / 私信） */
    variant?: "float" | "inline";
    maxLength?: number;
    iconSize?: number;
  }>(),
  { open: false, variant: "inline", maxLength: undefined, iconSize: 28 }
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

const openState = ref(props.open);
watch(
  () => props.open,
  (v) => (openState.value = v)
);

const { emojiOpen, toggleEmoji, insertEmoji, backspaceEmoji } = useEmoji(props.getEl, local, {
  maxLength: props.maxLength,
  onAfterInsert: (t) => {
    emit("update:modelValue", t);
    emit("after-insert", t);
  },
});

function toggle() {
  emojiOpen.value = !emojiOpen.value;
  emit("update:open", emojiOpen.value);
}
function onSelect(em: string) {
  insertEmoji(em);
}
function onBackspace() {
  backspaceEmoji();
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
/* 面板：相对入口容器定位，向下展开成浮层 */
.emoji-panel {
  position: absolute;
  top: calc(100% + 8rpx);
  right: 0;
  z-index: 30;
  width: min(420rpx, 86vw);
  padding: 10rpx 12rpx 8rpx;
  border-radius: 20rpx;
  background: var(--card-2);
  border: 1rpx solid var(--border);
  box-shadow: var(--shadow-2);
  animation: emojiIn 0.24s var(--ease-out) both;
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
