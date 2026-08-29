<template>
  <canvas ref="cv" class="fx" v-show="isDark" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, onActivated, onDeactivated, ref, watch } from "vue";
import { isDark } from "@/utils/theme";

// uni-app H5 下 <canvas> 是内置组件（渲染为 <uni-canvas><canvas class="uni-canvas-canvas"/>），
// ref 拿到的是组件实例而非原生元素，需经 resolveCanvas() 取内层原生 canvas 才能设 style/getContext。
const cv = ref<any>(null);

/** 解析真实原生 canvas：兼容「已是原生元素 / 组件实例（$el 内查）/ 宿主元素」三种形态 */
function resolveCanvas(): HTMLCanvasElement | null {
  const r: any = cv.value;
  if (!r) return null;
  const isCanvas = (v: any): v is HTMLCanvasElement =>
    typeof HTMLCanvasElement !== "undefined" && v instanceof HTMLCanvasElement;
  if (isCanvas(r)) return r;
  const host: any = r.$el || r;
  if (isCanvas(host)) return host;
  const inner = host?.querySelector ? host.querySelector("canvas") : null;
  return isCanvas(inner) ? inner : null;
}
let ctx: CanvasRenderingContext2D | null = null;
let raf = 0;
let w = 0;
let h = 0;
let dpr = 1;
let bars: Bar[] = [];
let running = false;
let reduce = false;
let active = false;       // 当前所属 tab 是否处于激活态（keep-alive 切换时更新）
let bgCanvas: HTMLCanvasElement | null = null; // 预渲染背景，避免每帧重建渐变

interface Bar {
  x: number;
  y: number;
  len: number;
  v: number;
  bw: number;
  hue: number;
  alpha: number;
}

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function spawn(initial: boolean): Bar {
  const up = Math.random() < 0.82; // 多数向上，营造「爆发」上攻感
  return {
    x: rand(0, w),
    y: initial ? rand(0, h) : h + rand(0, 80),
    len: rand(40, 160),
    v: rand(0.5, 1.6) * (up ? 1 : 0.55),
    bw: rand(2, 5),
    hue: up ? rand(140, 162) : rand(0, 16), // 绿 / 红
    alpha: rand(0.14, 0.5),
  };
}

function setup() {
  const canvas = resolveCanvas();
  if (!canvas) return;
  w = window.innerWidth;
  h = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 预渲染背景到离屏 canvas，每帧直接 drawImage 贴图，避免每帧重建渐变（昂贵）
  buildBg();
  const n = Math.round(Math.min(38, Math.max(22, w / 26)));
  bars = [];
  for (let i = 0; i < n; i++) bars.push(spawn(true));
}

// 离屏预渲染背景（深色渐变 + 顶部青绿辉光），每帧仅贴图，省去重复 createLinearGradient
function buildBg() {
  bgCanvas = document.createElement("canvas");
  bgCanvas.width = Math.round(w * dpr);
  bgCanvas.height = Math.round(h * dpr);
  const b = bgCanvas.getContext("2d");
  if (!b) return;
  b.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = b.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#070d1c");
  g.addColorStop(0.55, "#05080f");
  g.addColorStop(1, "#02040a");
  b.fillStyle = g;
  b.fillRect(0, 0, w, h);
  // 顶部一抹青绿辉光，呼应「向上爆发」
  const r = b.createRadialGradient(w * 0.5, h * 0.06, 0, w * 0.5, h * 0.06, w * 0.75);
  r.addColorStop(0, "rgba(7, 193, 96, 0.18)");
  r.addColorStop(1, "rgba(7, 193, 96, 0)");
  b.fillStyle = r;
  b.fillRect(0, 0, w, h);
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, ww: number, hh: number, r: number) {
  const rr = Math.min(r, ww / 2, Math.abs(hh) / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + ww, y, x + ww, y + hh, rr);
  c.arcTo(x + ww, y + hh, x, y + hh, rr);
  c.arcTo(x, y + hh, x, y, rr);
  c.arcTo(x, y, x + ww, y, rr);
  c.closePath();
}

function frame() {
  if (!ctx || !running) return;
  // 贴背景图（1:1 像素贴图），避免每帧重建渐变
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, w, h);
  else ctx.clearRect(0, 0, w, h);
  ctx.lineCap = "round";
  for (const b of bars) {
    b.y -= b.v;
    if (b.y + b.len < -20) Object.assign(b, spawn(false));
    const top = b.y;
    const bot = b.y + b.len;
    const col = `hsla(${b.hue}, 82%, 56%,`;
    const grad = ctx.createLinearGradient(0, top, 0, bot);
    grad.addColorStop(0, col + (b.alpha * 0.12) + ")");
    grad.addColorStop(1, col + b.alpha + ")");
    ctx.fillStyle = grad;
    ctx.shadowColor = `hsla(${b.hue}, 90%, 62%, ${b.alpha})`;
    ctx.shadowBlur = 8;
    roundRect(ctx, b.x - b.bw / 2, top, b.bw, b.len, b.bw / 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  raf = requestAnimationFrame(frame);
}

function start() {
  if (running) return;
  running = true;
  raf = requestAnimationFrame(frame);
}
function stop() {
  running = false;
  if (raf) cancelAnimationFrame(raf);
}

function onVis() {
  if (document.hidden) stop();
  else if (active && isDark.value && !reduce) start();
}
function onResize() {
  if (!isDark.value) return;
  setup();
  if (!reduce) start();
}

onMounted(() => {
  reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  active = true;
  if (isDark.value) {
    setup();
    if (reduce) {
      if (ctx && bgCanvas) ctx.drawImage(bgCanvas, 0, 0, w, h);
    } else {
      start();
    }
  }
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVis);
});

// 切到非行情 tab（keep-alive 缓存但不可见）：暂停动画，省电省 CPU（三个页面各持有一个实例）
onActivated(() => {
  active = true;
  if (isDark.value && !reduce) {
    setup();
    start();
  }
});
onDeactivated(() => {
  active = false;
  stop();
});

// 切换主题：浅色时停止动画并清空画布（canvas 已由 v-show 隐藏）；深色时重新启动
watch(isDark, (v) => {
  if (v) {
    setup();
    if (reduce) {
      if (ctx && bgCanvas) ctx.drawImage(bgCanvas, 0, 0, w, h);
    } else if (active) {
      start();
    }
  } else {
    stop();
    if (ctx) ctx.clearRect(0, 0, w, h);
  }
});

onUnmounted(() => {
  stop();
  window.removeEventListener("resize", onResize);
  document.removeEventListener("visibilitychange", onVis);
});
</script>

<style scoped>
.fx {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}
</style>
