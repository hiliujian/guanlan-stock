<template>
  <view class="app-shell dp-page page-col">
    <!-- 自定义导航头（navigationStyle:custom，自带返回） -->
    <view class="dp-head sticky-head">
      <view class="dp-back nav-back" hover-class="nav-back-hover" @click="back" role="button" aria-label="返回">
        <OutlineIcon type="arrow-left" :size="30" color="var(--text)" />
      </view>
      <text class="dp-title nav-title">用户资料</text>
      <view class="dp-head-ph nav-ph" />
    </view>

    <scroll-view class="dp-scroll" scroll-y>
      <!-- 加载态 -->
      <view v-if="loading" class="dp-loading"><view class="cl-spin" /></view>

      <!-- 友好错误页：用户不存在 / 已注销 / 服务暂不可用 -->
      <view v-else-if="notFound" class="dp-error">
        <OutlineIcon type="user" :size="92" color="var(--border)" />
        <text class="dp-error-title">用户不存在或已注销</text>
        <text class="dp-error-sub">该用户可能已注销账号，或链接已失效</text>
        <button class="btn-primary dp-error-btn" @click="back">返回</button>
      </view>

      <!-- 资料主体 -->
      <template v-else-if="profile">
        <!-- 头部：左头像 + 中昵称/用户名（垂直居中）+ 右操作区（关注/私信两行，与头像对齐） -->
        <view class="dp-hero">
          <!-- 头像点击放大预览（复用「我的」页面效果：仅已上传图片头像可预览） -->
          <view class="dp-avatar" hover-class="dp-avatar-hover" @click="previewAvatar" role="button" aria-label="放大头像">
            <UserAvatar
              :url="profile.avatar_url"
              :seed="profile.display_name || profile.username"
              :size="150"
              :frame="profile.avatar_frame"
            />
          </view>

          <!-- 昵称（含等级图标）/ 用户名：与头像垂直居中对齐 -->
          <view class="dp-id">
            <view class="dp-namerow">
              <text class="dp-name truncate">{{ nameText }}</text>
              <view v-if="typeof profile.level === 'number' && profile.level > 0" class="dp-level-inline">
                <LevelTag :level="profile.level" />
              </view>
            </view>
            <text v-if="profile.username" class="dp-username">@{{ profile.username }}</text>
          </view>

          <!-- 右侧操作区：本人→编辑资料；他人→关注 + 私信（两行，与头像垂直对齐） -->
          <view class="dp-side">
            <view v-if="isSelf" class="dp-btn" hover-class="dp-btn-hover" role="button" @click="goEdit">
              <OutlineIcon type="edit" :size="26" color="var(--text)" />
              <text>编辑资料</text>
            </view>
            <template v-else>
              <view
                class="dp-btn"
                :class="{ on: following }"
                hover-class="dp-btn-hover"
                role="button"
                @click="onFollowToggle"
              >
                <OutlineIcon :type="following ? 'check' : 'plus'" :size="26" :color="following ? 'var(--text-2)' : 'var(--primary)'" />
                <text>{{ following ? '已关注' : '关注' }}</text>
              </view>
              <view
                class="dp-btn"
                :class="{ disabled: !canDm }"
                hover-class="dp-btn-hover"
                role="button"
                @click="onDmClick"
              >
                <OutlineIcon type="mail" :size="26" color="var(--primary)" />
                <text>{{ dmLabel }}</text>
              </view>
            </template>
          </view>
        </view>

        <!-- 个人简介（公开可读，来自 profiles.signature） -->
        <view class="dp-section">
          <text class="dp-label">个人简介</text>
          <text class="dp-bio">{{ profile.signature || "这个人很懒，还没有填写简介" }}</text>
        </view>

        <!-- 注册时间 -->
        <view v-if="registerText" class="dp-section">
          <text class="dp-label">注册时间</text>
          <text class="dp-bio">{{ registerText }}</text>
        </view>

        <!-- 自选股（受 public_watchlist 权限控制；需求 B） -->
        <view v-if="showWatchlist" class="dp-section">
          <text class="dp-label">自选股</text>
          <view v-if="watchlistLoading" class="dp-wl-loading"><view class="cl-spin" /></view>
          <view v-else-if="watchError" class="dp-wl-empty">自选股加载失败</view>
          <view v-else-if="watchlist.length === 0" class="dp-wl-empty">暂无自选股</view>
          <view v-else class="dp-wl-list">
            <view
              v-for="w in watchlist"
              :key="w.code + '|' + w.market"
              class="dp-wl-row"
              hover-class="dp-wl-row-hover"
              role="button"
              @click="openStock(w)"
            >
            <view class="dp-wl-info">
              <text class="dp-wl-name truncate">{{ w.name || w.code }}</text>
              <view class="dp-wl-coderow">
                <text class="mkt-label">{{ marketCharFor(w.code, w.market) }}</text>
                <text class="dp-wl-code">{{ w.code }}</text>
              </view>
            </view>
            <view v-if="typeof w.price === 'number'" class="dp-wl-q">
              <text class="dp-wl-price" :class="pctClass(w.pct)">{{ formatPrice(w.price) }}</text>
              <text class="dp-wl-pct" :class="pctClass(w.pct)">{{ formatPct(w.pct) }}</text>
            </view>
            <view
              class="dp-wl-star flex-center"
              :class="{ on: isWatched(w.code, w.market) }"
              @click.stop="toggleWatch(w)"
              role="button"
              aria-label="加入或移除自选"
            >
              <OutlineIcon type="star" :size="30" :color="isWatched(w.code, w.market) ? 'var(--primary)' : 'var(--text-3)'" />
            </view>
            </view>
          </view>
        </view>
        <!-- 对方未公开自选股（需求 B） -->
        <view v-else-if="watchlistHidden" class="dp-section">
          <text class="dp-label">自选股</text>
          <view class="dp-wl-locked">
            <OutlineIcon type="eye-off" :size="40" color="var(--text-3)" />
            <text class="dp-wl-lock-text">对方未公开自选股</text>
          </view>
        </view>

      </template>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import OutlineIcon from "@/components/OutlineIcon.vue";
