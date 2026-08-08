<template>
  <view class="pf-root">
    <scroll-view class="view-scroll" scroll-y>
    <view class="pf">
      <BackgroundFX />

      <!-- 顶部个人卡片：登录态点击进「个人资料」，未登录点击去登录 -->
      <view
        class="pf-head card anim-fade-up"
        :class="{ tappable: !user.loggedIn }"
        hover-class="pf-head-hover"
        role="button"
        :aria-label="user.loggedIn ? '编辑个人资料' : '登录或注册'"
        @click="onHeaderTap"
      >
        <view class="pf-avatar">
          <image
            v-if="user.loggedIn && avatarUrl"
            :src="avatarUrl"
            class="pf-avatar-img"
            mode="aspectFill"
            @click.stop="previewAvatar"
          />
          <text v-else class="pf-avatar-char" :style="{ background: avatarBg }">{{ avatarChar }}</text>
        </view>
        <view class="pf-id">
          <view class="pf-name-row">
            <text class="pf-name">{{ nameText }}</text>
            <view v-if="user.loggedIn" class="pf-lvtag" @click.stop="goLevel" role="button" aria-label="查看我的等级">
              <LevelTag :level="userLevel" />
            </view>
          </view>
          <text class="pf-sub">{{ subText }}</text>
        </view>
        <OutlineIcon v-if="user.loggedIn" type="arrow-right" :size="34" color="var(--text-2)" />
        <view v-else class="pf-login-btn">登录 / 注册</view>
      </view>

      <!-- 数据概览：仅登录后展示（自选股 / 我的帖子 / 赞过 均为用户私有数据） -->
      <view v-if="showStats" class="pf-stats card anim-fade-up" :style="{ animationDelay: '40ms' }">
        <view
          v-if="isTabEnabled('watch')"
          class="pf-stat"
          hover-class="pf-stat-hover"
          role="button"
          aria-label="我的自选"
          @click="goWatch"
        >
          <text class="pf-stat-num">{{ watchCount }}</text>
          <text class="pf-stat-lab">自选股</text>
        </view>
        <view v-if="isTabEnabled('watch') && isTabEnabled('community')" class="pf-divider" />
        <view
          v-if="isTabEnabled('community')"
          class="pf-stat"
          hover-class="pf-stat-hover"
          role="button"
          aria-label="我的帖子"
          @click="goCommunity"
        >
          <text class="pf-stat-num">{{ postCount }}</text>
          <text class="pf-stat-lab">我的帖子</text>
        </view>
        <view v-if="isTabEnabled('community')" class="pf-divider" />
        <view
          v-if="isTabEnabled('community')"
          class="pf-stat"
          hover-class="pf-stat-hover"
          role="button"
          aria-label="我赞过的"
          @click="goCommunity"
        >
          <text class="pf-stat-num">{{ likedCount }}</text>
          <text class="pf-stat-lab">赞过</text>
        </view>
      </view>

      <!-- 菜单分组 -->
      <view v-for="g in menuGroups" :key="g.title" class="pf-group">
        <text class="pf-group-title">{{ g.title }}</text>
        <view class="card">
          <view
            v-for="(it, idx) in g.items"
            :key="it.act"
            class="pf-row"
            :class="{ 'pf-row-last': idx === g.items.length - 1 }"
            hover-class="pf-row-hover"
            role="button"
            :aria-label="it.label"
            @click="onMenu(it.act)"
          >
            <view class="pf-row-left">
              <view class="pf-row-ic"><OutlineIcon :type="it.icon" :size="30" color="var(--text-2)" /></view>
              <text class="pf-row-label">{{ it.label }}</text>
            </view>
            <OutlineIcon type="arrow-right" :size="28" color="var(--text-2)" />
          </view>
        </view>
      </view>

      <!-- 账号操作 -->
      <view v-if="user.loggedIn" class="pf-group">
        <view class="card">
          <view
            class="pf-row pf-row-danger"
            hover-class="pf-row-hover"
            role="button"
            aria-label="退出登录"
            @click="logout"
          >
            <view class="pf-row-left">
              <view class="pf-row-ic"><OutlineIcon type="close" :size="30" color="var(--danger)" /></view>
              <text class="pf-row-label danger">退出登录</text>
            </view>
            <OutlineIcon type="arrow-right" :size="28" color="var(--text-2)" />
          </view>
        </view>
      </view>
      <view v-else class="pf-hint anim-fade-up">登录后同步自选股与云端资料</view>

      <view class="bottom-pad" />
    </view>
  </scroll-view>

  <!-- 退出登录确认：复用全局统一 ConfirmDialog 样式与交互 -->
  <ConfirmDialog
    v-model="showLogout"
    title="退出登录"
    message="确定退出当前账号？"
    confirm-text="退出"
    cancel-text="取消"
    icon="close"
    variant="danger"
    @confirm="confirmLogout"
  />
  </view>

