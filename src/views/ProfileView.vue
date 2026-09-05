<template>
  <view class="pf-root">
    <scroll-view class="view-scroll" scroll-y>
    <view class="pf">
      <!-- 顶部个人信息栏：登录态点击进「个人资料」，未登录点击去登录 -->
      <view
        class="pf-head"
        :class="{ tappable: !user.loggedIn }"
        hover-class="pf-head-hover"
        role="button"
        :aria-label="user.loggedIn ? '编辑个人资料' : '登录或注册'"
        @click="onHeaderTap"
      >
        <view class="pf-avatar" @click.stop="previewAvatar">
          <UserAvatar :url="avatarUrl" :seed="avatarName" :size="116" :frame="user.profile?.avatar_frame" />
        </view>
        <view class="pf-id">
          <view class="pf-name-row">
            <text :class="['pf-name', 'truncate', { 'vip-name': isVip }]">{{ nameText }}</text>
            <view v-if="user.loggedIn && canAccess('pages/profile/level')" class="pf-lvtag" @click.stop="goLevel" role="button" aria-label="查看我的等级">
              <LevelTag :level="userLevel" :vip="isVip" />
            </view>
          </view>
          <text class="pf-sub truncate">{{ subText }}</text>
        </view>
        <OutlineIcon v-if="user.loggedIn" type="arrow-right" :size="34" color="var(--text-2)" />
        <view v-else class="pf-login-btn">登录 / 注册</view>
      </view>

      <!-- VIP 会员 Banner（金色调通栏，浅色米金 / 深色黑金随主题，贴边全宽）：三态——
           有效会员 → 权益展示位（永久有效 / 有效期至某日，带擦亮动效）；已过期 → 灰调续费引导；
           未开通 → 广告位。点击均可进会员页，右上角都有 × 可关闭（统一进入 1 天冷却，冷却结束自动恢复展示） -->
      <view
        v-if="user.loggedIn && !vipBannerClosed"
        class="pf-vip-banner"
        :class="{ 'pf-vip-shine': isVip, 'pf-vip-expired': vipExpired }"
        hover-class="pf-vip-hover"
        role="button"
        :aria-label="vipBanner.aria"
        @click="goVip"
      >
        <view class="pf-vip-crown" :style="vipCrownStyle">
          <OutlineIcon type="crown" :size="26" :color="vipCrownIconColor" />
        </view>
        <view class="pf-vip-t">
          <text class="pf-vip-title">{{ vipBanner.title }}</text>
          <text class="pf-vip-sub">{{ vipBanner.sub }}</text>
        </view>
        <view class="pf-vip-go">{{ vipBanner.go }}</view>
        <view
          class="pf-vip-close flex-center"
          hover-class="pf-vip-close-hover"
          role="button"
          aria-label="关闭会员推广"
          @click.stop="closeVipBanner"
        >
          <OutlineIcon type="close" :size="22" :color="vipCloseColor" />
        </view>
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
        <!-- 我的关注：点击跳转「我的社区」并弹出关注列表（复用消息中心 PeekSheet） -->
        <view
          v-if="isTabEnabled('community')"
          class="pf-stat"
          hover-class="pf-stat-hover"
          role="button"
          aria-label="我的关注"
          @click="goMyFollow"
        >
          <text class="pf-stat-num">{{ followCount }}</text>
          <text class="pf-stat-lab">我的关注</text>
        </view>
        <view v-if="isTabEnabled('community')" class="pf-divider" />
        <view
          v-if="isTabEnabled('community')"
          class="pf-stat"
          hover-class="pf-stat-hover"
          role="button"
          aria-label="我的帖子"
          @click="goMyPosts"
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
          @click="goLiked"
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
            <text class="pf-row-label">退出登录</text>
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
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import LevelTag from "@/components/LevelTag.vue";
import { useUser, refreshProfile } from "@/store/user";
import { BIO_PLACEHOLDER } from "@/store/bio";
import { openAuth, goTab } from "@/store/nav";
import { usePageGuard } from "@/store/guard";
import { canAccess } from "@/store/access";
import { useWatchlist, initWatchlist } from "@/store/watchlist";
import { useCommunity, useCommunityPreset } from "@/store/community";
import { useFollow, useFollowPanel } from "@/store/follow";
import { isTabEnabled } from "@/store/appConfig";
import { getMyName } from "@/store/identity";
import { avatarSeed } from "@/utils/avatar";
import { isDark } from "@/utils/theme";
import UserAvatar from "@/components/UserAvatar.vue";
import { signOut } from "@/api/auth";
import { VIP_BADGE, vipActive, vipValidityText } from "@/store/level";

