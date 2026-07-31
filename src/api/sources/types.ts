// =====================================================================
// 数据源抽象层（与传输层解耦）
//
// 设计目标：每个「数据接口」（实时行情 / K 线 / 分时 / 资金流 / 搜索）都配备
// 多家相互独立的上游数据源（东方财富 / 腾讯证券 / 新浪财经 …）。当首选源不可
// 用时，自动切换到下一家，避免「单一数据源挂掉 → 整页取数失败」。
//
// 两层降级叠加：
//   1) 数据源层（本文件 + sources/*.ts）：东财挂了换腾讯，腾讯挂了换新浪；
//   2) 传输层（transport.ts）：即便某家源可用，其默认传输通道不通时（如 CORS），
//      仍会自动切到 JSONP / 公共代理等通道。
//
// 熔断机制：某数据源连续失败达到阈值即「熔断」一段时间，期间直接跳过，避免
// 每次请求都白等 8s 超时；冷却结束后自动恢复探测，实现自愈。
// =====================================================================
import type { Kline, Trend, PeriodKey } from "@/utils/period";

// ---- 归一化数据类型（各 provider 返回统一结构，便于上层无差别消费） ----
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
  time: string;
}

export type RawKline = Kline;
export type RawTrend = Trend;
export type FlowMap = Record<string, number>;

export interface SearchHit {
  code: string;
  name: string;
}

// ---- 单个取数尝试（数据源 + 其取数动作） ----
export interface Attempt<T> {
  id: string; // 数据源唯一标识，如 "eastmoney-realtime"
  run: () => Promise<T | null>; // 返回 null 视为「该源未取得有效数据」
}

// ---- 熔断 / 健康检查 ----
const FAIL_THRESHOLD = 3; // 连续失败次数达到即熔断
const COOLDOWN_MS = 60_000; // 熔断冷却时长（1 分钟）

interface Health {
  fails: number;
  deadUntil: number; // 0 表示健康；>now 表示熔断中
}
const health = new Map<string, Health>();

function markProviderFail(id: string) {
  const h = health.get(id) || { fails: 0, deadUntil: 0 };
  h.fails += 1;
  if (h.fails >= FAIL_THRESHOLD) h.deadUntil = Date.now() + COOLDOWN_MS;
  health.set(id, h);
}

function markProviderOk(id: string) {
  health.set(id, { fails: 0, deadUntil: 0 });
}

function isProviderDead(id: string): boolean {
  const h = health.get(id);
  if (!h) return false;
  if (h.deadUntil > Date.now()) return true;
  if (h.deadUntil > 0) {
    // 冷却结束，恢复探测
    health.set(id, { fails: 0, deadUntil: 0 });
  }
  return false;
}

// 记录「当前接口最近一次由哪家数据源成功返回」，便于上层展示数据来源。
const activeSource: Record<string, string> = {};
export function getActiveSource(label: string): string | undefined {
  return activeSource[label];
}

// ---- 并发首胜：同时发起所有数据源，谁先返回有效数据就用谁 ----
// 与「顺序逐个尝试」相比，首胜能显著降低首选源变慢（而非挂掉）时的等待时间；
// 落败的请求在后台自然结束，其成功/失败结果仍会被健康监测捕获，故健康状态可自愈。
export async function raceProviders<T>(
  attempts: Attempt<T>[],
  label: string
): Promise<T> {
  if (!attempts.length) throw new Error(`${label}未配置任何数据源`);
  let settled = false;
  let failures = 0;
  const n = attempts.length;
  let lastErr: any = null;

  return new Promise<T>((resolve, reject) => {
    const onFail = (e: any) => {
      lastErr = e;
      failures += 1;
      if (failures >= n && !settled) {
        settled = true;
        reject(new Error(`${label}获取失败，请稍后重试`));
      }
    };

    attempts.forEach((a) => {
      // 熔断中的源直接跳过，不浪费一次往返
      if (isProviderDead(a.id)) {
        onFail(new Error(`[${a.id}] 熔断跳过`));
        return;
      }
      a.run()
        .then((r) => {
          if (settled) return;
          if (r === null || r === undefined) {
            markProviderFail(a.id);
            onFail(new Error(`[${a.id}] 空数据`));
            return;
          }
          settled = true;
          markProviderOk(a.id);
          activeSource[label] = a.id;
          resolve(r);
        })
        .catch((e) => {
          if (settled) return;
          markProviderFail(a.id);
          onFail(e);
        });
    });
  });
}
