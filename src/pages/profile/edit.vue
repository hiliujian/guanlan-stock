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
      <!-- 头像（点击弹出操作菜单：上传头像 / 设置头像框）：居中展示 -->
      <view class="ep-hero">
        <view class="ep-avatar" hover-class="ep-av-hover" @click="openAvatarMenu" role="button" aria-label="头像设置">
          <UserAvatar :url="avatarUrl" :seed="seedName" :size="148" :frame="frame" />
          <view class="ep-cam">
            <OutlineIcon v-if="!uploading" type="camera" :size="20" color="#fff" />
            <view v-else class="ep-spin" />
          </view>
        </view>
        <text class="ep-hero-tip">点击头像可更换照片</text>
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

        <!-- 个人简介：本机存储、不写数据库；多行输入框，最多 50 字；
             空值保存即清空简介（与「我的」页空态引导一致）。占位用 BIO_PLACEHOLDER。 -->
        <view class="sec-row sec-row-col">
          <view class="sec-row-left">
            <view class="sec-row-text">
              <text class="sec-row-label">个人简介</text>
            </view>
          </view>
          <textarea
            v-model="bioDraft"
            class="sec-field-ta"
            :placeholder="BIO_PLACEHOLDER"
            placeholder-class="ep-ph"
            :maxlength="BIO_MAX"
          />
          <text class="ep-count">{{ bioDraft.length }}/{{ BIO_MAX }}</text>
        </view>

        <!-- 保存资料：组内最后一行，铺满白卡；形态与账号安全页「注销账号」按钮完全一致（仅主色绿 vs 危险红） -->
        <view class="sec-save-row">
          <button class="btn-primary" :disabled="saving" @click="save">
            <text>{{ saving ? "保存中…" : "保存资料" }}</text>
          </button>
        </view>
      </view>

      <!-- 头像框选择弹窗：从「头像设置」菜单点「设置头像框」进入，横向展示全部可选框
           （头像预览 + 名称），选中即写入并自动关闭；选中态用主色高亮 + 对勾标记。 -->
      <BottomSheet v-model="frameSheetVisible" title="选择头像框">
        <scroll-view class="af-scroll" scroll-x :show-scrollbar="false">
          <view class="af-row">
            <view
              v-for="f in AVATAR_FRAMES"
              :key="f.id || 'none'"
              class="af-opt"
              :class="{ on: frame === f.id }"
              role="button"
              :aria-label="f.name"
              @click="selectFrame(f)"
            >
              <UserAvatar :url="avatarUrl" :seed="seedName" :size="100" :frame="f.id" />
              <text class="af-name">{{ f.name }}</text>
              <view v-if="frame === f.id" class="af-check">
                <OutlineIcon type="check" :size="22" color="#fff" />
              </view>
            </view>
          </view>
        </scroll-view>
      </BottomSheet>

      <!-- 头像设置菜单：点击头像弹出，含「上传头像」「设置头像框」两项操作 -->
      <BottomSheet v-model="avatarMenuVisible" title="头像设置">
        <view class="am-list">
          <view class="am-item" role="button" hover-class="am-item-hover" @click="onPickPhoto">
            <view class="am-ico">
              <OutlineIcon type="camera" :size="26" color="var(--primary)" />
            </view>
            <text class="am-label">上传头像</text>
          </view>
          <view class="am-item" role="button" hover-class="am-item-hover" @click="onPickFrame">
            <view class="am-ico">
              <svg class="am-frame-ico" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="2" />
                <rect x="8" y="8" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="2" />
              </svg>
            </view>
            <text class="am-label">设置头像框</text>
          </view>
        </view>
      </BottomSheet>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import AvatarCropper from "@/components/AvatarCropper.vue";
import UserAvatar from "@/components/UserAvatar.vue";
import BottomSheet from "@/components/BottomSheet.vue";
import { useUser, refreshProfile } from "@/store/user";
import { useBio, setBio, BIO_MAX, BIO_PLACEHOLDER } from "@/store/bio";
import { updateProfile, uploadAvatar } from "@/api/auth";
import { avatarSeed } from "@/utils/avatar";
import { AVATAR_FRAMES, type AvatarFrameDef } from "@/utils/avatarFrame";
import { usePageGuard } from "@/store/guard";

const user = useUser();
// 全局页面守卫：个人资料页未对游客开放 + 未登录 → 跳转登录页
usePageGuard("/pages/profile/edit");

const displayName = ref("");
// 个人简介：本机存储、不写数据库；用 bioDraft 承接编辑态，保存时 setBio 落本机
const bio = useBio();
const bioDraft = ref(bio.value);
const username = ref("");
const saving = ref(false);
const avatarUrl = ref("");
const uploading = ref(false);
const frame = ref(""); // 头像框 id（'' = 无边框）

// 裁剪弹窗状态
const cropperVisible = ref(false);
const cropperSrc = ref("");

// 字头像种子：用户名（不可变身份），与社区页等其他场景共用
const seedName = computed(() => avatarSeed(username.value) || "我");

