<template>
  <scroll-view class="view-scroll" scroll-y>
    <view class="pf">
      <BackgroundFX />
      <!-- 未登录：引导登录 -->
      <view v-if="!user.loggedIn" class="login-prompt card anim-fade-up">
        <view class="lp-avatar">
          <OutlineIcon type="person" :size="56" color="var(--text-2)" />
        </view>
        <text class="lp-title">登录后同步自选股与资料</text>
        <text class="lp-sub">支持邮箱注册，数据保存在云端（Supabase）</text>
        <button class="btn-primary lp-btn" @click="openAuth">登录 / 注册</button>
        <text v-if="!user.supabaseEnabled" class="lp-tip">
          未配置 Supabase：登录功能不可用，但行情分析与本地自选仍可正常使用。
        </text>
      </view>

      <!-- 已登录：资料 -->
      <block v-else>
        <view class="profile-head card anim-fade-up">
          <view class="ph-avatar" @click="chooseAvatar">
            <image
              v-if="avatarUrl"
              :src="avatarUrl"
              class="ph-img"
              mode="aspectFill"
            />
            <OutlineIcon v-else type="person" :size="56" color="var(--text-2)" />
            <view class="ph-cam">
              <OutlineIcon type="camera" :size="22" color="#fff" />
            </view>
          </view>
          <view class="ph-meta">
            <input v-model="displayName" class="ph-name-input" placeholder="昵称" placeholder-class="ph" />
            <text class="ph-email">{{ user.email }}</text>
          </view>
        </view>

        <view class="form card anim-fade-up" :style="{ animationDelay: '60ms' }">
          <view class="field">
            <text class="fl">用户名</text>
            <input v-model="username" class="fi" placeholder="选填" placeholder-class="ph" />
          </view>
          <view class="field">
            <text class="fl">头像链接</text>
            <input v-model="avatarUrl" class="fi" placeholder="可手动粘贴图片 URL" placeholder-class="ph" />
          </view>
          <view class="field col">
            <text class="fl">个人简介</text>
            <textarea v-model="bio" class="ta" placeholder="选填，介绍一下自己" placeholder-class="ph" />
          </view>
          <button class="btn-primary save" :disabled="saving" @click="save">
            {{ saving ? "保存中…" : "保存资料" }}
          </button>
        </view>

        <button class="btn-ghost logout anim-fade-up" :style="{ animationDelay: '120ms' }" @click="logout">
          退出登录
        </button>
      </block>

      <!-- 设置入口：放在资料卡片下方（应用级偏好，与登录态无关） -->
      <view class="set-row card lift anim-fade-up" hover-class="set-row-hover" @click="goSettings">
        <view class="sr-left">
          <OutlineIcon type="gear" :size="32" color="var(--text-2)" />
          <text class="sr-label">设置</text>
        </view>
        <view class="sr-right">
          <text class="sr-val">{{ isDark ? "深色" : "浅色" }}</text>
          <OutlineIcon type="arrow-right" :size="30" color="var(--text-2)" />
        </view>
      </view>

      <view class="bottom-pad" />
    </view>
  </scroll-view>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import BackgroundFX from "@/components/BackgroundFX.vue";
import { useUser, refreshProfile } from "@/store/user";
import { openAuth } from "@/store/nav";
import { updateProfile, uploadAvatar, signOut } from "@/api/auth";
import { isDark } from "@/utils/theme";

const user = useUser();

// 进入设置页（独立页面，可返回）
function goSettings() {
  uni.navigateTo({ url: "/pages/settings/settings" });
}

const displayName = ref("");
const username = ref("");
const bio = ref("");
const avatarUrl = ref("");
const saving = ref(false);

// 登录态变化 / 资料加载完成后，回填表单
watch(
  () => [user.loggedIn, user.profile],
  () => {
    if (user.loggedIn && user.profile) {
      displayName.value = user.profile.display_name || "";
      username.value = user.profile.username || "";
      bio.value = user.profile.bio || "";
      avatarUrl.value = user.profile.avatar_url || "";
    }
  },
  { immediate: true }
);