import UserAvatar from "@/components/UserAvatar.vue";
import LevelTag from "@/components/LevelTag.vue";
import { getSupabase, isSupabaseConfigured } from "@/api/supabase";
import { resolveSecid, marketCharFor, type Market } from "@/utils/period";
import { fetchSnapshot } from "@/api/quote";
import { addWatch, removeWatch, isWatched } from "@/store/watchlist";
import { useUser, userState } from "@/store/user";
import { useDmTarget } from "@/store/community";
import { useFollow } from "@/store/follow";
import { goTab, openAuth, openInMarket } from "@/store/nav";

const user = useUser();

/** 公开资料（他人视角，仅取公开字段）；与本地 Profile 字段对齐 */
interface ProfileDetail {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string;
  avatar_frame: string;
  level: number;
  exp: number;
  signature: string;
  created_at: string;
  allow_dm: boolean; // 允许私信（需求 B，默认 true）
  public_watchlist: boolean; // 公开自选股（需求 B，默认 true）
}

/** 他人自选股行（仅 code / market / name 来自后端公开 RPC，行情为前端实时补充） */
interface WatchRow {
  code: string;
  market: string;
  name: string;
  price?: number;
  pct?: number;
}

const uid = ref("");
const loading = ref(true);
const notFound = ref(false);
const profile = ref<ProfileDetail | null>(null);

// —— 自选股（需求 B：受 public_watchlist 权限控制） ——
const watchlist = ref<WatchRow[]>([]);
const watchlistLoading = ref(false);
const watchError = ref(false);
// 本人或对方公开 → 展示自选股列表；否则（他人且未公开）显示「对方未公开自选股」
const showWatchlist = computed(
  () => !!profile.value && (isSelf.value || profile.value.public_watchlist === true)
);
const watchlistHidden = computed(
  () => !!profile.value && !isSelf.value && profile.value.public_watchlist !== true
);

const { setDmTarget } = useDmTarget();

