<template>
  <!-- 主流应用风格：表单输入直接落在页面背景上 -->
  <view class="af auth-form anim-rise-soft">
    <text class="auth-lead">登录后从云端同步自选股与资料。</text>

    <view v-if="!isSupabaseConfigured" class="auth-warn">
      后端服务未配置，登录功能暂不可用。请部署时在构建环境注入
      <text class="auth-warn-code">VITE_SUPABASE_URL</text> /
      <text class="auth-warn-code">VITE_SUPABASE_ANON_KEY</text> 后重新构建。
    </view>

    <!-- 用户名或邮箱（统一输入框，后端按实际类型判定登录方式） -->
    <AuthField
      icon="person"
      v-model="identifier"
      placeholder="用户名或邮箱"
      :error="errors.identifier"
      @input="errors.identifier = ''"
    />

    <!-- 密码 -->
    <AuthField
      icon="locked"
      v-model="password"
      placeholder="密码（至少 6 位）"
      show-toggle
      :error="errors.password"
      @input="errors.password = ''"
    />

    <!-- 后端错误兜底（保留用户输入，仅提示） -->
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
/**
 * 登录表单（单一标识输入框）
 * - 用户名或邮箱共用一个输入框；后端 signInByIdentifier 按实际类型判定登录方式
 * - 不强制校验为邮箱格式：含 @ 走邮箱校验，否则按用户名规则校验
 */
import { ref, reactive } from "vue";
import AuthField from "./AuthField.vue";
import { signInByIdentifier, USERNAME_RE, EMAIL_RE } from "@/api/auth";
import { isSupabaseConfigured } from "@/config/app";

defineProps<{ mode?: "login" }>();
const emit = defineEmits<{ (e: "authed"): void }>();

const identifier = ref("");
const password = ref("");
const loading = ref(false);
const serverErr = ref("");
const errors = reactive<{ identifier: string; password: string }>({ identifier: "", password: "" });

async function submit() {
  // 每次提交先清空上一次的错误，避免残留
  serverErr.value = "";
  errors.identifier = "";
  errors.password = "";
  const id = identifier.value.trim();
  const p = password.value;
  // 前端校验：保留输入，字段下方内联提示
  // 用户名或邮箱均可：含 @ 走邮箱格式校验，否则校验用户名规则（不强制邮箱格式）
  if (!id) {
    errors.identifier = "请输入用户名或邮箱";
    return;
  }
  if (EMAIL_RE.test(id)) {
    // 邮箱：格式由 Supabase 兜底，这里仅做基本形态校验
  } else if (!USERNAME_RE.test(id)) {
    errors.identifier = "用户名须为 3-20 位中英文 / 数字 / 下划线";
    return;
  }
  if (p.length < 6) {
    errors.password = "密码至少 6 位";
    return;
  }
  loading.value = true;
  try {
    const r = await signInByIdentifier(id, p);
    if (!r.ok) {
      // r.error 已按实际登录方式返回中文（用户名不存在 / 邮箱或密码错误等）
      serverErr.value = r.error || "登录失败，请检查账号或密码";
      return;
    }
    emit("authed");
  } catch (err: any) {
    serverErr.value = err?.message || "登录失败，请重试";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
/* 主流应用风格：去掉卡片外壳，仅保留表单条目间距 */
.af {
  width: 100%;
  box-sizing: border-box;
}
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
