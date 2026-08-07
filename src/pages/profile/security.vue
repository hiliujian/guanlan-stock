<template>
  <view class="app-shell sec-page">
    <BackgroundFX />

    <!-- 自定义导航头（navigationStyle:custom，需自带返回） -->
    <view class="sec-head">
      <view class="sec-back" hover-class="sec-back-hover" @click="back" role="button" aria-label="返回">
        <OutlineIcon type="arrow-left" :size="44" color="var(--text)" />
      </view>
      <text class="sec-title">账号安全</text>
      <view class="sec-head-ph" />
    </view>

    <scroll-view class="sec-scroll" scroll-y>
      <!-- 顶部身份概览 -->
      <view class="card sec-hero anim-fade-up">
        <view class="sec-hero-ic">
          <OutlineIcon type="shield" :size="42" color="#fff" />
        </view>
        <view class="sec-hero-body">
          <text class="sec-hero-title">账号安全</text>
          <text class="sec-hero-sub">管理登录邮箱、密码与账号状态</text>
        </view>
        <view class="sec-hero-badge">
          <text class="sec-dot" />
          <text>基础保护</text>
        </view>
      </view>

      <!-- 上次登录信息：地点 · 时间 · 设备 合并一行展示（避免三项各占一行占用空间） -->
      <view class="card sec-group anim-fade-up">
        <text class="sec-group-title">上次登录</text>
        <view class="sec-row">
          <view class="sec-row-left">
            <view class="sec-row-ic"><OutlineIcon type="clock" :size="28" color="var(--text-2)" /></view>
            <view class="sec-row-text">
              <text class="sec-row-label">登录信息</text>
              <text class="sec-row-desc">{{ loginSummary }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 账号与安全分组：登录邮箱 / 登录密码（手风琴展开修改表单） -->
      <view class="card sec-group anim-fade-up">
        <text class="sec-group-title">账号与安全</text>

        <!-- 登录邮箱 -->
        <view class="sec-row" hover-class="sec-row-hover" role="button" aria-label="修改登录邮箱" @click="toggleMail">
          <view class="sec-row-left">
            <view class="sec-row-ic"><OutlineIcon type="mail" :size="28" color="var(--text-2)" /></view>
            <view class="sec-row-text">
              <text class="sec-row-label">登录邮箱</text>
              <text class="sec-row-desc">{{ maskedEmail }}</text>
            </view>
          </view>
          <view class="sec-row-action">
            <OutlineIcon type="edit" :size="30" :color="mailOpen ? 'var(--primary)' : 'var(--text-2)'" />
          </view>
        </view>

        <!-- 邮箱修改表单：新邮箱 + 验证码（发到新邮箱校验） -->
        <view v-if="mailOpen" class="sec-form">
          <text class="sec-form-title">更换登录邮箱</text>
          <AuthField
            icon="mail"
            v-model="newEmail"
            placeholder="新邮箱"
            :error="errors.email"
            @input="onNewEmailInput" @blur="validateNewEmail"
          >
            <template #suffix>
              <view
                class="auth-suffix"
                :class="{ disabled: emailCountdown > 0 || emailSending }"
                role="button"
                :aria-disabled="emailCountdown > 0 || emailSending"
                @click="sendEmailCode"
              >
                {{ emailCountdown > 0 ? emailCountdown + "s" : "发送验证码" }}
              </view>
            </template>
          </AuthField>
          <AuthField
            icon="locked"
            v-model="emailCode"
            :maxlength="6"
            placeholder="邮箱验证码"
            :error="errors.ecode"
            @input="errors.ecode = ''"
          />
          <view v-if="emailServerErr" class="sec-err">{{ emailServerErr }}</view>
          <button
            :class="['btn-primary', 'sec-submit', (emailSaving || emailDone) ? 'is-disabled' : '']"
            :disabled="emailSaving || emailDone"
            @click="confirmEmailChange"
          >
            <view v-if="emailSaving" class="btn-spin" />
            <text v-if="emailDone">修改成功 ✓</text>
            <text v-else-if="emailSaving">验证中…</text>
            <text v-else>验证并修改</text>
          </button>
          <text class="sec-tip">验证码将发送至新邮箱，验证成功后登录邮箱立即更新。</text>
        </view>

        <!-- 登录密码 -->
        <view class="sec-row" hover-class="sec-row-hover" role="button" aria-label="修改登录密码" @click="togglePwd">
          <view class="sec-row-left">
            <view class="sec-row-ic"><OutlineIcon type="locked" :size="28" color="var(--text-2)" /></view>
            <view class="sec-row-text">
              <text class="sec-row-label">登录密码</text>
              <text class="sec-row-desc">定期更换密码，保障账号安全</text>
            </view>
          </view>
          <view class="sec-row-action">
            <OutlineIcon type="edit" :size="30" :color="pwdOpen ? 'var(--primary)' : 'var(--text-2)'" />
          </view>
        </view>

        <!-- 密码修改表单 -->
        <view v-if="pwdOpen" class="sec-form">
          <text class="sec-form-title">修改登录密码</text>
          <AuthField
            icon="locked"
            v-model="currentPwd"
            placeholder="当前密码"
            :password="true"
            show-toggle
            :error="errors.current"
            @input="errors.current = ''"
          />
          <AuthField
            icon="locked"
            v-model="newPwd"
            placeholder="新密码（至少 6 位）"
            :password="true"
            show-toggle
            :error="errors.npwd"
            @input="errors.npwd = ''"
          />
          <AuthField
            icon="locked"
            v-model="confirmPwd"
            placeholder="确认新密码"
            :password="true"
            show-toggle
            :error="errors.confirm"
            @input="errors.confirm = ''"
          />
          <view v-if="serverErr" class="sec-err">{{ serverErr }}</view>
          <button
            :class="['btn-primary', 'sec-submit', saving ? 'is-disabled' : '']"
            :disabled="saving"
            @click="changePassword"
          >
            <text v-if="saving">保存中…</text>
            <text v-else>保存修改</text>
          </button>
          <text class="sec-tip">修改成功后，下次登录需使用新密码。</text>
        </view>
      </view>

        <!-- 危险操作区：卡片样式与其他卡片一致（分节标题 + 内衬内容），仅按钮保留危险红 -->
        <view class="card sec-danger-zone anim-fade-up" :style="{ animationDelay: '60ms' }">
          <text class="sec-danger-title">注销账号</text>
          <text class="sec-danger-warn">注销后，账号将被永久删除且不可恢复，请谨慎操作。</text>
          <button
            :class="['btn-danger', deleting ? 'is-disabled' : '']"
            :disabled="deleting"
            @click="askDelete"
          >
            <text v-if="deleting">注销中…</text>
            <text v-else>注销账号</text>
          </button>
        </view>

      <view class="bottom-pad" />
    </scroll-view>

    <!-- 注销二次确认：复用全局统一 ConfirmDialog -->
    <ConfirmDialog
      v-model="showDelete"
      title="注销账号"
      message="确定要注销账号吗？此操作不可恢复，账号将被永久删除。"
      confirm-text="确认注销"
      cancel-text="取消"
      icon="close"
      variant="danger"
      @confirm="confirmDelete"
    />
  </view>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onUnmounted } from "vue";
