// =====================================================================
// 认证层（极薄封装，仅透传 Supabase Auth）
// 业务/页面按需引用下列函数，与平台无关（仅透传 Supabase Auth）
// =====================================================================
import { getSupabase } from "./supabase";

export interface AuthResult {
  ok: boolean;
  error?: string;
  /** 仅在 updatePassword 中置位：新密码与账号当前密码相同，即该邮箱已注册 */
  samePassword?: boolean;
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: BACKEND_NOT_CONFIGURED };
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: translateSupabaseError(error.message) };
  return { ok: true };
}

/**
 * 用户名或邮箱登录：identifier 可以是用户名或邮箱。
 * - 邮箱（含 @ 且符合邮箱格式）：直接走 Supabase 原生 signInWithPassword
 * - 用户名（规则限定为 3-20 位中英文/数字/下划线，不含 @）：
 *   先经 RPC lookup_login_email 解析为对应邮箱，再走原生密码登录
 * 返回 ok=false 时 error 已是中文（含「该用户名不存在」）。
 */
export async function signInByIdentifier(identifier: string, password: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: BACKEND_NOT_CONFIGURED };
  const id = (identifier || "").trim();
  if (!id) return { ok: false, error: "请输入用户名或邮箱" };
  if (!password) return { ok: false, error: "请输入密码" };

  let email = id;
  // 用户名不含 @（规则限定），含 @ 且形如邮箱则按邮箱处理
  if (!EMAIL_RE.test(id)) {
    const { data, error } = await sb.rpc("lookup_login_email", { p_username: id });
    if (error) return { ok: false, error: translateSupabaseError(error.message) };
    email = (data as string) || "";
    if (!email) return { ok: false, error: "该用户名不存在" };
  }
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: translateSupabaseError(error.message) };
  return { ok: true };
}

/**
 * 校验用户名是否可用（未被占用）。
 * 返回 ok=false 表示网络/后端异常；ok=true 时 available 才有意义（true=可用）。
 * 底层走 RPC is_username_taken（security definer，可匿名调用）。
 */
export async function checkUsernameAvailable(username: string): Promise<{ ok: boolean; available: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, available: false, error: BACKEND_NOT_CONFIGURED };
  const { data, error } = await sb.rpc("is_username_taken", { p_username: username });
  if (error) return { ok: false, available: false, error: translateSupabaseError(error.message) };
  return { ok: true, available: !(data as boolean) };
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
  if (error) {
    const err = error.message || "";
    const samePassword = /(different from the old|different from the current)/i.test(err);
    return { ok: false, error: translateSupabaseError(err), samePassword };
  }
  return { ok: true };
}

/**
 * 发起邮箱变更：向「新邮箱」发送 6 位验证码（需 Email Change 模板配置为 {{ .Token }}）。
 * 前置：用户已登录。需关闭 Supabase 的「Secure email change」（否则会要求旧邮箱二次验证）。
 * 返回 ok=false 时 error 已是中文。
 */
export async function requestEmailChange(newEmail: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: BACKEND_NOT_CONFIGURED };
  const { error } = await sb.auth.updateUser({ email: newEmail });
  if (error) return { ok: false, error: translateSupabaseError(error.message) };
  return { ok: true };
}

/**
 * 校验新邮箱验证码，完成邮箱变更：verifyOtp type=email_change 匹配 auth.users
 * 的 email_change / email_change_token_new 列，成功后邮箱正式更新为 newEmail。
 */
export async function verifyEmailChange(newEmail: string, code: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: BACKEND_NOT_CONFIGURED };
  const { error } = await sb.auth.verifyOtp({
    email: newEmail,
    token: code,
    type: "email_change",
  });
  if (error) return { ok: false, error: translateSupabaseError(error.message) };
  return { ok: true };
}

/** 用户名规则：3-20 位，仅限中英文 / 数字 / 下划线（与数据库、注册页校验保持一致） */
export const USERNAME_RE = /^[一-龥A-Za-z0-9_]{3,20}$/;

/** 邮箱格式规则（登录 identifier / 注册 / 找回 / 邮箱修改共用，避免各处重复定义） */
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
}

/**
 * 注销账号（删除用户）：客户端 SDK 无权删除 auth.users，必须经服务端 Edge Function
 * （guanlan-delete-account，使用 service_role）代为删除，并先清理 profiles / watchlists
 * 等业务数据。调用时自动携带当前用户会话（Bearer），函数内仅能删除调用者自身。
 */
export async function deleteAccount(): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: BACKEND_NOT_CONFIGURED };
  const { data, error } = await sb.functions.invoke("guanlan-delete-account");
  if (error) return { ok: false, error: translateSupabaseError(error.message) };
  const body = data as { ok?: boolean; error?: string } | null;
  if (!body || body.ok !== true) {
    return { ok: false, error: body?.error || "注销失败，请稍后再试" };
  }
  return { ok: true };
}

