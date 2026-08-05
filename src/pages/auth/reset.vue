<template>
  <AuthShell title="找回密码">
    <view class="card auth-form anim-rise-soft">
      <text class="auth-lead">验证邮箱身份后，即可重设登录密码。</text>

      <!-- 邮箱 + 发送验证码（主流小程序：发送按钮内嵌邮箱输入框右侧） -->
      <AuthField
        icon="mail"
        v-model="email"
        placeholder="邮箱"
        :error="errors.email"
        @input="onEmailInput" @blur="validateEmail"
      >
        <template #suffix>
          <view
            class="auth-suffix"
            :class="{ disabled: countdown > 0 || sending }"
            role="button"
            :aria-disabled="countdown > 0 || sending"
            @click="sendCode"
          >
            {{ countdown > 0 ? countdown + "s" : "发送验证码" }}
          </view>
        </template>
      </AuthField>

      <!-- 邮箱验证码（仅输入，发送按钮已内嵌邮箱输入框） -->
      <AuthField
        icon="locked"
        v-model="code"
        :maxlength="6"
        placeholder="邮箱验证码"
        :error="errors.code"
        @input="errors.code = ''"
      />

      <!-- 新密码 -->
      <AuthField
        icon="locked"
        v-model="password"
        placeholder="新密码（至少 6 位）"
        show-toggle
        :error="errors.password"
        @input="errors.password = ''"
        @blur="validatePassword"
      />

      <!-- 确认新密码 -->
      <AuthField
        icon="locked"
        v-model="confirm"
        placeholder="确认新密码"
        show-toggle
        :error="errors.confirm"
        @input="errors.confirm = ''"
        @blur="validateConfirm"
      />

      <!-- 后端错误：保留用户输入，仅高亮提示，绝不清空 -->
      <view v-if="serverErr" class="auth-server-err">{{ serverErr }}</view>

      <!-- 底部重设按钮 -->
      <button
        :class="['btn-primary', 'auth-submit', (loading || done) ? 'is-disabled' : '']"
        :disabled="loading || done"
        @click="submit"
      >
        <view v-if="loading" class="btn-spin" />
        <text v-if="done">密码已重设 ✓</text>
        <text v-else-if="loading">提交中…</text>
        <text v-else>重设密码</text>
      </button>
      <text v-if="done" class="auth-sent-tip">正在进入应用…</text>
    </view>

    <view class="auth-foot">
      <view class="auth-switch">
        <text>想起密码了？<text class="auth-link" @click="goLogin">去登录</text></text>
      </view>
      <AuthAgreement action="使用" />
    </view>
  </AuthShell>
</template>

<script setup lang="ts">
import { ref, reactive, onUnmounted } from "vue";
import AuthShell from "@/components/AuthShell.vue";
import AuthField from "@/components/AuthField.vue";
import AuthAgreement from "@/components/AuthAgreement.vue";
import {
  requestResetCode,
  verifyResetCode,
  updatePassword,
  EMAIL_RE,
} from "@/api/auth";
import { syncSession } from "@/store/user";

const email = ref("");
const code = ref("");
const password = ref("");
const confirm = ref("");
const loading = ref(false); // 仅重设提交（验证+设密）使用
const sending = ref(false); // 仅"发送验证码"使用，避免与重设按钮样式耦合
const sent = ref(false);
const done = ref(false);
const serverErr = ref("");
const countdown = ref(0);
const errors = reactive<{ email: string; code: string; password: string; confirm: string }>({
  email: "",
  code: "",
  password: "",
  confirm: "",
});

let timer: any = null;

function startCountdown() {
  countdown.value = 120;
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) {
      clearInterval(timer);
      timer = null;
    }
  }, 1000);
}

function validateEmail() {
  const e = email.value.trim();
  errors.email = e && !EMAIL_RE.test(e) ? "请输入有效的邮箱地址" : "";
}

// 发送验证码后用户仍可修改邮箱：一旦改动则旧验证码作废，重置发送/倒计时状态，允许重新发送
function onEmailInput() {
  errors.email = "";
  if (sent.value) {
    sent.value = false;
    code.value = "";
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    countdown.value = 0;
  }
}

// 新密码失焦校验
function validatePassword() {
  if (password.value && password.value.length < 6) {
    errors.password = "密码至少需要 6 位";
  }
}

// 确认密码失焦校验（与“新密码”一致）
function validateConfirm() {
  if (confirm.value && confirm.value !== password.value) {
    errors.confirm = "两次输入的密码不一致";
  }
}

async function sendCode() {
  if (countdown.value > 0 || sending.value) return;
  serverErr.value = "";
  errors.email = "";
  const e = email.value.trim();
  if (!e || !EMAIL_RE.test(e)) {
    errors.email = "请输入有效的邮箱地址";
    return;
  }
  sending.value = true;
  try {
    const r = await requestResetCode(e);
    if (!r.ok) {
      serverErr.value = r.error || "发送失败，请稍后重试";
      return;
    }
    sent.value = true;
    startCountdown();
  } catch (err: any) {
    serverErr.value = err?.message || "操作失败，请重试";
  } finally {
    sending.value = false;
  }
}

async function submit() {
  // 前端基础校验：邮箱格式 / 验证码非空 / 密码长度 / 两次一致
  serverErr.value = "";
  errors.email = "";
  errors.code = "";
  errors.password = "";
  errors.confirm = "";
  const e = email.value.trim();
  const c = code.value.trim();
  const p = password.value;
  if (!e || !EMAIL_RE.test(e)) {
    errors.email = "请输入有效的邮箱地址";
    return;
  }
  if (!c) {
    errors.code = "请输入邮箱验证码";
    return;
  }
  if (c.length !== 6) {
    errors.code = "请输入完整的邮箱验证码";
    return;
  }
  if (p.length < 6) {
    errors.password = "密码至少需要 6 位";
    return;
  }
  if (p !== confirm.value) {
    errors.confirm = "两次输入的密码不一致";
    return;
  }

  loading.value = true;
  try {
    // 1) 校验验证码 —— 通过后 Supabase 建立会话
    const v = await verifyResetCode(e, c);
    if (!v.ok) {
      errors.code = v.error || "验证码错误或已过期";
      return;
    }
    // 2) 重设密码（已建会话）
    const u = await updatePassword(p);
    if (!u.ok) {
      serverErr.value = u.error || "密码重设失败，请重试";
      return;
    }
    // 3) 重设完成即自动登录：验证码已建立会话、密码已写入，直接进入主应用
    done.value = true;
    await syncSession().catch(() => {});
    setTimeout(() => {
      uni.reLaunch({ url: "/pages/index/index" });
    }, 800);
  } catch (err: any) {
    serverErr.value = err?.message || "操作失败，请重试";
  } finally {
    loading.value = false;
  }
}

function goLogin() {
  uni.redirectTo({ url: "/pages/auth/login" });
}

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>
