// =====================================================================
// 数据源抽象层：归一化数据类型
//
// 统一后端架构：多数据源冗余（东财 → 腾讯 → 新浪）已收拢到 Edge Function
// 网关完成，前端不再做源级竞速 / 熔断，也不再直连任何行情源。这里只保留
// 各 provider 返回的统一结构，供上层无差别消费。
// =====================================================================
export interface RawRealtime {
  name: string;
  code: string;
  price: number;
  preClose: number;
  open: number;
  high: number;
  low: number;
  vol: number; // 成交量（手）
  amount: number; // 成交额（元）
  turnover?: number; // 换手率（%），仅东财 / 腾讯实时提供，新浪无此字段
  time: string;
}

export type FlowMap = Record<string, number>;

export interface SearchHit {
  code: string;
  name: string;
}
