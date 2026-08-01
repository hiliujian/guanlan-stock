// =====================================================================
// 本地身份（昵称）
// 已登录时优先返回云端账号用户名 / 昵称，保证社区与「我的」同一身份；
// 未登录时回退到本地昵称（游客模式），行为与接入登录前一致。
// =====================================================================
const KEY = "guanlan_nick";

import { userState } from "@/store/user";

/** 读取我的昵称：已登录用账号用户名 / 昵称，否则回退本地昵称 */
export function getMyName(): string {
  if (userState.loggedIn && userState.profile) {
    return userState.profile.username || userState.profile.display_name || userState.email || "我";
  }
  try {
    let n = localStorage.getItem(KEY);
    if (!n) {
      n = "股友" + Math.floor(1000 + Math.random() * 9000);
      localStorage.setItem(KEY, n);
    }
    return n;
  } catch {
    return "我";
  }
}

/** 保存用户自定义的昵称（空值忽略） */
export function setMyName(raw: string): void {
  const v = (raw || "").trim();
  if (!v) return;
  try {
    localStorage.setItem(KEY, v.slice(0, 12));
  } catch {
    /* 静默降级 */
  }
}
