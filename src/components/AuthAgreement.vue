<template>
  <view class="agree" v-show="!keyboardOpen">
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
 * 的 bottom:0 顶到键盘上方，导致协议"跟着键盘弹上来"），键盘打开期间隐藏
 * 本协议（打字时本就不需要看法律条文），关闭后自动恢复。
 * 检测方式：监听输入框的 focusin/focusout——任一表单字段获得焦点即视为键盘
 * 打开。之所以不用 visualViewport 几何计算，是因为在 Android WebView / VIA
 * 等浏览器中，软键盘常以「覆盖层」弹出、并不收缩 visualViewport，几何检测
 * 会失效；而聚焦判定跨端一致、绝对可靠。
 */
import { ref, onMounted, onUnmounted } from "vue";

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

// 软键盘是否打开：打开时隐藏协议，避免其被顶到键盘上方
const keyboardOpen = ref(false);

// H5 键盘避让：在 Android WebView / VIA 等浏览器中，软键盘常以「覆盖层」弹出，
// 并不收缩 visualViewport，导致基于几何计算的检测失效、协议跟着键盘顶上来。
// 因此改用「输入框聚焦」判定——任一表单字段获得焦点即视为键盘打开，隐藏协议；
// 失焦后（或焦点移出表单）自动恢复。比 visualViewport 几何更可靠、跨端一致。
const isField = (el: EventTarget | null): boolean => {
  const node = el as HTMLElement | null;
  return (
    !!node &&
    (node.tagName === "INPUT" ||
      node.tagName === "TEXTAREA" ||
      node.isContentEditable)
  );
};
const syncKeyboard = () => {
  keyboardOpen.value = isField(document.activeElement);
};

let detach: (() => void) | null = null;

onMounted(() => {
  // #ifdef H5
  // focusin/focusout 冒泡，挂在 document 上即可捕获所有输入框的聚焦变化；
  // focusout 用 rAF 延后一帧，确保焦点已真正转移到下一元素后再判定，
  // 避免从密码框切到验证码框时的瞬间闪烁。
  document.addEventListener("focusin", syncKeyboard);
  document.addEventListener("focusout", () => requestAnimationFrame(syncKeyboard));
  syncKeyboard();
  detach = () => {
    document.removeEventListener("focusin", syncKeyboard);
    document.removeEventListener("focusout", syncKeyboard);
  };
  // #endif
  // #ifndef H5
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uni.onKeyboardHeightChange((res: any) => {
    keyboardOpen.value = res.height > 0;
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