import { onShow } from "@dcloudio/uni-app";
import OutlineIcon from "@/components/OutlineIcon.vue";
import BackgroundFX from "@/components/BackgroundFX.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import AuthField from "@/components/AuthField.vue";
import { useUser, refreshProfile, syncSession } from "@/store/user";
import {
  signIn,
  updatePassword,
  deleteAccount,
  signOut,
  requestEmailChange,
  verifyEmailChange,
  captureLoginInfo,
  fetchLoginInfo,
  type LoginInfo,
  EMAIL_RE,
} from "@/api/auth";

const user = useUser();

// —— 上次登录信息：每次打开本页都直接从云端 profiles 表查询（不依赖本地缓存 / 登录时的
// 内存快照，避免快照为 null 时一直显示「暂无登录记录」）。仅当云端确实无记录，才以当前
// 会话最佳努力补写一条并回读；无论如何最终值都来自云端，本地存储不参与读取。
const lastLogin = ref<LoginInfo | null>(null);

onShow(async () => {
  if (!user.loggedIn) return;
  // 每次打开都直查云端 profiles 表（不读本地缓存/内存快照）；云端真的没记录才补写并回读
  let info = await fetchLoginInfo();
  if (!info) {
    await captureLoginInfo().catch(() => {});
    info = await fetchLoginInfo();
  }
  lastLogin.value = info;
});