const nameText = computed(() =>
  profile.value ? profile.value.display_name || profile.value.username || "用户" : ""
);
const isSelf = computed(
  () => !!user.loggedIn && !!profile.value && profile.value.id === userState.userId
);
// 关注态（与社区帖子关注同源：本地持久化集合，以昵称为键）
const { follows, toggleFollow } = useFollow();
const following = computed(() => {
  const name = profile.value?.display_name || profile.value?.username;
  return !!name && follows.value.has(name);
});
// 私信按钮可用性与文案（未登录 / 对方关闭 / 正常 三态）
const canDm = computed(
  () => user.loggedIn && !!profile.value && profile.value.allow_dm === true
);
const dmLabel = computed(() => {
  if (!user.loggedIn) return "登录后私信";
  if (profile.value?.allow_dm === false) return "未开启私信";
  return "发私信";
});

function onFollowToggle() {
  const name = profile.value?.display_name || profile.value?.username;
  if (!name) return;
  toggleFollow(name);
}
function onDmClick() {
  if (!user.loggedIn) {
    goLogin();
    return;
  }
  if (profile.value?.allow_dm === false) return; // 对方关闭私信，按钮禁用不触发
  startDm();
}
// 注册时间格式化（YYYY-MM-DD），created_at 为空则隐藏该区块
const registerText = computed(() => {
  const raw = profile.value?.created_at;
  if (!raw) return "";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
});

// 公开资料查询：profiles 表 RLS 已对 anon/authenticated 开放 SELECT（qual=true），
// 故游客亦可直查他人资料；无行（PGRST116）/ 异常 → 友好错误页。
async function loadProfile() {
  loading.value = true;
  notFound.value = false;
  profile.value = null;
  try {
    const sb = getSupabase();
    if (!sb || !uid.value) {
      notFound.value = true;
      return;
    }
    const { data, error } = await sb
      .from("profiles")
      .select("id, display_name, username, avatar_url, avatar_frame, level, exp, signature, created_at, allow_dm, public_watchlist")
      .eq("id", uid.value)
      .single();
    if (error || !data) {
      notFound.value = true;
      return;
    }
    profile.value = {
      id: data.id,
      display_name: data.display_name || "",
      username: data.username || "",
      avatar_url: data.avatar_url || "",
      avatar_frame: data.avatar_frame || "",
      level: typeof data.level === "number" ? data.level : 0,
      exp: typeof data.exp === "number" ? data.exp : 0,
      signature: typeof data.signature === "string" ? data.signature : "",
      created_at: typeof data.created_at === "string" ? data.created_at : "",
      allow_dm: typeof data.allow_dm === "boolean" ? data.allow_dm : true,
      public_watchlist: typeof data.public_watchlist === "boolean" ? data.public_watchlist : true,
    };
    // 权限判定：本人或对方公开 → 拉取自选股（前端控制 + 后端 RPC 再校验一次）
    if (profile.value.public_watchlist === true || isSelf.value) {
      loadWatchlist();
    } else {
      watchlist.value = [];
    }
  } catch {
    notFound.value = true;
  } finally {
    loading.value = false;
  }
}

/** 拉取对方自选股（经 get_user_watchlist RPC，后端按 public_watchlist 再次校验可见性）。
 *  仅回传 code / market / name；基本行情（现价 / 涨跌幅）由前端并行补 fetchSnapshot，缺省不阻断列表。 */
async function loadWatchlist() {
  const sb = getSupabase();
  if (!sb || !uid.value) return;
  watchlistLoading.value = true;
  watchError.value = false;
  try {
    const { data, error } = await sb.rpc("get_user_watchlist", { p_target: uid.value });
    if (error || !data) {
      watchError.value = true;
      return;
    }
    const rows: WatchRow[] = (data as any[]).map((d: any) => ({
      code: d.code,
      market: d.market || "auto",
      name: d.name || "",
    }));
    await Promise.all(
      rows.map(async (r) => {
        try {
          const secid = resolveSecid(r.code, (r.market as Market) || "auto");
          const snap = await fetchSnapshot(secid);
          r.price = snap.price;
          r.pct = snap.pct;
        } catch {
          /* 行情缺失时仅展示名称与代码 */
        }
      })
    );
    watchlist.value = rows;
  } catch {
    watchError.value = true;
  } finally {
    watchlistLoading.value = false;
  }
}

