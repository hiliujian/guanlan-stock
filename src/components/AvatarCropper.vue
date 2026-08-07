<template>
  <view v-if="modelValue" class="ac-mask mask-blur" @click.self="onCancel" @touchmove.prevent>
    <view class="ac-card" role="dialog" aria-modal="true">
      <view class="ac-title">{{ title }}</view>

      <!-- 裁剪工作区：图片 + 暗色蒙层（四周半透明 + 中央圆形镂空） -->
      <view
        ref="stageRef"
        class="ac-stage"
        :style="stageStyle"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
        @mousedown="onTouchStart"
        @mousemove="onTouchMove"
        @mouseup="onTouchEnd"
        @mouseleave="onTouchEnd"
        @wheel.prevent="onWheel"
      >
        <!-- 原图：等比 cover 缩放（短边铺满 stage，长边溢出可由用户平移选取） -->
        <image
          :src="src"
          class="ac-img"
          mode="aspectFill"
          :style="imgStyle"
          @load="onImgLoad"
          @error="onImgError"
        />
        <!-- 暗色蒙层：四周暗 + 中央圆形镂空（用 radial-gradient 实现） -->
        <view class="ac-overlay" :style="overlayStyle" />
        <!-- 圆形选区边框 -->
        <view class="ac-ring" :style="ringStyle" />
        <!-- 网格线（三分构图） -->
        <view class="ac-grid ac-grid-h" :style="ringStyle" />
        <view class="ac-grid ac-grid-v" :style="ringStyle" />
      </view>

      <!-- 缩放控制 -->
      <view class="ac-controls">
        <view class="ac-zoom-btn" hover-class="ac-zoom-btn-hover" @click="zoomOut">
          <OutlineIcon type="minus" :size="20" color="var(--text)" />
        </view>
        <view
          class="ac-zoom-track"
          @touchstart="onTrackPointer"
          @touchmove="onTrackPointer"
          @mousedown="onTrackPointerDown"
          @mousemove="onTrackPointerMove"
          @mouseup="onTrackPointerUp"
          @mouseleave="onTrackPointerUp"
        >
          <view class="ac-zoom-fill" :style="zoomFillStyle" />
          <view class="ac-zoom-thumb" :style="zoomThumbStyle" />
        </view>
        <view class="ac-zoom-btn" hover-class="ac-zoom-btn-hover" @click="zoomIn">
          <OutlineIcon type="plus" :size="20" color="var(--text)" />
        </view>
      </view>

      <text class="ac-tip">拖动图片调整位置，滑动滑杆缩放</text>

      <view class="ac-actions">
        <view class="ac-btn ac-cancel" hover-class="ac-cancel-hover" @click="onCancel">{{ cancelText }}</view>
        <view class="ac-btn ac-ok" hover-class="ac-ok-hover" @click="onConfirm">{{ confirmText }}</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 头像裁剪弹窗（与 ConfirmDialog 复用 mask 风格）
 * - 矩形图片 → 正方形圆形头像
 * - 用户可拖动图片、双击放大、滚轮缩放、滑杆缩放
 * - 确认后 canvas 离屏渲染输出 256×256 PNG（圆形 + 透明背景外圈）
 *
 * 设计要点：
 * 1. 工作区固定一个方形容器 stage（auto-按屏幕宽度）
 * 2. 图片 aspectFill 放到 stage 内部，使用 left/top/width/height 自由拖动
 * 3. 圆形选区始终等于 stage 大小（最大正方形 = stage 边长，圆形 = stage 边长作直径）
 *    → 用户只需在「圆形范围内调整图片」，所见即所得
 * 4. 缩放基于图片短边放大倍数 ratio（1 = 正好铺满 stage 短边；>1 = 放大；上限 3）
 */
import { computed, nextTick, ref, watch } from "vue";
import OutlineIcon from "./OutlineIcon.vue";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    src: string;
    title?: string;
    confirmText?: string;
    cancelText?: string;
    outputSize?: number;
  }>(),
  {
    title: "调整头像",
    confirmText: "使用",
    cancelText: "取消",
    outputSize: 256,
  }
);
const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "confirm", payload: { dataURL: string }): void;
  (e: "cancel"): void;
}>();

