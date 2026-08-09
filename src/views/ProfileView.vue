<template>
  <view class="pf-root">
    <scroll-view class="view-scroll" scroll-y>
    <view class="pf">
      <BackgroundFX />

      <!-- 顶部个人信息栏：登录态点击进「个人资料」，未登录点击去登录 -->
      <view
        class="pf-head"
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
          <text v-else class="pf-avatar-char flex-center" :style="{ background: avatarBg }">{{ avatarChar }}</text>
        </view>
        <view class="pf-id">
          <view class="pf-name-row">
            <text class="pf-name truncate">{{ nameText }}</text>
            <view v-if="user.loggedIn && canAccess('pages/profile/level')" class="pf-lvtag" @click.stop="goLevel" role="button" aria-label="查看我的等级">
              <LevelTag :level="userLevel" />
            </view>
          </view>
          <text class="pf-sub truncate">{{ subText }}</text>
        </view>
        <OutlineIcon v-if="user.loggedIn" type="arrow-right" :size="34" color="var(--text-2)" />
        <view v-else class="pf-login-btn">登录 / 注册</view>
      </view>

      <!-- 数据概览：仅登录后展示 -->
      <view v-if="showStats" class="pf-stats">
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
        <view
          v-for="it in g.items"
          :key="it.act"
          class="pf-row"
          hover-class="pf-row-hover"
          role="button"
          :aria-label="it.label"
          @click="onMenu(it.act)"
        >
          <view class="pf-row-left">
            <view class="pf-row-ic flex-center"><OutlineIcon :type="it.icon" :size="30" color="var(--text-2)" /></view>
            <text class="pf-row-label">{{ it.label }}</text>
          </view>
          <OutlineIcon type="arrow-right" :size="28" color="var(--text-2)" />
        </view>
      </view>

      <!-- 账号操作 -->
      <view v-if="user.loggedIn" class="pf-group">
        <view
          class="pf-row pf-row-danger"
          hover-class="pf-row-hover"
          role="button"
          aria-label="退出登录"
          @click="logout"
        >
          <view class="pf-row-left">
            <view class="pf-row-ic flex-center"><OutlineIcon type="close" :size="30" color="var(--danger)" /></view>
            <text class="pf-row-label danger">退出登录</text>
          </view>
          <OutlineIcon type="arrow-right" :size="28" color="var(--text-2)" />
        </view>
      </view>
      <text v-else class="foot-note anim-fade-up">登录后同步自选股与云端资料</text>
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
import { useUser, refreshProfile } from "@/store/user";
import { openAuth, goTab } from "@/store/nav";
import { usePageGuard } from "@/store/guard";
import { canAccess } from "@/store/access";
import { useWatchlist, initWatchlist } from "@/store/watchlist";
import { useCommunity } from "@/store/community";
import { isTabEnabled } from "@/store/appConfig";
import { getMyName } from "@/store/identity";
import { avatarGradient, avatarChar as avatarCharFn, avatarSeed } from "@/utils/avatar";
import { signOut } from "@/api/auth";

const user = useUser();
// 全局页面守卫：「我的」页未对游客开放 + 未登录 → 跳转登录页
usePageGuard("profile");
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

// 下拉刷新（由 pages/index 的 onPullDownRefresh 路由到本方法）：
// 重新拉取云端资料（昵称/头像/邮箱/等级）+ 社区帖子（我的帖子/赞过计数），
// 并刷新自选单例（自选股计数），让「我的」页数据即时同步。无论成功/失败都被
// index 的 safeRefresh 兜底收尾，不会卡 loading。
async function refresh() {
  if (!user.loggedIn) return;
  await Promise.allSettled([
    refreshProfile(),
    loadCommunity(),
    Promise.resolve(initWatchlist()),
  ]);
}
defineExpose({ refresh });

