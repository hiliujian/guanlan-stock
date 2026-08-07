<template>
  <view class="agree">
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
 * 贴底实现：本组件由 AuthShell 作为 flex 列末尾项渲染，并靠 `margin-top:auto`
 * 推到屏幕最底部，完全基于正常文档流定位，不再使用 position:fixed——
 * fixed 在 VIA 等「覆盖层键盘」下会浮到键盘上方（即「条例跟着弹上来」），
 * 且需额外的键盘高度/聚焦探测逻辑。改回文档流后：
 *   - 收缩型键盘（iOS / 部分 WebView）：dvh 变小，整页压缩，协议仍在可视区底部；
 *   - 覆盖层键盘（VIA 等不收缩视口）：页面不压缩，协议固定在屏幕底、被键盘自然遮挡，
 *     既不浮到键盘上方，也不是主动隐藏（display:none），位置始终固定在底部。
 */
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
/* 协议贴底：作为 AuthShell flex 列的末尾项，margin-top:auto 把本身推到
   屏幕最底部；不再 fixed，避免覆盖层键盘下浮到键盘上。自带安全区内边距，
   避免被底部 Home 指示条遮挡。 */
.agree {
  margin-top: auto;
  padding: 16rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
  text-align: center;
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
