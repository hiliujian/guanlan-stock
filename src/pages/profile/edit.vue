<template>
  <view class="app-shell ep-page page-col">
    <!-- 自定义导航头（navigationStyle:custom，需自带返回） -->
    <view class="ep-head sticky-head">
      <view class="ep-back nav-back" hover-class="nav-back-hover" @click="back" role="button" aria-label="返回">
        <OutlineIcon type="arrow-left" :size="30" color="var(--text)" />
      </view>
      <text class="ep-title nav-title">个人资料</text>
      <view class="ep-head-ph nav-ph" />
    </view>

    <scroll-view class="ep-scroll" scroll-y>
      <!-- 头像（点击更换）：居中展示 -->
      <view class="ep-hero">
        <view class="ep-avatar" hover-class="ep-av-hover" @click="chooseAvatar" role="button" aria-label="更换头像">
          <UserAvatar :url="avatarUrl" :seed="seedName" :size="148" :frame="frame" />
          <view class="ep-cam">
            <OutlineIcon v-if="!uploading" type="camera" :size="20" color="#fff" />
            <view v-else class="ep-spin" />
          </view>
        </view>
        <text class="ep-hero-tip">点击头像可更换</text>
      </view>

      <!-- 头像裁剪弹窗：选图后弹出，确认后上传 -->
      <AvatarCropper
        v-model="cropperVisible"
        :src="cropperSrc"
        @confirm="onCropped"
      />

      <!-- 基本资料（与账号安全页 sec-group 结构/样式一致：整块白卡 + 标题 + 行） -->
      <view class="sec-group">
        <text class="sec-group-title">基本资料</text>

        <!-- 昵称 -->
        <view class="sec-row">
          <view class="sec-row-left">
            <view class="sec-row-text">
              <text class="sec-row-label">昵称</text>
            </view>
          </view>
          <input v-model="displayName" class="sec-field-input" placeholder="输入昵称" placeholder-class="ep-ph" maxlength="20" />
        </view>

        <!-- 用户名：唯一且不可修改；空则保持空白展示，不隐藏、不加占位 -->
        <view class="sec-row">
          <view class="sec-row-left">
            <view class="sec-row-text">
              <text class="sec-row-label">用户名</text>
            </view>
          </view>
          <text class="sec-field-value">{{ username }}</text>
        </view>

        <!-- 个人简介：多行 -->
        <view class="sec-row sec-row-col">
          <view class="sec-row-left">
            <view class="sec-row-text">
              <text class="sec-row-label">个人简介</text>
            </view>
          </view>
          <textarea
            v-model="bio"
            class="sec-field-ta"
            placeholder="选填，介绍一下自己"
            placeholder-class="ep-ph"
            maxlength="200"
          />
          <text class="ep-count">{{ bio.length }}/200</text>
        </view>

        <!-- 保存资料：组内最后一行，铺满白卡；形态与账号安全页「注销账号」按钮完全一致（仅主色绿 vs 危险红） -->
        <view class="sec-save-row">
          <button class="btn-primary" :disabled="saving" @click="save">
            <text>{{ saving ? "保存中…" : "保存资料" }}</text>
          </button>
        </view>
      </view>

      <!-- 头像框：点击选择，下方用「当前头像 + 该框」实时预览；保存时随资料一起写入 profiles.avatar_frame -->
      <view class="sec-group">
        <text class="sec-group-title">头像框</text>
        <view class="ep-frames">
          <view
            v-for="f in AVATAR_FRAMES"
            :key="f.id || 'none'"
            class="ep-frame"
            :class="{ on: frame === f.id }"
            role="button"
            :aria-label="f.name"
            @click="frame = f.id"
          >
            <UserAvatar :url="framePreviewUrl" :seed="framePreviewSeed" :size="84" :frame="f.id" />
            <text class="ep-frame-name">{{ f.name }}</text>
          </view>
        </view>
        <text class="ep-frame-tip">{{ currentFrameDesc }}</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import AvatarCropper from "@/components/AvatarCropper.vue";
import UserAvatar from "@/components/UserAvatar.vue";
import { useUser, refreshProfile } from "@/store/user";
import { updateProfile, uploadAvatar } from "@/api/auth";
import { avatarSeed } from "@/utils/avatar";
import { AVATAR_FRAMES } from "@/utils/avatarFrame";
import { usePageGuard } from "@/store/guard";

const user = useUser();
// 全局页面守卫：个人资料页未对游客开放 + 未登录 → 跳转登录页
usePageGuard("/pages/profile/edit");

const displayName = ref("");
const username = ref("");
const bio = ref("");
const saving = ref(false);
const avatarUrl = ref("");
const uploading = ref(false);
const frame = ref(""); // 头像框 id（'' = 无边框）

// 裁剪弹窗状态
const cropperVisible = ref(false);
const cropperSrc = ref("");

// 字头像种子：用户名（不可变身份），与社区页等其他场景共用
const seedName = computed(() => avatarSeed(username.value) || "我");

