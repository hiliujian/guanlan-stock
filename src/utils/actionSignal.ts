// =====================================================================
// 操作信号（持仓感知）：引擎技术信号 → 面向用户的「仓位动作」
// ---------------------------------------------------------------------
// 为什么需要这一层：
//   分析引擎（analyzer.decideSignal）只做技术面判断，输出 buy/sell/hold/watch/wait。
//   但「买点」「持有」这类标签对**空仓**和**已持仓**的用户含义完全不同——
//   空仓的人看到「持有」无从下手，已持仓的人看到「买点」也未必该满仓追。
//   因此在这里做一次「持仓感知」翻译，同一份技术判断按持仓状态给出不同的动作。
//
// 档位设计原则：**同一视角内零重叠、动作互斥**（不会出现既「持有」又「观望」）。
//   空仓视角（未设持仓）：买点 / 关注 / 观望     —— 介入导向
//   持仓视角（已设持仓）：加仓 / 持有 / 减仓     —— 仓位管理导向
//
// 单一事实来源：行情页信号卡（ReportView）与自选页持仓表（WatchlistView）
// 必须共用本模块，否则两处信号会各说各话（历史上正是两处独立实现导致不一致）。
// =====================================================================

/** 分析引擎输出的技术信号档位（与本模块的「动作档位」解耦） */
export type EngineSignalLevel = "buy" | "sell" | "hold" | "watch" | "wait";

/** 对外的仓位动作档位 */
export type ActionLevel = "buy" | "add" | "watch" | "hold" | "wait" | "reduce";

export interface ActionSignal {
  /** 动作档位（决定配色与语义，不复用引擎 level） */
  level: ActionLevel;
  /** 展示标签：买点 / 加仓 / 关注 / 持有 / 观望 / 减仓 */
  label: string;
  /** 一句话建议（持仓感知后的措辞） */
  text: string;
}

/** 动作档位的展示类型（供 TS 约束，运行时即 ActionSignal） */
export interface ActionChip {
  text: string;
  cls: string;
}

// ---- 空仓视角：介入导向（3 档，互斥） ----
const FLAT_VIEW: Record<EngineSignalLevel, ActionSignal> = {
  buy: { level: "buy", label: "买点", text: "已出现买入信号，可在买入区间内建仓" },
  // 空仓谈不上「持有」：趋势再好也只是「先关注、等回调」，避免诱导追高
  hold: { level: "watch", label: "关注", text: "趋势向上，等待回调至支撑的更好买点" },
  watch: { level: "watch", label: "关注", text: "偏强运行，等待回调至支撑的更好买点" },
  // 空仓也谈不上「卖点」：技术面转弱 = 别进场，统一收口为「观望」
  sell: { level: "wait", label: "观望", text: "技术形态转弱，暂不参与" },
  wait: { level: "wait", label: "观望", text: "趋势偏弱或方向未明，暂不参与" },
};

// ---- 持仓视角：仓位管理导向（3 档，互斥） ----
const HOLD_VIEW: Record<EngineSignalLevel, ActionSignal> = {
  // 已持仓 + 技术买点 → 小幅加仓（不是「买点」，因为底仓已有，动作是加）
  buy: { level: "add", label: "加仓", text: "出现买入信号，可小幅加仓，勿重仓追高" },
  hold: { level: "hold", label: "持有", text: "趋势向上，继续持有，回调即加仓点" },
  watch: { level: "hold", label: "持有", text: "偏强运行，继续持有观察" },
  // 弱势/震荡但尚未触发卖出：已持仓者「不加不减」，提示减仓触发条件
  wait: { level: "hold", label: "持有", text: "趋势转弱或方向未明，暂不加仓，跌破 MA20 考虑减仓" },
  sell: { level: "reduce", label: "减仓", text: "出现卖出信号，建议降低仓位" },
};

/**
 * 把引擎技术信号翻译为持仓感知的仓位动作。
 * @param level 引擎信号档位（analyze().signal.level）
 * @param hasPosition 是否已设置持仓成本
 */
export function toActionSignal(
  level: EngineSignalLevel,
  hasPosition: boolean
): ActionSignal {
  const table = hasPosition ? HOLD_VIEW : FLAT_VIEW;
  return table[level] || table.wait;
}

/** 持仓表格用的极简形态（只要标签与配色类名） */
export function toActionChip(
  level: EngineSignalLevel,
  hasPosition: boolean
): ActionChip {
  const s = toActionSignal(level, hasPosition);
  // cls 直接用引擎档位（而非动作档位）：与行情页信号卡的配色体系一一对应
  // （buy=红 / sell=绿 / hold=蓝 / watch=橙 / wait=中性灰），标签文字仍是持仓感知的动作。
  return { text: s.label, cls: level };
}