function pctClass(pct?: number): string {
  if (typeof pct !== "number" || pct === 0) return "flat";
  return pct > 0 ? "up" : "down";
}
function formatPrice(p: number): string {
  return p.toFixed(2);
}
function formatPct(p?: number): string {
  if (typeof p !== "number") return "";
  return `${p > 0 ? "+" : ""}${p.toFixed(2)}%`;
}
function openStock(w: WatchRow) {
  openInMarket(w.code, w.market as Market);
}

/** 资料页自选星标：仿行情页 .qh-star 逻辑，点击加入/移除自选（不触发整卡跳转，已 @click.stop）。
 *  未登录且后端开启时引导登录，避免「加了却看不到」。 */
async function toggleWatch(w: WatchRow) {
  if (!user.loggedIn && user.supabaseEnabled) {
    openAuth("login");
    return;
  }
  if (isWatched(w.code, w.market)) {
    await removeWatch(w.code, w.market);
    uni.showToast({ title: "已移除自选", icon: "none" });
  } else {
    const r = await addWatch({
      code: w.code,
      market: w.market,
      name: w.name || w.code,
      note: "",
    });
    if (r.ok) {
      uni.showToast({ title: "已加入自选", icon: "success" });
    } else {
      uni.showToast({ title: r.error || "加入失败", icon: "none" });
    }
  }
}

onLoad((options: any) => {
  uid.value = (options?.uid || "").toString().trim();
  if (!uid.value) {
    notFound.value = true;
    loading.value = false;
    return;
  }
  loadProfile();
});

function back() {
  uni.navigateBack({
    delta: 1,
    fail: () => uni.reLaunch({ url: "/pages/index/index" }),
  });
}

/** 头像点击放大预览（复用「我的」页面逻辑：仅已上传图片头像才有可预览资源，
 *  "字"头像无 url 时直接返回，不弹预览）。 */
function previewAvatar() {
  const url = profile.value?.avatar_url;
  if (!url) return;
  uni.previewImage({ current: url, urls: [url] });
}

function goEdit() {
  uni.navigateTo({ url: "/pages/profile/edit" });
}

function goLogin() {
  openAuth("login");
}

/** 发私信：写入深链目标 → 切到社区 tab → 返回（社区页消费目标并打开消息中心会话）。 */
function startDm() {
  if (!profile.value) return;
  // 二次拦截：对方关闭「允许私信」时不写入深链目标（后端 send_dm 亦会校验，双重保险）
  if (profile.value.allow_dm === false) return;
  setDmTarget({
    otherId: profile.value.id,
    otherName: nameText.value,
    otherAvatarUrl: profile.value.avatar_url || "",
    otherFrame: profile.value.avatar_frame || "",
  });
  goTab("community");
  uni.navigateBack({
    delta: 1,
    fail: () => uni.reLaunch({ url: "/pages/index/index" }),
  });
}
</script>

<style scoped>
.dp-scroll {
  flex: 1;
  height: 100%;
  box-sizing: border-box;
}

/* 头部：左头像 + 中昵称/用户名 + 右操作区（横向一行，三者垂直居中） */
.dp-hero {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
  padding: 28rpx 20rpx;
  background: linear-gradient(135deg, rgba(7, 193, 96, 0.16), rgba(7, 193, 96, 0.04) 60%, transparent), var(--card);
}
/* 头像容器：可点击放大、指针光标 + 悬停缩放反馈（复用「我的」页面效果） */
.dp-avatar {
  flex: none;
  display: inline-flex;
  cursor: pointer;
  border-radius: 50%;
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.dp-avatar-hover {
  opacity: 0.85;
  transform: scale(0.96);
}
/* 昵称 + 用户名：占中间弹性区域，与头像垂直居中对齐 */
.dp-id {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6rpx;
}
.dp-name {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  font-size: var(--font-2xl);
  font-weight: 400;
  color: var(--text);
}
.dp-username {
  font-size: var(--font-sm);
  color: var(--text-2);
}
/* 昵称 + 等级图标同行 */
.dp-namerow {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10rpx;
  width: 100%;
}
.dp-level-inline {
  flex: none;
  align-self: center;
}
/* 右侧操作区：两行（关注 / 私信），与头像垂直对齐 */
.dp-side {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 12rpx;
}
/* 操作按钮（图标 + 文字，无底色，仅颜色区分状态） */
.dp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 12rpx 22rpx;
  border-radius: 999rpx;
  font-size: var(--font-sm);
  line-height: 1;
  color: var(--primary);
  transition: transform 0.12s ease, opacity 0.12s ease;
}
.dp-btn-hover {
  transform: scale(0.96);
}
.dp-btn.on {
  color: var(--text-2);
}
.dp-btn.disabled {
  opacity: 0.5;
}

