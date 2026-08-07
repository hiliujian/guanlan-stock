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
      <!-- 头像（点击更换）：居中展示 -->
      <view class="card ep-hero anim-fade-up">
        <view class="ep-avatar" hover-class="ep-av-hover" @click="chooseAvatar" role="button" aria-label="更换头像">
          <image v-if="avatarUrl" :src="avatarUrl" class="ep-av-img" mode="aspectFill" />
          <text v-else class="ep-av-char" :style="{ background: avatarBg }">{{ ch }}</text>
          <view class="ep-cam">
            <OutlineIcon v-if="!uploading" type="camera" :size="20" color="#fff" />
            <view v-else class="ep-spin" />
          </view>
        </view>
        <text class="ep-hero-tip">点击头像可裁剪调整</text>
      </view>

      <!-- 头像裁剪弹窗 -->
      <AvatarCropper
        v-model="cropperVisible"
        :src="cropperSrc"
        @confirm="onCropped"
      />

      <!-- 基本资料（含保存按钮） -->
      <view class="card ep-card anim-fade-up" :style="{ animationDelay: '60ms' }">
        <text class="ep-group-title">基本资料</text>

        <view class="ep-field">
          <text class="ep-fl">昵称</text>
          <input v-model="displayName" class="ep-fi" placeholder="输入昵称" placeholder-class="ep-ph" maxlength="20" />
        </view>

        <!-- 用户名：唯一且不可修改；空则保持空白展示，不隐藏、不加占位 -->
        <view class="ep-field read">
          <text class="ep-fl">用户名</text>
          <text class="ep-fr">{{ username }}</text>
        </view>

        <view class="ep-field col">
          <text class="ep-fl">个人简介</text>
          <textarea
            v-model="bio"
            class="ep-ta"
            placeholder="选填，介绍一下自己"
            placeholder-class="ep-ph"
            maxlength="200"
          />
          <text class="ep-count">{{ bio.length }}/200</text>
        </view>

        <button class="btn-primary ep-save" :disabled="saving" @click="save">
          <text>{{ saving ? "保存中…" : "保存资料" }}</text>
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
import AvatarCropper from "@/components/AvatarCropper.vue";
import { useUser, refreshProfile } from "@/store/user";
import { updateProfile, uploadAvatar } from "@/api/auth";
import { avatarGradient, avatarChar, avatarSeed } from "@/utils/avatar";

const user = useUser();

const displayName = ref("");
const username = ref("");
const bio = ref("");
const saving = ref(false);
const avatarUrl = ref("");
const uploading = ref(false);

// 裁剪弹窗状态
const cropperVisible = ref(false);
const cropperSrc = ref("");

// 默认头像（底色 + 首字）以「不变身份」为种子：昵称修改不改变，
// 仅当用户自行上传图片头像时才替换。
const seedName = computed(() => avatarSeed(username.value) || "我");
const avatarBg = computed(() => avatarGradient(seedName.value));
const ch = computed(() => avatarChar(seedName.value));

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

/**
 * 流程：选图 → 弹出裁剪弹窗 → 用户调整 → 确认后上传
 * - 选图后不入上传，先把临时路径传入弹窗预览与裁剪
 * - 裁剪回调拿到 dataURL/本地路径后，再走 uploadAvatar + updateProfile
 */
function chooseAvatar() {
  if (uploading.value) return;
  uni.chooseImage({
    count: 1,
    sizeType: ["compressed"],
    sourceType: ["album", "camera"],
    success: (res: any) => {
      const path = res.tempFilePaths?.[0] || res.tempFiles?.[0]?.path;
      if (!path) return;
      cropperSrc.value = path;
      cropperVisible.value = true;
    },
    fail: () => {
      /* 用户取消选择，静默 */
    },
  });
}

async function onCropped(payload: { dataURL: string }) {
  const finalPath = payload.dataURL;
  if (!finalPath) return;
  uploading.value = true;
  try {
    const r = await uploadAvatar(finalPath);
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
  } finally {
    uploading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    const dn = displayName.value.trim();
    if (!dn) {
      uni.showToast({ title: "昵称不能为空", icon: "none" });
      return;
    }
    const r = await updateProfile({
      display_name: dn,
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
  height: 88rpx;
  padding: 0 12rpx;
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

/* 头像卡：头像居中展示（紧凑留白） */
.ep-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  padding: 30rpx 24rpx 26rpx;
  background: linear-gradient(135deg, rgba(7, 193, 96, 0.16), rgba(7, 193, 96, 0.04) 60%, transparent);
}
.ep-avatar {
  position: relative;
  flex: none;
  width: 148rpx;
  height: 148rpx;
  border-radius: 50%;
  background: var(--card-2);
  border: 3rpx solid var(--card);
  box-shadow: 0 0 0 6rpx rgba(7, 193, 96, 0.16), 0 10rpx 24rpx rgba(0, 0, 0, 0.22);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.18s ease;
}
.ep-av-hover {
  transform: scale(0.97);
}
.ep-av-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}
.ep-av-char {
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
  right: 6rpx;
  bottom: 6rpx;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3rpx solid #fff;
  box-shadow: 0 4rpx 10rpx rgba(7, 193, 96, 0.4);
}
.ep-spin {
  width: 26rpx;
  height: 26rpx;
  border: 4rpx solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.ep-hero-tip {
  display: block;
  font-size: 22rpx;
  color: var(--text-2);
}

/* 基本资料表单：分组 + 分行，与「账号安全」视觉一致 */
.ep-card {
  margin-top: 20rpx;
  padding: 8rpx 26rpx 10rpx;
}
.ep-group-title {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: 1rpx;
  margin: 12rpx 2rpx 4rpx;
}
.ep-field {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 26rpx 0;
  border-bottom: 1rpx solid var(--border);
}
.ep-field.col {
  flex-direction: column;
  align-items: stretch;
  gap: 14rpx;
}
.ep-field.read {
  color: var(--text-2);
}
.ep-field:last-child {
  border-bottom: none;
}
.ep-fl {
  flex: none;
  width: 130rpx;
  font-size: 28rpx;
  color: var(--text-2);
}
.ep-fi {
  flex: 1;
  font-size: 28rpx;
  text-align: right;
  color: var(--text);
}
.ep-fr {
  flex: 1;
  font-size: 28rpx;
  text-align: right;
  color: var(--text-2);
}
.ep-ta {
  width: 100%;
  box-sizing: border-box;
  min-height: 140rpx;
  font-size: 28rpx;
  line-height: 1.6;
  background: var(--card-2);
  border-radius: var(--radius-sm);
  padding: 16rpx;
  color: var(--text);
}
.ep-count {
  align-self: flex-end;
  font-size: 20rpx;
  color: var(--text-2);
  margin-top: -6rpx;
}
.ep-ph {
  color: var(--text-2);
}

/* 保存按钮：位于基本资料卡片底部，上下留白均衡 */
.ep-save {
  width: 100%;
  margin: 30rpx 0 22rpx;
}
.bottom-pad {
  height: 60rpx;
}
</style>