// =====================================================================
// 认证层（极薄封装，仅透传 Supabase Auth）
// 业务/页面按需引用下列函数，与平台无关（仅透传 Supabase Auth）
// =====================================================================
import { getSupabase } from "./supabase";

export interface AuthResult {
  ok: boolean;
  error?: string;
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: BACKEND_NOT_CONFIGURED };
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: translateSupabaseError(error.message) };
  return { ok: true };
}

/**
 * 处理邮件确认链接：链接带 token_hash + type，用 verifyOtp 完成验证并写入会话。
 * 返回 ok=false 时 error 已是中文（过期 / 已确认 / 网络等）。
 */
export async function verifyEmailToken(tokenHash: string, type: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: BACKEND_NOT_CONFIGURED };
  const { data, error } = await sb.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as any,
  });
  if (error) return { ok: false, error: translateSupabaseError(error.message) };
  if (!data.session) return { ok: false, error: "验证未完成，请重试" };
  return { ok: true };
}

/**
 * 发送邮箱验证码（忘记密码 / 验证码方式，主流小程序做法）。
 * 复用 Supabase 邮箱 OTP：向该邮箱发送 6 位验证码；shouldCreateUser=false
 * 保证只有已注册邮箱能收到，未注册邮箱会报错（前端提示「账号不存在」）。
 * 注意：该函数无需登录即可调用（找回密码的前提就是用户登不进去）。
 */
export async function requestResetCode(email: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: BACKEND_NOT_CONFIGURED };
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, data: { purpose: "reset" } },
  });
  if (error) return { ok: false, error: translateSupabaseError(error.message) };
  return { ok: true };
}

/**
 * 校验邮箱验证码：通过后 Supabase 会建立有效会话（已等效登录），
 * 随后到「重设密码」页调用 updatePassword 即可修改密码。
 */
export async function verifyResetCode(email: string, code: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: BACKEND_NOT_CONFIGURED };
  const { error } = await sb.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  if (error) return { ok: false, error: translateSupabaseError(error.message) };
  return { ok: true };
}

/**
 * 发送注册邮箱验证码（主流小程序做法：OTP 注册/登录合一）。
 * shouldCreateUser: true —— 允许未注册邮箱创建账号；已注册邮箱也会收到码，
 * 验证后等效登录（Supabase 官方 OTP 模式，前端无法预知邮箱是否已注册，
 * 故不强行区分，已注册用户走此流程即直接登录）。
 */
export async function requestSignupCode(email: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: BACKEND_NOT_CONFIGURED };
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, data: { purpose: "signup" } },
  });
  if (error) return { ok: false, error: translateSupabaseError(error.message) };
  return { ok: true };
}

/**
 * 校验注册验证码：通过后 Supabase 建立有效会话，随后由页面调用 updatePassword
 * 设置密码、再以 signOut 收尾，从而完成「邮箱 + 验证码 + 密码」三要素注册流程。
 */
export async function verifySignupCode(email: string, code: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: BACKEND_NOT_CONFIGURED };
  const { error } = await sb.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  if (error) return { ok: false, error: translateSupabaseError(error.message) };
  return { ok: true };
}

/**
 * 在已验证的会话中重设密码（OTP 验证通过、会话建立后调用）。
 * 需要当前存在有效会话：若直接进入本页且未验证，会拦截并提示先验证。
 */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: BACKEND_NOT_CONFIGURED };
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: translateSupabaseError(error.message) };
  return { ok: true };
}

/** 生成随机用户名（如「观澜847291」），注册后自动分配，用户可后续修改 */
export function genRandomUsername(): string {
  return "观澜" + Math.floor(100000 + Math.random() * 900000);
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
}

export interface ProfilePatch {
  display_name?: string;
  username?: string;
  bio?: string;
  avatar_url?: string;
}

export interface UploadResult {
  url: string | null;
  error?: string;
}

// 头像限制：仅允许常见位图格式，单文件 ≤ 2MB（与 storage 桶 file_size_limit 对齐）
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_ALLOWED = ["jpg", "jpeg", "png", "webp"];

/**
 * 上传头像到 Supabase Storage 的 avatars 桶（uni.chooseImage 跨端通用）。
 * H5 下 localPath 是 blob: URL，用 fetch 取二进制；非 H5 走原生 readFileSync + base64。
 * 内置格式 / 大小校验，错误一律中文；上传成功后返回公链。
 */
