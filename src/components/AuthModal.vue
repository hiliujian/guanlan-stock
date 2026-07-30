<template>
  <view v-if="visible" class="auth-mask anim-mask" @click="onMaskClick">
    <view class="auth-sheet anim-sheet" @click.stop>
      <view class="sheet-head">
        <text class="sheet-title">{{ mode === "login" ? "登录" : "注册" }}</text>
        <OutlineIcon type="close" :size="26" color="var(--text-3)" @click="$emit('close')" />
      </view>

      <view class="seg">
        <view
          :class="['seg-item', mode === 'login' ? 'active' : '']"
          @click="mode = 'login'"
        >
          <text>登录</text>
        </view>
        <view
          :class="['seg-item', mode === 'register' ? 'active' : '']"
          @click="mode = 'register'"
        >
          <text>注册</text>
        </view>
      </view>

      <view class="field">
        <OutlineIcon type="person" :size="20" color="var(--text-3)" />
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
        <OutlineIcon type="locked" :size="20" color="var(--text-3)" />
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
        <text>登录后可同步自选股与资料（Supabase）。未配置时仅本地保存。</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import OutlineIcon from "./OutlineIcon.vue";
import { signIn, signUp } from "@/api/auth";

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: "close"): void; (e: "success"): void }>();

const mode = ref<"login" | "register">("login");
const email = ref("");
const password = ref("");
const loading = ref(false);
const errMsg = ref("");
const okMsg = ref("");

watch(
  () => props.visible,
  (v) => {
    if (v) {
      errMsg.value = "";
      okMsg.value = "";
    }
  }
);

function onMaskClick() {
  emit("close");
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
    if (mode.value === "login") {
      const r = await signIn(e, p);
      if (!r.ok) {
        errMsg.value = r.error || "登录失败";
        return;
      }
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
  background: rgba(0, 0, 0, 0.45);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.auth-sheet {
  width: 100%;
  max-width: 480px;
  background: var(--card);
  border-radius: 32rpx 32rpx 0 0;
  padding: 36rpx 40rpx calc(40rpx + env(safe-area-inset-bottom));
  box-shadow: 0 -8rpx 40rpx rgba(0, 0, 0, 0.12);
}
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}
.sheet-title {
  font-size: 34rpx;
  font-weight: 700;
}
.seg {
  display: flex;
  background: var(--card-2);
  border-radius: 999rpx;
  padding: 6rpx;
  margin-bottom: 28rpx;
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
  color: var(--text-3);
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
  color: var(--text-3);
  line-height: 1.6;
  text-align: center;
}
</style>
