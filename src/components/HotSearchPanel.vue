<template>
  <view v-if="list.length" class="hot anim-fade-up">
    <view class="hot-head">
      <text class="hot-title">今日热门</text>
      <view class="hot-dot" />
      <text v-if="loading" class="hot-refresh">刷新中…</text>
    </view>
    <view class="hot-chips">
      <view
        v-for="(s, i) in list"
        :key="s.code"
        class="chip"
        role="button"
        :style="{ animationDelay: (i % 10) * 30 + 'ms' }"
        @click="pick(s)"
      >
        <view class="chip-rank" :class="{ top: i < 3 }">{{ i + 1 }}</view>
        <view class="chip-main">
          <text class="chip-name">{{ s.name || s.code }}</text>
          <text class="chip-code">{{ s.code }}</text>
        </view>
        <text class="chip-count">{{ s.count }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { fetchHotSearches, type HotStock } from "@/api/hot";

const emit = defineEmits<{ (e: "open", stock: { code: string; name: string }): void }>();

const list = ref<HotStock[]>([]);
const loading = ref(false);

async function load() {
  if (loading.value) return;
  loading.value = true;
  list.value = await fetchHotSearches(8);
  loading.value = false;
}

function pick(s: HotStock) {
  emit("open", { code: s.code, name: s.name });
}

onMounted(load);
</script>

<style scoped>
.hot {
  width: 100%;
  margin-top: 36rpx;
}
.hot-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 20rpx;
}
.hot-title {
  font-size: 24rpx;
  font-weight: 700;
  color: var(--text);
}
.hot-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: var(--primary);
}
.hot-refresh {
  font-size: 20rpx;
  color: var(--text-3);
}
.hot-chips {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}
.chip {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 20rpx;
  border-radius: 16rpx;
  background: var(--card-2);
  border: 1rpx solid var(--border);
  transition: all 0.15s ease;
}
.chip:active {
  transform: scale(0.97);
}
.chip-rank {
  flex: none;
  width: 44rpx;
  height: 44rpx;
  border-radius: 10rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  font-weight: 800;
  color: var(--text-2);
  background: var(--bg-2);
  border: 1rpx solid var(--border);
  font-variant-numeric: tabular-nums;
}
.chip-rank.top {
  color: #fff;
  background: linear-gradient(135deg, var(--primary), var(--primary-dark, #06a050));
  border: none;
}
.chip-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.chip-name {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-code {
  font-size: 22rpx;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.chip-count {
  flex: none;
  font-size: 20rpx;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
</style>