// ===== 容器尺寸 =====
const stageSize = ref(560); // px（运行时折算自屏幕宽度）
const stageStyle = computed(() => ({
  width: `${stageSize.value}px`,
  height: `${stageSize.value}px`,
}));

// ===== 图片状态 =====
const imgW = ref(0);
const imgH = ref(0);
const imgError = ref(false);

// 图片显示尺寸（scale=1 时的基准尺寸，容器内坐标系）
const imgDispW = ref(0);
const imgDispH = ref(0);

// 用户拖动产生的偏移（叠加到 imgLeft/imgTop 上）
const offsetX = ref(0);
const offsetY = ref(0);

// 缩放（相对初始「正好铺满短边」的倍数）
const minScale = 1;
const maxScale = 3;
const scale = ref(1);

// ===== 拖动/缩放手势 =====
let dragging = false;
let lastX = 0;
let lastY = 0;
let pinchStart = 0;
let scaleStart = 0;

function onImgLoad(e: any) {
  imgError.value = false;
  const w = e.detail?.width || 0;
  const h = e.detail?.height || 0;
  if (!w || !h) return;
  imgW.value = w;
  imgH.value = h;
  resetView();
}
function onImgError() {
  imgError.value = true;
  uni.showToast({ title: "图片加载失败", icon: "none" });
}

/**
 * 重置：图片等比 cover 缩放到「短边正好铺满 stage」，
 * 长边自然溢出（可平移选取）。居中由 imgStyle 实时计算，
 * 用户从此状态开始拖动/缩放。
 */
function resetView() {
  if (!imgW.value || !imgH.value) return;
  // 等比缩放，使图片短边 == stage（cover 模式：长边溢出）
  const baseScale = stageSize.value / Math.min(imgW.value, imgH.value);
  imgDispW.value = imgW.value * baseScale;
  imgDispH.value = imgH.value * baseScale;
  offsetX.value = 0;
  offsetY.value = 0;
  scale.value = 1;
}

const imgStyle = computed(() => {
  // 实际渲染尺寸（含缩放），居中基准 + 用户平移偏移
  const dispW = imgDispW.value * scale.value;
  const dispH = imgDispH.value * scale.value;
  const left = (stageSize.value - dispW) / 2 + offsetX.value;
  const top = (stageSize.value - dispH) / 2 + offsetY.value;
  return {
    width: `${dispW}px`,
    height: `${dispH}px`,
    left: `${left}px`,
    top: `${top}px`,
  };
});

/**
 * 暗色蒙层：用 radial-gradient + mask-image 实现「中央圆形镂空」。
 * mask-image 兼容 H5 / 小程序：用径向蒙版绘制镂空。
 */
const overlayStyle = computed(() => {
  const r = stageSize.value / 2;
  return {
    backgroundImage: `radial-gradient(circle at center, transparent ${r - 1}px, rgba(0,0,0,0.55) ${r}px)`,
  };
});
const ringStyle = computed(() => ({
  width: `${stageSize.value}px`,
  height: `${stageSize.value}px`,
}));

// ===== 拖动事件 =====
function clampOffset() {
  // 图片必须始终覆盖整个 stage（圆形选区不能露出背景）。
  // 关键：使用图片「实际渲染尺寸」(imgDispW/ imgDispH × scale)，
  // 而非 stageSize×scale —— 否则宽幅图片长边溢出量被错误算成 0，
  // 用户无法左右平移选取区域（即本 BUG）。
  const dispW = imgDispW.value * scale.value;
  const dispH = imgDispH.value * scale.value;
  const dxMax = Math.max(0, (dispW - stageSize.value) / 2);
  const dyMax = Math.max(0, (dispH - stageSize.value) / 2);
  offsetX.value = Math.max(-dxMax, Math.min(dxMax, offsetX.value));
  offsetY.value = Math.max(-dyMax, Math.min(dyMax, offsetY.value));
}
function pt(e: any) {
  if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX || 0, y: e.clientY || 0 };
}
function onTouchStart(e: any) {
  const touches = e.touches;
  if (touches && touches.length === 2) {
    // 双指 pinch：记录初始距离
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    pinchStart = Math.hypot(dx, dy);
    scaleStart = scale.value;
    dragging = false;
    return;
  }
  dragging = true;
  const p = pt(e);
  lastX = p.x;
  lastY = p.y;
}
function onTouchMove(e: any) {
  const touches = e.touches;
  if (touches && touches.length === 2 && pinchStart) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    const next = scaleStart * (dist / pinchStart);
    scale.value = Math.min(maxScale, Math.max(minScale, next));
    clampOffset();
    return;
  }
  if (!dragging) return;
  const p = pt(e);
  offsetX.value += p.x - lastX;
  offsetY.value += p.y - lastY;
  lastX = p.x;
  lastY = p.y;
  clampOffset();
}
function onTouchEnd() {
  dragging = false;
  pinchStart = 0;
}

