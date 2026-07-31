<template>
  <view v-if="visible" class="auth-mask mask-blur anim-mask" @click="onMaskClick">
    <view class="auth-card anim-card" @click.stop>
      <OutlineIcon type="close" :size="26" color="var(--text-2)" class="card-close" @click="$emit('close')" />

      <!-- 品牌 + 头像 -->
      <view class="card-hero">
        <view class="avatar-wrap" @click="chooseAvatar">
          <image v-if="avatarLocal" :src="avatarLocal" class="avatar-img" mode="aspectFill" />
          <OutlineIcon v-else type="person" :size="56" color="var(--text-2)" />
          <view class="avatar-cam">
            <OutlineIcon type="camera" :size="20" color="#fff" />
          </view>
        </view>
        <text class="brand-name">观澜</text>
        <text class="brand-sub">智能股票分析</text>
        <text class="hero-tip">点击头像可上传个性图片</text>
      </view>

      <view class="seg">
        <view :class="['seg-item', mode === 'login' ? 'active' : '']" @click="mode = 'login'">
          <text>登录</text>
        </view>
        <view :class="['seg-item', mode === 'register' ? 'active' : '']" @click="mode = 'register'">
          <text>注册</text>
        </view>
      </view>

      <view class="field">
        <OutlineIcon type="person" :size="20" color="var(--text-2)" />
        <input
          class="input"
          v-model="email"
          type="text"
          placeholder="邮箱"
          placeholder-class="ph"
          :adjust-position="true"
        />
      </view>
      <view class="field">
        <OutlineIcon type="locked" :size="20" color="var(--text-2)" />
        <input
          class="input"
          v-model="password"
          type="password"
          placeholder="密码（至少 6 位）"
          placeholder-class="ph"
          :adjust-position="true"
        />
      </view>

      <view v-if="errMsg" class="err">{{ errMsg }}</view>
      <view v-if="okMsg" class="ok-msg">{{ okMsg }}</view>

      <button
        :class="['btn-primary', loading ? 'is-disabled' : '']"
        :disabled="loading"
        @click="submit"
      >
        {{ loading ? "处理中…" : mode === "login" ? "登录" : "注册并登录" }}
      </button>
      <view class="hint">
        <text>登录后可同步自选股与资料到云端；未登录时数据仅保存在本机。</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import { signIn, signUp, uploadAvatar, updateProfile } from "@/api/auth";

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: "close"): void; (e: "success"): void }>();

const mode = ref<"login" | "register">("login");
const email = ref("");
const password = ref("");
const avatarLocal = ref(""); // 头像本地预览路径（提交后上传）
const loading = ref(false);
const errMsg = ref("");
const okMsg = ref("");

watch(
  () => props.visible,
  (v) => {
    if (v) {
      // 每次打开重置为干净初始态，避免残留上次的头像/输入
      errMsg.value = "";
      okMsg.value = "";
      avatarLocal.value = "";
      email.value = "";
      password.value = "";
      mode.value = "login";
    }
  }
);

function onMaskClick() {
  emit("close");
}

function chooseAvatar() {
  uni.chooseImage({
    count: 1,
    sizeType: ["compressed"],
    success: (res: any) => {
      const p = res.tempFilePaths?.[0] || res.tempFiles?.[0]?.path;
      if (p) avatarLocal.value = p;
    },
  });
}

