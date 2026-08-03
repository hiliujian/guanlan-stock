// =====================================================================
// 通知公告 API（与后端 server/index.js 的 /api/announcements 对接）
// 跨端兼容：H5 走 fetch，小程序走 uni.request
// =====================================================================

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

const isH5 = () => typeof window !== "undefined" && typeof document !== "undefined";

async function request<T>(url: string, options?: { method?: string; body?: any }): Promise<T> {
  const method = options?.method || "GET";
  if (isH5()) {
    const res = await fetch(url, {
      method,
      headers: method !== "GET" ? { "Content-Type": "application/json" } : undefined,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.msg || "请求失败");
    return json.data as T;
  }
  // 小程序
  return new Promise<T>((resolve, reject) => {
    uni.request({
      url,
      method: method as any,
      data: options?.body,
      header: method !== "GET" ? { "Content-Type": "application/json" } : undefined,
      success: (res: any) => {
        const json = res.data;
        if (json.code !== 0) reject(new Error(json.msg || "请求失败"));
        else resolve(json.data as T);
      },
      fail: (err: any) => reject(err),
    });
  });
}

// 获取当前生效的公告（公开接口，前端展示用）
export function fetchActiveAnnouncements(): Promise<Announcement[]> {
  return request<Announcement[]>("/api/announcements");
}
