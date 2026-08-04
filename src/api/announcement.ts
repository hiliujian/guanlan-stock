// =====================================================================
// 通知公告 API（Supabase 后端）
// 对接 supabase/deploy.sql 的 announcements 表（公开可读、service_role 可写）。
// 前端仅消费「当前生效」的公告，由 RLS + 查询条件双重过滤：
//   · active = true
//   · start_at 为空 或 ≤ now
//   · end_at   为空 或 ≥ now
// 未配置 Supabase（本地模式）时优雅返回 []，不阻塞主页面。
// =====================================================================
import { getSupabase, isSupabaseConfigured } from "@/api/supabase";

export interface Announcement {
  id: string;
  title: string;
  content: string;
  images: string[];
  type: "modal" | "banner" | "toast"; // 展示方式
  position: "top" | "center" | "bottom"; // modal 弹窗位置
  pages: string[]; // 在哪些页面显示，["*"] = 所有页面
  priority: number; // 优先级，数字越大越优先
  active: boolean;
  startAt: string | null;
  endAt: string | null;
  dismissKey: "once" | "always" | "session"; // 关闭策略
  link: string; // 可选跳转链接
  createdAt: string;
  updatedAt: string;
}

// announcements 表行（snake_case 列）
interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  images: string[] | null;
  type: Announcement["type"];
  position: Announcement["position"];
  pages: string[] | null;
  priority: number;
  active: boolean;
  start_at: string | null;
  end_at: string | null;
  dismiss_key: Announcement["dismissKey"];
  link: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(r: AnnouncementRow): Announcement {
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    images: r.images || [],
    type: r.type,
    position: r.position,
    pages: r.pages && r.pages.length ? r.pages : ["*"],
    priority: r.priority,
    active: r.active,
    startAt: r.start_at,
    endAt: r.end_at,
    dismissKey: r.dismiss_key,
    link: r.link || "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// 获取当前生效的公告（公开接口，前端展示用）
export async function fetchActiveAnnouncements(): Promise<Announcement[]> {
  if (!isSupabaseConfigured) return [];
  const sb = getSupabase();
  if (!sb) return [];
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("announcements")
    .select("*")
    .eq("active", true)
    .or(`start_at.is.null,start_at.lte.${now}`)
    .or(`end_at.is.null,end_at.gte.${now}`)
    .order("priority", { ascending: false });
  if (error) {
    // 公告非关键路径：表未建 / 网络异常时静默降级，不打断主页面
    console.warn("[announcement] 公告拉取失败：", error.message);
    return [];
  }
  return ((data || []) as AnnouncementRow[]).map(mapRow);
}
