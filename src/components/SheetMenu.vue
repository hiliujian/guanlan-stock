<template>
  <!-- 通用底部弹层菜单（复用统一底部卡片 menu 形态 + 全局 grp 列表样式）：
       帖子「长按操作」「举报原因」「设置访问权限」等多处复用，避免每处重写一套列表。 -->
  <UniversalCard v-model="open" :title="title" :max-height-hint="hintRpx">
    <view class="grp-list">
      <view
        v-for="it in items"
        :key="it.key"
        class="grp-item"
        :class="{ danger: it.danger }"
        role="button"
        @click="pick(it)"
      >
        <OutlineIcon v-if="it.icon" :type="it.icon" :size="28" :color="it.danger ? '#ff3b30' : 'var(--text-2)'" />
        <view class="sm-text">
          <text class="grp-label" :class="{ danger: it.danger }">{{ it.label }}</text>
          <text v-if="it.desc" class="sm-desc">{{ it.desc }}</text>
        </view>
        <OutlineIcon v-if="it.checked" type="check" :size="26" color="var(--primary)" />
      </view>
    </view>
  </UniversalCard>
</template>

<script setup lang="ts">
import { computed } from "vue";
import UniversalCard from "./UniversalCard.vue";
import OutlineIcon from "./OutlineIcon.vue";

export interface SheetMenuItem {
  key: string;
  label: string;
  icon?: string;
  desc?: string;
  danger?: boolean;
  checked?: boolean;
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    items: SheetMenuItem[];
  }>(),
  { title: "", items: () => [] }
);
const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "select", key: string): void;
}>();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

// 菜单高度提示（rpx）：让 UniversalCard 以「内容高度」为 max-height 过渡目标，
// 使短菜单的生长/收缩节奏与半屏 sheet 卡片一致（否则 0→100vh 会让短菜单瞬间长好）
const hintRpx = computed(() => {
  const grip = 36; // 顶部拖拽热区
  const head = props.title ? 72 : 0; // 标题栏
  const pad = 44; // 正文上下内边距
  return grip + head + pad + props.items.length * 68; // 每项约 68rpx
});

function pick(it: SheetMenuItem) {
  emit("select", it.key);
}
</script>