export async function uploadAvatar(localPath: string): Promise<UploadResult> {
  try {
    const sb = getSupabase();
    if (!sb) return { url: null, error: SERVICE_UNAVAILABLE };
    const { data: u } = await sb.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return { url: null, error: "未登录" };

    let bin: ArrayBuffer;
    let ext: string;

    if (typeof window !== "undefined" && typeof document !== "undefined") {
      // H5：chooseImage 返回 blob: URL，直接 fetch 取二进制
      const resp = await fetch(localPath);
      if (!resp.ok) return { url: null, error: "读取图片失败，请重试" };
      const blob = await resp.blob();
      if (blob.size > AVATAR_MAX_BYTES) return { url: null, error: "图片不能超过 2MB" };
      const type = (resp.headers.get("content-type") || "").toLowerCase();
      ext = (type.split("/")[1] || localPath.split(".").pop() || "").replace("+xml", "");
      if (!AVATAR_ALLOWED.includes(ext)) return { url: null, error: "仅支持 JPG / PNG / WebP 格式" };
      bin = await blob.arrayBuffer();
    } else {
      // 非 H5（微信 / App）：原生读取 base64 → ArrayBuffer
      ext = (localPath.split(".").pop() || "").toLowerCase();
      if (!AVATAR_ALLOWED.includes(ext)) return { url: null, error: "仅支持 JPG / PNG / WebP 格式" };
      const fi: any = await uni.getFileInfo({ filePath: localPath });
      const size = fi?.size;
      if (typeof size === "number" && size > AVATAR_MAX_BYTES) return { url: null, error: "图片不能超过 2MB" };
      const b64 = uni.getFileSystemManager().readFileSync(localPath, "base64") as string;
      bin = uni.base64ToArrayBuffer(b64);
    }

    // 清理同用户旧格式残留（换格式时避免产生孤儿文件），忽略失败
    await sb.storage
      .from("avatars")
      .remove([`${uid}.png`, `${uid}.jpg`, `${uid}.jpeg`, `${uid}.webp`])
      .catch(() => {});

    const path = `${uid}.${ext}`;
    const mime = `image/${ext === "jpg" ? "jpeg" : ext}`;
    const { error } = await sb.storage
      .from("avatars")
      .upload(path, bin, { contentType: mime, upsert: true });
    if (error) return { url: null, error: translateSupabaseError(error.message) };
    const { data } = sb.storage.from("avatars").getPublicUrl(path);
    return { url: data?.publicUrl || null };
  } catch (e) {
    return { url: null, error: "头像上传失败，请重试" };
  }
}

/**
 * 上传社区配图到 Supabase Storage 的 post-images 桶（deploy.sql 1.6 已建）。
 * H5 下 localPath 是 blob: URL，用 fetch 取二进制；非 H5 走原生 readFileSync + base64。
 * 内置格式 / 大小校验，错误一律中文；上传成功后返回公链。
 */
export async function uploadPostImage(localPath: string): Promise<UploadResult> {
  try {
    const sb = getSupabase();
    if (!sb) return { url: null, error: SERVICE_UNAVAILABLE };
    const { data: u } = await sb.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return { url: null, error: "未登录" };

    let bin: ArrayBuffer;
    let ext: string;

    if (typeof window !== "undefined" && typeof document !== "undefined") {
      const resp = await fetch(localPath);
      if (!resp.ok) return { url: null, error: "读取图片失败，请重试" };
      const blob = await resp.blob();
      if (blob.size > AVATAR_MAX_BYTES) return { url: null, error: "图片不能超过 2MB" };
      const type = (resp.headers.get("content-type") || "").toLowerCase();
      ext = (type.split("/")[1] || localPath.split(".").pop() || "").replace("+xml", "");
      if (!AVATAR_ALLOWED.includes(ext)) return { url: null, error: "仅支持 JPG / PNG / WebP 格式" };
      bin = await blob.arrayBuffer();
    } else {
      ext = (localPath.split(".").pop() || "").toLowerCase();
      if (!AVATAR_ALLOWED.includes(ext)) return { url: null, error: "仅支持 JPG / PNG / WebP 格式" };
      const fi: any = await uni.getFileInfo({ filePath: localPath });
      const size = fi?.size;
      if (typeof size === "number" && size > AVATAR_MAX_BYTES) return { url: null, error: "图片不能超过 2MB" };
      const b64 = uni.getFileSystemManager().readFileSync(localPath, "base64") as string;
      bin = uni.base64ToArrayBuffer(b64);
    }

    const fileName = `${Date.now()}.${ext}`;
    const path = `posts/${uid}/${fileName}`;
    const mime = `image/${ext === "jpg" ? "jpeg" : ext}`;
    const { error } = await sb.storage
      .from("post-images")
      .upload(path, bin, { contentType: mime, upsert: true });
    if (error) return { url: null, error: translateSupabaseError(error.message) };
    const { data } = sb.storage.from("post-images").getPublicUrl(path);
    return { url: data?.publicUrl || null };
  } catch (e) {
    return { url: null, error: "图片上传失败，请重试" };
  }
}

