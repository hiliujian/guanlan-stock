<template>
  <AuthShell title="登录">
    <!-- 表单（双输入：用户名 → 邮箱 → 密码） -->
    <AuthForm mode="login" @authed="onAuthed" />

    <!-- 切换链接：注册 / 忘记密码，独立成行（主流应用的「文字引导 + 链接」风格） -->
    <view class="auth-foot">
      <view class="auth-foot-guide" @click="goRegister">
        <text>还没有账号？</text>
        <text class="auth-link">注册账号</text>
      </view>
      <view class="auth-foot-guide" @click="goReset">忘记密码？</view>
    </view>

    <!-- 协议贴底（fixed）：与表单整体垂直居中无关，始终在屏幕最底部 -->
    <AuthAgreement action="使用" />
  </AuthShell>
</template>

<script setup lang="ts">
import AuthShell from "@/components/AuthShell.vue";
import AuthForm from "@/components/AuthForm.vue";
import AuthAgreement from "@/components/AuthAgreement.vue";
import { syncSession } from "@/store/user";
import { goAfterAuth } from "@/store/nav";

function onAuthed() {
  // 主动同步一次会话（不阻塞跳转，确保 user store 切到已登录态）
  syncSession().catch(() => {});
  // 可靠跳转：有上一页则回退来源（如「我的」），栈底则直接进首页。
  // 不再依赖 navigateBack 的 fail 回调（H5 栈底时不可靠，会卡在登录页）。
  goAfterAuth();
}
function goRegister() {
  uni.navigateTo({ url: "/pages/auth/register" });
}
function goReset() {
  uni.navigateTo({ url: "/pages/auth/reset" });
}
</script>