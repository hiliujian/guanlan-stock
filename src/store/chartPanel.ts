// =====================================================================
// 行情图「副图指标面板内部辅助线」显隐配置 store（本地持久化）
// - panelConfig：响应式单例配置，控制成交量面板内的量均线、MACD 面板内的 DIF/DEA 是否绘制；
// - 字段语义：volumeMa5/10/20 = 成交量副图内的量均线（MA5/10/20）、macdDif/macdDea = MACD 副图内的 DIF/DEA 线；
// - 成交量面板与 MACD 面板本身常驻显示（不提供整体隐藏开关），二级仅控制各线；
// - 持久化到 localStorage（key: gl_chart_panel），跨会话保留用户偏好。
// 说明：本文件只管「副图面板内部辅助线」，与「主图辅助线 MA」（chartMa）、
//        「智能标注」（chartAux）相互独立。
// =====================================================================
import { reactive } from "vue";
import { loadConfig, watchPersist } from "@/utils/storageConfig";

interface ChartPanelConfig {
  /** 成交量面板内部的量均线 MA5 是否绘制 */
  volumeMa5: boolean;
  /** 成交量面板内部的量均线 MA10 是否绘制 */
  volumeMa10: boolean;
  /** 成交量面板内部的量均线 MA20 是否绘制 */
  volumeMa20: boolean;
  /** MACD 面板内部的 DIF 线是否绘制 */
  macdDif: boolean;
  /** MACD 面板内部的 DEA 线是否绘制 */
  macdDea: boolean;
}

const STORAGE_KEY = "gl_chart_panel";

function defaultConfig(): ChartPanelConfig {
  return { volumeMa5: true, volumeMa10: true, volumeMa20: true, macdDif: true, macdDea: true };
}

export const panelConfig = reactive<ChartPanelConfig>(loadConfig(STORAGE_KEY, defaultConfig));

// 配置变化即时落盘（仅持久化已知字段，忽略多余脏字段）
watchPersist(panelConfig, STORAGE_KEY);
