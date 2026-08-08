<template>
  <view class="agree">
    <text class="agree-text">
      {{ action }}{{ productName }}即视为同意
      <text class="lk" @click="openTerms">《服务协议》</text>
      与
      <text class="lk" @click="openPrivacy">《隐私政策》</text>
    </text>
  </view>
</template>

<script setup lang="ts">
/**
 * 协议声明（登录 / 注册 / 找回密码 页脚）
 * - 使用即视为已同意（主流小程序做法），不需要勾选
 * - 链接通过 uni API 打开，便于后续接入内置 H5 预览
 *
 * 贴底实现：本组件作为 AuthShell flex 列的末尾项渲染，由 `.auth-body(flex:1)`
 * 吸收剩余空间后自然落在屏幕最底部（基于正常文档流，不依赖 margin-top:auto）。
 * 非 position:fixed，因此覆盖层键盘（VIA 等）下协议被键盘自然遮挡，不会浮到键盘上方。
 */
const props = withDefaults(
  defineProps<{
    action?: string;
    productName?: string;
    termsUrl?: string;
    privacyUrl?: string;
    /** 内部协议页路径：默认跳本平台内置协议页；termsUrl/privacyUrl 有值则优先走外部链接 */
    termsPath?: string;
    privacyPath?: string;
  }>(),
  {
    action: "继续",
    productName: "观澜",
    termsUrl: "",
    privacyUrl: "",
    termsPath: "/pages/legal/terms",
    privacyPath: "/pages/legal/privacy",
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

/** 点击《服务协议》：有外部链接走外链，否则跳本平台内置协议页 */
function openTerms() {
  if (props.termsUrl) return openUrl(props.termsUrl);
  uni.navigateTo({ url: props.termsPath });
}

/** 点击《隐私政策》：有外部链接走外链，否则跳本平台内置协议页 */
function openPrivacy() {
  if (props.privacyUrl) return openUrl(props.privacyUrl);
  uni.navigateTo({ url: props.privacyPath });
}
</script>

<style scoped>
/* 协议贴底：作为 AuthShell flex 列的末尾项，由 .auth-body(flex:1) 吸收剩余空间后
   自然落在屏幕最底部；非 fixed，避免覆盖层键盘下浮到键盘上。自带安全区内边距，
   避免被底部 Home 指示条遮挡。 */
.agree {
  padding: 16rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));
  text-align: center;
}
.agree-text {
  font-size: var(--font-sm); /* 与「还没有账号？」引导语字号保持一致 */
  color: var(--text-2);
  line-height: 1.6;
}
.agree-text .lk {
  color: var(--primary);
}
</style>
