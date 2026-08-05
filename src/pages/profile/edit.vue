<template>
  <view class="app-shell ep-page">
    <BackgroundFX />

    <!-- 自定义导航头（navigationStyle:custom，需自带返回） -->
    <view class="ep-head">
      <view class="ep-back" hover-class="ep-back-hover" @click="back" role="button" aria-label="返回">
        <OutlineIcon type="arrow-left" :size="44" color="var(--text)" />
      </view>
      <text class="ep-title">个人资料</text>
      <view class="ep-head-ph" />
    </view>

    <scroll-view class="ep-scroll" scroll-y>
      <!-- 头像 -->
      <view class="ep-avatar-wrap card anim-fade-up">
        <view class="ep-avatar" hover-class="ep-avatar-hover" @click="chooseAvatar" role="button" aria-label="上传头像">
          <image v-if="avatarUrl" :src="avatarUrl" class="ep-avatar-img" mode="aspectFill" />
          <text v-else class="ep-avatar-char" :style="{ background: avatarBg }">{{ ch }}</text>
          <view class="ep-cam">
            <OutlineIcon v-if="!uploading" type="camera" :size="22" color="#fff" />
            <view v-else class="ep-spin" />
          </view>
        </view>
        <text class="ep-avatar-tip">点击上传头像（JPG / PNG / WebP，不超过 2MB）</text>
      </view>

      <!-- 资料表单 -->
      <view class="form card anim-fade-up" :style="{ animationDelay: '60ms' }">
        <view class="field">
          <text class="fl">昵称</text>
          <input v-model="displayName" class="fi" placeholder="昵称" placeholder-class="ph" maxlength="20" />
        </view>
        <view class="field read">
          <text class="fl">用户名</text>
          <text class="fr">{{ username || "—" }}</text>
        </view>
        <view class="field read">
          <text class="fl">邮箱</text>
          <text class="fr">{{ user.email || "—" }}</text>
        </view>
        <view class="field col">
          <text class="fl">个人简介</text>
          <textarea v-model="bio" class="ta" placeholder="选填，介绍一下自己" placeholder-class="ph" maxlength="200" />
        </view>
        <button class="btn-primary save" :disabled="saving" @click="save">
          {{ saving ? "保存中…" : "保存资料" }}
        </button>
      </view>

      <view class="bottom-pad" />
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import BackgroundFX from "@/components/BackgroundFX.vue";
import { useUser, refreshProfile } from "@/store/user";
import { updateProfile, uploadAvatar } from "@/api/auth";
import { avatarGradient, avatarChar } from "@/utils/avatar";

const user = useUser();

const displayName = ref("");
const username = ref("");
const bio = ref("");
const saving = ref(false);
const avatarUrl = ref("");
const uploading = ref(false);

const avatarName = computed(() => displayName.value || username.value || user.email || "我");
const avatarBg = computed(() => avatarGradient(avatarName.value));
const ch = computed(() => avatarChar(avatarName.value));

watch(
  () => [user.loggedIn, user.profile],
  () => {
    if (user.loggedIn && user.profile) {
      displayName.value = user.profile.display_name || "";
      username.value = user.profile.username || "";
      bio.value = user.profile.bio || "";
      avatarUrl.value = user.profile.avatar_url || "";
    } else {
      avatarUrl.value = "";
    }
  },
  { immediate: true }
);

function back() {
  uni.navigateBack({ delta: 1 });
}

function chooseAvatar() {
  if (uploading.value) return;
  uni.chooseImage({
    count: 1,
    sizeType: ["compressed"],
    sourceType: ["album", "camera"],
    success: async (res: any) => {
      const path = res.tempFilePaths?.[0] || res.tempFiles?.[0]?.path;
      if (!path) return;
      uploading.value = true;
      const r = await uploadAvatar(path);
      uploading.value = false;
      if (r.url) {
        avatarUrl.value = r.url;
        const s = await updateProfile({ avatar_url: r.url });
        if (!s.ok) {
          uni.showToast({ title: s.error || "保存失败", icon: "none" });
          return;
        }
        await refreshProfile();
        uni.showToast({ title: "头像已更新", icon: "success" });
      } else {
        uni.showToast({ title: r.error || "上传失败", icon: "none" });
      }
    },
    fail: () => {
      /* 用户取消选择，静默 */
    },
  });
}

async function save() {
  saving.value = true;
  try {
    const r = await updateProfile({
      display_name: displayName.value.trim(),
      bio: bio.value.trim(),
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
</script>

<style scoped>
.ep-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  overflow-x: hidden;
}
.ep-head {
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
.ep-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  margin-left: 6rpx;
  transition: background 0.18s ease;
}
.ep-back-hover {
  background: var(--card-2);
}
.ep-title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--text);
}
.ep-head-ph {
  width: 72rpx;
}
.ep-scroll {
  flex: 1;
  height: 100%;
  box-sizing: border-box;
  padding: 24rpx 24rpx 0;
}

.ep-avatar-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  padding: 40rpx 24rpx;
}
.ep-avatar {
  position: relative;
  width: 152rpx;
  height: 152rpx;
  border-radius: 50%;
  background: var(--card-2);
  border: 1rpx solid var(--border);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 22rpx rgba(0, 0, 0, 0.25);
}
.ep-avatar-hover {
  transform: scale(0.97);
}
.ep-avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}
.ep-avatar-char {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #fff;
  font-size: 64rpx;
}
.ep-cam {
  position: absolute;
  right: 4rpx;
  bottom: 4rpx;
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3rpx solid #fff;
}
.ep-spin {
  width: 28rpx;
  height: 28rpx;
  border: 4rpx solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.ep-avatar-tip {
  font-size: 22rpx;
  color: var(--text-2);
}

.form {
  padding: 10rpx 24rpx;
  margin-top: 20rpx;
}
.field {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid var(--border);
}
.field.col {
  flex-direction: column;
  align-items: stretch;
  gap: 12rpx;
}
.field.read {
  color: var(--text-2);
}
.fl {
  width: 130rpx;
  font-size: 28rpx;
  color: var(--text-2);
  flex-shrink: 0;
}
.fi {
  flex: 1;
  font-size: 28rpx;
  text-align: right;
  color: var(--text);
}
.fr {
  flex: 1;
  font-size: 28rpx;
  text-align: right;
  color: var(--text-2);
}
.ta {
  width: 100%;
  min-height: 150rpx;
  font-size: 28rpx;
  line-height: 1.6;
  background: var(--card-2);
  border-radius: var(--radius-sm);
  padding: 16rpx;
  color: var(--text);
}
.ph {
  color: var(--text-2);
}
.save {
  margin-top: 28rpx;
}
.bottom-pad {
  height: 60rpx;
}
</style>
