<template>
  <!-- 验证中 / 仍未登录：空态页面（无遮罩、无加载圈，替代原「正在完成登录…」弹窗） -->
  <view v-if="authFlow.callback.active && authFlow.callback.status === 'verifying'" class="ac-empty">
    <BackgroundFX />
    <view class="ac-empty-inner anim-rise-soft">
      <view class="ac-empty-ic">
        <OutlineIcon type="person" :size="58" color="var(--text-2)" />
      </view>
      <text class="ac-empty-title">当前未登录</text>
      <text class="ac-empty-sub">登录后即可同步自选股与资料，畅享完整功能</text>
      <button class="btn-primary ac-empty-btn" @click="goLogin">去登录 / 注册</button>
    </view>
  </view>

  <!-- 结果态：沿用毛玻璃遮罩弹窗（成功 / 过期 / 已确认 / 错误），不再有加载圈 -->
  <view v-else-if="authFlow.callback.active" class="ac-mask">
    <view class="ac-card anim-card">
      <!-- 成功 -->
      <template v-if="authFlow.callback.status === 'success'">
        <view class="ac-ic ok"><OutlineIcon type="check" :size="46" color="#fff" /></view>
        <text class="ac-title">验证成功</text>
        <text class="ac-sub">{{ authFlow.callback.message || "正在进入…" }}</text>
      </template>

      <!-- 链接过期 -->
      <template v-else-if="authFlow.callback.status === 'expired'">
        <view class="ac-ic warn"><OutlineIcon type="warning" :size="46" color="#fff" /></view>
        <text class="ac-title">链接已过期</text>
        <text class="ac-sub">{{ authFlow.callback.message }}</text>
        <button class="btn-primary ac-btn" @click="goRegister">重新注册</button>
        <view class="ac-link" @click="goLogin">直接登录</view>
      </template>

      <!-- 已确认 -->
      <template v-else-if="authFlow.callback.status === 'already'">
        <view class="ac-ic ok"><OutlineIcon type="check" :size="46" color="#fff" /></view>
        <text class="ac-title">邮箱已验证</text>
        <text class="ac-sub">{{ authFlow.callback.message }}</text>
        <button class="btn-primary ac-btn" @click="goLogin">去登录</button>
      </template>

      <!-- 网络错误 / 其他错误 -->
      <template v-else>
        <view class="ac-ic err"><OutlineIcon type="close" :size="46" color="#fff" /></view>
        <text class="ac-title">验证未完成</text>
        <text class="ac-sub">{{ authFlow.callback.message || "验证失败，请重试" }}</text>
        <button class="btn-primary ac-btn" @click="goLogin">去登录</button>
        <view class="ac-link" @click="goRegister">重新注册</view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import BackgroundFX from "./BackgroundFX.vue";
import OutlineIcon from "./OutlineIcon.vue";
import { authFlow, closeCallback } from "@/store/authFlow";
import { openAuth } from "@/store/nav";

function goLogin() {
  // 关闭回调层（同时让后台轮询提前退出），再跳转登录页
  closeCallback();
  openAuth("login");
}
function goRegister() {
  closeCallback();
  openAuth("register");
}
</script>

<style scoped>
/* ===== 验证中空态页面（替代加载弹窗） ===== */
.ac-empty {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
}
.ac-empty-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 100%;
  max-width: 440px;
}
.ac-empty-ic {
  width: 132rpx;
  height: 132rpx;
  border-radius: 50%;
  background: var(--card);
  border: 1rpx solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 30rpx;
}
.ac-empty-title {
  font-size: var(--font-xl);
  font-weight: 800;
  color: var(--text);
}
.ac-empty-sub {
  font-size: var(--font-sm);
  color: var(--text-2);
  line-height: 1.7;
  margin-top: 14rpx;
  max-width: 480rpx;
}
.ac-empty-btn {
  width: 100%;
  margin-top: 40rpx;
}
.ac-empty-btn::after {
  border: none;
}

/* ===== 结果态遮罩弹窗 ===== */
.ac-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
}
.ac-card {
  width: 100%;
  max-width: 440px;
  background: var(--card);
  border-radius: 32rpx;
  padding: 52rpx 40rpx 44rpx;
  box-shadow: var(--shadow-4);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.anim-card {
  animation: cardIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(30rpx) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.ac-ic {
  width: 92rpx;
  height: 92rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
}
.ac-ic.ok {
  background: var(--primary);
}
.ac-ic.warn {
  background: #f5a623;
}
.ac-ic.err {
  background: var(--up);
}
.ac-title {
  font-size: var(--font-lg);
  font-weight: 800;
  color: var(--text);
}
.ac-sub {
  font-size: var(--font-sm);
  color: var(--text-2);
  line-height: 1.7;
  margin-top: 14rpx;
  max-width: 480rpx;
}
.ac-btn {
  width: 100%;
  margin-top: 32rpx;
}
.ac-btn::after {
  border: none;
}
.ac-link {
  margin-top: 20rpx;
  font-size: var(--font-sm);
  color: var(--primary);
}
</style>
