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
              :frame="vipGatedFrame(profile.avatar_frame, isVip)"
            />
          </view>

          <!-- 昵称（含等级图标）/ 用户名：与头像垂直居中对齐 -->
          <view class="dp-id">
            <view class="dp-namerow">
              <text :class="['dp-name', 'truncate', { 'vip-name': isVip }]">{{ nameText }}</text>
              <!-- 等级标签：全等级可见（新用户 = 0 级新手散户也展示）；点击进入我的等级页 -->
              <view
                class="dp-level-inline"
                hover-class="dp-level-hover"
                role="button"
                aria-label="查看我的等级"
                @click.stop="goLevel"
              >
                <LevelTag :level="profile.level" :vip="isVip" />
              </view>
            </view>
            <text v-if="profile.username" class="dp-username">@{{ profile.username }}</text>
            <text v-if="ipLocation" class="dp-location">IP 属地：{{ ipLocation }}</text>
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
                :class="{ on: following, disabled: !user.loggedIn }"
                hover-class="dp-btn-hover"
                role="button"
                @click="onFollowToggle"
              >
                <OutlineIcon :type="following ? 'check' : 'plus'" :size="26" :color="following ? 'var(--text-2)' : 'var(--primary)'" />
                <text>{{ followLabel }}</text>
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
          <text class="dp-label">自选/持仓股</text>
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
            <!-- 对方持仓标识（位于行情区左侧，与 .dp-wl-q 同构分列对齐：两行右对齐、无背景）——
                 第一行：持仓收益率（涨红跌绿，与现价同字号）；第二行：铜钱图标 + 持股数（与涨跌幅同字号）。
                 中部持仓信息可点：展开持仓详情弹窗（收益率/盈亏/股数/成本 + 该股近期操作动态），
                 @click.stop 防止误触发行跳转 -->
            <view
              v-if="w.holdingCost && typeof w.price === 'number'"
              class="dp-wl-hold"
              role="button"
              aria-label="查看持仓详情"
              @click.stop="openHoldDetail(w)"
            >
              <text class="dp-wl-holdpct" :class="holdPct(w) >= 0 ? 'up' : 'down'">{{ holdPctText(w) }}</text>
              <view class="dp-wl-holdrow">
                <OutlineIcon type="portfolio" :size="22" color="var(--primary)" />
                <text class="dp-wl-shares">{{ holdingShares(w) }} 股</text>
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
        <!-- 对方未公开自选/持仓股（需求 B） -->
        <view v-else-if="watchlistHidden" class="dp-section">
          <text class="dp-label">自选/持仓股</text>
          <view class="dp-wl-locked">
            <OutlineIcon type="eye-off" :size="40" color="var(--text-3)" />
          <text class="dp-wl-lock-text">对方未公开自选/持仓股</text>
        </view>
      </view>

      <!-- TA 的动态：帖子 + 持仓操作事件（建仓/加仓/减仓/清仓）合并时间线，按时间倒序取前 20 条；
           事件行点击 → 行情页查看该股；帖子行点击 → 社区定位该帖（滚动 + 高亮，而非仅跳首页）；
           条目超 10 条时该区块独立滚动；查看更多常驻可跳社区全量 -->
      <view class="dp-section">
        <text class="dp-label">TA 的动态</text>
        <view v-if="recentLoading" class="dp-wl-loading"><view class="cl-spin" /></view>
        <view v-else-if="activityFeed.length === 0" class="dp-wl-empty">暂无动态</view>
        <view v-else>
          <view
            class="dp-posts"
            :class="{ 'dp-posts-scroll': activityFeed.length > 10 }"
          >
            <view
              v-for="(a, i) in activityFeed"
              :key="a.type + '-' + i"
              class="dp-post-row"
              :class="{ tappable: a.type === 'event' || a.type === 'post' }"
              @click="onActivityClick(a)"
            >
              <text class="dp-post-time">{{ formatRelative(a.time) }}</text>
              <view v-if="a.type === 'event' && a.ev" class="dp-ev">
                <text :class="['dp-ev-tag', evCls(a.ev.kind)]">{{ evLabel(a.ev.kind) }}</text>
                <text class="dp-ev-name truncate">{{ a.ev.name }}</text>
                <text class="dp-ev-shares">{{ fmtShareNum(a.ev.shares) }}股</text>
              </view>
              <text v-else class="dp-post-sum truncate">{{ postSummary(a.post!) }}</text>
            </view>
          </view>
          <view class="dp-posts-more" hover-class="dp-btn-hover" role="button" @click="goUserPosts">
            <text>查看更多</text>
            <OutlineIcon type="arrow-right" :size="24" color="var(--primary)" />
          </view>
        </view>
      </view>

      </template>
    </scroll-view>

    <!-- 持仓详情弹窗：中部持仓标识点击展开（复用全局 modal-mask/modal-card 窗体），
         透出该股持仓明细（收益率/盈亏/股数/成本）+ 该股近期操作动态（复用 holdEvents 时间线） -->
    <view v-if="holdDetail" class="modal-mask" @click="closeHoldDetail">
      <view class="modal-card" @click.stop>
        <view class="modal-head">
          <text class="modal-title">{{ holdDetail.name || holdDetail.code }} 持仓详情</text>
          <view class="modal-close" role="button" aria-label="关闭" @click="closeHoldDetail">
            <OutlineIcon type="close" :size="26" color="var(--text-3)" />
          </view>
        </view>
        <!-- 持仓明细行：口径与列表行一致（现价−成本 驱动收益率/盈亏），涨红跌绿 -->
        <view class="hd-grid">
          <view class="hd-cell">
            <text class="hd-k">收益率</text>
            <text class="hd-v" :class="holdPct(holdDetail) >= 0 ? 'up' : 'down'">{{ holdPctText(holdDetail) }}</text>
          </view>
          <view class="hd-cell">
            <text class="hd-k">盈亏</text>
            <text class="hd-v" :class="holdPnl(holdDetail) >= 0 ? 'up' : 'down'">{{ holdPnlText(holdDetail) }}</text>
          </view>
          <view class="hd-cell">
            <text class="hd-k">持股数</text>
            <text class="hd-v">{{ fmtShareNum(holdDetail.holdingShares || 0) }} 股</text>
          </view>
          <view class="hd-cell">
            <text class="hd-k">成本价</text>
            <text class="hd-v">{{ holdDetail.holdingCost?.toFixed(2) ?? "--" }}</text>
          </view>
          <view class="hd-cell">
            <text class="hd-k">现价</text>
            <text class="hd-v" :class="pctClass(holdDetail.pct)">{{ typeof holdDetail.price === 'number' ? formatPrice(holdDetail.price) : "--" }}</text>
          </view>
          <view class="hd-cell">
            <text class="hd-k">市值</text>
            <text class="hd-v">{{ holdValueText(holdDetail) }}</text>
          </view>
        </view>
        <!-- 该股近期操作动态：holdEvents 已含全量事件（RPC 拉取 10 条），按 code 过滤即得；
             记录超 5 条时该区域独立滚动（.dp-hd-ev-list 限制高度），避免弹窗被无限撑高 -->
        <view class="hd-ev-head">
          <text class="hd-k">近期操作</text>
        </view>
        <view v-if="holdDetailEvents.length === 0" class="dp-wl-empty">暂无该股操作动态</view>
        <view v-else class="dp-hd-ev-list">
          <view v-for="(e, i) in holdDetailEvents" :key="i" class="dp-post-row">
            <text class="dp-post-time">{{ formatRelative(e.createdAt) }}</text>
            <view class="dp-ev">
              <text :class="['dp-ev-tag', evCls(e.kind)]">{{ evLabel(e.kind) }}</text>
              <text class="dp-ev-name truncate">{{ e.name }}</text>
              <text class="dp-ev-shares">{{ fmtShareNum(e.shares) }}股</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import OutlineIcon from "@/components/OutlineIcon.vue";
