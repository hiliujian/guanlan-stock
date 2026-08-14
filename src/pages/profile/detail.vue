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
        <!-- 头部：头像 + 昵称 + 用户名 + 等级 -->
        <view class="dp-hero">
          <UserAvatar
            :url="profile.avatar_url"
            :seed="profile.display_name || profile.username"
            :size="150"
            :frame="profile.avatar_frame"
          />
          <text class="dp-name truncate">{{ nameText }}</text>
          <text v-if="profile.username" class="dp-username">@{{ profile.username }}</text>
          <view v-if="isSelf" class="dp-selftag">本人</view>
          <view v-if="typeof profile.level === 'number' && profile.level > 0" class="dp-level">
            <LevelTag :level="profile.level" />
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

        <!-- 操作区：本人→编辑资料；他人已登录→发私信；他人未登录→引导登录 -->
        <view class="dp-actions">
          <button v-if="isSelf" class="btn-primary" @click="goEdit">编辑我的资料</button>
          <button v-else-if="user.loggedIn" class="btn-primary" @click="startDm">发私信</button>
          <button v-else class="btn-primary" @click="goLogin">登录后发私信</button>
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
import { useUser, userState } from "@/store/user";
import { useDmTarget } from "@/store/community";
import { goTab, openAuth } from "@/store/nav";

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
}

const uid = ref("");
const loading = ref(true);
const notFound = ref(false);
const profile = ref<ProfileDetail | null>(null);

const { setDmTarget } = useDmTarget();

const nameText = computed(() =>
  profile.value ? profile.value.display_name || profile.value.username || "用户" : ""
);
const isSelf = computed(
  () => !!user.loggedIn && !!profile.value && profile.value.id === userState.userId
);
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
      .select("id, display_name, username, avatar_url, avatar_frame, level, exp, signature, created_at")
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
    };
  } catch {
    notFound.value = true;
  } finally {
    loading.value = false;
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

function goEdit() {
  uni.navigateTo({ url: "/pages/profile/edit" });
}

function goLogin() {
  openAuth("login");
}

/** 发私信：写入深链目标 → 切到社区 tab → 返回（社区页消费目标并打开消息中心会话）。 */
function startDm() {
  if (!profile.value) return;
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

/* 头部 */
.dp-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  padding: 36rpx 20rpx 30rpx;
  background: linear-gradient(135deg, rgba(7, 193, 96, 0.16), rgba(7, 193, 96, 0.04) 60%, transparent), var(--card);
}
.dp-name {
  flex: none;
  max-width: 80%;
  font-size: var(--font-2xl);
  font-weight: 600;
  color: var(--text);
}
.dp-username {
  font-size: var(--font-sm);
  color: var(--text-2);
}
.dp-selftag {
  margin-top: 4rpx;
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
  background: var(--primary-soft);
  color: var(--primary);
  font-size: var(--font-xs);
}
.dp-level {
  margin-top: 6rpx;
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

/* 操作区 */
.dp-actions {
  padding: 28rpx 20rpx 40rpx;
}
.dp-actions .btn-primary {
  display: block;
  width: 100%;
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
</style>
