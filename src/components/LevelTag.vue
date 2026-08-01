<template>
  <view class="lv-tag" :style="style" role="img" :aria-label="`等级：${meta.name}`">
    <OutlineIcon :type="meta.icon" :size="18" :color="colors.icon" />
    <text class="lv-name">{{ meta.name }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import { levelMeta, BAND_COLORS } from "@/store/level";

const props = defineProps<{ level: number }>();

const meta = computed(() => levelMeta(props.level));
const colors = computed(() => BAND_COLORS[meta.value.band]);
const style = computed(() => ({
  background: `linear-gradient(135deg, ${colors.value.from}, ${colors.value.to})`,
  color: colors.value.icon,
}));
</script>

<style scoped>
.lv-tag {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1.3;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.18);
  vertical-align: middle;
}
.lv-name {
  letter-spacing: 1rpx;
}
</style>