import UserAvatar from "@/components/UserAvatar.vue";
import LevelTag from "@/components/LevelTag.vue";
import { getSupabase } from "@/api/supabase";
import { resolveSecid, marketCharFor, type Market } from "@/utils/period";
import { fetchSnapshot } from "@/api/quote";
import { addWatch, removeWatch, isWatched } from "@/store/watchlist";
import { useUser, userState } from "@/store/user";
import { vipActive } from "@/store/level";
import { vipGatedFrame } from "@/utils/avatarFrame";
import { formatLoginCity } from "@/utils/geo";
import { useDmTarget, useCommunityUserTarget, usePostTarget } from "@/store/community";
import { useFollow } from "@/store/follow";
import { goTab, openAuth, openInMarket, requireLogin } from "@/store/nav";
import { communityRepo, formatRelative, unpackCards, type CommunityPost } from "@/api/community";

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
  vip: boolean;
  vip_expires_at: string | null;
  signature: string;
  location: string;
  created_at: string;
  allow_dm: boolean; // 允许私信（需求 B，默认 true）
  public_watchlist: boolean; // 公开自选/持仓股（需求 B，默认 true）
}

/** 他人自选股行（code/market/name/holding_cost 来自后端公开 RPC，行情为前端实时补充）。
 *  holding_cost：该用户在此标的的持仓成本（未持仓为空）——公开自选即公开持仓收益，
 *  页面仅在行内展示「持有」徽标与持仓收益率，不单独展示成本金额。 */
