// =====================================================================
// 盘口异动监测（自选股实时异动监控）
// - 轮询自选股实时快照，识别常见异动类型（封涨停/跌停、快速拉升/下跌、
//   大笔买入/卖出、放量突破），命中即记入当日异动列表；
// - 列表本地持久化，仅保留「当日交易日」，第二个自然日自动清空；
// - 异动卡片切换与行情页大盘指数切换共用 <RollSwap>，动画完全一致。
//
// 数据说明：当前行情代理(API)仅提供 现价/涨跌幅/成交量(手)/成交额(元)，
// 不含五档盘口委买委卖。因此「大笔买入/卖出」以「单轮成交量突增 + 价格方向」
// 作为盘口代理信号；其余类型均基于真实可得字段。
// =====================================================================
import { reactive, computed } from "vue";
import { fetchSnapshot, type SnapResult } from "@/api/quote";
import { useWatchlist } from "./watchlist";
import { getMarketStatus } from "@/utils/marketStatus";
import { resolveSecid } from "@/utils/period";
import { loadConfig, watchPersist } from "@/utils/storageConfig";

export type AnomalyType =
  | "limit_up" // 封涨停
  | "limit_down" // 封跌停
  | "rapid_up" // 快速拉升
  | "rapid_down" // 快速下跌
  | "big_buy" // 大笔买入（盘口代理：量能突增 + 价升）
  | "big_sell" // 大笔卖出（盘口代理：量能突增 + 价跌）
  | "vol_breakout"; // 放量突破

export interface AnomalyRecord {
  id: string; // 同股同类型唯一（code-type-time）
  code: string;
  name: string;
  type: AnomalyType;
  time: string; // ISO 时间（异动发生时刻）
  price: number;
  pct: number;
  chg: number;
}

// 异动类型展示元数据：cls 复用全局 up(红涨)/down(绿跌)/warn 配色
export const ANOMALY_META: Record<AnomalyType, { label: string; cls: "up" | "down" | "warn" }> = {
  limit_up: { label: "封涨停", cls: "up" },
  limit_down: { label: "封跌停", cls: "down" },
  rapid_up: { label: "快速拉升", cls: "up" },
  rapid_down: { label: "快速下跌", cls: "down" },
  big_buy: { label: "大笔买入", cls: "up" },
  big_sell: { label: "大笔卖出", cls: "down" },
  vol_breakout: { label: "放量突破", cls: "warn" },
};

// ---- 阈值（集中可调） ----
const RAPID_PCT = 1.0; // 单轮(~20s)涨跌幅变动超 1% 视为快速
const BIG_VOL = 5000; // 单轮成交量(手)突增超 5000 手视为大单（盘口代理）
const BREAKOUT_MULT = 2.0; // 单轮成交额相对 EMA 放大 2 倍视为放量突破
const BREAKOUT_MIN_AMT = 5_000_000; // 放量突破最小成交额增量（500 万，过滤噪声）
const FIRE_COOLDOWN_MS = 5 * 60 * 1000; // 同股同类型 5 分钟内不重复触发

interface Track {
  prevPct: number | null;
  prevPrice: number | null;
  prevVol: number | null;
  prevAmount: number | null;
  emaDeltaAmt: number; // 成交额增量 EMA（用于放量突破）
  lastFired: Record<string, number>; // type -> 上次触发时间戳
}
const tracks = new Map<string, Track>();
function getTrack(k: string): Track {
  let t = tracks.get(k);
  if (!t) {
    t = { prevPct: null, prevPrice: null, prevVol: null, prevAmount: null, emaDeltaAmt: 0, lastFired: {} };
    tracks.set(k, t);
  }
  return t;
}

function dayOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 涨跌幅限制（%）：主板 10；创业板 300/301、科创板 688/689 为 20；
// 北交所（43/83/87/88/920 开头，或 market=bj）为 30；主板 ST 股为 5（由调用方按名称叠加）。
// 港美股无涨跌幅限制 → 返回 null（不参与涨跌停检测）。
function limitPct(code: string, market: string): number | null {
  if (market === "hk" || market === "us") return null;
  if (/^30[01]/.test(code) || /^68[89]/.test(code)) return 20;
  if (market === "bj" || /^[48]/.test(code) || /^92/.test(code)) return 30;
  return 10;
}
// 精确涨跌停价：交易所规则 = 昨收 ×(1±limit) 四舍五入到分
function limitPrice(preClose: number, lim: number, dir: 1 | -1): number {
  return Math.round(preClose * (1 + (dir * lim) / 100) * 100) / 100;
}

interface AnomalyState {
  list: AnomalyRecord[];
  lastDay: string; // 最近一次清空日（自然日）
}
const STORAGE_KEY = "gl_anomaly_list";
const state = reactive<AnomalyState>(
  loadConfig<AnomalyState>(STORAGE_KEY, () => ({ list: [], lastDay: dayOf(new Date()) }))
);
watchPersist(state, STORAGE_KEY);

// 第二个交易日清空：自然日切换即清空（周末/休市 lastDay 不变，不会重复清空）
function clearIfNewDay() {
  const today = dayOf(new Date());
  if (state.lastDay !== today) {
    state.list = [];
    state.lastDay = today;
  }
}

