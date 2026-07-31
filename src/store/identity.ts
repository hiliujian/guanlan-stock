// =====================================================================
// 本地身份（昵称）
// 当前未接入登录体系（Supabase 未配置），社区以"本地昵称"标识发布者。
// 后续开放 Supabase 登录后，可平滑替换为真实用户资料（见 store/user.ts）。
// =====================================================================
const KEY = "guanlan_nick";
const AVATAR_KEY = "guanlan_avatar";

/** 读取本地头像 emoji（可为空串，表示使用首字母占位头像） */
export function getMyAvatar(): string {
  try {
    return localStorage.getItem(AVATAR_KEY) || "";
  } catch {
    return "";
  }
}

/** 保存用户选择的头像 emoji（空串表示退回首字母占位） */
export function setMyAvatar(raw: string): void {
  try {
    localStorage.setItem(AVATAR_KEY, raw || "");
  } catch {
    /* 静默降级 */
  }
}

/** 读取本地昵称；首次访问自动生成一个"股友_xxxx"的默认昵称 */
export function getMyName(): string {
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
