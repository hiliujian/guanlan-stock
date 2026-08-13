// =====================================================================
// 行情图「智能标注」配置 store（本地持久化）
// - auxConfig：响应式单例配置，组件 watch 后自动响应「智能标注开关」变化；
// - 默认值全部开启（压力/支撑/趋势）；
// - 持久化到 localStorage（key: gl_chart_aux），跨会话保留用户偏好。
// 说明：本项目约定「辅助线」专指均线 MA（MA5/MA10/MA20/MA60，由 chartMa 管理）；
//       本文件管理的是「智能标注」——系统自动标注的压力/支撑/趋势，
//       与用户手绘画线（工具栏）相互独立，互不影响。
// =====================================================================
import { reactive, watch } from "vue";

export interface ChartAuxConfig {
  /** 结构线（结构支撑 + 结构压力，深绿/深红；波段高低点结构位） */
  structLine: boolean;
  /** 交易线（S 交易参考支撑 + B 交易参考压力，浅绿/浅红；短线筹码密集中枢） */
  tradeLine: boolean;
  /** 趋势线 */
  trend: boolean;
}

const STORAGE_KEY = "gl_chart_aux";

function defaultConfig(): ChartAuxConfig {
  return { structLine: true, tradeLine: true, trend: true };
}

// 读取本地已存偏好（容错：解析失败 / 无数据 / 脏数据 → 回退默认全开）
// 注意：uni.getStorageSync 在多数端返回的是「对象」而非字符串（底层已序列化），
// 因此 load 兼容「字符串(解析)」与「对象(直接用)」两种形态，避免读不到已存设置。
function load(): ChartAuxConfig {
  const base = defaultConfig();
  try {
    const raw = uni.getStorageSync(STORAGE_KEY);
    if (raw == null) return base;
    const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<ChartAuxConfig>;
    if (parsed && typeof parsed === "object") {
      return { ...base, ...parsed };
    }
  } catch {
    /* noop */
  }
  return base;
}

export const auxConfig = reactive<ChartAuxConfig>(load());

// 配置变化即时落盘（仅持久化已知字段，忽略多余脏字段）
watch(
  auxConfig,
  (val) => {
    try {
      uni.setStorageSync(STORAGE_KEY, { ...val });
    } catch {
      /* noop */
    }
  },
  { deep: true }
);