async function submit() {
  errMsg.value = "";
  okMsg.value = "";
  const e = email.value.trim();
  const p = password.value;
  if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
    errMsg.value = "请输入有效的邮箱地址";
    return;
  }
  if (p.length < 6) {
    errMsg.value = "密码至少 6 位";
    return;
  }
  loading.value = true;
  try {
    let sessionOk = false;
    if (mode.value === "login") {
      const r = await signIn(e, p);
      if (!r.ok) {
        errMsg.value = r.error || "登录失败";
        return;
      }
      sessionOk = true;
    } else {
      const r = await signUp(e, p);
      if (!r.ok) {
        errMsg.value = r.error || "注册失败";
        return;
      }
      if (r.needsConfirm) {
        okMsg.value = "注册成功，请前往邮箱完成验证后再登录。";
        mode.value = "login";
        loading.value = false;
        return;
      }
      sessionOk = true; // 注册后已建立会话
    }
    // 头像：仅在已登录/已建会话时上传；注册需邮件确认时无法上传，提示稍后在「我的」设置
    if (sessionOk && avatarLocal.value) {
      const ext = (avatarLocal.value.split(".").pop() || "png").toLowerCase();
      const url = await uploadAvatar(avatarLocal.value, ext);
      if (url) await updateProfile({ avatar_url: url }).catch(() => {});
    }
    emit("success");
    emit("close");
  } catch (err: any) {
    errMsg.value = err?.message || "操作失败，请重试";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.auth-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  /* 轻模糊由全局 .mask-blur 提供 */
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
}
/* 居中卡片：比底部抽屉更像「页面」，视觉更聚焦、更精致 */
.auth-card {
  position: relative;
  width: 100%;
  max-width: 440px;
  background: var(--card);
  border-radius: 32rpx;
  padding: 36rpx 40rpx 32rpx;
  box-shadow: 0 24rpx 60rpx rgba(0, 0, 0, 0.25);
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
.card-close {
  position: absolute;
  top: 24rpx;
  right: 24rpx;
  z-index: 2;
}
.card-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  padding: 8rpx 0 22rpx;
}
.avatar-wrap {
  position: relative;
  width: 150rpx;
  height: 150rpx;
  border-radius: 50%;
  background: var(--card-2);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 2rpx solid var(--border);
  margin-bottom: 10rpx;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}
.avatar-wrap:active {
  transform: scale(0.96);
  box-shadow: var(--shadow-up);
}
.avatar-img {
  width: 100%;
  height: 100%;
}
.avatar-cam {
  position: absolute;
  right: 6rpx;
  bottom: 6rpx;
  width: 46rpx;
  height: 46rpx;
  border-radius: 50%;
  background: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3rpx solid #fff;
}
.brand-name {
  font-size: 40rpx;
  font-weight: 800;
  color: var(--primary);
  letter-spacing: 3rpx;
}
.brand-sub {
  font-size: 24rpx;
  color: var(--text-2);
}
.hero-tip {
  font-size: 20rpx;
  color: var(--text-2);
  margin-top: 4rpx;
}
.seg {
  display: flex;
  background: var(--card-2);
  border-radius: 999rpx;
  padding: 6rpx;
  margin-bottom: 26rpx;
}
.seg-item {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  font-size: 28rpx;
  color: var(--text-2);
  border-radius: 999rpx;
  transition: all 0.25s ease;
}
.seg-item.active {
  background: var(--card);
  color: var(--primary);
  font-weight: 600;
  box-shadow: var(--shadow);
}
.field {
  display: flex;
  align-items: center;
  gap: 14rpx;
  background: var(--card-2);
  border-radius: var(--radius-sm);
  padding: 22rpx 24rpx;
  margin-bottom: 20rpx;
}
.input {
  flex: 1;
  font-size: 28rpx;
  color: var(--text);
}
.ph {
  color: var(--text-2);
}
.btn-primary {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 4rpx;
}
/* uni-app 默认给 button 加方角 ::after 描边，会戳在圆角外，统一去掉 */
.btn-primary::after {
  border: none;
}
.err {
  color: var(--up);
  font-size: 24rpx;
  margin-bottom: 12rpx;
}
.ok-msg {
  color: var(--primary);
  font-size: 24rpx;
  margin-bottom: 12rpx;
}
.hint {
  margin-top: 18rpx;
  font-size: 22rpx;
  color: var(--text-2);
  line-height: 1.6;
  text-align: center;
}
</style>
