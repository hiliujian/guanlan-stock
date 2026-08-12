// =====================================================================
// 行情图「副图指标面板内部辅助线」显隐配置 store（本地持久化）
// - panelConfig：响应式单例配置，控制成交量面板内的量均线、MACD 面板内的 DIF/DEA 是否绘制；
// - 字段语义：volumeMa5/10/20 = 成交量副图内的量均线（MA5/10/20）、macdDif/macdDea = MACD 副图内的 DIF/DEA 线；
// - 成交量面板与 MACD 面板本身常驻显示（不提供整体隐藏开关），二级仅控制各线；
// - 持久化到 localStorage（key: gl_chart_panel），跨会话保留用户偏好。
// 说明：本文件只管「副图面板内部辅助线」，与「主图辅助线 MA」（chartMa）、
//        「智能标注」（chartAux）相互独立。
// =====================================================================
import { reactive, watch } from "vue";

export interface ChartPanelConfig {
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

// 读取本地已存偏好（容错：解析失败 / 无数据 / 脏数据 → 回退默认全开）
// 注意：uni.getStorageSync 在多数端返回的是「对象」而非字符串（底层已序列化），
// 因此 load 兼容「字符串(解析)」与「对象(直接用)」两种形态，避免读不到已存设置。
function load(): ChartPanelConfig {
  const base = defaultConfig();
  try {
    const raw = uni.getStorageSync(STORAGE_KEY);
    if (raw == null) return base;
    const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<ChartPanelConfig>;
    if (parsed && typeof parsed === "object") {
      return { ...base, ...parsed };
    }
  } catch {
    /* noop */
  }
  return base;
}

export const panelConfig = reactive<ChartPanelConfig>(load());

// 配置变化即时落盘（仅持久化已知字段，忽略多余脏字段）
watch(
  panelConfig,
  (val) => {
    try {
      uni.setStorageSync(STORAGE_KEY, { ...val });
    } catch {
      /* noop */
    }
  },
  { deep: true }
);
