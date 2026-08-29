// =====================================================================
// 用户持仓簿（user_holdings）：发帖「添加持仓」的一键填入数据源
// ---------------------------------------------------------------------
// - 持久化到数据库（切换设备 / 重新登录后可恢复，发帖时一键回填）；
// - 只保留 shares > 0 的记录：DB 层 check(shares>0) 兜底，前端置零 / 删除即删行，
//   保证库内数据与用户当前持仓始终一致；
// - 未配置后端 / 未登录时优雅降级为空（getSupabase() 返回 null 或跳过写入）。
// =====================================================================
import { getSupabase } from "@/api/supabase";
import { withTimeout } from "@/api/transport";
import { userState } from "@/store/user";

export interface SavedHolding {
  code: string;
  name: string;
  cost: number;
  shares: number;
  updatedAt: number;
}

/** 读取我的持仓簿（按更新时间倒序，最新在前）；失败 / 未登录返回空数组 */
export async function listMyHoldings(): Promise<SavedHolding[]> {
  const sb = getSupabase();
  if (!sb || !userState.loggedIn) return [];
  const res: any = await withTimeout(
    sb
      .from("user_holdings")
      .select("code, name, cost, shares, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50) as any,
    10000
  );
  if (res?.error || !res?.data) return [];
  return (res.data as any[]).map((r) => ({
    code: r.code,
    name: r.name || "",
    cost: Number(r.cost) || 0,
    shares: Number(r.shares) || 0,
    updatedAt: new Date(r.updated_at).getTime(),
  }));
}

/** 保存 / 更新一条持仓（(user_id, code) 唯一键 upsert）；数量 <= 0 或代码缺失时改为删除 */
export async function saveHolding(item: { code: string; name: string; cost: number; shares: number }): Promise<void> {
  const sb = getSupabase();
  if (!sb || !userState.loggedIn) return;
  const shares = Number(item.shares) || 0;
  if (shares <= 0 || !item.code) {
    await dropHolding(item.code);
    return;
  }
  await withTimeout(
    sb
      .from("user_holdings")
      .upsert(
        {
          user_id: userState.userId,
          code: item.code,
          name: item.name || "",
          cost: Number(item.cost) || 0,
          shares,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id, code" }
      ) as any,
    10000
  );
}

/** 删除一条持仓（用户在发帖框移除该持仓时调用，数据库与用户当前持仓保持同步） */
export async function dropHolding(code: string): Promise<void> {
  const sb = getSupabase();
  if (!sb || !userState.loggedIn || !code) return;
  await withTimeout(
    sb.from("user_holdings").delete().eq("user_id", userState.userId).eq("code", code) as any,
    10000
  );
}
