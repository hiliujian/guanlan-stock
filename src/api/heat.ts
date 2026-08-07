// =====================================================================
// 自选股人气榜（热度聚合）· 数据层
// 数据源：Supabase RPC get_stock_heat（跨用户聚合 watchlists，按持有人数计热度）
//   · today=true  → 仅统计「当日（北京时间）新增自选」行为，真实反映今日热度
//   · today=false → 统计历史累计持有人数（完整榜单）
// 两种口径后端各自独立聚合；today 为空时返回空列表，组件显示「暂无数据」，
// 绝不兜底/复用完整榜单数据。后端未配置 / 接口失败时优雅降级：返回空列表。
// =====================================================================
import { getSupabase } from "@/api/supabase";

export interface HeatStock {
  code: string;
  name: string;
  market: string;
  heat: number;
}

// 拉取人气榜（默认 20 只，按持有人数降序）
// @param today true=仅统计当日新增自选（今日热榜），false=历史累计（完整榜单）
export async function fetchStockHeat(limit = 20, today = false): Promise<HeatStock[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb.rpc("get_stock_heat", { p_limit: limit, p_today: today });
    if (error || !Array.isArray(data)) return [];
    return (data as any[])
      .filter((x) => x && x.code)
      .map((x) => ({
        code: x.code,
        name: x.name || "",
        market: x.market || "",
        heat: typeof x.heat === "number" ? x.heat : Number(x.heat) || 0,
      }))
      .slice(0, limit);
  } catch {
    return [];
  }
}
