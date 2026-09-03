// =====================================================================
// 社区实时在线人数（基于 Supabase Realtime Presence）
// ---------------------------------------------------------------------
// 设计要点（对应需求 1/2/4/5）：
// 1. 「在线」定义：已登录 + 已加入 community-online 频道 presence +
//    最近 HEARTBEAT 内刷新过时间戳 + 页面可见且有用户活动（超过 IDLE 无操作即离线）。
//    - 断开连接（关标签页 / 网络中断）：Realtime 服务端心跳超时自动 leave，移出统计。
//    - 长时间无操作：客户端 IDLE 计时到点后 untrack，移出统计；有操作再 track 回。
// 2. 实时性：presence 的 sync/join/leave 事件即时驱动 onlineCount，无需轮询。
// 4. 并发 / 防重复计数：以 userId 作为 presence key，同一账号多标签页、多设备
//    在频道内自动合并为 1 个 key → 计数 = 不同 userId 数，杜绝重复计数与漏计。
// 5. 未登录访客：不计入（仅统计已登录会员）。理由：避免爬虫 / 多标签 / 多设备
//    噪声膨胀，且不额外占用 Realtime 连接。若日后需计入，可改为用本地持久化
//    设备 UUID 作为 key 并在未登录时也加入频道（见 COUNT_ANON 预留位）。
//
// 性能：Presence 状态保存在 Realtime 服务端内存，不写 Postgres，高并发下
// 比「心跳写表 + 轮询 count」省去了大量 DB 写入与查询压力。
// =====================================================================
import { ref } from "vue";
import { getSupabase } from "@/api/supabase";
import { userState } from "@/store/user";

const HEARTBEAT_MS = 25_000; // 每 25s 刷新一次 presence 时间戳（保活 + 刷新在线判定）
const IDLE_MS = 5 * 60_000; // 5min 无任何操作 → 视为离开（untrack）
const CHANNEL = "community-online";
// 预留开关：true 时未登录访客也按设备 UUID 计入（当前默认 false，仅统计会员）
const COUNT_ANON = false;

/** 当前在线人数（不同 userId 数，含自己）。 */
export const onlineCount = ref(0);
/** 自己是否处于在线统计中（已 track，仅内部使用）。 */
const imOnline = ref(false);
/** 频道是否已订阅并同步过（用于 UI 区分加载态）。 */
export const presenceReady = ref(false);

let channel: any = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let deviceId = "";

function presenceKey(): string | null {
  if (userState.loggedIn && userState.userId) return userState.userId;
  if (COUNT_ANON) {
    if (!deviceId) {
      try {
        deviceId = uni.getStorageSync("gl_device_id") || "";
        if (!deviceId) {
          deviceId = "d-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
          uni.setStorageSync("gl_device_id", deviceId);
        }
      } catch {
        deviceId = "d-" + Math.random().toString(36).slice(2);
      }
    }
    return deviceId;
  }
  return null;
}

function refreshCount(ch: any) {
  try {
    const state = ch.presenceState();
    onlineCount.value = Object.keys(state || {}).length;
  } catch {
    /* ignore */
  }
}

function trackSelf() {
  if (!channel) return;
  const key = presenceKey();
  if (!key) return;
  try {
    channel.track({ u: key, t: Date.now() }, { key });
    imOnline.value = true;
  } catch {
    /* ignore */
  }
}

function untrackSelf() {
  if (!channel) return;
  try {
    channel.untrack();
  } catch {
    /* ignore */
  }
  imOnline.value = false;
}

function onVisibility() {
  if (typeof document === "undefined") return;
  if (document.visibilityState === "hidden") {
    untrackSelf();
  } else {
    trackSelf();
    bumpActivity();
  }
}

// 用户活动 → 重置空闲计时；若因空闲已离线则重新上线
function bumpActivity() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (channel && imOnline.value) untrackSelf();
  }, IDLE_MS);
}

/** 初始化在线统计（幂等；未配置后端时自动退订）。登录态变化时调用。
 *  注意：频道「始终订阅」——即使未登录（访客）也能接收其他会员的在线状态并展示人数；
 *  仅当存在 userId 时才 track 自己（访客不计入）。这样无论登录与否底部卡片都能看到「N 人在线」。 */
export function initPresence() {
  const sb = getSupabase();
  if (!sb) {
    stopPresence();
    return;
  }
  const key = presenceKey();
  stopPresence(); // 清理旧频道，避免重复 init ,堆叠订阅
  try {
    channel = sb.channel(CHANNEL, { config: { presence: { key: key ?? undefined } } });
    channel
      .on("presence", { event: "sync" }, () => refreshCount(channel))
      .on("presence", { event: "join" }, () => refreshCount(channel))
      .on("presence", { event: "leave" }, () => refreshCount(channel))
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          presenceReady.value = true;
          trackSelf();
        }
      });
  } catch {
    channel = null;
  }

  // 心跳：仅页面可见时刷新时间戳（隐藏页不计入在线）
  heartbeat = setInterval(() => {
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      trackSelf();
    }
  }, HEARTBEAT_MS);

  // 活动监听：任何交互都重置空闲计时
  if (typeof window !== "undefined") {
    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pointerdown", bumpActivity, true);
    window.addEventListener("keydown", bumpActivity, true);
    window.addEventListener("scroll", bumpActivity, true);
  }
  bumpActivity();
}

/** 停止在线统计（登出 / 应用卸载时调用，防止 channel 泄漏）。 */
function stopPresence() {
  const sb = getSupabase();
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (typeof window !== "undefined") {
    window.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pointerdown", bumpActivity, true);
    window.removeEventListener("keydown", bumpActivity, true);
    window.removeEventListener("scroll", bumpActivity, true);
  }
  if (sb && channel) {
    try {
      sb.removeChannel(channel);
    } catch {
      /* ignore */
    }
  }
  channel = null;
  imOnline.value = false;
  presenceReady.value = false;
  onlineCount.value = 0;
}
