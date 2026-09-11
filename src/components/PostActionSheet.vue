<template>
  <!-- 帖子长按「操作」卡片：直接复用统一底部卡片组件（与发帖器 / 设置持仓同款 UniversalCard，
       sheet 形态），生长/收缩走半屏 max-height 过渡，与全站底部卡片动效完全一致、不掉帧。
       原先的 menu 形态用 max-height 从 0→内容高，逐帧重排导致严重卡顿，故改为 sheet 复用。 -->
  <UniversalCard v-model="open" variant="sheet" title="操作">
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
import type { SheetMenuItem } from "./SheetMenu.vue";

const props = defineProps<{
  modelValue: boolean;
  items: SheetMenuItem[];
}>();
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
