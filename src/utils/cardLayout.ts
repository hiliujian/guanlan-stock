// 行情页卡片布局：顺序 + 显隐，跨端统一，持久化到 localStorage。
// 行情页按 visibleMarketCards 顺序渲染可见卡片；设置页可调整顺序与显隐。
//
// 卡片模型（2026-07-31 重构）：K线/分时、成交量、MACD、筹码分布本就互相印证，
// 已统一并入 StockChart 单图多窗格（主图 + 量 + MACD + 右侧筹码叠加），因此只保留
// 一张「行情图」卡片；关联资讯·情绪量化作为独立「分析报告」卡片。
import { reactive, computed } from "vue";

export type CardId = "kline" | "report";

export interface MarketCardMeta {
  id: CardId;
  title: string;
  icon: string;
}

// 卡片元数据（顺序即默认展示顺序）
export const MARKET_CARDS: MarketCardMeta[] = [
  { id: "kline", title: "行情图", icon: "bars" },
  { id: "report", title: "分析报告", icon: "chatbubble" },
];

const KEY = "guanlan-card-layout";
const DEFAULT_ORDER: CardId[] = MARKET_CARDS.map((c) => c.id);

function readStored(): { order: CardId[]; hidden: CardId[] } {
  try {
    const v = localStorage.getItem(KEY);
    if (v) {
      const p = JSON.parse(v);
      const order = Array.isArray(p.order)
        ? (p.order.filter((x: any) => MARKET_CARDS.some((c) => c.id === x)) as CardId[])
        : [...DEFAULT_ORDER];
      // 补齐缺失的 id（防止旧数据/新增卡片漏显示）
      for (const id of DEFAULT_ORDER) if (!order.includes(id)) order.push(id);
      const hidden = Array.isArray(p.hidden)
        ? (p.hidden.filter((x: any) => MARKET_CARDS.some((c) => c.id === x)) as CardId[])
        : [];
      return { order, hidden };
    }
  } catch {
    /* 解析失败则回退默认 */
  }
  return { order: [...DEFAULT_ORDER], hidden: [] };
}

const stored = readStored();
const cardOrder = reactive<CardId[]>(stored.order);
const hidden = reactive<Record<CardId, boolean>>(
  Object.fromEntries(DEFAULT_ORDER.map((id) => [id, stored.hidden.includes(id)])) as Record<CardId, boolean>
);

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ order: cardOrder, hidden: Object.keys(hidden).filter((k) => hidden[k as CardId]) }));
  } catch {
    /* 忽略存储异常 */
  }
}

// 按配置顺序返回可见卡片（行情页直接 v-for 渲染）
export const visibleMarketCards = computed<MarketCardMeta[]>(() =>
  cardOrder.filter((id) => !hidden[id]).map((id) => MARKET_CARDS.find((c) => c.id === id)!)
);

export function metaOf(id: CardId): MarketCardMeta {
  return MARKET_CARDS.find((c) => c.id === id)!;
}

export function toggleCard(id: CardId) {
  hidden[id] = !hidden[id];
  save();
}

// 拖拽提交：按新顺序整体写入（顺序受控于设置页拖拽，校验完整性后生效）
export function setOrder(ids: CardId[]) {
  const set = new Set(ids);
  if (set.size !== DEFAULT_ORDER.length) return;
  for (const id of DEFAULT_ORDER) if (!set.has(id)) return; // 缺损则放弃，避免丢卡片
  cardOrder.splice(0, cardOrder.length, ...ids);
  save();
}

export function resetCardLayout() {
  cardOrder.splice(0, cardOrder.length, ...DEFAULT_ORDER);
  for (const id of DEFAULT_ORDER) hidden[id] = false;
  save();
}

export { cardOrder, hidden };
