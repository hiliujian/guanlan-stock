// =====================================================================
// 今日热搜（热门股票快速入口）· 数据层
// 数据源：Supabase Edge Function guanlan-hot-searches（只统计当日，零点自动重置）
// 后端未配置 / 接口失败时优雅降级：返回空列表，组件自动隐藏。
// =====================================================================
import { getSupabase } from "@/api/supabase";

const FN = "guanlan-hot-searches";

export interface HotStock {
  code: string;
  name: string;
  count: number;
}

// 拉取今日热搜榜单（默认 8 只，按搜索次数降序）
export async function fetchHotSearches(limit = 8): Promise<HotStock[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb.functions.invoke<{
      ok?: boolean;
      list?: HotStock[];
      error?: string;
    }>(FN, { method: "GET", body: { limit } });
    if (error || !data?.ok || !Array.isArray(data.list)) return [];
    return data.list.filter((x) => x && x.code).slice(0, limit);
  } catch {
    return [];
  }
}

// 记录一次搜索（当日计数 +1；异步失败静默，不阻塞搜索流程）
export function recordSearch(code: string, name: string): void {
  const sb = getSupabase();
  if (!sb || !code) return;
  sb.functions
    .invoke<{ ok?: boolean }>(FN, {
      method: "POST",
      body: { code, name },
    })
    .catch(() => {});
}