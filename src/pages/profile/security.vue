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
          <text class="sec-hero-sub">管理登录密码与账号状态</text>
        </view>
        <view class="sec-hero-badge">
          <text class="sec-dot" />
          <text>基础保护</text>
        </view>
      </view>

      <!-- 登录邮箱 -->
      <view class="card sec-mail anim-fade-up">
        <text class="sec-mail-lab">登录邮箱</text>
        <text class="sec-mail-val">{{ maskedEmail }}</text>
      </view>

      <!-- 安全设置：登录密码（手风琴展开修改表单） -->
      <view class="card sec-group anim-fade-up">
        <view class="sec-row" hover-class="sec-row-hover" role="button" aria-label="修改登录密码" @click="togglePwd">
          <view class="sec-row-left">
            <view class="sec-row-ic"><OutlineIcon type="locked" :size="28" color="var(--text-2)" /></view>
            <view class="sec-row-text">
              <text class="sec-row-label">登录密码</text>
              <text class="sec-row-desc">定期更换密码，保障账号安全</text>
            </view>
          </view>
          <view class="sec-row-action">
            <text class="sec-row-edit">{{ pwdOpen ? "收起" : "修改" }}</text>
            <OutlineIcon :type="pwdOpen ? 'arrow-up' : 'arrow-down'" :size="26" color="var(--text-2)" />
          </view>
        </view>

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

      <!-- 危险操作区 -->
      <view class="card sec-danger-zone anim-fade-up" :style="{ animationDelay: '60ms' }">
        <text class="sec-danger-title">注销账号</text>
        <text class="sec-danger-warn">注销后，账号、个人资料与自选股将被永久删除且不可恢复，请谨慎操作。</text>
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
      message="确定要注销账号吗？此操作不可恢复，账号、资料与自选股将永久删除。"
      confirm-text="确认注销"
      cancel-text="取消"
      icon="close"
      variant="danger"
      @confirm="confirmDelete"
    />
  </view>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import BackgroundFX from "@/components/BackgroundFX.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import AuthField from "@/components/AuthField.vue";
import { useUser } from "@/store/user";
import { signIn, updatePassword, deleteAccount, signOut } from "@/api/auth";

const user = useUser();

// 邮箱脱敏展示（仅显示前 3 位 + 星号 + 域名），不暴露完整地址
const maskedEmail = computed(() => {
  const e = (user.email || "").trim();
  if (!e || !e.includes("@")) return e || "—";
  const [name, domain] = e.split("@");
  const head = name.slice(0, 3);
  const stars = "*".repeat(Math.max(4, name.length - 3));
  return `${head}${stars}@${domain}`;
});

// 手风琴：修改密码表单展开状态
const pwdOpen = ref(false);
function togglePwd() {
  pwdOpen.value = !pwdOpen.value;
  if (!pwdOpen.value) {
    // 收起时清空错误提示，避免再次展开残留
    errors.current = "";
    errors.npwd = "";
    errors.confirm = "";
    serverErr.value = "";
  }
}

const currentPwd = ref("");
const newPwd = ref("");
const confirmPwd = ref("");
const saving = ref(false);
const deleting = ref(false);
const serverErr = ref("");
const showDelete = ref(false);
const errors = reactive<{ current: string; npwd: string; confirm: string }>({
  current: "",
  npwd: "",
  confirm: "",
});

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
    // 收起表单并清空输入
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

/* 登录邮箱 */
.sec-mail {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26rpx 28rpx;
  margin-top: 20rpx;
}
.sec-mail-lab {
  font-size: 28rpx;
  color: var(--text-2);
}
.sec-mail-val {
  font-size: 28rpx;
  color: var(--text);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 安全设置分组 */
.sec-group {
  margin-top: 20rpx;
  padding: 8rpx 0;
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
}
.sec-row-action {
  display: flex;
  align-items: center;
  gap: 4rpx;
  flex: none;
}
.sec-row-edit {
  font-size: 28rpx;
  color: var(--primary);
  font-weight: 600;
}

/* 内联修改表单 */
.sec-form {
  padding: 4rpx 28rpx 26rpx;
  border-top: 1rpx solid var(--border);
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

/* 危险操作区：红色描边弱化，避免刺眼 */
.sec-danger-zone {
  margin-top: 20rpx;
  padding: 28rpx;
  border: 1rpx solid rgba(229, 72, 77, 0.32);
}
.sec-danger-title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: var(--danger);
  margin-bottom: 10rpx;
}
.sec-danger-warn {
  display: block;
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--text-2);
  margin-bottom: 20rpx;
}

.bottom-pad {
  height: 60rpx;
}
</style>
