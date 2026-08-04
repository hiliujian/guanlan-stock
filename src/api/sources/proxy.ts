// =====================================================================
// 数据源：资金流代理（主力净流入）
//   新浪资金流接口无 CORS 头且不支持 JSONP，必须服务端转发。
//   统一走 Supabase Edge Function（guanlan-quote-proxy，支持 GBK 解码）——
//   由全局开关 USE_EDGE_FUNCTIONS 控制（东财经 Edge 同样可达，已验证）。
//   失败优雅返回 null，由上层 raceProviders 降级处理，不阻断页面。
// =====================================================================
import { withTimeout } from "@/api/transport";
import { getSupabase } from "@/api/supabase";
import { config, isSupabaseConfigured } from "@/config/app";
import { toMarketSymbol } from "./symbol";

const EDGE_FN = "guanlan-quote-proxy";

// 新浪资金流接口：返回 GBK 编码的 JSON 数组 [{opendate, r0_net, ...}]
function sinaFlowUrl(sym: string): string {
  return (
    "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/MoneyFlow.ssl_qsfx_zjlrqs" +
    "?daima=" + sym + "&page=1&num=20&sort=opendate&asc=0"
  );
}

// 把新浪资金流原始 JSON 归一化为 {日期: 主力净流入(元)}
function mapSinaFlow(text: string): Record<string, number> | null {
  const arr = JSON.parse(text);
  if (!Array.isArray(arr)) return null;
  const map: Record<string, number> = {};
  for (const it of arr) {
    const v = parseFloat(it?.r0_net);
    if (it?.opendate && Number.isFinite(v)) map[String(it.opendate)] = v;
  }
  return Object.keys(map).length ? map : null;
}

// 经 Supabase Edge Function 服务端转发（规避 CORS + 处理 GBK）。失败抛错由上层回退。
async function fetchFlowViaEdge(sym: string): Promise<Record<string, number> | null> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase 未配置");
  const { data, error } = await withTimeout(
    sb.functions.invoke(EDGE_FN, { body: { url: sinaFlowUrl(sym), encoding: "gbk" } }),
    6000
  );
  if (error) throw new Error(error.message || "资金流代理请求失败");
  const text = typeof data === "string" ? data : JSON.stringify(data ?? null);
  return mapSinaFlow(text);
}

export const proxyFlow = {
  id: "proxy-flow",
  async fetch(secid: string): Promise<Record<string, number> | null> {
    if (isSupabaseConfigured && config.USE_EDGE_FUNCTIONS) {
      try {
        return await fetchFlowViaEdge(toMarketSymbol(secid));
      } catch (e) {
        console.warn("[proxyFlow] Edge Function 取数失败：", (e as Error)?.message);
      }
    }
    return null;
  },
};