// 头像框选择弹窗状态
const frameSheetVisible = ref(false);
const frameSaving = ref(false);

// 头像操作菜单：点头像弹出，含「上传头像」「设置头像框」两项操作
const avatarMenuVisible = ref(false);
function openAvatarMenu() {
  if (uploading.value) return;
  avatarMenuVisible.value = true;
}
function onPickPhoto() {
  avatarMenuVisible.value = false;
  chooseAvatar();
}
function onPickFrame() {
  avatarMenuVisible.value = false;
  frameSheetVisible.value = true;
}
// 选中某头像框：立即写入并自动关闭弹窗，且直接提交到后端（无需等待「保存资料」）
async function selectFrame(f: AvatarFrameDef) {
  if (frameSaving.value) return;
  frameSaving.value = true;
  frame.value = f.id;
  frameSheetVisible.value = false;
  try {
    const r = await updateProfile({ avatar_frame: f.id });
    if (!r.ok) {
      uni.showToast({ title: r.error || "设置失败", icon: "none" });
      return;
    }
    await refreshProfile();
    uni.showToast({ title: "头像框已设置", icon: "success" });
  } finally {
    frameSaving.value = false;
  }
}

watch(
  () => [user.loggedIn, user.profile],
  () => {
    if (user.loggedIn && user.profile) {
      displayName.value = user.profile.display_name || "";
      username.value = user.profile.username || "";
      bioDraft.value = bio.value;
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
    // 个人简介不写数据库，仅落本机存储（与「我的」页空态引导一致）
    setBio(bioDraft.value);
    const r = await updateProfile({
      display_name: dn,
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

/* 头像设置菜单：两行操作（上传头像 / 设置头像框），图标圆形徽标 + 文字，主色按压反馈 */
.am-list {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 10rpx 0 4rpx;
}
.am-item {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 24rpx 16rpx;
  border-radius: var(--radius);
  transition: background 0.18s ease;
}
.am-item-hover {
  background: var(--card-2);
}
.am-ico {
  flex: none;
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: var(--primary-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
}
.am-frame-ico {
  width: 28rpx;
  height: 28rpx;
  color: var(--primary);
}
.am-label {
  font-size: var(--font-md);
  color: var(--text);
}

/* 头像框弹窗：横向滚动的一排选项，选中态加主色高亮边框 + 对勾标记 */
.af-scroll {
  width: 100%;
  white-space: nowrap;
}
.af-row {
  display: inline-flex;
  gap: 22rpx;
  padding: 18rpx 4rpx 8rpx;
}
.af-opt {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  padding: 12rpx;
  border-radius: var(--radius);
  background: var(--card-2);
  box-shadow: inset 0 0 0 1rpx var(--border);
  transition: box-shadow 0.18s ease, transform 0.18s ease;
}
.af-opt:active {
  transform: scale(0.96);
}
.af-opt.on {
  box-shadow: inset 0 0 0 2rpx var(--primary), var(--shadow-primary-1);
}
.af-name {
  font-size: var(--font-xs);
  color: var(--text-2);
}
.af-opt.on .af-name {
  color: var(--primary);
}
/* 选中态对勾角标 */
.af-check {
  position: absolute;
  right: 8rpx;
  top: 8rpx;
  width: 34rpx;
  height: 34rpx;
  border-radius: 50%;
  background: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-primary-1);
}

/* 基本资料分组：与安全页 .sec-group 视觉一致（整块白卡 + 顶部 16rpx 背景色分隔带 + 行内间距分隔） */
.sec-group {
  padding: 8rpx 0 16rpx;
  background: var(--card);
  border-top: 16rpx solid var(--bg);
}
/* 本分组所有文本统一常规字重（font-weight:400），覆盖浏览器/小程序对
   input/textarea/button 等表单控件的默认字重，确保「基本资料」内无一加粗。 */
.sec-group-title {
  display: block;
  font-size: var(--font-sm);
  font-weight: 400;
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
  font-weight: 400;
  color: var(--text);
}
/* 行内表单控件：右侧与左侧标签对齐，右对齐文本，与 sec-row 节奏一致 */
.sec-field-input {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
  font-size: var(--font-md);
  font-weight: 400;
  text-align: right;
  color: var(--text);
}
.sec-field-value {
  flex: 1;
  min-width: 0;
  margin-left: 20rpx;
  font-size: var(--font-md);
  font-weight: 400;
  text-align: right;
  color: var(--text-2);
}
.sec-field-ta {
  width: 100%;
  box-sizing: border-box;
  min-height: 140rpx;
  font-size: var(--font-md);
  font-weight: 400;
  line-height: 1.6;
  background: var(--card-2);
  border-radius: var(--radius-sm);
  padding: 16rpx;
  color: var(--text);
}
.ep-count {
  align-self: flex-end;
  font-size: var(--font-xs);
  font-weight: 400;
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
  font-weight: 400;
}
</style>