interface WatchRow {
  code: string;
  market: string;
  name: string;
  price?: number;
  pct?: number;
  holdingCost?: number;
  holdingShares?: number;
}

const uid = ref("");
const loading = ref(true);
const notFound = ref(false);
const profile = ref<ProfileDetail | null>(null);

// —— 自选股（需求 B：受 public_watchlist 权限控制） ——
const watchlist = ref<WatchRow[]>([]);
const watchlistLoading = ref(false);
const watchError = ref(false);
// 本人或对方公开 → 展示自选股列表；否则（他人且未公开）显示「对方未公开自选/持仓股」
const showWatchlist = computed(
  () => !!profile.value && (isSelf.value || profile.value.public_watchlist === true)
);
const watchlistHidden = computed(
  () => !!profile.value && !isSelf.value && profile.value.public_watchlist !== true
);

// —— TA 的最新动态（最多 5 条，含发布时间 + 内容摘要） ——
const recentPosts = ref<CommunityPost[]>([]);
const recentLoading = ref(false);

const { setDmTarget } = useDmTarget();
// 跨页深链：资料页「查看更多 TA 的动态」→ 切社区并定位该用户帖子（复用 useCommunityUserTarget）
const { setUserTarget } = useCommunityUserTarget();

const nameText = computed(() =>
  profile.value ? profile.value.display_name || profile.value.username || "用户" : ""
);
const isSelf = computed(
  () => !!user.loggedIn && !!profile.value && profile.value.id === userState.userId
);
// VIP 有效态（黑金昵称 / 会员金框 / 金冠徽章共用；过期自动退回普通视觉）
const isVip = computed(() => vipActive(profile.value?.vip, profile.value?.vip_expires_at));
const ipLocation = computed(() => {
  const location = profile.value?.location;
  return location ? formatLoginCity(location) : "";
});
// 关注态（与社区帖子关注同源：服务端 follows 表，以 uid 为键）
const { follows, toggleFollow } = useFollow();
const following = computed(() => !!profile.value && follows.value.has(profile.value.id));
// 关注按钮文案（未登录 → 登录后关注，与私信「登录后私信」同源）
const followLabel = computed(() => {
  if (!user.loggedIn) return "登录后关注";
  return following.value ? "已关注" : "关注";
});
// 私信按钮可用性与文案（未登录 / 对方关闭 / 正常 三态）
const canDm = computed(
  () => user.loggedIn && !!profile.value && profile.value.allow_dm === true
);
const dmLabel = computed(() => {
  if (!user.loggedIn) return "登录后私信";
  if (profile.value?.allow_dm === false) return "未开启私信";
  return "私信";
});

