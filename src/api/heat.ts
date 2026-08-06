// =====================================================================
// 自选股人气榜（热度聚合）· 数据层
// 数据源：Supabase RPC get_stock_heat（跨用户聚合 watchlists，按持仓人数计热度）
// 后端未配置 / 接口失败时优雅降级：返回空列表，组件自动隐藏或回退。
// =====================================================================
import { getSupabase } from "@/api/supabase";

export interface HeatStock {
  code: string;
  name: string;
  market: string;
  heat: number;
}

// 拉取人气榜（默认 20 只，按持有人数降序）
export async function fetchStockHeat(limit = 20): Promise<HeatStock[]> {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb.rpc("get_stock_heat", { p_limit: limit });
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
