<template>
  <!-- 横幅模式：页面顶部条幅，可关闭 -->
  <view v-if="bannerAnn" class="ann-banner anim-fade-up" @click="onAction(bannerAnn)">
    <OutlineIcon type="bell" :size="26" />
    <text class="ann-banner-text">{{ bannerAnn.title }}</text>
    <view class="ann-banner-close" @click.stop="dismiss(bannerAnn)">
      <OutlineIcon type="close" :size="22" />
    </view>
  </view>

  <!-- 轻提示模式：底部 toast，点击关闭 -->
  <view v-if="toastAnn" class="ann-toast anim-fade-up" @click="dismiss(toastAnn)">
    <text class="ann-toast-text">{{ toastAnn.title }}</text>
  </view>

  <!-- 弹窗模式：居中/顶部/底部 modal，支持图文 -->
  <view v-if="modalAnn" class="ann-mask" @click="onMaskClick">
    <view :class="['ann-modal', 'pos-' + modalAnn.position]" @click.stop>
      <view class="ann-modal-hd">
        <text class="ann-modal-title">{{ modalAnn.title }}</text>
        <view class="ann-modal-close" @click="dismiss(modalAnn)">
          <OutlineIcon type="close" :size="28" />
        </view>
      </view>
      <scroll-view class="ann-modal-bd" scroll-y>
        <image
          v-for="(img, i) in modalAnn.images"
          :key="i"
          :src="img"
          mode="widthFix"
          class="ann-modal-img"
          :preview-src-list="modalAnn.images"
        />
        <text v-if="modalAnn.content" class="ann-modal-content">{{ modalAnn.content }}</text>
      </scroll-view>
      <view v-if="modalAnn.link || modalAnn.content" class="ann-modal-ft">
        <view v-if="modalAnn.link" class="ann-modal-btn" @click="onAction(modalAnn)">
          <text>查看详情</text>
        </view>
        <view class="ann-modal-btn ghost" @click="dismiss(modalAnn)">
          <text>我知道了</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import { fetchActiveAnnouncements, type Announcement } from "@/api/announcement";

const props = withDefaults(
  defineProps<{
    /** 当前页面标识，用于匹配公告的 pages 字段 */
    currentPage?: string;
  }>(),
  { currentPage: "*" }
);

const announcements = ref<Announcement[]>([]);
const dismissedIds = ref<Set<string>>(new Set());

// 已关闭的公告 ID 持久化 key
const STORAGE_KEY = "ann_dismissed";

function loadDismissed() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) dismissedIds.value = new Set(JSON.parse(stored));
    // session 策略：用 sessionStorage 独立存储，关闭标签页即清
    const session = sessionStorage.getItem(STORAGE_KEY + "_session");
    if (session) {
      const sIds: string[] = JSON.parse(session);
      sIds.forEach((id) => dismissedIds.value.add(id));
    }
  } catch {
    /* 非关键路径 */
  }
}