// ===== 缩放按钮/滑杆 =====
function zoomIn() {
  scale.value = Math.min(maxScale, +(scale.value + 0.1).toFixed(2));
  clampOffset();
}
function zoomOut() {
  scale.value = Math.max(minScale, +(scale.value - 0.1).toFixed(2));
  clampOffset();
}
/**
 * 滑杆交互：点哪跳到哪 + 拖拽 thumb 改变 scale
 * - 移动端 touch 事件用 clientX 直接算比例
 * - 桌面端 mouse 按下后开启 dragToTrack 模式，move/up 持续更新
 */
let trackDragging = false;
function trackXToScale(x: number) {
  const el = (typeof document !== "undefined" ? document.querySelector(".ac-zoom-track") : null) as HTMLElement | null;
  const rect = el?.getBoundingClientRect?.();
  if (!rect || !rect.width) return;
  const ratio = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
  scale.value = +(minScale + ratio * (maxScale - minScale)).toFixed(2);
}
function onTrackPointer(e: any) {
  // 触屏：touchstart 与 touchmove 都直接跟随手指
  const touch = e.touches?.[0] || e.changedTouches?.[0];
  if (touch?.clientX != null) {
    trackXToScale(touch.clientX);
    e.preventDefault?.();
  }
}
function onTrackPointerDown(e: any) {
  if (typeof window === "undefined") return;
  trackDragging = true;
  trackXToScale(e.clientX);
}
function onTrackPointerMove(e: any) {
  if (!trackDragging) return;
  trackXToScale(e.clientX);
}
function onTrackPointerUp() {
  trackDragging = false;
}
function onWheel(e: any) {
  const delta = e.deltaY || 0;
  scale.value = Math.max(minScale, Math.min(maxScale, scale.value - delta * 0.002));
  clampOffset();
}

const zoomFillStyle = computed(() => ({
  width: `${((scale.value - minScale) / (maxScale - minScale)) * 100}%`,
}));
const zoomThumbStyle = computed(() => ({
  left: `${((scale.value - minScale) / (maxScale - minScale)) * 100}%`,
}));

// ===== 弹窗开关时重置 =====
watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const info: any = (uni as any).getSystemInfoSync ? (uni as any).getSystemInfoSync() : {};
        const sw = info.screenWidth || info.windowWidth || 375;
        stageSize.value = Math.min(560, (560 * sw) / 750);
      } catch (_) {
        stageSize.value = 320;
      }
      nextTick(() => {
        scale.value = 1;
        offsetX.value = 0;
        offsetY.value = 0;
        if (imgW.value && imgH.value) resetView();
      });
    }
  }
);

function close() {
  emit("update:modelValue", false);
}
function onCancel() {
  close();
  emit("cancel");
}

function onConfirm() {
  if (!imgW.value || !imgH.value) {
    uni.showToast({ title: "图片未加载完成", icon: "none" });
    return;
  }
  // 计算「圆形选区」对应到原图的源区域。
  // 实际渲染尺寸（含缩放）与相对 stage 的位置：
  const dispW = imgDispW.value * scale.value;
  const dispH = imgDispH.value * scale.value;
  const dispLeft = (stageSize.value - dispW) / 2 + offsetX.value;
  const dispTop = (stageSize.value - dispH) / 2 + offsetY.value;
  // stage 上的方形选区(0..stageSize) → 原图像素：
  // 显示每像素对应原图 (imgW/dispW)、(imgH/dispH) 像素。
  const sx = -dispLeft * (imgW.value / dispW);
  const sy = -dispTop * (imgH.value / dispH);
  const sw = stageSize.value * (imgW.value / dispW);
  const sh = stageSize.value * (imgH.value / dispH);

  // #ifdef H5
  const cvs: HTMLCanvasElement | null =
    typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (cvs) {
    cvs.width = props.outputSize;
    cvs.height = props.outputSize;
    const ctx = cvs.getContext("2d");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (ctx) {
        ctx.clearRect(0, 0, props.outputSize, props.outputSize);
        // 用圆形 clip 让裁剪输出为正圆头像（PNG 透明背景）
        ctx.beginPath();
        ctx.arc(props.outputSize / 2, props.outputSize / 2, props.outputSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, props.outputSize, props.outputSize);
      }
      const dataURL = cvs.toDataURL("image/png");
      close();
      emit("confirm", { dataURL });
    };
    img.onerror = () => {
      close();
      emit("confirm", { dataURL: props.src });
    };
    img.src = props.src;
    return;
  }
  // #endif
  close();
  emit("confirm", { dataURL: props.src });
}
</script>