/* 信息区块（与设置页 sec-group 视觉一致：整块白卡 + 上行分隔带） */
.dp-section {
  margin-top: 16rpx;
  padding: 22rpx 20rpx;
  background: var(--card);
}
.dp-label {
  display: block;
  font-size: var(--font-sm);
  color: var(--text-3);
  margin-bottom: 10rpx;
}
.dp-bio {
  display: block;
  font-size: var(--font-md);
  line-height: 1.6;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}

/* 加载 / 错误 */
.dp-loading {
  display: flex;
  justify-content: center;
  padding: 120rpx 0;
}
.dp-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18rpx;
  padding: 140rpx 40rpx;
}
.dp-error-title {
  font-size: var(--font-lg);
  color: var(--text);
}
.dp-error-sub {
  font-size: var(--font-sm);
  color: var(--text-2);
  text-align: center;
}
.dp-error-btn {
  margin-top: 20rpx;
  width: 60%;
}

/* 自选股列表（需求 B） */
.dp-wl-loading {
  display: flex;
  justify-content: center;
  padding: 28rpx 0;
}
.dp-wl-empty {
  font-size: var(--font-sm);
  color: var(--text-2);
  padding: 16rpx 0;
}
.dp-wl-list {
  display: flex;
  flex-direction: column;
  /* 约 10 行高度，超出滚动（需求：显示 10 个股票高度，超过滚动） */
  max-height: 880rpx;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.dp-wl-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 18rpx 0;
  border-top: 1rpx solid var(--border);
}
.dp-wl-row:first-child {
  border-top: none;
}
.dp-wl-row-hover {
  background: var(--card-2);
}
.dp-wl-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.dp-wl-name {
  font-size: var(--font-md);
  color: var(--text);
}
.dp-wl-code {
  font-size: var(--font-xs);
  color: var(--text-2);
}
/* 代码 + 沪深港标签同行 */
.dp-wl-coderow {
  display: flex;
  align-items: center;
  gap: 6rpx;
}
.dp-wl-q {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;
  flex: none;
}
.dp-wl-price {
  font-size: var(--font-md);
  color: var(--text);
}
/* 股价与涨跌幅同步涨红 / 跌绿（需求） */
.dp-wl-price.up {
  color: var(--up);
}
.dp-wl-price.down {
  color: var(--down);
}
.dp-wl-price.flat {
  color: var(--text);
}
.dp-wl-pct {
  font-size: var(--font-xs);
}
.dp-wl-pct.up {
  color: var(--up);
}
.dp-wl-pct.down {
  color: var(--down);
}
.dp-wl-pct.flat {
  color: var(--text-2);
}
/* 自选星标（复用行情页 .qh-star 视觉：圆形底 + 描边星，加入自选底变 primary-soft；
   此处用静态定位而非 absolute，使其内联在行尾，点击加入/移除自选，不触发整卡跳转） */
.dp-wl-star {
  flex: none;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: var(--card-2);
  transition: transform 0.12s ease, background 0.15s ease;
}
.dp-wl-star:active {
  transform: scale(0.9);
}
.dp-wl-star.on {
  background: var(--primary-soft);
}
.dp-wl-locked {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  padding: 30rpx 0;
}
.dp-wl-lock-text {
  font-size: var(--font-sm);
  color: var(--text-2);
}
</style>
