<template>
  <view class="agree" :style="agreeStyle">
    <text class="agree-text">
      {{ action }}{{ productName }}即视为同意
      <text class="lk" @click="openUrl(termsUrl)">《服务协议》</text>
      与
      <text class="lk" @click="openUrl(privacyUrl)">《隐私政策》</text>
    </text>
  </view>
</template>

<script setup lang="ts">
/**
 * 协议声明（登录 / 注册 / 找回密码 页脚）
 * - 使用即视为已同意（主流小程序做法），不需要勾选
 * - 链接通过 uni API 打开，便于后续接入内置 H5 预览
 *
 * 贴底实现：组件自身采用 fixed 定位 + bottom:0，
 * 不参与父容器的 flex 居中计算，因此不会被表单"顶起来"。
 * 注意：本组件只能作为 AuthShell（position:fixed 全屏层）的子元素使用。
 *
 * 键盘避让：软键盘弹出时（尤其 Android/iOS WebView 会把 position:fixed
 * 的 bottom:0 顶到键盘上方，导致协议"跟着键盘弹上来"），用「键盘实际高度」把本协议
 * 条推到键盘下方（bottom 取负键盘高度），使其不再悬浮在键盘上方的可视区。
 * 仅由键盘真实高度驱动，绝不受输入框聚焦影响——桌面端或覆盖层键盘下高度为 0，
 * 协议始终贴屏幕底部可见；点输入框不会让它消失。
 */
import { ref, computed, onMounted, onUnmounted } from "vue";

withDefaults(
  defineProps<{
    action?: string;
    productName?: string;
    termsUrl?: string;
    privacyUrl?: string;
  }>(),
  {
    action: "继续",
    productName: "观澜",
    termsUrl: "",
    privacyUrl: "",
  }
);

// 软键盘高度（CSS px）：仅当几何上确实存在键盘高度时，把协议条推到键盘下方，
// 避免其悬浮在键盘上方的可视区（即「跟着键盘弹起来」的观感）。
// 注意：用「键盘实际高度」驱动，而非「输入框是否聚焦」——
// 桌面端或覆盖层键盘下高度为 0，协议始终贴屏幕底部可见；只有真正弹出键盘时才下移。
const kbPx = ref(0);
const agreeStyle = computed(() =>
  kbPx.value > 0 ? { bottom: `-${kbPx.value}px` } : null
);

let detach: (() => void) | null = null;

onMounted(() => {
  // #ifdef H5
  const vv = window.visualViewport;
  if (vv) {
    const onResize = () => {
      // 键盘高度 = 布局视口高 - 可视视口高 - 偏移；>0 即键盘已弹出
      kbPx.value = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    };
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    onResize();
    detach = () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }
  // #endif
  // #ifndef H5
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uni.onKeyboardHeightChange((res: any) => {
    kbPx.value = res.height;
  });
  // #endif
});

onUnmounted(() => detach?.());

function openUrl(url: string) {
  if (!url) return;
  // #ifdef H5
  window.open(url, "_blank");
  // #endif
  // #ifndef H5
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (uni as any).setClipboardData({ data: url });
  uni.showToast({ title: "链接已复制", icon: "none" });
  // #endif
}
</script>

<style scoped>
/* 协议贴底：fixed 始终贴屏幕底部（不受父级 flex/grid 影响），
   自带 padding-bottom: env 安全区 避免被底部 Home 指示条遮挡。
   这样无论表单怎么居中，协议始终在屏幕最底部一行。 */
.agree {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
  text-align: center;
  z-index: 10;
}
.agree-text {
  font-size: 22rpx;
  color: var(--text-2);
  line-height: 1.6;
}
.agree-text .lk {
  color: var(--primary);
}
</style>