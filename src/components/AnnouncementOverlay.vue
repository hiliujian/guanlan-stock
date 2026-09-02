<template>
  <!-- 横幅模式：页面顶部条幅，可关闭 -->
  <view v-if="bannerAnn" class="ann-banner anim-fade-up" @click="onAction(bannerAnn)">
    <OutlineIcon type="bell" :size="26" />
    <text class="ann-banner-text truncate">{{ bannerAnn.title }}</text>
    <view class="ann-banner-close flex-center" @click.stop="dismiss(bannerAnn)">
      <OutlineIcon type="close" :size="22" />
    </view>
  </view>

  <!-- 轻提示模式：底部 toast，点击关闭 -->
  <view v-if="toastAnn" class="ann-toast anim-fade-up" @click="dismiss(toastAnn)">
    <text class="ann-toast-text truncate">{{ toastAnn.title }}</text>
  </view>

  <!-- 弹窗模式：居中/顶部/底部 modal，支持图文；无遮罩压暗（透明全屏层仅承接点空白关闭） -->
  <view v-if="modalAnn" class="ann-mask" @click="onMaskClick">
    <view :class="['ann-modal', 'pos-' + modalAnn.position]" @click.stop>
      <view class="ann-modal-hd">
        <view class="ann-modal-badge flex-center">
          <OutlineIcon type="bell" :size="30" color="var(--primary)" />
        </view>
        <text class="ann-modal-title">{{ modalAnn.title }}</text>
        <view class="ann-modal-close flex-center" @click="dismiss(modalAnn)">
          <OutlineIcon type="close" :size="26" />
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
        <view v-if="modalAnn.link" class="ann-modal-btn ghost" @click="onAction(modalAnn)">
          <text>查看详情</text>
        </view>
        <view class="ann-modal-btn" @click="dismiss(modalAnn)">
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
  font-size: var(--font-sm);
  cursor: pointer;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.ann-banner-text {
  flex: 1;
  /* 截断属性已提升至全局 .truncate */
}
.ann-banner-close {
  /* 布局属性已提升至全局 .flex-center */
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
  font-size: var(--font-sm);
  z-index: 9999;
  pointer-events: auto;
  cursor: pointer;
}
.ann-toast-text {
  /* 截断属性已提升至全局 .truncate */
}

/* ---- 弹窗模式 ---- */
/* 遮罩已移除：透明全屏层不再压暗背景，仅承接「点空白处关闭」；
   卡片改用实心 --card 背景（非玻璃），让正文在透明背景下仍能聚焦、易读 */
.ann-mask {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: annFade var(--dur-fast) ease both;
}
.ann-modal {
  width: 84%;
  max-width: 600rpx;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  /* 不透明实心卡：项目 --card 为玻璃半透明（浅 0.72 / 深 0.06），不符合「不要透明」要求 */
  background: #ffffff;
  border-radius: 28rpx;
  border: 1rpx solid var(--border);
  box-shadow: var(--shadow-3);
  overflow: hidden;
  animation: annScale var(--dur) var(--ease-out) both;
}
/* 深色主题：替换为不透明深色表面，跨主题一致 */
:global(.theme-dark) .ann-modal {
  background: #11161f;
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
  border-radius: 22rpx 22rpx 0 0;
  animation: annSlideUp var(--dur) var(--ease-out) both;
}
.ann-modal-hd {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 30rpx 24rpx 18rpx 28rpx;
  flex: none;
  border-bottom: 1rpx solid var(--border);
}
/* 标题左侧的铃铛图标芯片（主色浅底圆角块），点明「公告」属性 */
.ann-modal-badge {
  flex: none;
  width: 60rpx;
  height: 60rpx;
  border-radius: 18rpx;
  background: var(--primary-soft);
}
/* 标题：本组件全程禁用 font-weight 加粗，层级仅靠字号 + 颜色 + 图标区分 */
.ann-modal-title {
  flex: 1;
  font-size: var(--font-lg);
  color: var(--r-ink, var(--text));
}
.ann-modal-close {
  /* 布局属性已提升至全局 .flex-center */
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
  padding: 24rpx 28rpx 8rpx;
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
  font-size: var(--font-md);
  line-height: 1.8;
  color: var(--r-soft, var(--text));
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 16rpx;
}
.ann-modal-ft {
  display: flex;
  gap: 16rpx;
  padding: 8rpx 28rpx 28rpx;
  flex: none;
}
/* 按钮形状 / 字重对齐系统 .btn-primary：药丸 999rpx、高 72rpx、不加粗（继承 400） */
.ann-modal-btn {
  flex: 1;
  height: 72rpx;
  line-height: 72rpx;
  text-align: center;
  border: none;
  border-radius: 999rpx;
  background: var(--primary);
  color: #fff;
  font-size: var(--font-md);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease, opacity 0.2s ease, background 0.15s ease;
}
/* 激活态复用系统「按下」语言：primary-dark + 轻微下沉 + 主色投影 + 内高光（非 scale 抖动） */
.ann-modal-btn:active {
  background: var(--primary-dark);
  color: #fff;
  transform: translateY(1rpx);
  box-shadow: var(--shadow-primary-1), inset 0 1rpx 0 rgba(255, 255, 255, 0.22);
}
/* 次按钮：柔和我方 --card-2 软填充（替代原先透明文字，解决「很丑 / 不搭主题」），形状一致 */
.ann-modal-btn.ghost {
  background: var(--card-2);
  color: var(--text-2);
  box-shadow: none;
}
.ann-modal-btn.ghost:active {
  background: var(--card-2);
  color: var(--text-2);
  transform: translateY(1rpx);
  opacity: 0.85;
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