</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";
import BackgroundFX from "@/components/BackgroundFX.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import LevelTag from "@/components/LevelTag.vue";
import { useUser } from "@/store/user";
import { openAuth, goTab } from "@/store/nav";
import { useWatchlist } from "@/store/watchlist";
import { useCommunity } from "@/store/community";
import { isTabEnabled } from "@/store/appConfig";
import { getMyName } from "@/store/identity";
import { avatarGradient, avatarChar as avatarCharFn, avatarSeed } from "@/utils/avatar";
import { signOut } from "@/api/auth";

const user = useUser();
const watch = useWatchlist();
const { posts: communityPosts, load: loadCommunity } = useCommunity();

// 声明可接收的自定义事件：父级（pages/index）在 watch 激活时向动态组件绑定 open-market，
// KeepAlive 缓存其它视图后仍可能把该监听透传到本组件。声明为 emit 后 Vue 按自定义事件
// 处理（而非尝试继承到 DOM 根节点），避免「extraneous non-emits」告警。本视图自身从不触发。
defineEmits<{ (e: "open-market", payload: { code: string; market: string }): void }>();

const nameText = computed(() =>
  user.loggedIn ? user.profile?.display_name || user.profile?.username || user.email || "我" : "点击登录 / 注册"
);
const subText = computed(() =>
  user.loggedIn ? user.email || "" : "登录后同步自选股与云端资料"
);
// 「字」头像种子 = 用户名（固定唯一，昵称修改不改变默认头像）
const avatarName = computed(() =>
  user.loggedIn ? avatarSeed(user.profile?.username || "") || "我" : "我"
);
const avatarBg = computed(() => avatarGradient(avatarName.value));
const avatarChar = computed(() => avatarCharFn(avatarName.value));
const avatarUrl = computed(() => user.profile?.avatar_url || "");
const userLevel = computed(() => {
  const l = user.profile?.level;
  return typeof l === "number" && l >= 0 ? l : 0;
});

const watchCount = computed(() => watch.items.length);
const isMine = (p: { userId?: string | null; author: string }) =>
  user.userId ? p.userId === user.userId : p.author === getMyName();
const postCount = computed(() => communityPosts.value.filter(isMine).length);
const likedCount = computed(() => communityPosts.value.filter((p) => p.likedByMe).length);

// 登录后主动拉一次社区，让「我的帖子 / 赞过」计数准确（社区 store 为单例，顺带预热社区页）
onMounted(() => {
  if (user.loggedIn) loadCommunity();
});

// —— 权限边界：登录态可见性规则（集中定义，便于审查） ——
// 仅登录后展示：数据概览卡（自选股 / 我的帖子 / 赞过 均为用户私有数据，未登录无意义）。
//   卡内子项仍各自受 watch / community 功能开关约束，故整体需「已登录 且 至少开启一个相关 Tab」才显示。
// 无需登录即可访问：顶部个人卡片（同时充当登录引导）、「通用」菜单（设置 / 意见反馈）。
//   （未登录不再在菜单内提供「个人资料」入口，登录引导统一由顶部个人卡片承担，
//    避免与「个人资料=仅登录功能」的权限边界冲突。）
// 其余菜单（「我的」组、退出登录）已在下方以 user.loggedIn 控制，未登录不会渲染任何仅限登录入口。
const showStats = computed(
  () => user.loggedIn && (isTabEnabled("watch") || isTabEnabled("community"))
);

interface MenuItem {
  icon: string;
  label: string;
  act: "edit" | "settings" | "feedback" | "security";
}
const menuGroups = computed(() => {
  const groups: { title: string; items: MenuItem[] }[] = [];
  if (user.loggedIn) {
    const mine: MenuItem[] = [
      { icon: "person", label: "个人资料", act: "edit" },
      { icon: "shield", label: "账号安全", act: "security" },
    ];
    groups.push({ title: "我的", items: mine });
  }
  const common: MenuItem[] = [];
  common.push({ icon: "gear", label: "设置", act: "settings" });
  common.push({ icon: "mail", label: "意见反馈", act: "feedback" });
  groups.push({ title: "通用", items: common });
  return groups;
});

