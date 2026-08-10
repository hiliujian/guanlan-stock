// =====================================================================
// 行情图辅助线配置 store（本地持久化）
// - auxConfig：响应式单例配置，组件 watch 后自动响应「辅助线开关」变化；
// - 默认值全部开启（总开关 + 压力/支撑/趋势/关键区间）；
// - 持久化到 localStorage（key: gl_chart_aux），跨会话保留用户偏好。
// 说明：辅助线指系统「自动画线」标注的压力/支撑/趋势/关键区间，
//       与用户手绘画线（工具栏）相互独立，互不影响。
// =====================================================================
import { reactive, watch } from "vue";

export interface ChartAuxConfig {
  /** 辅助线总开关：关闭后不再绘制任何自动辅助线（手绘画线不受影响） */
  enabled: boolean;
  /** 压力线 */
  pressure: boolean;
  /** 支撑线 */
  support: boolean;
  /** 趋势线 */
  trend: boolean;
  /** 关键区间（阻力组与支撑组之间的阴影带） */
  zone: boolean;
}

const STORAGE_KEY = "gl_chart_aux";

function defaultConfig(): ChartAuxConfig {
  return { enabled: true, pressure: true, support: true, trend: true, zone: true };
}

// 读取本地已存偏好（容错：解析失败 / 无数据 → 回退默认全开）
function load(): ChartAuxConfig {
  const base = defaultConfig();
  try {
    const raw = uni.getStorageSync(STORAGE_KEY);
    if (raw && typeof raw === "string") {
      const parsed = JSON.parse(raw) as Partial<ChartAuxConfig>;
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
      uni.setStorageSync(STORAGE_KEY, JSON.parse(JSON.stringify(val)));
    } catch {
      /* noop */
    }
  },
  { deep: true }
);
