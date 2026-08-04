// =====================================================================
// 传输层（统一后端网关）
//
// 统一后端架构下，前端不再直连任何行情源，也不再在浏览器里做 JSONP /
// 直连 fetch / 公共 CORS 代理等通道兜底。所有行情请求（实时 / K 线 / 分时 /
// 资金流 / 搜索 / 资讯 / 市场宽度 / 行业列表）统一经 Supabase Edge Function
// （guanlan-quote-proxy）转发，多数据源冗余（东财 → 腾讯 → 新浪）由后端完成，
// 前端只负责：按 kind 发起语义化请求 → 按返回的 source 用对应解析器取数。
//
// 本文件只做一件事：把「语义化请求」变成「{ source, text }」原始响应文本。
// =====================================================================
import { getSupabase } from "@/api/supabase";

const EDGE_FN = "guanlan-quote-proxy";

export interface GatewayResponse {
  source: string; // 实际命中的数据源（eastmoney | tencent | sina），决定用哪家解析器
  text: string; // 该源返回的原始响应文本（解析仍由前端各源解析器完成）
}

// 请求超时兜底：Edge Function 偶发网络抖动会挂起连接，用 Promise.race 强制超时，
// 避免「分析中」卡死（后端已做源级冗余，这里只防网关本身异常）。
const GATEWAY_TIMEOUT = 8000;

function withTimeout<T>(p: Promise<T>, ms: number, fallback?: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      if (fallback !== undefined) resolve(fallback);
      else reject(new Error("行情网关请求超时"));
    }, ms);
    p.then(
      (v) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (fallback !== undefined) resolve(fallback as T);
        else reject(e);
      }
    );
  });
}

// 经 Edge Function 请求行情数据，返回 { source, text }。
// kind ∈ realtime | kline | trend | flow | search | news | ulist | clist，
// 具体参数（secid / period / keyword / fields 等）透传给网关，网关内部构建 URL、
// 按配置顺序做多源冗余并返回命中的源与原始文本。
export async function requestGateway(
  kind: string,
  params: Record<string, unknown> = {}
): Promise<GatewayResponse> {
  const sb = getSupabase();
  if (!sb) throw new Error("后端未配置");
  const { data, error } = await withTimeout(
    sb.functions.invoke(EDGE_FN, { body: { kind, ...params } }),
    GATEWAY_TIMEOUT
  );
  if (error) throw new Error(error.message || "行情网关请求失败");
  const body = data as { ok?: boolean; source?: string; text?: string; error?: string } | null;
  if (!body || body.ok !== true || !body.source || typeof body.text !== "string") {
    throw new Error(body?.error || "行情网关返回异常");
  }
  return { source: body.source, text: body.text };
}

export { withTimeout };
export const FETCH_TIMEOUT = GATEWAY_TIMEOUT;