const user = useUser();
// 全局页面守卫：「我的」页未对游客开放 + 未登录 → 跳转登录页
usePageGuard("profile");
const watch = useWatchlist();
const { posts: communityPosts, load: loadCommunity } = useCommunity();
// 社区筛选预设：跳转社区前 setPreset，由 CommunityView 激活时消费（如「我的帖子」→「我发布的」）
const { setPreset } = useCommunityPreset();
// 关注系统：复用全局关注 store（服务端 uid 维度），驱动「我的关注」计数与跨 tab 打开弹层信号。
const { follows } = useFollow();
const { followPanelOpen } = useFollowPanel();
const followCount = computed(() => follows.value.size);

// 声明可接收的自定义事件：父级（pages/index）在 watch 激活时向动态组件绑定 open-market，
// KeepAlive 缓存其它视图后仍可能把该监听透传到本组件。声明为 emit 后 Vue 按自定义事件
// 处理（而非尝试继承到 DOM 根节点），避免「extraneous non-emits」告警。本视图自身从不触发。
defineEmits<{ (e: "open-market", payload: { code: string; market: string }): void }>();

const nameText = computed(() =>
  user.loggedIn ? user.profile?.display_name || user.profile?.username || user.email || "我" : "点击登录 / 注册"
);
// 个人简介（profiles.signature，公开可读、持久化到数据库）：登录后为空则展示灰色引导文案
// 「点击添加简介，让大家认识你」（.pf-sub 已用 --text-2 灰色字，符合系统空态配色）；未登录展示登录引导。
const subText = computed(() =>
  user.loggedIn ? (user.profile?.signature?.trim() || BIO_PLACEHOLDER) : "登录后同步自选股与云端资料"
);
// 「字」头像种子 = 昵称首字（与社区帖子、资料页统一采用昵称首字）
const avatarName = computed(() =>
  user.loggedIn ? avatarSeed(user.profile?.display_name || "") || "我" : "我"
);
const avatarUrl = computed(() => user.profile?.avatar_url || "");
const userLevel = computed(() => {
  const l = user.profile?.level;
  return typeof l === "number" && l >= 0 ? l : 0;
});
// VIP 会员：有效期用 vipActive 实时判定；Banner 三态——有效会员=权益展示位、
// 已过期=灰调续费引导（vip 标志仍在但有效期已过）、未开通=推广广告位，
// 均可用右上角 × 关闭，进入 1 天冷却后自动恢复展示；金冠配色取自 VIP_BADGE（与徽章同一金色来源）
const isVip = computed(() => vipActive(user.profile?.vip, user.profile?.vip_expires_at));
// 已过期：曾授予 VIP（vip=true）但有效期已过 —— 与「从未开通」区分，走续费引导而非新客推广
const vipExpired = computed(() => user.profile?.vip === true && !isVip.value);
// Banner 关闭冷却：关闭时记录时间戳，冷却期内不再打扰，冷却结束自动恢复展示，
// 保证会员推广能在合适的时机再次触达。旧版本存储的 "1" 会被解析为过期时间戳，立即恢复展示
const VIP_BANNER_CLOSED_KEY = "guanlan_vip_banner_closed";
const VIP_BANNER_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 1 天
const vipBannerClosedAt = ref(Number(uni.getStorageSync(VIP_BANNER_CLOSED_KEY)) || 0);
const vipBannerClosed = computed(
  () => vipBannerClosedAt.value > 0 && Date.now() - vipBannerClosedAt.value < VIP_BANNER_COOLDOWN_MS
);
// Banner 三态文案统一收敛，模板不再叠三层三元表达式
const vipBanner = computed(() => {
  if (isVip.value)
    return {
      title: "VIP 尊贵会员",
      sub: vipValidityText(user.profile?.vip, user.profile?.vip_expires_at),
      go: "查看权益",
      aria: "查看 VIP 会员权益",
    };
  if (vipExpired.value) {
    // 过期日期展示：vipValidityText 仅对有效会员返回文案，过期态这里单独格式化
    const raw = user.profile?.vip_expires_at;
    const t = raw ? new Date(raw).getTime() : NaN;
    const expiredText = Number.isFinite(t)
      ? `已于 ${new Date(t).getFullYear()}-${String(new Date(t).getMonth() + 1).padStart(2, "0")}-${String(new Date(t).getDate()).padStart(2, "0")} 过期`
      : "会员有效期已过";
    return {
      title: "会员已过期",
      sub: `${expiredText} · 续费继续解锁特权`,
      go: "续费会员",
      aria: "续费 VIP 会员",
    };
  }
  return {
    title: "观澜 VIP 会员",
    sub: "黑金昵称 · 金冠徽章 · 专属特权",
    go: "了解特权",
    aria: "了解 VIP 会员",
  };
});
// 金冠底色随状态：有效=尊贵金；过期=降饱和灰（弱化尊贵感，突出续费引导）
const vipCrownStyle = computed(() =>
  vipExpired.value
    ? { background: "linear-gradient(135deg, #cfccc4, #949087)", boxShadow: "0 0 0 4rpx rgba(0, 0, 0, 0.06)" }
    : { background: `linear-gradient(135deg, ${VIP_BADGE.from}, ${VIP_BADGE.to})`, boxShadow: "0 0 0 4rpx rgba(192, 142, 14, 0.22)" }
);
const vipCrownIconColor = computed(() => (vipExpired.value ? "#4a463f" : VIP_BADGE.fg));
function closeVipBanner() {
  vipBannerClosedAt.value = Date.now();
  uni.setStorageSync(VIP_BANNER_CLOSED_KEY, String(vipBannerClosedAt.value));
}
// 关闭按钮图标色随主题：深色黑金 Banner 上用亮金，浅色米金底上用深金
const vipCloseColor = computed(() =>
  isDark.value ? "rgba(240, 205, 110, 0.75)" : "rgba(122, 92, 12, 0.75)"
);

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
function goVip() {
  uni.navigateTo({ url: "/pages/profile/vip" });
}
function goWatch() {
  goTab("watch");
}
// 赞过：跳转社区并预设筛选项为「我赞过的」（由 CommunityView 激活时消费）
function goLiked() {
  setPreset("liked");
  goTab("community");
}
// 我的帖子：跳转社区并预设筛选项为「我发布的」（由 CommunityView 激活时消费）
function goMyPosts() {
  setPreset("mine");
  goTab("community");
}
// 我的关注：先切到社区 tab（触发 CommunityView 挂载），再置共享信号打开「我的关注」弹层。
function goMyFollow() {
  goTab("community");
  followPanelOpen.value = true;
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
  flex: none;
  box-shadow: var(--shadow-2);
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

/* VIP 会员 Banner：金色尊贵风通栏（贴边全宽），浅色米金暖底 / 深色经典黑金，随主题切换。
   有效会员=权益展示位（带擦亮）；已过期=灰调续费引导（见 .pf-vip-expired）；未开通=广告位（CTA，可关闭）。
   配色统一走本组件 CSS 变量，避免每条规则重复写两套渐变 */
.pf-vip-banner {
  /* 浅色默认：米金暖底 + 深金字 */
  --vip-bg: linear-gradient(120deg, #fbf3df, #f6ead0 55%, #faf1dc);
  --vip-line: rgba(192, 142, 14, 0.3);
  --vip-hover: linear-gradient(120deg, #f4ebcf, #eee0bd 55%, #f2e8c8);
  --vip-title: linear-gradient(120deg, #d9a83e, #b8860b 50%, #7a5c10);
  --vip-sub: rgba(122, 92, 12, 0.78);
  --vip-close-hover: rgba(67, 48, 10, 0.12);
  position: relative;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 22rpx 24rpx;
  background: var(--vip-bg);
  box-shadow: inset 0 0 0 1rpx var(--vip-line);
  overflow: hidden;
}
/* 「擦亮」仅会员生效（普通用户看的是无动画的广告位）：一道金光 10s 一次缓慢扫过（6s 静止 → 3s 慢扫） */
.pf-vip-shine::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 26%;
  background: linear-gradient(100deg, transparent, rgba(255, 238, 190, 0.38), transparent);
  transform: translateX(-320%) skewX(-18deg);
  animation: vipBannerShine 10s ease-in-out infinite;
  pointer-events: none;
}
@keyframes vipBannerShine {
  0%, 60% {
    transform: translateX(-320%) skewX(-18deg);
  }
  90%, 100% {
    transform: translateX(320%) skewX(-18deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .pf-vip-shine::after { display: none; }
}
.theme-dark .pf-vip-banner {
  /* 深色：经典黑金 */
  --vip-bg: linear-gradient(120deg, #2b2008, #171005 55%, #241a08);
  --vip-line: rgba(240, 205, 110, 0.35);
  --vip-hover: linear-gradient(120deg, #35280c, #1d1507 55%, #2c2009);
  --vip-title: linear-gradient(120deg, #f7e3a1, #e8c558 50%, #c08e0e);
  --vip-sub: rgba(240, 205, 110, 0.72);
  --vip-close-hover: rgba(255, 255, 255, 0.1);
}
/* 已过期：整体降饱和转灰（金冠转灰由脚本内联样式处理），弱化尊贵感；
   「续费会员」CTA 仍保留金色按钮，让行动入口在灰调底上更突出 */
.pf-vip-banner.pf-vip-expired {
  --vip-bg: linear-gradient(120deg, #f2f0eb, #eae8e2 55%, #f0eee8);
  --vip-line: rgba(0, 0, 0, 0.08);
  --vip-hover: linear-gradient(120deg, #ebe9e3, #e2e0d9 55%, #e9e7e0);
  --vip-title: #8d887c;
  --vip-sub: rgba(93, 89, 80, 0.72);
  --vip-close-hover: rgba(0, 0, 0, 0.1);
}
.theme-dark .pf-vip-banner.pf-vip-expired {
  --vip-bg: linear-gradient(120deg, #232327, #161619 55%, #1f1f23);
  --vip-line: rgba(255, 255, 255, 0.09);
  --vip-hover: linear-gradient(120deg, #2c2c31, #1c1c20 55%, #26262b);
  --vip-title: #a5a19a;
  --vip-sub: rgba(255, 255, 255, 0.45);
  --vip-close-hover: rgba(255, 255, 255, 0.1);
}
.pf-vip-hover {
  background: var(--vip-hover);
}
.pf-vip-crown {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.pf-vip-t {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
/* 金渐变文字（浅色深金 / 深色亮金，见 --vip-title），与全局 .vip-name（卡片昵称用）区分场景 */
.pf-vip-title {
  font-size: var(--font-md);
  background: var(--vip-title);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
}
.pf-vip-sub {
  font-size: var(--font-xs);
  color: var(--vip-sub);
}
.pf-vip-go {
  flex: none;
  font-size: var(--font-xs);
  padding: 10rpx 20rpx;
  border-radius: 999rpx;
  background: linear-gradient(135deg, #f7d27a, #c08e0e);
  color: #43300a;
}
/* 右上角关闭按钮：不随 Banner 点击跳转（@click.stop）；z-index 保证擦亮光带扫过时不遮按钮 */
.pf-vip-close {
  position: absolute;
  top: 6rpx;
  right: 6rpx;
  z-index: 1;
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  flex: none;
}
.pf-vip-close-hover {
  background: var(--vip-close-hover);
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
.pf-row-danger .pf-row-label {
  color: var(--danger);
}
.pf-row-danger .pf-row-ic {
  background: rgba(229, 72, 77, 0.12);
}
</style>