// 上次登录：地点 · 时间 · 设备 合并一行展示（缺失项自动跳过，全空显「暂无登录记录」）
const loginSummary = computed(() => {
  const l = lastLogin.value;
  if (!l) return "暂无登录记录";
  const parts: string[] = [];
  // 地点：依赖 IP 地理定位，定位失败则显示「未知」（不回退到裸 IP）
  parts.push(l.city || "未知");
  if (l.time) parts.push(fmtLoginTime(l.time));
  const dev = [l.device, l.os].filter(Boolean);
  if (dev.length) parts.push(dev.join(" · "));
  else if (l.platform) parts.push(l.platform);
  return parts.length ? parts.join(" · ") : "暂无登录记录";
});

// 时间格式化：YYYY-MM-DD HH:mm（本地时区），无效则「—」
function fmtLoginTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 邮箱脱敏展示（仅显示前 3 位 + 星号 + 域名），不暴露完整地址
const maskedEmail = computed(() => {
  const e = (user.email || "").trim();
  if (!e || !e.includes("@")) return e || "—";
  const [name, domain] = e.split("@");
  const head = name.slice(0, 3);
  const stars = "*".repeat(Math.max(4, name.length - 3));
  return `${head}${stars}@${domain}`;
});

// —— 手风琴：邮箱 / 密码表单互斥展开 ——
const mailOpen = ref(false);
const pwdOpen = ref(false);
function toggleMail() {
  mailOpen.value = !mailOpen.value;
  if (mailOpen.value && pwdOpen.value) pwdOpen.value = false;
  if (pwdOpen.value) {
    errors.current = "";
    errors.npwd = "";
    errors.confirm = "";
    serverErr.value = "";
  }
  if (!mailOpen.value) resetMailState();
}
function togglePwd() {
  pwdOpen.value = !pwdOpen.value;
  if (pwdOpen.value && mailOpen.value) mailOpen.value = false;
  if (mailOpen.value) resetMailState();
  if (!pwdOpen.value) {
    errors.current = "";
    errors.npwd = "";
    errors.confirm = "";
    serverErr.value = "";
  }
}

// —— 邮箱修改状态 ——
const newEmail = ref("");
const emailCode = ref("");
const emailSending = ref(false);
const emailSent = ref(false);
const emailSaving = ref(false);
const emailDone = ref(false);
const emailServerErr = ref("");
const emailCountdown = ref(0);
let emailTimer: any = null;

function resetMailState() {
  if (emailTimer) {
    clearInterval(emailTimer);
    emailTimer = null;
  }
  emailCountdown.value = 0;
  emailSent.value = false;
}

function startEmailCountdown() {
  emailCountdown.value = 120;
  emailTimer = setInterval(() => {
    emailCountdown.value -= 1;
    if (emailCountdown.value <= 0) {
      clearInterval(emailTimer);
      emailTimer = null;
    }
  }, 1000);
}

function validateNewEmail() {
  const e = newEmail.value.trim();
  if (!e) {
    errors.email = "";
    return;
  }
  if (!EMAIL_RE.test(e)) {
    errors.email = "请输入有效的邮箱地址";
    return;
  }
  if (user.email && e.toLowerCase() === (user.email || "").toLowerCase()) {
    errors.email = "新邮箱不能与当前邮箱相同";
    return;
  }
  errors.email = "";
}

// 发送验证码后用户仍可修改新邮箱：一旦改动则旧验证码作废，重置发送/倒计时状态
function onNewEmailInput() {
  errors.email = "";
  if (emailSent.value) {
    emailSent.value = false;
    emailCode.value = "";
    resetMailState();
  }
}