// 数据概览卡（自选股 / 我的帖子 / 赞过）：均为用户私有数据，仅登录后展示；
//   子项另受 watch / community 功能开关约束，故需「已登录 且 至少开启一个相关 Tab」才显示。
const showStats = computed(
  () => user.loggedIn && (isTabEnabled("watch") || isTabEnabled("community"))
);

// 菜单项与「页面白名单」联动：入口显隐统一用 canAccess(route) 判定，与路由守卫语义一致——
// 已登录用户一律可见（白名单只约束游客，登录用户不被 open 二次限制）；游客仅能见到
// open=true 的页面。这样「我的」二级页（个人资料 / 账号安全 / 设置）登录后即全部显示，
// 游客则因这些页 open=false 而被隐藏且点击会被守卫拦截。无对应页面的常驻工具项
// （如意见反馈，无 route）不参与过滤，始终显示。
interface MenuItem {
  icon: string;
  label: string;
  act: "edit" | "settings" | "feedback" | "security";
  route?: string;
}
const RAW_MENU: { title: string; items: MenuItem[] }[] = [
  {
    title: "我的",
    items: [
      { icon: "person", label: "个人资料", act: "edit", route: "pages/profile/edit" },
      { icon: "shield", label: "账号安全", act: "security", route: "pages/profile/security" },
    ],
  },
  {
    title: "通用",
    items: [
      { icon: "gear", label: "设置", act: "settings", route: "pages/settings/settings" },
      { icon: "mail", label: "意见反馈", act: "feedback" }, // 工具项，无对应页面，常驻
    ],
  },
];
const menuGroups = computed(() =>
  RAW_MENU.map((g) => ({
    title: g.title,
    items: g.items.filter((it) => !it.route || canAccess(it.route)),
  })).filter((g) => g.items.length > 0)
);

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
  padding: 0;
  background: var(--bg); /* 间隙底色，区块之间自然形成色带分隔 */
}

/* 顶部个人信息栏 */
.pf-head {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx 20rpx;
  background: linear-gradient(135deg, rgba(12, 110, 220, 0.16), rgba(12, 110, 220, 0.04) 60%, transparent), var(--card);
}
.pf-head-hover {
  background: var(--card-2);
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
  color: #fff;
  font-size: var(--font-3xl);
  /* flex-center 已提升至全局 .flex-center */
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
  align-self: center;
}
.pf-name {
  flex: none;
  max-width: calc(100% - 150rpx);
  font-size: var(--font-xl);
  color: var(--text);
  /* 截断属性已提升至全局 .truncate */
}
.pf-sub {
  display: block;
  font-size: var(--font-sm);
  color: var(--text-2);
  margin-top: 8rpx;
  /* 截断属性已提升至全局 .truncate */
}
.pf-login-btn {
  flex: none;
  padding: 14rpx 28rpx;
  border-radius: 999rpx;
  background: var(--primary);
  color: #fff;
  font-size: var(--font-sm);
}

/* 数据概览 */
.pf-stats {
  display: flex;
  align-items: center;
  padding: 20rpx;
  background: var(--card);
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

/* 菜单分组：粗分隔线隔开 */
.pf-group {
  border-top: 16rpx solid var(--bg);
}
.pf-group-title {
  display: block;
  font-size: var(--font-sm);
  color: var(--text-3);
  padding: 16rpx 20rpx 6rpx;
}
.pf-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 80rpx;
  padding: 20rpx;
  background: var(--card);
  border-top: 2rpx solid var(--bg); /* 行间间隙 */
  transition: background 0.18s ease;
}
.pf-row:first-child {
  border-top: none;
}
.pf-row-hover {
  background: var(--card-2) !important;
}
.pf-row-left {
  display: flex;
  align-items: center;
  gap: 18rpx;
  min-width: 0;
}
.pf-row-ic {
  width: 60rpx;
  height: 60rpx;
  border-radius: 16rpx;
  background: var(--card-2);
  flex: none;
  /* flex-center 已提升至全局 .flex-center */
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
</style>
