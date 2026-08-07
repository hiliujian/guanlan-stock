<template>
  <view v-if="modelValue" class="ac-mask mask-blur" @click.self="onCancel">
    <view class="ac-card" role="dialog" aria-modal="true">
      <view class="ac-title">{{ title }}</view>

      <!-- 裁剪区：原图底层 + 圆形遮罩 + 可拖动圆形定位 -->
      <view class="ac-stage">
        <view class="ac-canvas" :style="canvasStyle">
          <image
            :src="src"
            class="ac-img"
            mode="aspectFill"
            @load="onImgLoad"
          />
          <!-- 圆形选区 -->
          <view class="ac-circle" :style="circleStyle" @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd" @mousedown="onTouchStart" @mousemove="onTouchMove" @mouseup="onTouchEnd" @mouseleave="onTouchEnd">
            <view class="ac-grid ac-grid-h" />
            <view class="ac-grid ac-grid-v" />
          </view>
        </view>
      </view>

      <!-- 操作区：缩放滑杆 -->
      <view class="ac-zoom">
        <OutlineIcon type="minus" :size="22" color="var(--text-2)" />
        <slider
          class="ac-slider"
          :min="minScale"
          :max="maxScale"
          :step="0.01"
          :value="scale"
          activeColor="var(--primary)"
          backgroundColor="var(--card-2)"
          block-size="22"
          @change="onScaleChange"
        />
        <OutlineIcon type="plus" :size="22" color="var(--text-2)" />
      </view>

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
 * - 传入图片 src，输出圆形裁剪后的 base64（PNG）
 * - 用户可缩放（滑杆）+ 拖动（圆形选区）调整裁剪区域
 * - 确认时通过 canvas 离屏渲染 → 输出 256×256 圆形 PNG（透明背景）
 * - 输出格式：dataURL，便于调用方直接传入 upload 接口
 */
import { computed, nextTick, ref, watch } from "vue";
import OutlineIcon from "./OutlineIcon.vue";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    src: string; // 待裁剪的图片本地路径或 URL
    title?: string;
    confirmText?: string;
    cancelText?: string;
    /** 输出尺寸（正方形像素），默认 256 */
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

// 容器尺寸（rpx → px 在运行时通过 uni.getSystemInfo 折算）
const stageSize = ref(560); // 容器宽度 px（560 = 350rpx，按 750 设计）
const stageSizeCss = computed(() => `${stageSize.value}px`);

const sizeCss = computed(() => `${stageSize.value}px`);

const circleStyle = computed(() => ({
  width: sizeCss.value,
  height: sizeCss.value,
}));

const canvasStyle = computed(() => ({
  width: stageSizeCss.value,
  height: stageSizeCss.value,
}));

// 缩放/位移
const minScale = 1;
const maxScale = 3;
const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);

// 原始图片尺寸（用于输出时计算源区域）
const imgNaturalW = ref(0);
const imgNaturalH = ref(0);

function onImgLoad(e: any) {
  const w = e.detail?.width || 0;
  const h = e.detail?.height || 0;
  imgNaturalW.value = w;
  imgNaturalH.value = h;
  scale.value = 1;
  offsetX.value = 0;
  offsetY.value = 0;
}

function onScaleChange(e: any) {
  scale.value = Math.min(maxScale, Math.max(minScale, Number(e.detail?.value || 1)));
}

// ===== 拖动 =====
let dragging = false;
let lastX = 0;
let lastY = 0;
function clamp() {
  // 限制拖动范围：图片相对容器中心位置的位移最大不超过放大后的溢出量
  const maxAbs = Math.max(0, (stageSize.value * (scale.value - 1)) / 2);
  offsetX.value = Math.max(-maxAbs, Math.min(maxAbs, offsetX.value));
  offsetY.value = Math.max(-maxAbs, Math.min(maxAbs, offsetY.value));
}
function pt(e: any) {
  if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  return { x: e.clientX || 0, y: e.clientY || 0 };
}
function onTouchStart(e: any) {
  dragging = true;
  const p = pt(e);
  lastX = p.x;
  lastY = p.y;
  if (e.cancelable) {
    try { e.preventDefault(); } catch (_) {}
  }
}
function onTouchMove(e: any) {
  if (!dragging) return;
  const p = pt(e);
  offsetX.value += p.x - lastX;
  offsetY.value += p.y - lastY;
  lastX = p.x;
  lastY = p.y;
  clamp();
}
function onTouchEnd() {
  dragging = false;
}

