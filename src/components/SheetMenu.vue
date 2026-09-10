<template>
  <!-- 通用底部弹层菜单（复用 BottomSheet 外壳 + 全局 grp 列表样式）：
       帖子「长按操作」「举报原因」「设置访问权限」等多处复用，避免每处重写一套列表。 -->
  <BottomSheet v-model="open" :title="title">
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
  </BottomSheet>
</template>

<script setup lang="ts">
import { computed } from "vue";
import BottomSheet from "./BottomSheet.vue";
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

function pick(it: SheetMenuItem) {
  emit("select", it.key);
}
</script>
