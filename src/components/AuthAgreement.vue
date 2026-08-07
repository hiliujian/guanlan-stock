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