async function save() {
  saving.value = true;
  try {
    const r = await updateProfile({
      display_name: displayName.value.trim(),
      username: username.value.trim(),
      bio: bio.value.trim(),
      avatar_url: avatarUrl.value.trim(),
    });
    if (!r.ok) {
      uni.showToast({ title: r.error || "保存失败", icon: "none" });
      return;
    }
    await refreshProfile();
    uni.showToast({ title: "已保存", icon: "success" });
  } finally {
    saving.value = false;
  }
}

function chooseAvatar() {
  uni.chooseImage({
    count: 1,
    success: async (res: any) => {
      const path = res.tempFilePaths?.[0] || res.tempFiles?.[0]?.path;
      if (!path) return;
      const ext = (path.split(".").pop() || "png").toLowerCase();
      const url = await uploadAvatar(path, ext);
      if (url) {
        avatarUrl.value = url;
        uni.showToast({ title: "头像已更新", icon: "success" });
      } else {
        uni.showToast({ title: "上传失败，可手动粘贴链接", icon: "none" });
      }
    },
  });
}

async function logout() {
  uni.showModal({
    title: "退出登录",
    content: "确定退出当前账号？",
    success: async (r) => {
      if (r.confirm) {
        await signOut();
        uni.showToast({ title: "已退出", icon: "none" });
      }
    },
  });
}
</script>

<style scoped>
.view-scroll {
  height: 100%;
}
.pf {
  padding: 24rpx 24rpx 0;
}
.login-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  padding: 44rpx 32rpx;
}
.lp-avatar {
  width: 140rpx;
  height: 140rpx;
  border-radius: 50%;
  background: var(--card-2);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1rpx solid var(--border);
}
.lp-title {
  font-size: 32rpx;
  font-weight: 600;
}
.lp-sub {
  font-size: 24rpx;
  color: var(--text-2);
  text-align: center;
}
.lp-btn {
  margin-top: 16rpx;
  width: 100%;
}
.lp-tip {
  font-size: 21rpx;
  color: var(--text-2);
  text-align: center;
  line-height: 1.6;
  margin-top: 8rpx;
}

.profile-head {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 28rpx 24rpx;
}
.ph-avatar {
  position: relative;
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
  background: var(--card-2);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1rpx solid var(--border);
}
.ph-img {
  width: 100%;
  height: 100%;
}
.ph-cam {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  background: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3rpx solid #fff;
}
.ph-meta {
  flex: 1;
  min-width: 0;
}
.ph-name-input {
  font-size: 34rpx;
  font-weight: 700;
  height: 48rpx;
  line-height: 48rpx;
}
.ph-email {
  display: block;
  font-size: 24rpx;
  color: var(--text-2);
  margin-top: 8rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form {
  padding: 10rpx 24rpx;
}
.field {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid var(--border);
}
.field.col {
  flex-direction: column;
  align-items: stretch;
  gap: 12rpx;
}
.fl {
  width: 140rpx;
  font-size: 28rpx;
  color: var(--text-2);
  flex-shrink: 0;
}
.fi {
  flex: 1;
  font-size: 28rpx;
  text-align: right;
}
.ta {
  width: 100%;
  min-height: 140rpx;
  font-size: 28rpx;
  line-height: 1.6;
  background: var(--card-2);
  border-radius: var(--radius-sm);
  padding: 16rpx;
}
.ph {
  color: var(--text-2);
}
.save {
  margin-top: 28rpx;
}
.logout {
  width: 100%;
  margin-top: 16rpx;
}
.bottom-pad {
  /* 留出底部导航栏高度，避免末尾内容被 tab 栏遮挡 */
  height: 140rpx;
}

/* 设置入口行 */
.set-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26rpx 24rpx;
}
.set-row-hover {
  background: var(--card-2);
}
.sr-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.sr-label {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--text);
}
.sr-right {
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.sr-val {
  font-size: 26rpx;
  color: var(--text-2);
}
</style>
