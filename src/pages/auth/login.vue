<template>
  <AuthShell title="登录">
    <AuthForm mode="login" @authed="onAuthed" />

    <view class="auth-foot">
      <view class="auth-switch">
        <text>还没有账号？<text class="auth-link" @click="goRegister">立即注册</text></text>
      </view>
      <view class="auth-forgot" @click="goReset">忘记密码？</view>
      <AuthAgreement action="使用" />
    </view>
  </AuthShell>
</template>

<script setup lang="ts">
import AuthShell from "@/components/AuthShell.vue";
import AuthForm from "@/components/AuthForm.vue";
import AuthAgreement from "@/components/AuthAgreement.vue";
import { syncSession } from "@/store/user";

async function onAuthed() {
  // 主动同步一次会话，确保 user store 立即切到已登录态
  // （避免退回来源页时仍按未登录渲染，造成「登录成功却不跳转/不生效」的错觉）
  await syncSession().catch(() => {});
  // 优先退回来源页（如「我的」），无上一页时兜底回首页
  uni.navigateBack({
    fail: () => uni.reLaunch({ url: "/pages/index/index" }),
  });
}
function goRegister() {
  uni.navigateTo({ url: "/pages/auth/register" });
}
function goReset() {
  uni.navigateTo({ url: "/pages/auth/reset" });
}
</script>