// 头像框选择器的实时预览：复用当前头像（或字头像），切换框时下方小样同步变化
const framePreviewUrl = computed(() => avatarUrl.value);
const framePreviewSeed = computed(() => seedName.value);
const currentFrameDesc = computed(
  () => AVATAR_FRAMES.find((f) => f.id === frame.value)?.desc || ""
);

watch(
  () => [user.loggedIn, user.profile],
  () => {
    if (user.loggedIn && user.profile) {
      displayName.value = user.profile.display_name || "";
      username.value = user.profile.username || "";
      bio.value = user.profile.bio || "";
      avatarUrl.value = user.profile.avatar_url || "";
      frame.value = user.profile.avatar_frame || "";
    } else {
      avatarUrl.value = "";
      frame.value = "";
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
      avatar_frame: frame.value,
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
.ep-scroll {
  flex: 1;
  height: 100%;
  box-sizing: border-box;
}

.ep-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  padding: 30rpx 20rpx 26rpx;
  background: linear-gradient(135deg, rgba(7, 193, 96, 0.16), rgba(7, 193, 96, 0.04) 60%, transparent), var(--card);
}
.ep-avatar {
  position: relative;
  flex: none;
  width: 148rpx;
  height: 148rpx;
  border-radius: 50%;
  border: 3rpx solid var(--card);
  box-shadow: 0 0 0 6rpx var(--primary-soft), var(--shadow-3);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.18s ease;
}
.ep-av-hover {
  transform: scale(0.97);
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
  box-shadow: var(--shadow-primary-1);
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
  font-size: var(--font-xs);
  color: var(--text-2);
}

/* 头像框选择器：横向滚动的一排小样，选中态加主色高亮边框 */
.ep-frames {
  display: flex;
  flex-wrap: wrap;
  gap: 22rpx;
  padding: 18rpx 20rpx 6rpx;
}
.ep-frame {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx;
  border-radius: var(--radius);
  background: var(--card-2);
  box-shadow: inset 0 0 0 1rpx var(--border);
  transition: box-shadow 0.18s ease, transform 0.18s ease;
}
.ep-frame.on {
  box-shadow: inset 0 0 0 2rpx var(--primary), var(--shadow-primary-1);
}
.ep-frame:active {
  transform: scale(0.96);
}
.ep-frame-name {
  font-size: var(--font-xs);
  color: var(--text-2);
}
.ep-frame.on .ep-frame-name {
  color: var(--primary);
}
.ep-frame-tip {
  display: block;
  padding: 4rpx 20rpx 14rpx;
  font-size: var(--font-xs);
  color: var(--text-2);
}

/* 基本资料分组：与安全页 .sec-group 视觉一致（整块白卡 + 顶部 16rpx 背景色分隔带 + 行内间距分隔） */
.sec-group {
  padding: 8rpx 0 16rpx;
  background: var(--card);
  border-top: 16rpx solid var(--bg);
}
.sec-group-title {
  display: block;
  font-size: var(--font-sm);
  color: var(--text-3);
  margin: 14rpx 20rpx 6rpx;
}
.sec-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx;
  transition: background 0.18s ease;
}
.sec-row-col {
  flex-direction: column;
  align-items: stretch;
  gap: 12rpx;
}
.sec-row-left {
  display: flex;
  align-items: center;
  gap: 18rpx;
  min-width: 0;
  flex: 1;
}
.sec-row-text {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}
.sec-row-label {
  font-size: var(--font-md);
  color: var(--text);
}
/* 行内表单控件：右侧与左侧标签对齐，右对齐文本，与 sec-row 节奏一致 */
.sec-field-input {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
  font-size: var(--font-md);
  text-align: right;
  color: var(--text);
}
.sec-field-value {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
  font-size: var(--font-md);
  text-align: right;
  color: var(--text-2);
}
.sec-field-ta {
  width: 100%;
  box-sizing: border-box;
  min-height: 140rpx;
  font-size: var(--font-md);
  line-height: 1.6;
  background: var(--card-2);
  border-radius: var(--radius-sm);
  padding: 16rpx;
  color: var(--text);
}
.ep-count {
  align-self: flex-end;
  font-size: var(--font-xs);
  color: var(--text-2);
  margin-top: -6rpx;
}
.ep-ph {
  color: var(--text-2);
}

/* 保存按钮容器：与账号安全页 .sec-danger-zone 的按钮容器形态一致（左右 20rpx 内衬、顶部 8rpx，
   底部留白由 .sec-group 的 16rpx 提供）。
   按钮显式 display:block + width:100%，与「注销账号」(.btn-danger) 完全一致：
   仅按钮颜色不同（主色绿 vs 危险红），形状 / 高度（72rpx 药丸）/ 间距 / 宽度完全相同。 */
.sec-save-row {
  padding: 8rpx 20rpx 0;
}
.sec-save-row .btn-primary {
  display: block;
  width: 100%;
}
</style>