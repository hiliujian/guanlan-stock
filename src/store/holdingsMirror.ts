// =====================================================================
// 持仓簿云端镜像（user_holdings → 本地 costBasis 缓存）
// ---------------------------------------------------------------------
// 职责：把 Supabase「用户持仓簿」同步进本机持仓缓存（cost:index / cost:secid）。
// 消费者仍是原有的一切：自选页持仓视图 / 长按「设置持仓」图标、行情页报告、
// 社区发帖回填 —— 它们全部读本地缓存，因此只需在「进入页面 / 登录 / 保存 / 清除」
// 时把云端作为唯一事实来源铺进去即可，无需改动任何读取方。
// 同步方向：
//   · 云端 → 本地：进入页面 / 登录时整表对比覆盖（删除、置零以云端为准）；
//   · 本地 → 云端：保存 / 清除持仓时经 api/holdings upsert / delete 写回。
// 未登录 / 未配置后端：本函数直接跳过，保持纯本地行为（游客可继续用）。
// =====================================================================
import { userState } from "@/store/user";
import { listMyHoldings } from "@/api/holdings";
import { resolveSecid } from "@/utils/period";
import { listCostSecids, setPosition, clearPosition } from "@/utils/costBasis";

let inFlight: Promise<void> | null = null;

/** 拉取云端持仓簿并按 secid 映射到本地缓存；重复调用合并为一次在途请求（幂等） */
export function hydrateCloudPositions(): Promise<void> {
  if (!userState.loggedIn) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const rows = await listMyHoldings();
    // 读取失败（表缺失 / RLS / 超时）时 listMyHoldings 会「伪装成空数组」而非抛错。
    // 此时若本机已有持仓，必须放弃本次重建 —— 否则会把用户全部持仓清空且不可恢复。
    // 口径与项目其它地方一致：读失败保留旧数据，只在「确实读到记录」或「本机本就为空」时重建。
    if (!rows.length && listCostSecids().length) return;
    // 以云端为事实来源整表重建：先清空本地持仓，再逐条铺入云端记录。
    // 这样「换了设备登录 / 云端被删」后本机不会残留旧持仓（图标/盈亏即时收口）。
    for (const s of listCostSecids()) clearPosition(s);
    for (const r of rows) {
      const secid = resolveSecid(r.code, "auto");
      const cost = Number(r.cost);
      const shares = Number(r.shares);
      if (cost > 0 && shares > 0) setPosition(secid, { cost, qty: shares });
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}