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
 * 贴底实现：组件自身采用 fixed 定位 + bottom:0，不参与父容器的
 * flex 居中计算，因此不会被表单布局顶起。
 * 注意：本组件只能作为 AuthShell（position:fixed 全屏层）的子元素使用。
 *
 * 键盘避让（解决「点输入框唤起键盘后协议跟着弹上来」）：
 * - H5 触屏设备（手机/平板）：软键盘几乎必然伴随输入框聚焦，故用
 *   focusin/focusout 在「任一表单字段聚焦」时直接隐藏协议条、失焦恢复。
 *   这能覆盖 Android WebView / VIA 等「覆盖层键盘」场景——这类键盘不收缩
 *   visualViewport，纯高度探测（innerHeight-vv.height）永远为 0，会失效。
 * - 桌面端（无触屏）：不随聚焦隐藏，协议始终贴底可见（点输入框不会消失）。
 * - 非 H5（App/小程序）：用 uni.onKeyboardHeightChange，键盘高度 >0 时隐藏。
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

// 是否触屏设备（仅 H5 有意义）：触屏设备用「聚焦」驱动隐藏，桌面端不隐藏
const isTouch = ref(false);
// 表单内是否有字段被聚焦（H5 触屏设备据此隐藏协议）
const focused = ref(false);
// 软键盘真实高度（CSS px）：非 H5 / 收缩型键盘（iOS）据此隐藏
const kbPx = ref(0);

// 隐藏条件：触屏且聚焦，或键盘真实高度 >0
const hidden = computed(() => (isTouch.value && focused.value) || kbPx.value > 0);
const agreeStyle = computed(() => (hidden.value ? { display: "none" } : null));

let detach: (() => void) | null = null;

onMounted(() => {
  // #ifdef H5
  isTouch.value =
    (navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
  if (isTouch.value) {
    const onFocusIn = () => {
      focused.value = true;
    };
    const onFocusOut = () => {
      // 延后一帧，避免输入框之间切换时闪烁
      requestAnimationFrame(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || !el.closest(".auth-form")) focused.value = false;
      });
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    const prev = detach;
    detach = () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      prev?.();
    };
  }
  // 兜底：收缩型键盘（iOS Safari）会收缩 visualViewport，可据此判定
  const vv = window.visualViewport;
  if (vv) {
    const onResize = () => {
      kbPx.value = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    };
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    onResize();
    const prev = detach;
    detach = () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
      prev?.();
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