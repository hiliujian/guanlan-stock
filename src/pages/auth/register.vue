<template>
  <AuthShell title="注册">
    <view class="auth-form anim-rise-soft">
      <text class="auth-lead">注册后探索深度数据分析。</text>

      <!-- 用户名（用户自填、唯一；昵称由系统自动生成） -->
      <AuthField
        icon="person"
        v-model="username"
        placeholder="用户名（3-20 位中英文 / 数字 / 下划线）"
        :error="errors.username"
        @input="onUsernameInput"
        @blur="validateUsername"
      />
      <text v-if="!errors.username && usernameStatus === 'checking'" class="auth-sent-tip">正在检查用户名可用性…</text>
      <text v-else-if="!errors.username && usernameStatus === 'ok'" class="auth-ok-tip">✓ 用户名可用</text>

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

      <!-- 密码 + 可见性切换 -->
      <AuthField
        icon="locked"
        v-model="password"
        placeholder="密码（至少 6 位）"
        show-toggle
        :error="errors.password"
        @input="errors.password = ''"
        @blur="validatePassword"
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
      <text>已有账号？<text class="auth-link" @click="goLogin">去登录</text></text>
    </view>
    <!-- 协议贴底（fixed）：与表单整体垂直居中无关，始终在屏幕最底部 -->
    <AuthAgreement action="使用" />
  </AuthShell>
</template>

<script setup lang="ts">
import { ref, reactive, onUnmounted } from "vue";
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

// 用户名输入：实时格式校验 + 防抖校验是否可用（格式合法才查可用性）
function onUsernameInput() {
  if (usernameTimer) clearTimeout(usernameTimer);
  const uname = username.value.trim();
  // 格式校验优先：实时反馈，输入“12”等非法值时立即提示
  if (uname && !USERNAME_RE.test(uname)) {
    errors.username = "用户名须为 3-20 位中英文 / 数字 / 下划线";
    usernameStatus.value = "idle";
    return;
  }
  errors.username = "";
  usernameStatus.value = "idle";
  if (!uname) return; // 空值不查，等待用户继续输入
  // 格式合法 → 查可用性
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

// 用户名失焦兜底校验（与实时校验保持一致）
function validateUsername() {
  const uname = username.value.trim();
  if (uname && !USERNAME_RE.test(uname)) {
    errors.username = "用户名须为 3-20 位中英文 / 数字 / 下划线";
  }
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

// 密码失焦校验（提交时另有长度校验兜底）
function validatePassword() {
  if (password.value && password.value.length < 6) {
    errors.password = "密码至少需要 6 位";
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

  loading.value = true;
  try {
    // 不依赖 is_email_taken 预判（OTP 创建用户时邮箱即被标记确认，库里无法可靠区分
    // 幽灵与真实账号），直接走验证：以 Supabase 流程中的真实信号来区分新/老用户。
    // 1) 校验验证码 —— 通过后 Supabase 建立会话
    const v = await verifySignupCode(e, c);
    if (!v.ok) {
      // 已确认/已注册邮箱收到的是“已完成验证”错误 → 引导去登录，而非误拦新注册
      if (/已注册|已验证|直接登录/.test(v.error || "")) {
        errors.email = "该邮箱已注册，请直接登录或使用找回密码";
      } else {
        errors.code = v.error || "验证码错误或已过期";
      }
      return;
    }
    // 2) 设置密码（已建会话）；密码与账号当前密码相同说明该邮箱已注册
    const u = await updatePassword(p);
    if (!u.ok) {
      if (u.samePassword) {
        errors.email = "该邮箱已注册，请直接登录或使用找回密码";
      } else {
        errors.password = u.error || "密码设置失败，请重试";
      }
      return;
    }
    // 3) 写入用户名（用户自填、唯一；昵称由触发器自动随机生成）
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