function onFollowToggle() {
  if (!user.loggedIn) return; // 未登录：关注按钮为「登录后关注」禁用态，点击无效
  const id = profile.value?.id;
  if (!id) return;
  toggleFollow(id);
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
  // 刷新容错：不预先清空旧 profile（页面实例与 uid 一一对应，旧数据必属同一用户），
  // 拉取失败时保留旧资料而非跳「用户不存在」，避免网络抖动误报
  try {
    const sb = getSupabase();
    if (!sb || !uid.value) {
      notFound.value = true;
      return;
    }
    const { data, error } = await sb
      .from("profiles")
      .select("id, display_name, username, avatar_url, avatar_frame, level, exp, vip, vip_expires_at, signature, location, created_at, allow_dm, public_watchlist")
      .eq("id", uid.value)
      .single();
    // 无此用户（PGRST116）→ 明确的「不存在」错误页；其它查询错误 → 有旧资料则保留，否则降级错误页
    if (error) {
      if ((error as any).code === "PGRST116" || !profile.value) notFound.value = true;
      return;
    }
    if (!data) {
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
      vip: data.vip === true,
      vip_expires_at: typeof data.vip_expires_at === "string" ? data.vip_expires_at : null,
      signature: typeof data.signature === "string" ? data.signature : "",
      location: typeof data.location === "string" ? data.location : "",
      created_at: typeof data.created_at === "string" ? data.created_at : "",
      allow_dm: typeof data.allow_dm === "boolean" ? data.allow_dm : true,
      public_watchlist: typeof data.public_watchlist === "boolean" ? data.public_watchlist : true,
    };
    // 权限判定：本人或对方公开 → 拉取自选股（前端控制 + 后端 RPC 再校验一次）
    if (profile.value.public_watchlist === true || isSelf.value) {
      loadWatchlist();
      loadHoldingEvents(); // 持仓操作事件可见性与自选/持仓列表同口径（RPC 内再校验一次）
    } else {
      watchlist.value = [];
      holdEvents.value = [];
    }
    // 拉取 TA 的最新动态（最多 5 条），与自选股相互独立
    loadRecentPosts();
  } catch {
    // 刷新容错：异常时保留旧资料（若有），避免网络抖动误报「用户不存在」
    if (!profile.value) notFound.value = true;
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
      holdingCost: typeof d.holding_cost === "number" && d.holding_cost > 0 ? d.holding_cost : undefined,
      holdingShares: typeof d.holding_shares === "number" && d.holding_shares > 0 ? d.holding_shares : undefined,
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

// —— TA 的持仓操作事件（建仓/加仓/减仓/清仓）：与帖子合并为动态时间线 ——
type EvKind = "open" | "add" | "reduce" | "close";
interface HoldEvent {
  kind: EvKind;
  code: string;
  name: string;
  shares: number;
  createdAt: number;
}
const holdEvents = ref<HoldEvent[]>([]);

/** 拉取 TA 最近的持仓操作事件（经 get_user_holding_events RPC，
 *  后端按 public_watchlist 裁决可见性，口径与自选/持仓列表一致；失败静默不影响帖子展示） */
async function loadHoldingEvents() {
  const sb = getSupabase();
  if (!sb || !uid.value) return;
  try {
    const { data, error } = await sb.rpc("get_user_holding_events", {
      p_target: uid.value,
      p_limit: 10,
    });
    if (error || !data) return;
    holdEvents.value = (data as any[]).map((d) => ({
      kind: d.kind as EvKind,
      code: d.code,
      name: d.name || d.code,
      shares: Number(d.shares) || 0,
      createdAt: new Date(d.created_at).getTime(),
    }));
  } catch {
    /* 事件拉取失败静默 */
  }
}

/** 动态合并时间线：帖子 + 持仓事件按时间倒序取前 20 条（超 20 条由「查看更多」跳社区全量） */
interface ActivityItem {
  time: number;
  type: "post" | "event";
  post?: CommunityPost;
  ev?: HoldEvent;
}
const activityFeed = computed<ActivityItem[]>(() => {
  const items: ActivityItem[] = [
    ...recentPosts.value.map((p) => ({
      time: new Date(p.createdAt).getTime(),
      type: "post" as const,
      post: p,
    })),
    ...holdEvents.value.map((e) => ({ time: e.createdAt, type: "event" as const, ev: e })),
  ];
  return items.sort((a, b) => b.time - a.time).slice(0, 20);
});

// 事件文案与着色：建仓/加仓=红（做多方向）、减仓/清仓=绿（离场方向），与全站涨红跌绿一致
const EV_META: Record<EvKind, { label: string; cls: string }> = {
  open: { label: "建仓", cls: "up" },
  add: { label: "加仓", cls: "up" },
  reduce: { label: "减仓", cls: "down" },
  close: { label: "清仓", cls: "down" },
};
function evLabel(k: EvKind): string {
  return EV_META[k]?.label || k;
}
function evCls(k: EvKind): string {
  return EV_META[k]?.cls || "";
}
function openEventStock(e: HoldEvent) {
  openInMarket(e.code, "auto");
}
// 帖子深链目标（跨页定位）：写入 CommunityView 消费，复用其 focusPost 滚动 + 高亮
const { setPostTarget } = usePostTarget();
/** 动态区点击分发：事件行 → 行情页该股；帖子行 → 社区定位该帖（而非仅跳社区首页）。 */
function onActivityClick(a: ActivityItem) {
  if (a.type === "event" && a.ev) openEventStock(a.ev);
  else if (a.type === "post" && a.post) openPost(a.post);
}
/** 点击某条帖子：写入帖子深链目标 → 切社区 tab → 返回（社区页消费目标滚动定位到该帖）。 */
function openPost(p: CommunityPost) {
  setPostTarget({ postId: p.id, expandComments: false });
  goTab("community");
  uni.navigateBack({
    delta: 1,
    fail: () => uni.reLaunch({ url: "/pages/index/index" }),
  });
}
/** 股数展示：整数千分位、非整数保留两位小数 */
function fmtShareNum(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(2);
}

/** 拉取 TA 的最新动态（最多 20 条）：走社区 listByUser 服务端按 user_id 过滤，
 *  与社区页「该用户帖子模式」同源，保证点赞 / 头像权威一致。 */
async function loadRecentPosts() {
  if (!uid.value) return;
  recentLoading.value = true;
  try {
    const res = await communityRepo.listByUser(uid.value, { limit: 20 });
    // 刷新容错：读失败伪装成空数组——已有动态时保留旧列表（允许数据延迟），
    // 首次为空正常显示「暂无动态」；页面实例与 uid 一一对应，无串用户风险
    if (res.length === 0 && recentPosts.value.length > 0) return;
    recentPosts.value = res.slice(0, 20);
  } catch {
    // 异常时保留旧动态，不主动清空
  } finally {
    recentLoading.value = false;
  }
}

/** 帖子内容摘要（用于动态列表一行展示）：优先取正文；无正文时取卡片一句话概述。 */
function postSummary(p: CommunityPost): string {
  let s: string;
  if (p.content && p.content.trim()) {
    s = p.content.trim();
  } else if (p.card) {
    // 附加卡片为持仓（单张 / 多张包）；旧数据的其他卡片类型统一兜底为一句概述
    const list = unpackCards(p.card);
    if (list.length === 1) s = `持仓 · ${list[0].stock || list[0].code || "—"}`;
    else if (list.length > 1) s = `持仓 · ${list[0].stock || list[0].code || "—"} 等 ${list.length} 只`;
    else s = "分享了一张卡片";
  } else {
    s = "（无内容）";
  }
  return s.length > 50 ? s.slice(0, 50) + "…" : s;
}

// 涨跌色：缺失/零值 → flat（价格黑、涨跌幅灰），仅真实涨/跌才染色——与全局 trendCls 口径一致
function pctClass(pct?: number): string {
  if (typeof pct !== "number") return "flat";
  return pct > 0 ? "up" : pct < 0 ? "down" : "flat";
}
function formatPrice(p: number): string {
  return p.toFixed(2);
}
function formatPct(p?: number): string {
  if (typeof p !== "number") return "";
  return `${p > 0 ? "+" : ""}${p.toFixed(2)}%`;
}
/** 对方在该标的的持仓收益率：(现价 − 对方成本) / 对方成本 × 100；成本或行情缺失不展示 */
function holdPct(w: WatchRow): number {
  if (!w.holdingCost || typeof w.price !== "number" || !w.price) return 0;
  return ((w.price - w.holdingCost) / w.holdingCost) * 100;
}
function holdPctText(w: WatchRow): string {
  const p = holdPct(w);
  return `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
}
/** 对方持股数（千分位整数）；未回传时不显示第二行 */
function holdingShares(w: WatchRow): string {
  return w.holdingShares ? w.holdingShares.toLocaleString("en-US") : "--";
}

// —— 持仓详情弹窗：列表中部持仓标识点击展开 ——
const holdDetail = ref<WatchRow | null>(null);
function openHoldDetail(w: WatchRow) {
  holdDetail.value = w;
}
function closeHoldDetail() {
  holdDetail.value = null;
}
/** 该股近期操作动态：holdEvents 为全量事件（loadHoldingEvents 拉取 10 条），按 code 过滤 */
const holdDetailEvents = computed<HoldEvent[]>(() => {
  if (!holdDetail.value) return [];
  return holdEvents.value.filter((e) => e.code === holdDetail.value!.code);
});
/** 盈亏（元）＝(现价−成本)×股数；行情/成本缺失 → 0（显示层用 "--" 判定） */
function holdPnl(w: WatchRow): number {
  if (!w.holdingCost || typeof w.price !== "number" || !w.holdingShares) return 0;
  return (w.price - w.holdingCost) * w.holdingShares;
}
function holdPnlText(w: WatchRow): string {
  if (!w.holdingCost || typeof w.price !== "number" || !w.holdingShares) return "--";
  const v = holdPnl(w);
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}
/** 持仓市值（元）＝现价×股数；千分位整数展示 */
function holdValueText(w: WatchRow): string {
  if (typeof w.price !== "number" || !w.holdingShares) return "--";
  return Math.round(w.price * w.holdingShares).toLocaleString("en-US");
}
function openStock(w: WatchRow) {
  openInMarket(w.code, w.market as Market);
  // 必须同步切到行情 Tab，否则 MarketView 不激活、pendingCode 无人消费（与 StockTag/index 一致）
  goTab("market");
  // 资料页是 navigateTo 压在 Tab 栈上层的子页面，仅切 Tab 不足以露出行情页，
  // 必须把本页 pop 出栈（与 startDm / goUserPosts 同款跨页深链范式），下层行情 Tab 才可见。
  uni.navigateBack({
    delta: 1,
    fail: () => uni.reLaunch({ url: "/pages/index/index" }),
  });
}

/** 资料页自选星标：仿行情页 .qh-star 逻辑，点击加入/移除自选（不触发整卡跳转，已 @click.stop）。
 *  未登录且后端开启时引导登录，避免「加了却看不到」。 */
async function toggleWatch(w: WatchRow) {
  if (!requireLogin()) return;
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

/** 等级标签点击 → 我的等级页（未登录由等级页守卫拦截跳登录，与「我的」页 goLevel 同款） */
function goLevel() {
  uni.navigateTo({ url: "/pages/profile/level" });
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
    otherFrame: vipGatedFrame(profile.value.avatar_frame, isVip.value),
    otherVip: isVip.value,
  });
  goTab("community");
  uni.navigateBack({
    delta: 1,
    fail: () => uni.reLaunch({ url: "/pages/index/index" }),
  });
}

/** 查看更多 TA 的动态：写入「某用户帖子」深链目标 → 切社区 tab → 返回，
 *  社区页消费目标后进入该用户帖子模式并展示全部帖子（支持滚动加载）。 */
function goUserPosts() {
  if (!profile.value) return;
  setUserTarget({ userId: profile.value.id, userName: nameText.value });
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
  flex: none;
  min-width: 0;
  max-width: calc(100% - 150rpx);
  font-size: var(--font-2xl);
  font-weight: 400;
  color: var(--text);
}
.dp-username {
  font-size: var(--font-sm);
  color: var(--text-2);
}
.dp-location {
  font-size: var(--font-xs);
  color: var(--text-3);
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
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.dp-level-hover {
  opacity: 0.85;
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
  /* 固定单行 112rpx × 5 = 560rpx，恰好显示 5 个，超出滚动（需求：自选股只显示 5 个，多了滚动） */
  max-height: 560rpx;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.dp-wl-row {
  box-sizing: border-box;
  height: 112rpx;
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
  width: 180rpx; /* 与持仓列同宽：固定列宽保证上下行的持仓信息/行情信息右边缘完全对齐 */
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
/* 对方持仓标识：与行情区 .dp-wl-q 同构分列（两行右对齐、无背景），置于其左侧。
   第一行持仓收益率与现价同为 font-md，第二行图标+股数与涨跌幅同为 font-xs、gap 4rpx 一致，
   两列上下行完全对齐；行内 gap 8rpx 紧凑排布。
   ⚠️ hold 与 q 必须固定同宽：flex 布局下若宽度随内容浮动，
   不同行的「行情列」宽窄不一，会把持仓列的右边缘顶得上下错位 */
.dp-wl-hold {
  flex: none;
  width: 180rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;
}
.dp-wl-holdrow {
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.dp-wl-holdpct {
  font-size: var(--font-md);
  font-variant-numeric: tabular-nums;
}
.dp-wl-holdpct.up {
  color: var(--up);
}
.dp-wl-holdpct.down {
  color: var(--down);
}
.dp-wl-shares {
  font-size: var(--font-xs);
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
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

/* TA 的动态（最多 20 条：发布时间 + 内容摘要；底部「查看更多」常驻） */
.dp-posts {
  display: flex;
  flex-direction: column;
}
/* TA 的动态：条目超 10 条时该区块独立滚动（最多 20 条，查看更多常驻可跳社区全量） */
.dp-posts-scroll {
  max-height: 720rpx;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
/* 持仓详情弹窗内「近期操作」：记录超 5 条时该区域独立滚动，避免弹窗被无限撑高 */
.dp-hd-ev-list {
  max-height: 340rpx;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.dp-post-row {
  display: flex;
  align-items: baseline;
  gap: 16rpx;
  padding: 14rpx 0;
  border-top: 1rpx solid var(--border);
}
.dp-post-row:first-child {
  border-top: none;
}
.dp-post-time {
  flex: none;
  width: 118rpx;
  font-size: var(--font-xs);
  color: var(--text-3);
}
.dp-post-sum {
  flex: 1;
  min-width: 0;
  /* 与持仓操作动态行的股票名（.dp-ev-name = --font-sm）统一字号 */
  font-size: var(--font-sm);
  color: var(--text);
}
/* 持仓操作事件行（建仓/加仓/减仓/清仓）：操作标签着色 + 股票名 + 股数，整行可点跳行情 */
.dp-post-row.tappable {
  cursor: pointer;
}
.dp-ev {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.dp-ev-tag {
  flex: none;
  font-size: var(--font-xs);
  padding: 2rpx 12rpx;
  border-radius: 6rpx;
  line-height: 1.4;
}
.dp-ev-tag.up {
  color: var(--up);
  background: rgba(239, 35, 42, 0.1);
}
.dp-ev-tag.down {
  color: var(--down);
  background: rgba(9, 176, 122, 0.12);
}
.dp-ev-name {
  min-width: 0;
  font-size: var(--font-sm);
  color: var(--text);
}
.dp-ev-shares {
  flex: none;
  margin-left: auto;
  font-size: var(--font-xs);
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
/* 「查看更多」入口：整行可点，与主色呼应 */
.dp-posts-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  margin-top: 12rpx;
  padding: 14rpx 0;
  font-size: var(--font-sm);
  color: var(--primary);
  cursor: pointer;
  border-top: 1rpx solid var(--border);
}

/* 持仓详情弹窗：明细 2×3 网格（复用全局 modal-card 窗体），数值涨红跌绿 */
.hd-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16rpx 24rpx;
}
.hd-cell {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12rpx;
  background: var(--card-2);
  border-radius: 12rpx;
  padding: 12rpx 16rpx;
}
.hd-k {
  flex: none;
  font-size: var(--font-xs);
  color: var(--text-2);
}
.hd-v {
  font-size: var(--font-sm);
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.hd-v.up {
  color: var(--up);
}
.hd-v.down {
  color: var(--down);
}
.hd-ev-head {
  margin-top: 4rpx;
}
</style>
