<template>
  <AuthShell title="注册">
    <view class="card auth-form anim-rise-soft">
      <text class="auth-lead">注册后探索深度数据分析。</text>

      <!-- 邮箱 -->
      <AuthField
        icon="mail"
        v-model="email"
        placeholder="邮箱"
        :error="errors.email"
        :disabled="sent"
        @input="errors.email = ''"
      />

      <!-- 用户名（用户自填、唯一、注册后不可修改；昵称由系统自动生成） -->
      <AuthField
        icon="person"
        v-model="username"
        placeholder="用户名（3-20 位中英文 / 数字 / 下划线，唯一不可改）"
        :error="errors.username"
        :disabled="sent"
        @input="onUsernameInput"
      />
      <text v-if="!errors.username && usernameStatus === 'checking'" class="auth-sent-tip">正在检查用户名可用性…</text>
      <text v-else-if="!errors.username && usernameStatus === 'ok'" class="auth-ok-tip">✓ 用户名可用</text>

      <!-- 验证码 + 发送按钮（倒计时防重复） -->
      <AuthField
        icon="locked"
        v-model="code"
        :maxlength="6"
        placeholder="6 位邮箱验证码"
        :error="errors.code"
        @input="errors.code = ''"
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
      <text v-if="sent && !errors.code" class="auth-sent-tip">验证码已发送至 {{ maskedEmail }}</text>

      <!-- 密码 + 可见性切换 -->
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

      <!-- 底部注册按钮 -->
      <button
        :class="['btn-primary', 'auth-submit', (loading || done) ? 'is-disabled' : '']"
        :disabled="loading || done"
        @click="submit"
      >
        <view v-if="loading" class="btn-spin" />
        <text v-if="done">注册成功 ✓</text>
        <text v-else-if="loading">注册中…</text>
        <text v-else>注册</text>
      </button>
      <text v-if="done" class="auth-sent-tip">正在自动登录并进入应用…</text>
    </view>

    <view class="auth-foot">
      <view class="auth-switch">
        <text>已有账号？<text class="auth-link" @click="goLogin">去登录</text></text>
      </view>
      <AuthAgreement action="使用" />
    </view>
  </AuthShell>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onUnmounted } from "vue";
import AuthShell from "@/components/AuthShell.vue";
import AuthField from "@/components/AuthField.vue";
import AuthAgreement from "@/components/AuthAgreement.vue";
import {
  requestSignupCode,
  verifySignupCode,
  updatePassword,
  updateProfile,
  checkUsernameAvailable,
  USERNAME_RE,
  EMAIL_RE,
} from "@/api/auth";
import { syncSession, refreshProfile } from "@/store/user";

const email = ref("");
const username = ref("");
const usernameStatus = ref<"idle" | "checking" | "ok" | "taken">("idle");
const code = ref("");
const password = ref("");
const loading = ref(false); // 仅注册提交（验证+设密）使用
const sending = ref(false); // 仅"发送验证码"使用，避免与注册按钮样式耦合
const sent = ref(false);
const serverErr = ref("");
const countdown = ref(0);
const done = ref(false);
const errors = reactive<{ email: string; username: string; code: string; password: string }>({
  email: "",
  username: "",
  code: "",
  password: "",
});

let timer: any = null;
let usernameTimer: any = null;

// 邮箱脱敏展示：a****@domain.com
const maskedEmail = computed(() => {
  const e = email.value.trim();
  const at = e.indexOf("@");
  if (at <= 1) return e;
  const name = e.slice(0, at);
  const head = name.slice(0, 1);
  const tail = name.length > 2 ? name.slice(-1) : "";
  return `${head}****${tail ? tail + "@" : "@"}${e.slice(at + 1)}`;
});

function startCountdown() {
  countdown.value = 60;
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) {
      clearInterval(timer);
      timer = null;
    }
  }, 1000);
}

// 用户名输入：清除错误并防抖校验是否可用（格式合法才查，空/非法直接回到 idle）
function onUsernameInput() {
  errors.username = "";
  usernameStatus.value = "idle";
  if (usernameTimer) clearTimeout(usernameTimer);
  const uname = username.value.trim();
  if (!uname || !USERNAME_RE.test(uname)) return; // 格式非法不查，等待用户继续输入
  usernameStatus.value = "checking";
  usernameTimer = setTimeout(async () => {
    const r = await checkUsernameAvailable(uname);
    if (!r.ok) {
      // 后端/网络异常不强行拦截，交由提交时最终校验
      usernameStatus.value = "idle";
      return;
    }
    usernameStatus.value = r.available ? "ok" : "taken";
    if (!r.available) errors.username = "该用户名已被占用";
  }, 450);
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
    const r = await requestSignupCode(e);
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
  // 前端基础校验：邮箱格式 / 用户名规则与可用性 / 验证码非空 / 密码长度
  serverErr.value = "";
  errors.email = "";
  errors.username = "";
  errors.code = "";
  errors.password = "";
  const e = email.value.trim();
  const uname = username.value.trim();
  const c = code.value.trim();
  const p = password.value;
  if (!e || !EMAIL_RE.test(e)) {
    errors.email = "请输入有效的邮箱地址";
    return;
  }
  if (!uname) {
    errors.username = "请设置用户名";
    return;
  }
  if (!USERNAME_RE.test(uname)) {
    errors.username = "用户名须为 3-20 位中英文 / 数字 / 下划线";
    return;
  }
  if (usernameStatus.value === "taken") {
    errors.username = "该用户名已被占用";
    return;
  }
  if (usernameStatus.value !== "ok") {
    // 尚在检查中或未查过：阻塞提交，等待校验结果
    errors.username = "正在检查用户名，请稍候";
    return;
  }
  if (!c) {
    errors.code = "请输入验证码";
    return;
  }
  if (c.length !== 6) {
    errors.code = "请输入完整的 6 位数字验证码";
    return;
  }
  if (p.length < 6) {
    errors.password = "密码至少需要 6 位";
    return;
  }

  loading.value = true;
  try {
    // 1) 校验验证码 —— 通过后 Supabase 建立会话
    const v = await verifySignupCode(e, c);
    if (!v.ok) {
      errors.code = v.error || "验证码错误或已过期";
      return;
    }
    // 2) 设置密码（已建会话）
    const u = await updatePassword(p);
    if (!u.ok) {
      errors.password = u.error || "密码设置失败，请重试";
      return;
    }
    // 3) 写入用户名（用户自填、唯一不可改；昵称由触发器自动随机生成）
    const up = await updateProfile({ username: uname });
    if (!up.ok) {
      errors.username = up.error || "用户名设置失败，请重试";
      return;
    }
    // 4) 注册完成即自动登录：验证码已建立会话、密码已写入，会话保持，
    //    直接进入主应用（不再登出、不再跳登录页；user store 的 onAuthChange 已落地登录态）
    await refreshProfile().catch(() => {});
    done.value = true;
    // 兜底主动同步一次会话，确保即使监听器尚未就绪也能拿到登录态
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