function makeRecord(
  it: { code: string; market: string; name: string },
  type: AnomalyType,
  time: string,
  s: SnapResult
): AnomalyRecord {
  return {
    id: `${it.code}-${type}-${time}`,
    code: it.code,
    name: it.name,
    type,
    time,
    price: s.price,
    pct: s.pct,
    chg: s.chg,
  };
}

// secid 仅作内部 track 键（同股冷却/基线），不入记录
function addAnomaly(rec: AnomalyRecord, secid: string) {
  const t = getTrack(secid);
  const now = Date.now();
  // 同股同类型 5 分钟内已记录则跳过（避免连续轮询重复刷屏）
  if (t.lastFired[rec.type] && now - t.lastFired[rec.type] < FIRE_COOLDOWN_MS) return;
  t.lastFired[rec.type] = now;
  // 已存在同股同类型记录则更新为最新（控制列表规模，不重复堆叠）
  const idx = state.list.findIndex((a) => a.code === rec.code && a.type === rec.type);
  if (idx >= 0) state.list[idx] = rec;
  else state.list.unshift(rec);
  if (state.list.length > 50) state.list.length = 50; // 上限保护
}

function detect(it: { code: string; market: string; name: string }, secid: string, s: SnapResult) {
  const t = getTrack(secid);
  const lim0 = limitPct(it.code, it.market);
  const now = new Date();
  const time = now.toISOString();

  // 1) 封涨停 / 封跌停：按交易所规则算精确涨跌停价（主板 ST ±5%），价格封在当日最高/最低
  if (lim0 != null && s.preClose > 0) {
    const lim = lim0 === 10 && /ST/i.test(it.name) ? 5 : lim0;
    const upPx = limitPrice(s.preClose, lim, 1);
    const dnPx = limitPrice(s.preClose, lim, -1);
    if (s.price >= upPx - 0.005 && s.price >= s.high * 0.999) {
      addAnomaly(makeRecord(it, "limit_up", time, s), secid);
    } else if (s.price <= dnPx + 0.005 && s.price <= s.low * 1.001) {
      addAnomaly(makeRecord(it, "limit_down", time, s), secid);
    }
  }

  // 2) 快速拉升 / 下跌：与上一轮涨跌幅比较（数据含 20s TTL，实际按刷新间隔计）
  if (t.prevPct != null) {
    const dpct = s.pct - t.prevPct;
    if (dpct >= RAPID_PCT) addAnomaly(makeRecord(it, "rapid_up", time, s), secid);
    else if (dpct <= -RAPID_PCT) addAnomaly(makeRecord(it, "rapid_down", time, s), secid);
  }

  // 3) 大笔买入 / 卖出（盘口代理）：单轮成交量突增 + 价格方向
  if (t.prevVol != null) {
    const dvol = s.vol - t.prevVol;
    if (dvol >= BIG_VOL) {
      if (s.price >= (t.prevPrice ?? s.price)) addAnomaly(makeRecord(it, "big_buy", time, s), secid);
      else addAnomaly(makeRecord(it, "big_sell", time, s), secid);
    }
  }

  // 4) 放量突破：单轮成交额显著超过「本轮之前」的 EMA 基线
  //    （基线先比后更：首轮基线为 0 不打信号，避免大盘股每轮几百万成交额的常态误报）
  if (t.prevAmount != null) {
    const dAmt = s.amount - t.prevAmount;
    if (t.emaDeltaAmt > 0 && dAmt > t.emaDeltaAmt * BREAKOUT_MULT && dAmt > BREAKOUT_MIN_AMT) {
      addAnomaly(makeRecord(it, "vol_breakout", time, s), secid);
    }
    t.emaDeltaAmt = t.emaDeltaAmt * 0.7 + Math.max(0, dAmt) * 0.3;
  }

  // 更新基线
  t.prevPct = s.pct;
  t.prevPrice = s.price;
  t.prevVol = s.vol;
  t.prevAmount = s.amount;
}

let polling = false;
let timer: any = null;
const POLL_MS = 15000;

// 一轮监测：遍历自选股快照，逐只检测（单只失败不影响其余）
async function monitorTick() {
  clearIfNewDay();
  if (!getMarketStatus().open) return; // 休市不监测
  const wl = useWatchlist();
  const items = wl.items.map((it) => ({ code: it.code, market: it.market, name: it.name }));
  if (!items.length) return;
  await Promise.allSettled(
    items.map(async (it) => {
      try {
        const secid = resolveSecid(it.code, it.market as any);
        const s = await fetchSnapshot(secid);
        detect(it, secid, s);
      } catch {
        /* 单只失败忽略，下一轮重试 */
      }
    })
  );
}

// 派生：按异动时间倒序（最新在前）
export const anomalies = computed(() =>
  state.list.slice().sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0))
);

// 应用级心跳：开市期间每 15s 跑一轮（fetchSnapshot 自带 20s TTL 限流）
export function startAnomalyMonitor() {
  if (timer) return;
  timer = setInterval(() => {
    if (polling) return;
    polling = true;
    monitorTick().finally(() => {
      polling = false;
    });
  }, POLL_MS);
  monitorTick(); // 启动即跑一次
}
