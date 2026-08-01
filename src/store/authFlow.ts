// =====================================================================
// 登录流程编排 store（前端状态机）
// ---------------------------------------------------------------------
// 负责邮件确认链接回调的 UI 状态：用户点击邮件链接后打开应用时的反馈
// （验证中 / 成功 / 过期 / 已确认 / 网络错误）。业务页面只消费 authFlow.callback
// 的响应式状态，不关心 Supabase 细节。
// =====================================================================
import { reactive } from "vue";
import { verifyEmailToken } from "@/api/auth";
import { syncSession } from "@/store/user";

type CallbackStatus = "verifying" | "success" | "expired" | "already" | "error" | "network";

export const authFlow = reactive({
  callback: { active: false, status: "verifying" as CallbackStatus, message: "" },
});

// ---------------- 邮件确认链接回调 ----------------
/** 由应用启动处调用：解析 URL 中的 token / error，完成验证或给出清晰提示 */
export async function handleCallback() {
  if (typeof window === "undefined" || !window.location) return;
  const params = new URLSearchParams(window.location.search);

  // 1) Supabase 验证失败后回跳带 error（链接过期 / 已确认 / 网络等）
  const error = params.get("error");
  if (error) {
    authFlow.callback = { active: true, status: statusFromError(params.get("error_description") || ""), message: translateCallbackError(params.get("error_description") || "") };
    cleanUrl();
    return;
  }

  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  // 2) 链接带 token_hash + type：直接走 verifyOtp 完成验证（邮箱确认 OTP 流）
  if (tokenHash && type) {
    authFlow.callback = { active: true, status: "verifying", message: "正在验证邮箱…" };
    const r = await verifyEmailToken(tokenHash, type);
    if (!r.ok) {
      authFlow.callback = { active: true, status: statusFromError(r.error || ""), message: r.error || "验证失败，请重试" };
      cleanUrl();
      return;
    }
    await syncSession();
    cleanUrl();
    authFlow.callback = { active: true, status: "success", message: "验证成功，正在进入…" };
    setTimeout(closeCallbackAndGo, 1200);
    return;
  }

  // 3) 隐式流 / PKCE 回流（URL 带会话令牌）：由 Supabase detectSessionInUrl 自动建会话，
  //    这里仅轮询等待，最多约 8 秒，登录成功则进入，否则提示失败。
  //    ⚠️ 关键修复：普通启动（URL 中没有任何回调令牌）必须直接 return，
  //    绝不开启「正在完成登录…」覆盖层 —— 否则每次打开 App 都会先全屏弹出
  //    「当前未登录」空态盖住首页，8 秒轮询失败后再弹「验证未完成」弹窗，
  //    造成空态页面重叠（未登录空态 vs 行情页「输入代码或名称」空态）/ 误弹窗。
  const hasCallbackToken =
    /access_token|token_type/i.test(window.location.hash) || params.has("code");
  if (!hasCallbackToken) return;

  authFlow.callback = { active: true, status: "verifying", message: "正在完成登录…" };
  for (let i = 0; i < 20; i++) {
    // 用户若在空态页主动点击「去登录」，closeCallback 会把 active 置否，这里及时退出轮询，
    // 避免后台轮询成功后又 reLaunch 把用户从登录页踢回首页。
    if (!authFlow.callback.active) return;
    if (await syncSession()) {
      authFlow.callback = { active: true, status: "success", message: "登录成功，正在进入…" };
      cleanUrl();
      setTimeout(closeCallbackAndGo, 1000);
      return;
    }
    await delay(400);
  }
  authFlow.callback = { active: true, status: "error", message: "登录未完成，请重新登录或重试" };
  cleanUrl();
}

/** 关闭回调反馈层（「去登录」按钮调用） */
export function closeCallback() {
  authFlow.callback.active = false;
}

function statusFromError(desc: string): CallbackStatus {
  const d = (desc || "").toLowerCase();
  if (/expired|invalid/i.test(d)) return "expired";
  if (/already confirmed/i.test(d)) return "already";
  if (/network|fetch/i.test(d)) return "network";
  return "error";
}
function translateCallbackError(desc: string): string {
  const s = statusFromError(desc);
  if (s === "expired") return "验证链接已过期或无效，请重新获取验证邮件或重新注册";
  if (s === "already") return "该邮箱已完成验证，请直接登录";
  if (s === "network") return "网络异常，请检查网络后重试";
  return desc || "验证失败，请重试";
}
/** 去除 URL 中的 token / error 参数，避免刷新后重复触发 */
function cleanUrl() {
  try {
    const url = window.location.pathname + window.location.hash;
    window.history.replaceState(null, "", url);
  } catch {
    /* 忽略 */
  }
}
/** 验证成功后跳回首页（已登录态） */
function closeCallbackAndGo() {
  authFlow.callback.active = false;
  uni.reLaunch({ url: "/pages/index/index" }).catch(() => {});
}
function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
