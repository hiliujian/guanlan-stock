// =====================================================================
// 认证层（极薄封装，仅透传 Supabase Auth）
// 业务/页面只调用 signIn / signUp / signOut / getSession，与平台无关
// =====================================================================
import { getSupabase } from "./supabase";

export interface AuthResult {
  ok: boolean;
  error?: string;
  needsConfirm?: boolean;
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "未配置 Supabase（请在 src/config/app.ts 填入 URL/KEY）" };
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "未配置 Supabase（请在 src/config/app.ts 填入 URL/KEY）" };
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) return { ok: false, error: error.message };
  // 若开启了邮件确认，data.session 为 null
  if (!data.session) return { ok: true, needsConfirm: true };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
}

export async function getSessionUser(): Promise<any | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

export interface ProfilePatch {
  display_name?: string;
  username?: string;
  bio?: string;
  avatar_url?: string;
}

export async function updateProfile(patch: ProfilePatch): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "未配置 Supabase（请在 src/config/app.ts 填入 URL/KEY）" };
  const { data: u } = await sb.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return { ok: false, error: "未登录" };
  const { error } = await sb.from("profiles").update(patch).eq("id", uid);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// 头像上传到 Supabase Storage 的 avatars 桶（uni.chooseImage 跨端通用）
export async function uploadAvatar(localPath: string, ext = "png"): Promise<string | null> {
  try {
    const sb = getSupabase();
    if (!sb) return null;
    const { data: u } = await sb.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return null;
    const path = `${uid}.${ext}`;
    const b64 = uni.getFileSystemManager().readFileSync(localPath, "base64") as string;
    const bin = uni.base64ToArrayBuffer(b64);
    const { error } = await sb.storage
      .from("avatars")
      .upload(path, bin, { contentType: `image/${ext}`, upsert: true });
    if (error) {
      console.error("avatar upload failed", error.message);
      return null;
    }
    const { data } = sb.storage.from("avatars").getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (e) {
    console.error("avatar upload failed", e);
    return null;
  }
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