async function sendEmailCode() {
  if (emailCountdown.value > 0 || emailSending.value) return;
  emailServerErr.value = "";
  errors.email = "";
  const e = newEmail.value.trim();
  if (!e || !EMAIL_RE.test(e)) {
    errors.email = "请输入有效的邮箱地址";
    return;
  }
  if (user.email && e.toLowerCase() === (user.email || "").toLowerCase()) {
    errors.email = "新邮箱不能与当前邮箱相同";
    return;
  }
  emailSending.value = true;
  try {
    const r = await requestEmailChange(e);
    if (!r.ok) {
      emailServerErr.value = r.error || "发送失败，请稍后重试";
      return;
    }
    emailSent.value = true;
    startEmailCountdown();
  } catch (err: any) {
    emailServerErr.value = err?.message || "操作失败，请重试";
  } finally {
    emailSending.value = false;
  }
}

async function confirmEmailChange() {
  emailServerErr.value = "";
  errors.email = "";
  errors.ecode = "";
  const e = newEmail.value.trim();
  const c = emailCode.value.trim();
  if (!e || !EMAIL_RE.test(e)) {
    errors.email = "请输入有效的邮箱地址";
    return;
  }
  if (!c) {
    errors.ecode = "请输入邮箱验证码";
    return;
  }
  if (c.length !== 6) {
    errors.ecode = "请输入完整的邮箱验证码";
    return;
  }
  emailSaving.value = true;
  try {
    const r = await verifyEmailChange(e, c);
    if (!r.ok) {
      errors.ecode = r.error || "验证码错误或已过期";
      return;
    }
    emailDone.value = true;
    // 邮箱已变更：刷新会话中的邮箱 + 资料，使页面与 store 同步
    await syncSession().catch(() => {});
    await refreshProfile().catch(() => {});
    uni.showToast({ title: "邮箱已更新", icon: "success" });
    setTimeout(() => {
      mailOpen.value = false;
      resetMailState();
      newEmail.value = "";
      emailCode.value = "";
      emailDone.value = false;
    }, 900);
  } catch (err: any) {
    emailServerErr.value = err?.message || "操作失败，请重试";
  } finally {
    emailSaving.value = false;
  }
}

// —— 密码修改状态 ——
const currentPwd = ref("");
const newPwd = ref("");
const confirmPwd = ref("");
const saving = ref(false);
const serverErr = ref("");
const errors = reactive<{
  current: string;
  npwd: string;
  confirm: string;
  email: string;
  ecode: string;
}>({ current: "", npwd: "", confirm: "", email: "", ecode: "" });

function back() {
  uni.navigateBack({ delta: 1 });
}

async function changePassword() {
  serverErr.value = "";
  errors.current = "";
  errors.npwd = "";
  errors.confirm = "";
  const c = currentPwd.value;
  const p = newPwd.value;
  if (!c) {
    errors.current = "请输入当前密码";
    return;
  }
  if (p.length < 6) {
    errors.npwd = "新密码至少 6 位";
    return;
  }
  if (p !== confirmPwd.value) {
    errors.confirm = "两次输入的密码不一致";
    return;
  }

  saving.value = true;
  try {
    // 1) 校验当前密码（重新登录，确保是本人操作）
    const v = await signIn(user.email || "", c);
    if (!v.ok) {
      errors.current = v.error || "当前密码错误";
      return;
    }
    // 2) 在当前会话中修改密码
    const u = await updatePassword(p);
    if (!u.ok) {
      serverErr.value = u.error || "密码修改失败，请重试";
      return;
    }
    uni.showToast({ title: "密码已修改", icon: "success" });
    currentPwd.value = "";
    newPwd.value = "";
    confirmPwd.value = "";
    pwdOpen.value = false;
    setTimeout(() => back(), 600);
  } catch (e: any) {
    serverErr.value = e?.message || "操作失败，请重试";
  } finally {
    saving.value = false;
  }
}

const deleting = ref(false);
const showDelete = ref(false);

function askDelete() {
  showDelete.value = true;
}

async function confirmDelete() {
  deleting.value = true;
  try {
    const r = await deleteAccount();
    if (!r.ok) {
      uni.showToast({ title: r.error || "注销失败", icon: "none" });
      return;
    }
    // 注销后会话已失效，清理本地登录态并回到首页
    await signOut().catch(() => {});
    uni.showToast({ title: "账号已注销", icon: "none" });
    setTimeout(() => {
      uni.reLaunch({ url: "/pages/index/index" });
    }, 600);
  } finally {
    deleting.value = false;
  }
}