// 服务不可用时的统一友好提示（不向用户暴露内部配置/实现细节）
const SERVICE_UNAVAILABLE = "服务暂时不可用，请稍后再试";

// 后端未配置时的提示（部署时未注入 Supabase 环境变量）：与「服务异常」明确区分，
// 否则用户会误以为服务挂了，其实是部署配置问题。
const BACKEND_NOT_CONFIGURED = "后端服务未配置，登录功能暂不可用（部署时未注入 Supabase 环境变量）";

// Supabase / 后端原始英文报错 → 中文（面向中国用户）
// 覆盖登录、注册、资料、自选股同步等最常见场景；未命中则降级为中性提示。
const AUTH_ERROR_MAP: Record<string, string> = {
  "Invalid login credentials": "邮箱或密码错误",
  "Email not confirmed": "邮箱尚未验证，请先到邮箱完成验证",
  "User already registered": "该邮箱已注册，请直接登录",
  "User not found": "账号不存在，请先注册",
  "Invalid email": "邮箱格式不正确",
  "Unable to validate email address: invalid format": "邮箱格式不正确",
  "Password should be at least 6 characters": "密码至少需要 6 位",
  "Signups not allowed for this instance": "当前未开放注册，请稍后再试",
  "Email logins are disabled": "邮箱登录未启用，请联系管理员",
  "Invalid API key": SERVICE_UNAVAILABLE,
  "Invalid JWT": SERVICE_UNAVAILABLE,
  "JWT expired": "登录已过期，请重新登录",
  "Email rate limit exceeded": "操作过于频繁，请稍后再试",
  "Over email send rate limit.": "邮件发送过于频繁，请稍后再试",
  "For security purposes, you can only request this after": "操作过于频繁，请稍后再试",
  "Failed to fetch": "网络异常，请检查网络后重试",
  "Token has expired or is invalid": "验证信息已过期或无效，请重新获取",
  "Email address already confirmed": "该邮箱已完成验证，请直接登录",
  "User already confirmed": "该邮箱已完成验证，请直接登录",
  "User not authenticated": "登录状态已失效，请重新验证邮箱",
  "Auth session missing!": "请先完成邮箱验证再设置密码",
  "New password should be different from the old password.": "新密码不能与旧密码相同",
};

export function translateSupabaseError(raw: string | undefined | null): string {
  if (!raw) return SERVICE_UNAVAILABLE;
  const key = raw.trim();
  if (AUTH_ERROR_MAP[key]) return AUTH_ERROR_MAP[key];
  // 含关键字的部分匹配（兜底）
  if (/rate limit/i.test(key)) return "操作过于频繁，请稍后再试";
  if (/invalid (login )?credentials/i.test(key)) return "邮箱或密码错误";
  if (/not confirmed/i.test(key)) return "邮箱尚未验证，请先到邮箱完成验证";
  if (/already registered/i.test(key)) return "该邮箱已注册，请直接登录";
  if (/password should be at least/i.test(key)) return "密码至少需要 6 位";
  if (/invalid email|invalid format/i.test(key)) return "邮箱格式不正确";
  if (/failed to fetch|network/i.test(key)) return "网络异常，请检查网络后重试";
  if (/token has expired|invalid or is invalid/i.test(key)) return "验证信息已过期或无效，请重新获取";
  if (/already confirmed/i.test(key)) return "该邮箱已完成验证，请直接登录";
  if (/not authenticated|auth session missing/i.test(key)) return "请先完成邮箱验证再设置密码";
  if (/different from the old/i.test(key)) return "新密码不能与旧密码相同";
  // 实在无法识别，给中性兜底，绝不把英文原文透给用户
  return "操作失败，请稍后再试";
}

export async function updateProfile(patch: ProfilePatch): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: BACKEND_NOT_CONFIGURED };
  const { data: u } = await sb.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return { ok: false, error: "未登录" };
  const { error } = await sb.from("profiles").update(patch).eq("id", uid);
  if (error) return { ok: false, error: translateSupabaseError(error.message) };
  return { ok: true };
}

export function onAuthChange(cb: (user: any | null) => void): () => void {
  const sb = getSupabase();
  if (!sb) {
    cb(null);
    return () => {};
  }
  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    cb(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}
