<template>
  <view class="card auth-form anim-rise-soft">
    <text class="auth-lead">{{ leadText }}</text>

    <!-- 邮箱 -->
    <AuthField
      icon="mail"
      v-model="email"
      placeholder="邮箱"
      :error="errors.email"
      @input="errors.email = ''"
      @blur="validateEmail"
    />

    <!-- 密码 + 可见性切换 -->
    <AuthField
      icon="locked"
      v-model="password"
      placeholder="密码"
      show-toggle
      :error="errors.password"
      @input="errors.password = ''"
    />

    <!-- 后端错误兜底（保留用户输入，仅提示） -->
    <view v-if="serverErr" class="auth-server-err">{{ serverErr }}</view>

    <!-- 底部提交按钮 -->
    <button
      :class="['btn-primary', 'auth-submit', (loading || done) ? 'is-disabled' : '']"
      :disabled="loading || done"
      @click="submit"
    >
      <view v-if="loading" class="btn-spin" />
      <text v-if="done">{{ doneText }}</text>
      <text v-else-if="loading">{{ loadingText }}</text>
      <text v-else>{{ submitText }}</text>
    </button>
    <text v-if="done" class="auth-sent-tip">正在进入应用…</text>
  </view>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import AuthField from "./AuthField.vue";
import { signIn, EMAIL_RE } from "@/api/auth";

withDefaults(
  defineProps<{
    mode?: "login";
  }>(),
  { mode: "login" }
);
const emit = defineEmits<{ (e: "authed"): void }>();

const email = ref("");
const password = ref("");
const loading = ref(false);
const done = ref(false);
const serverErr = ref("");
const errors = reactive({ email: "", password: "" });

// 文案常量（不随 props 变化，组件当前只支持 login 一种模式，无需 computed）
const submitText = "登录";
const loadingText = "登录中…";
const doneText = "登录成功 ✓";
const leadText = "登录后解锁完整报告与自选功能。";

function validateEmail() {
  const e = email.value.trim();
  errors.email = e && !EMAIL_RE.test(e) ? "请输入有效的邮箱地址" : "";
}

async function submit() {
  serverErr.value = "";
  errors.email = "";
  errors.password = "";
  const e = email.value.trim();
  const p = password.value;
  if (!e || !EMAIL_RE.test(e)) {
    errors.email = "请输入有效的邮箱地址";
    return;
  }
  if (!p) {
    errors.password = "请输入密码";
    return;
  }
  loading.value = true;
  try {
    const r = await signIn(e, p);
    if (!r.ok) {
      serverErr.value = r.error || "登录失败，请检查邮箱或密码";
      return;
    }
    done.value = true;
    emit("authed");
  } catch (err: any) {
    serverErr.value = err?.message || "登录失败，请重试";
  } finally {
    loading.value = false;
  }
}
</script>