<style scoped>
.ac-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
}
.ac-card {
  width: 100%;
  max-width: 620rpx;
  box-sizing: border-box;
  background: var(--card);
  border-radius: 32rpx;
  padding: 36rpx 32rpx 28rpx;
  box-shadow: 0 24rpx 64rpx rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
}
.ac-title {
  text-align: center;
  font-size: 30rpx;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 20rpx;
}
.ac-stage {
  position: relative;
  overflow: hidden;
  border-radius: 20rpx;
  background: #000;
  margin: 0 auto;
  flex: none;
  user-select: none;
  -webkit-user-select: none;
  /* 关键：禁用浏览器原生图片拖拽 */
  touch-action: none;
}
.ac-img {
  position: absolute;
  pointer-events: none;
  /* 禁用浏览器原生拖动 */
  -webkit-user-drag: none;
}
/* 暗色蒙层：CSS 渐变模拟「中央圆形镂空 + 四周暗」，无 SVG/clip-path，跨端可用 */
.ac-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
/* 圆形选区描边 */
.ac-ring {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 50%;
  border: 2rpx solid rgba(255, 255, 255, 0.8);
  box-sizing: border-box;
  pointer-events: none;
}
/* 三分线网格（更专业感） */
.ac-grid {
  position: absolute;
  pointer-events: none;
}
.ac-grid-h {
  width: 100%;
  height: 1rpx;
  top: 50%;
  border-top: 1rpx solid rgba(255, 255, 255, 0.45);
}
.ac-grid-v {
  height: 100%;
  width: 1rpx;
  left: 50%;
  border-left: 1rpx solid rgba(255, 255, 255, 0.45);
}

/* 缩放控件 */
.ac-controls {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 22rpx;
}
.ac-zoom-btn {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: var(--card-2);
  border: 1rpx solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  transition: transform 0.12s ease, filter 0.18s ease;
}
.ac-zoom-btn-hover {
  filter: brightness(0.94);
  transform: scale(0.96);
}
.ac-zoom-track {
  flex: 1;
  position: relative;
  height: 8rpx;
  border-radius: 999rpx;
  background: var(--card-2);
  cursor: pointer;
}
.ac-zoom-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: var(--primary);
  border-radius: 999rpx;
  transition: width 0.12s ease;
}
.ac-zoom-thumb {
  position: absolute;
  top: 50%;
  width: 26rpx;
  height: 26rpx;
  border-radius: 50%;
  background: #fff;
  border: 2rpx solid var(--primary);
  transform: translate(-50%, -50%);
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.2);
  transition: left 0.12s ease;
}

.ac-tip {
  display: block;
  margin-top: 18rpx;
  text-align: center;
  font-size: 22rpx;
  color: var(--text-2);
}

.ac-actions {
  display: flex;
  gap: 18rpx;
  margin-top: 28rpx;
}
.ac-btn {
  flex: 1;
  height: 80rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 500;
  transition: transform 0.12s ease, filter 0.18s ease;
}
.ac-btn:active {
  transform: scale(0.97);
}
.ac-cancel {
  background: var(--card-2);
  color: var(--text-2);
  border: 1rpx solid var(--border);
}
.ac-cancel-hover {
  filter: brightness(0.96);
}
.ac-ok {
  background: var(--primary);
  color: #fff;
}
.ac-ok-hover {
  filter: brightness(1.06);
}
</style>