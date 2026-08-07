// =====================================================================
// 今日热搜（热门股票快速入口）· 数据层
// 数据源：Supabase RPC（直连，security definer + grant anon，无需 Edge Function）
//   · get_hot_searches(p_limit)  —— 今日（北京时间）搜索次数降序榜单
//   · log_stock_search(p_code,p_name) —— 当日计数 +1（upsert）
// 只统计当日、不叠加历史；底层 hot_search_daily 以「日期(北京)+代码」为主键按日分桶。
// 后端未配置 / 接口失败时优雅降级：返回空列表，组件自动隐藏。
// =====================================================================
import { getSupabase } from "@/api/supabase";

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
    const res = await sb.rpc("get_hot_searches", { p_limit: limit });
    if (res.error) return [];
    const rows = res.data as unknown as HotStock[] | null;
    if (!Array.isArray(rows)) return [];
    return rows.filter((x) => x && x.code).slice(0, limit);
  } catch {
    return [];
  }
}

// 记录一次搜索（当日计数 +1；异步失败静默，不阻塞搜索流程）
export function recordSearch(code: string, name: string): void {
  const sb = getSupabase();
  if (!sb || !code) return;
  sb.rpc("log_stock_search", { p_code: code, p_name: name }).then(
    () => {},
    () => {}
  );
}