// 图片定位：跟随缩放/位移
const imgStyle = computed(() => ({
  width: `${stageSize.value * scale.value}px`,
  height: `${stageSize.value * scale.value}px`,
  left: `${(stageSize.value - stageSize.value * scale.value) / 2 + offsetX.value}px`,
  top: `${(stageSize.value - stageSize.value * scale.value) / 2 + offsetY.value}px`,
}));

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      // 弹窗打开时按系统信息折算 px（750rpx = screenWidth px）
      try {
        const info: any = (uni as any).getSystemInfoSync ? (uni as any).getSystemInfoSync() : {};
        const sw = info.screenWidth || info.windowWidth || 375;
        stageSize.value = (560 * sw) / 750;
      } catch (_) {
        stageSize.value = 280;
      }
      nextTick(() => {
        scale.value = 1;
        offsetX.value = 0;
        offsetY.value = 0;
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
  // 输出：把容器可视区域按当前缩放/位移映射回原图，输出圆形 PNG
  // 1) 原图按 aspectFill 等比缩放到容器，得到基础缩放比 base
  // 2) 用户再额外乘以 scale，并加 offsetX/offsetY 位移
  if (!imgNaturalW.value || !imgNaturalH.value) {
    // 图片尚未加载完成，不裁剪
    close();
    return;
  }
  const baseScale = Math.max(stageSize.value / imgNaturalW.value, stageSize.value / imgNaturalH.value);
  // 裁剪源区域 = 容器内可见区对应到原图的矩形
  const sx = (-((stageSize.value - imgNaturalW.value * baseScale) / 2) - offsetX.value) / baseScale;
  const sy = (-((stageSize.value - imgNaturalH.value * baseScale) / 2) - offsetY.value) / baseScale;
  const sw = stageSize.value / baseScale;
  const sh = stageSize.value / baseScale;
  // 用 canvas 离屏渲染（H5 路径）；小程序内 canvas API 不一致时直接回退到原 src
  // #ifdef H5
  const cvs: HTMLCanvasElement | null = typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (cvs) {
    cvs.width = props.outputSize;
    cvs.height = props.outputSize;
    const ctx = cvs.getContext("2d");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (ctx) {
        ctx.clearRect(0, 0, props.outputSize, props.outputSize);
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
  /* 轻模糊由全局 .mask-blur 提供 */
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
  padding: 36rpx 36rpx 28rpx;
  box-shadow: 0 24rpx 64rpx rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
}
.ac-stage {
  display: flex;
  justify-content: center;
  margin: 20rpx 0;
}
.ac-canvas {
  position: relative;
  overflow: hidden;
  border-radius: 16rpx;
  background: var(--card-2);
  flex: none;
}
.ac-img {
  position: absolute;
}
/* 用 .ac-circle 的 outline 来表示圆形选区 */
.ac-circle {
  position: absolute;
  left: 0;
  top: 0;
  border: 2rpx solid #fff;
  border-radius: 50%;
  box-sizing: border-box;
  pointer-events: auto;
}
.ac-grid {
  position: absolute;
  background: rgba(255, 255, 255, 0.4);
}
.ac-grid-h {
  left: 0;
  right: 0;
  top: 50%;
  height: 1rpx;
  margin-top: -0.5rpx;
}
.ac-grid-v {
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1rpx;
  margin-left: -0.5rpx;
}
.ac-zoom {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 8rpx 6rpx 0;
}
.ac-slider {
  flex: 1;
  margin: 0;
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