function onHeaderTap() {
  user.loggedIn ? goEdit() : openAuth("login");
}
// 头像点击放大预览（仅已上传图片头像时可预览；"字"头像无可预览的图片资源）
function previewAvatar() {
  if (!avatarUrl.value) return;
  uni.previewImage({ current: avatarUrl.value, urls: [avatarUrl.value] });
}
function goEdit() {
  uni.navigateTo({ url: "/pages/profile/edit" });
}
function goSettings() {
  uni.navigateTo({ url: "/pages/settings/settings" });
}
function goSecurity() {
  uni.navigateTo({ url: "/pages/profile/security" });
}
function goLevel() {
  uni.navigateTo({ url: "/pages/profile/level" });
}
function goWatch() {
  goTab("watch");
}
function goCommunity() {
  goTab("community");
}
function feedback() {
  const email = "support@guanlan.app";
  uni.setClipboardData({
    data: email,
    success: () => uni.showToast({ title: "反馈邮箱已复制", icon: "none" }),
  });
}
const showLogout = ref(false);
function logout() {
  showLogout.value = true;
}
async function confirmLogout() {
  await signOut();
  uni.showToast({ title: "已退出", icon: "none" });
}

function onMenu(act: MenuItem["act"]) {
  switch (act) {
    case "edit":
      goEdit();
      break;
    case "security":
      goSecurity();
      break;
    case "settings":
      goSettings();
      break;
    case "feedback":
      feedback();
      break;
  }
}
</script>

<style scoped>
.pf-root {
  height: 100%;
}
.view-scroll {
  height: 100%;
}
.pf {
  padding: 20rpx 24rpx 0;
}

/* 顶部个人卡片：轻微渐变营造纵深，不用纯色平铺 */
.pf-head {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 24rpx;
  background: linear-gradient(135deg, rgba(12, 110, 220, 0.16), rgba(12, 110, 220, 0.04) 60%, transparent);
}
.pf-head-hover {
  transform: scale(0.99);
  filter: brightness(1.03);
}
.pf-head.tappable {
  cursor: pointer;
}
.pf-avatar {
  position: relative;
  width: 116rpx;
  height: 116rpx;
  border-radius: 50%;
  background: var(--card-2);
  border: 1rpx solid var(--border);
  overflow: hidden;
  flex: none;
  box-shadow: var(--shadow-2);
}
.pf-avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}
.pf-avatar-char {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #fff;
  font-size: var(--font-3xl);
}
.pf-id {
  flex: 1;
  min-width: 0;
}
.pf-name-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  min-width: 0;
}
.pf-lvtag {
  flex: none;
  margin-left: 0;
  align-self: center;
}
.pf-name {
  flex: none;
  max-width: calc(100% - 150rpx);
  font-size: var(--font-xl);
  font-weight: 700;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pf-sub {
  display: block;
  font-size: var(--font-sm);
  color: var(--text-2);
  margin-top: 8rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pf-login-btn {
  flex: none;
  padding: 14rpx 28rpx;
  border-radius: 999rpx;
  background: var(--primary);
  color: #fff;
  font-size: var(--font-sm);
  font-weight: 600;
}

/* 数据概览 */
.pf-stats {
  display: flex;
  align-items: center;
  margin-top: 16rpx;
  padding: 18rpx 24rpx;
}
.pf-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  transition: transform 0.12s ease;
}
.pf-stat-hover {
  transform: scale(0.96);
}
.pf-stat-num {
  font-size: var(--font-2xl);
  font-weight: 700;
  color: var(--text);
  line-height: 1.1;
}
.pf-stat-lab {
  font-size: var(--font-sm);
  color: var(--text-2);
}
.pf-divider {
  width: 1rpx;
  height: 56rpx;
  background: var(--border);
}

/* 菜单分组 */
.pf-group {
  margin-top: 16rpx;
}
.pf-group .card {
  padding: 12rpx 24rpx 18rpx;
}
.pf-group-title {
  display: block;
  font-size: var(--font-sm);
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: 1rpx;
  margin: 0 6rpx 6rpx;
}
.pf-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 80rpx;
  padding: 0;
  border-top: 1rpx solid var(--border);
  transition: background 0.18s ease;
}
.pf-row:first-child {
  border-top: none;
}
.pf-row-last {
  border-bottom: none;
}
.pf-row-hover {
  background: var(--card-2);
}
.pf-row-left {
  display: flex;
  align-items: center;
  gap: 18rpx;
  min-width: 0;
}
.pf-row-ic {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60rpx;
  height: 60rpx;
  border-radius: 16rpx;
  background: var(--card-2);
  flex: none;
}
.pf-row-label {
  font-size: var(--font-md);
  color: var(--text);
}
.pf-row-label.danger,
.pf-row-danger .pf-row-label {
  color: var(--danger);
}
.pf-row-danger .pf-row-ic {
  background: rgba(229, 72, 77, 0.12);
}
.pf-hint {
  padding: 8rpx 0 0;
  text-align: center;
  font-size: var(--font-sm);
  color: var(--text-2);
}
.bottom-pad {
  height: 80rpx;
}
</style>
