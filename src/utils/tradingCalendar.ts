// =====================================================================
// 交易日历自动判定（零维护）：取代需要每年人工更新的静态节假日表。
//
// 原理：指数只在交易日产生日 K bar。拉取基准指数（A 股=上证指数，港股=恒生指数）
// 最近约 30 根日 K，「今天是否出现在日 K 中」即为今天是否交易日：
//   · 今天已有 bar                       → 交易日
//   · 交易时段出价后仍无今天的 bar       → 节假日休市（含临时休市，交易所没开就是没有 bar）
//   · 出价时刻之前 / 日历不可用          → unknown，调用方回退「周末 + 交易时段」判断
//
// 为什么需要出价时刻（cutoff）：交易日 00:00~开盘集合竞价出价前，当天的 bar 尚未生成，
// 此时「今天无 bar」无法区分「未开盘」与「节假日」。cutoff 取集合竞价产生开盘价的时刻
// （A 股 9:26 / 港股 9:30），此后仍无 bar 才可断定今天非交易日。
//
// 自愈性：cutoff 前拉取的缓存对「今天」不具结论力（bar 未生成），cutoff 后自动重拉一次
// 确认；单次接口失败静默降级 unknown（等效于无节假日表的历史行为，只可能多拉几次快照，
// 不会误停行情刷新），下一拍心跳重试。
// =====================================================================
import { getKline } from "@/api/sources";

const STORE_PREFIX = "guanlan:cal:";

interface CalendarCache {
  dates: string[]; // 基准指数最近交易日（YYYY-MM-DD，升序）
  fetchedAt: number; // 拉取时间戳
  day: string; // 拉取当天日期（跨天失效）
}

const mem = new Map<string, CalendarCache>();
let lastTry = 0; // 全局节流（所有基准指数共用，心跳 5s 调用下防止打爆）

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? "0" + n : "" + n);
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function todayCutoffTs(cutoffMinute: number): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(cutoffMinute / 60), cutoffMinute % 60).getTime();
}

// 读当日有效缓存（内存优先，localStorage 兜底；跨天即失效）
function loadCache(secid: string): CalendarCache | null {
  const hit = mem.get(secid);
  if (hit && hit.day === todayStr()) return hit;
  try {
    const v = uni.getStorageSync(STORE_PREFIX + secid) as CalendarCache | undefined;
    if (v && v.day === todayStr() && Array.isArray(v.dates) && v.dates.length) {
      mem.set(secid, v);
      return v;
    }
  } catch {
    /* 非浏览器环境 / 存储异常：仅用内存 */
  }
  return null;
}

function saveCache(secid: string, c: CalendarCache) {
  mem.set(secid, c);
  try {
    uni.setStorageSync(STORE_PREFIX + secid, c);
  } catch {
    /* ignore */
  }
}

// 惰性刷新：当天 cutoff 后尚未拉过一次时拉取基准指数日 K（约最近 30 根）。
// 同步调用方每拍都会触发本函数，靠「缓存已可信则跳过 + 60s 失败节流」控制请求频率。
export async function ensureTradingCalendar(secid: string, cutoffMinute: number): Promise<void> {
  const now = Date.now();
  if (now - lastTry < 60_000) return;
  const c = loadCache(secid);
  if (c && c.fetchedAt >= todayCutoffTs(cutoffMinute)) return; // 今天出价时刻后已确认过，结论可信
  lastTry = now;
  try {
    const ks = await getKline(secid, "d");
    if (!ks || ks.length < 5) return; // 数据异常不覆盖旧缓存，下一拍重试
    saveCache(secid, { dates: ks.slice(-30).map((k) => k.date), fetchedAt: Date.now(), day: todayStr() });
  } catch {
    /* 失败静默：保持 unknown 降级，下一拍重试 */
  }
}

export interface DayInfo {
  known: boolean; // 是否能确定今天是否交易日
  trading: boolean; // known=true 时生效
}

// 今天是否交易日（纯同步读缓存，绝不联网）。unknown 语义见文件头。
export function tradingDayInfo(secid: string, cutoffMinute: number): DayInfo {
  const c = loadCache(secid);
  if (!c) return { known: false, trading: false };
  const d = new Date();
  const nowMin = d.getHours() * 60 + d.getMinutes();
  if (nowMin < cutoffMinute) return { known: false, trading: false }; // 当天 bar 尚未生成，无结论
  if (c.fetchedAt < todayCutoffTs(cutoffMinute)) return { known: false, trading: false }; // 缓存早于出价时刻，今天的结论未确认（将触发重拉）
  const today = todayStr();
  return c.dates[c.dates.length - 1] >= today ? { known: true, trading: true } : { known: true, trading: false };
}
