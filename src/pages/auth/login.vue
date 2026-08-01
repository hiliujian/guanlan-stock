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

function onAuthed() {
  // 登录成功：来源页通过响应式 user store 自动切到已登录态，直接返回即可
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