onUnmounted(() => {
  if (emailTimer) clearInterval(emailTimer);
});
</script>

<style scoped>
.sec-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  overflow-x: hidden;
}
.sec-head {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: calc(88rpx + env(safe-area-inset-top));
  padding: env(safe-area-inset-top) 12rpx 0;
  background: var(--sticky-bg);
  backdrop-filter: blur(16rpx) saturate(140%);
  -webkit-backdrop-filter: blur(16rpx) saturate(140%);
  box-shadow: var(--sticky-shadow);
}
.sec-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  margin-left: 6rpx;
  transition: background 0.18s ease;
}
.sec-back-hover {
  background: var(--card-2);
}
.sec-title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--text);
}
.sec-head-ph {
  width: 72rpx;
}
.sec-scroll {
  flex: 1;
  height: 100%;
  box-sizing: border-box;
  padding: 24rpx 24rpx 0;
}

/* 顶部身份概览：渐变营造纵深，盾牌徽章 + 状态徽标 */
.sec-hero {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 32rpx 28rpx;
  background: linear-gradient(135deg, rgba(7, 193, 96, 0.18), rgba(7, 193, 96, 0.04) 60%, transparent);
}
.sec-hero-ic {
  width: 84rpx;
  height: 84rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--primary), var(--primary-dark, #06a050));
  flex: none;
  box-shadow: 0 8rpx 20rpx rgba(7, 193, 96, 0.28);
}
.sec-hero-body {
  flex: 1;
  min-width: 0;
}
.sec-hero-title {
  display: block;
  font-size: 36rpx;
  font-weight: 700;
  color: var(--text);
}
.sec-hero-sub {
  display: block;
  font-size: 24rpx;
  color: var(--text-2);
  margin-top: 6rpx;
}
.sec-hero-badge {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  background: rgba(7, 193, 96, 0.14);
  color: var(--primary);
  font-size: 22rpx;
  font-weight: 600;
  flex: none;
}
.sec-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: var(--primary);
}

/* 账号与安全分组：与「我的」菜单分组视觉一致（标题 + 行 + 内联表单） */
.sec-group {
  margin-top: 20rpx;
  padding: 8rpx 0 16rpx;
}
.sec-group-title {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: 1rpx;
  margin: 14rpx 28rpx 6rpx;
}
.sec-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26rpx 28rpx;
  transition: background 0.18s ease;
}
.sec-row-hover {
  background: var(--card-2);
}
.sec-row-left {
  display: flex;
  align-items: center;
  gap: 18rpx;
  min-width: 0;
  flex: 1;
}
.sec-row-ic {
  width: 60rpx;
  height: 60rpx;
  border-radius: 16rpx;
  background: var(--card-2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.sec-row-text {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}
.sec-row-label {
  font-size: 30rpx;
  color: var(--text);
  font-weight: 600;
}
.sec-row-desc {
  font-size: 22rpx;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 400rpx;
}
.sec-row-action {
  display: flex;
  align-items: center;
  flex: none;
}

/* 内联修改表单 */
.sec-form {
  padding: 6rpx 28rpx 8rpx;
  border-top: 1rpx solid var(--border);
  margin-top: 6rpx;
}
.sec-form-title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: var(--text);
  margin: 18rpx 0 14rpx;
}
.sec-err {
  font-size: 24rpx;
  color: var(--danger);
  margin: 4rpx 0 8rpx;
}
.sec-submit {
  margin-top: 20rpx;
}
.sec-tip {
  display: block;
  font-size: 22rpx;
  color: var(--text-2);
  margin-top: 16rpx;
  line-height: 1.5;
}

/* 危险操作区：卡片与「账号与安全」分组一致（分节标题 + 28rpx 内衬），仅按钮保留危险红 */
.sec-danger-zone {
  margin-top: 20rpx;
  padding: 8rpx 28rpx 16rpx;
}
.sec-danger-title {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: 1rpx;
  margin: 14rpx 0 6rpx;
}
.sec-danger-warn {
  display: block;
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--text-2);
  margin: 4rpx 0 24rpx;
}

.bottom-pad {
  height: 60rpx;
}
</style>