export interface ProfilePatch {
  display_name?: string;
  username?: string;
  bio?: string;
  avatar_url?: string;
  last_login?: LoginInfo | null;
}

/** 最近一次登录信息（供「账号安全」页展示）：地点 / 时间 / 设备 */
export interface LoginInfo {
  ip?: string; // 登录 IP（最佳努力获取，失败为空）
  city?: string; // 登录城市（由 IP 地理定位，失败为「未知」）
  device?: string; // 设备型号（uni.getSystemInfoSync().model）
  os?: string; // 操作系统及版本（如 "iOS 17.0" / "Android 14"）
  platform?: string; // 平台标识（ios / android / web 等）
  time?: string; // 登录时刻 ISO 字符串
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
  "reauthentication_needed": "邮箱修改需先验证当前身份，请关闭 Supabase 的 Secure email change 后重试",
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

/**
 * 捕获本次登录的设备 / 地点 / 时间，写入 profiles.last_login，供「账号安全」页
 * 展示「上次登录信息」。全程最佳努力：系统信息 / IP 地理定位任一环节失败都不影响登录，
 * 仅对应字段留空；函数本身绝不抛出，避免阻塞登录主流程。
 */
export async function captureLoginInfo(): Promise<void> {
  try {
    const sb = getSupabase();
    if (!sb) return;
    const { data: u } = await sb.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;

    // 设备信息：uni-app 跨端可用（model=型号、system=操作系统及版本、platform=平台）
    let device = "";
    let os = "";
    let platform = "";
    try {
      const info: any = uni.getSystemInfoSync();
      device = info?.model || "";
      os = info?.system || "";
      platform = info?.platform || "";
    } catch {
      /* 设备信息不可用时仅留空 */
    }

    // 地点：最佳努力 IP 地理定位（超时即放弃，不影响其余字段）
    const geo = await fetchLoginGeo();

    const info: LoginInfo = {
      ip: geo?.ip || "",
      city: geo?.city || "",
      device,
      os,
      platform,
      time: new Date().toISOString(),
    };
    // 原子交换：服务端把「本次登录」写入 login_current，并把旧 login_current 移为 last_login，
    // 使「上次登录」严格等于上一次成功登录（而非本次）。函数以 auth.uid() 限定仅改写本人记录。
    const { error } = await sb.rpc("capture_login_info", { p_info: info });
    if (error) {
      // 仅开发期提示，便于排查；登录信息仅为展示用途，绝不阻塞主流程
      if (import.meta.env?.DEV) console.warn("[captureLoginInfo] 写入登录信息失败:", error.message);
      return;
    }
  } catch {
    /* 静默失败：登录信息仅为展示用途，绝不阻塞主流程 */
  }
}

/**
 * 直接从云端 profiles 表查询「最近一次登录信息」（last_login），不读取任何本地缓存，
 * 也不依赖登录时的内存快照。账号安全页每次打开时调用，保证展示的是云端最新值；
 * 云端确实无记录时返回 null（此时调用方会以当前会话最佳努力补写一条并回读）。
 * 全程不抛出，失败降级为 null。
 */
export async function fetchLoginInfo(): Promise<LoginInfo | null> {
  try {
    const sb = getSupabase();
    if (!sb) return null;
    const { data: u } = await sb.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return null;
    const { data, error } = await sb
      .from("profiles")
      .select("last_login")
      .eq("id", uid)
      .single();
    if (error) {
      if (import.meta.env?.DEV) console.warn("[fetchLoginInfo] 查询 last_login 失败:", error.message);
      return null;
    }
    return (data?.last_login as LoginInfo) ?? null;
  } catch {
    return null;
  }
}

/** 最佳努力 IP 地理定位：返回 { ip, city }，失败返回 null。3s 超时，绝不抛出。 */
async function fetchLoginGeo(): Promise<{ ip?: string; city?: string } | null> {
  try {
    const res: any = await uni.request({
      url: "https://ipwho.is/json",
      method: "GET",
      timeout: 3000,
      dataType: "json",
    });
    const body = res?.data;
    if (body && body.success !== false && (body.city || body.ip)) {
      return { ip: body.ip || "", city: body.city || "" };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 每日登录签到（后端 RPC，见 deploy.sql §100.6）：
 * 当日首次调用发放 +5 经验（连续登录每满 7 天再 +15），并返回最新 exp。
 * 幂等：同一自然日重复调用不重复发放。
 */
export async function awardDailySignin(): Promise<number | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc("award_daily_signin");
  if (error) return null;
  return typeof data === "number" ? data : null;
}

export function onAuthChange(
  cb: (user: any | null, event?: string) => void
): () => void {
  const sb = getSupabase();
  if (!sb) {
    cb(null);
    return () => {};
  }
  const { data } = sb.auth.onAuthStateChange((event, session) => {
    cb(session?.user ?? null, event);
  });
  return () => data.subscription.unsubscribe();
}