function saveDismissed(id: string, dismissKey: string) {
  try {
    if (dismissKey === "once") {
      const stored = localStorage.getItem(STORAGE_KEY);
      const list: string[] = stored ? JSON.parse(stored) : [];
      if (!list.includes(id)) list.push(id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } else if (dismissKey === "session") {
      const stored = sessionStorage.getItem(STORAGE_KEY + "_session");
      const list: string[] = stored ? JSON.parse(stored) : [];
      if (!list.includes(id)) list.push(id);
      sessionStorage.setItem(STORAGE_KEY + "_session", JSON.stringify(list));
    }
    // always: 不持久化，下次访问仍展示
  } catch {
    /* 非关键路径 */
  }
}

// 过滤：页面匹配 + 未被关闭
const visibleAnnouncements = computed(() => {
  return announcements.value
    .filter((a) => {
      // 页面匹配：pages 含 "*" 或包含当前页
      if (!a.pages.includes("*") && !a.pages.includes(props.currentPage)) return false;
      // 未被关闭
      if (dismissedIds.value.has(a.id)) return false;
      return true;
    })
    .sort((a, b) => b.priority - a.priority);
});

// 三种展示模式各取优先级最高的一条
const modalAnn = computed(
  () => visibleAnnouncements.value.find((a) => a.type === "modal") || null
);
const bannerAnn = computed(
  () => visibleAnnouncements.value.find((a) => a.type === "banner") || null
);
const toastAnn = computed(
  () => visibleAnnouncements.value.find((a) => a.type === "toast") || null
);

function dismiss(ann: Announcement) {
  dismissedIds.value.add(ann.id);
  saveDismissed(ann.id, ann.dismissKey);
}

function onMaskClick() {
  if (modalAnn.value) dismiss(modalAnn.value);
}

function onAction(ann: Announcement) {
  if (ann.link) {
    // H5 打开链接，小程序复制到剪贴板
    if (typeof window !== "undefined" && window.open) {
      window.open(ann.link, "_blank");
    } else {
      uni.setClipboardData({ data: ann.link });
    }
  }
  dismiss(ann);
}

onMounted(async () => {
  loadDismissed();
  try {
    announcements.value = await fetchActiveAnnouncements();
  } catch {
    // 后端未启动或网络异常时静默，不阻塞主页面
  }
});
</script>

<style scoped>
/* ---- 横幅模式 ---- */
.ann-banner {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 14rpx 22rpx;
  margin-bottom: 14rpx;
  border-radius: var(--radius-sm);
  background: var(--primary-soft);
  color: var(--primary-dark);
  font-size: 25rpx;
  cursor: pointer;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.ann-banner-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ann-banner-close {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  opacity: 0.6;
  cursor: pointer;
}
.ann-banner-close:active {
  opacity: 1;
  background: rgba(0, 0, 0, 0.06);
}

/* ---- 轻提示模式 ---- */
.ann-toast {
  position: fixed;
  bottom: 140rpx;
  left: 50%;
  transform: translateX(-50%);
  max-width: 86%;
  padding: 18rpx 32rpx;
  border-radius: 999rpx;
  background: rgba(0, 0, 0, 0.78);
  color: #fff;
  font-size: 25rpx;
  z-index: 9999;
  pointer-events: auto;
  cursor: pointer;
}
.ann-toast-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- 弹窗模式 ---- */
.ann-mask {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: annFade var(--dur-fast) ease both;
}
.ann-modal {
  width: 86%;
  max-width: 640rpx;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--card);
  border-radius: var(--radius);
  border: 1rpx solid var(--border);
  box-shadow: var(--shadow);
  backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(150%);
  overflow: hidden;
  animation: annScale var(--dur) var(--ease-out) both;
}
.ann-modal.pos-top {
  align-self: flex-start;
  margin-top: 120rpx;
  animation: annSlideDown var(--dur) var(--ease-out) both;
}
.ann-modal.pos-bottom {
  align-self: flex-end;
  margin-bottom: 0;
  width: 100%;
  max-width: 100%;
  border-radius: var(--radius) var(--radius) 0 0;
  animation: annSlideUp var(--dur) var(--ease-out) both;
}
.ann-modal-hd {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 24rpx 28rpx 12rpx;
  flex: none;
}
.ann-modal-title {
  flex: 1;
  font-size: 32rpx;
  font-weight: 700;
  color: var(--r-ink, var(--text));
}
.ann-modal-close {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  opacity: 0.5;
  cursor: pointer;
}
.ann-modal-close:active {
  opacity: 1;
  background: var(--card-2);
}
.ann-modal-bd {
  flex: 1;
  padding: 0 28rpx;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.ann-modal-img {
  width: 100%;
  border-radius: var(--radius-sm);
  margin-bottom: 16rpx;
}
.ann-modal-content {
  display: block;
  font-size: 27rpx;
  line-height: 1.7;
  color: var(--r-soft, var(--text-2));
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 16rpx;
}
.ann-modal-ft {
  display: flex;
  gap: 16rpx;
  padding: 16rpx 28rpx 24rpx;
  flex: none;
}
.ann-modal-btn {
  flex: 1;
  height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: #fff;
  font-size: 27rpx;
  font-weight: 600;
  cursor: pointer;
  transition: transform var(--dur-fast) var(--ease-out);
}
.ann-modal-btn:active {
  transform: scale(0.97);
}
.ann-modal-btn.ghost {
  background: var(--card-2);
  color: var(--text-2);
}

/* ---- 动画 ---- */
@keyframes annFade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes annScale {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes annSlideDown {
  from {
    opacity: 0;
    transform: translateY(-40rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes annSlideUp {
  from {
    opacity: 0;
    transform: translateY(100%);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
