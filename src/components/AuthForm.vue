<template>
  <view class="card auth-form anim-rise-soft">
    <text class="auth-lead">登录后从云端同步自选股与资料。</text>

    <view v-if="!isSupabaseConfigured" class="auth-warn">
      后端服务未配置，登录功能暂不可用。请部署时在 Vercel 注入
      <text class="auth-warn-code">VITE_SUPABASE_URL</text> /
      <text class="auth-warn-code">VITE_SUPABASE_ANON_KEY</text> 后重新构建。
    </view>

    <AuthField
      icon="person"
      v-model="email"
      placeholder="邮箱"
      :error="errors.email"
      @input="errors.email = ''"
    />
    <AuthField
      icon="locked"
      v-model="password"
      placeholder="密码（至少 6 位）"
      password
      :error="errors.password"
      @input="errors.password = ''"
    />

    <!-- 后端错误：保留用户输入，仅高亮提示，绝不清空 -->
    <view v-if="serverErr" class="auth-server-err">{{ serverErr }}</view>

    <button
      :class="['btn-primary', 'auth-submit', loading ? 'is-disabled' : '']"
      :disabled="loading"
      @click="submit"
    >
      <view v-if="loading" class="btn-spin" />
      <text>{{ loading ? "登录中…" : "登录" }}</text>
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import AuthField from "./AuthField.vue";
import { signIn } from "@/api/auth";
import { isSupabaseConfigured } from "@/config/app";

const props = defineProps<{ mode: "login" }>();
const emit = defineEmits<{
  (e: "authed"): void;
}>();

const email = ref("");
const password = ref("");
const loading = ref(false);
const serverErr = ref("");
const errors = reactive<{ email: string; password: string }>({ email: "", password: "" });

async function submit() {
  // 每次提交先清空上一次的错误，避免残留
  serverErr.value = "";
  errors.email = "";
  errors.password = "";
  const e = email.value.trim();
  const p = password.value;
  // 前端校验：保留输入，字段下方内联提示
  if (!e || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
    errors.email = "请输入有效的邮箱地址";
    return;
  }
  if (p.length < 6) {
    errors.password = "密码至少 6 位";
    return;
  }
  loading.value = true;
  try {
    const r = await signIn(e, p);
    if (!r.ok) {
      serverErr.value = r.error || "登录失败";
      return;
    }
    emit("authed");
  } catch (err: any) {
    serverErr.value = err?.message || "操作失败，请重试";
  } finally {
    loading.value = false;
  }
}

</script>

<style scoped>
.auth-warn {
  margin: 4rpx 0 18rpx;
  padding: 18rpx 20rpx;
  border-radius: 14rpx;
  background: rgba(255, 159, 64, 0.14);
  border: 1rpx solid rgba(255, 159, 64, 0.45);
  color: #b26a00;
  font-size: 24rpx;
  line-height: 1.65;
}
.auth-warn-code {
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-weight: 600;
  color: #8a5200;
}
</style>
