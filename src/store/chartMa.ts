// =====================================================================
// 行情图「辅助线」（均线 MA）配置 store（本地持久化）
// - maConfig：响应式单例配置，控制主图显示哪些周期均线；
// - 字段语义：ma5/ma10/ma20/ma60 各自独立开关（默认全开）；
// - 持久化到 localStorage（key: gl_chart_ma），跨会话保留用户偏好。
// 说明：本项目约定「辅助线」专指均线 MA（MA5/MA10/MA20/MA60）；
//       系统自动标注的压力/支撑/趋势另行归类为「智能标注」，
//       由 chartAux 管理，二者相互独立。
// =====================================================================
import { reactive, watch } from "vue";

export interface ChartMaConfig {
  /** MA5（周线参照） */
  ma5: boolean;
  /** MA10（两周线） */
  ma10: boolean;
  /** MA20（月线） */
  ma20: boolean;
  /** MA60（季线） */
  ma60: boolean;
  /** MA250（年线） */
  ma250: boolean;
}

/** 可调周期列表（顺序即图例/开关排列顺序） */
export const MA_PERIODS: { key: keyof ChartMaConfig; period: number; label: string }[] = [
  { key: "ma5", period: 5, label: "MA5" },
  { key: "ma10", period: 10, label: "MA10" },
  { key: "ma20", period: 20, label: "MA20" },
  { key: "ma60", period: 60, label: "MA60" },
  { key: "ma250", period: 250, label: "MA250" },
];

const STORAGE_KEY = "gl_chart_ma";

function defaultConfig(): ChartMaConfig {
  return { ma5: true, ma10: true, ma20: true, ma60: true, ma250: true };
}

// 读取本地已存偏好（容错：解析失败 / 无数据 / 脏数据 → 回退默认全开）
// 注意：uni.getStorageSync 在多数端返回的是「对象」而非字符串（底层已序列化），
// 因此 load 兼容「字符串(解析)」与「对象(直接用)」两种形态，避免读不到已存设置。
function load(): ChartMaConfig {
  const base = defaultConfig();
  try {
    const raw = uni.getStorageSync(STORAGE_KEY);
    if (raw == null) return base;
    const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<ChartMaConfig>;
    if (parsed && typeof parsed === "object") {
      return { ...base, ...parsed };
    }
  } catch {
    /* noop */
  }
  return base;
}

export const maConfig = reactive<ChartMaConfig>(load());

// 配置变化即时落盘（仅持久化已知字段，忽略多余脏字段）
watch(
  maConfig,
  (val) => {
    try {
      uni.setStorageSync(STORAGE_KEY, { ...val });
    } catch {
      /* noop */
    }
  },
  { deep: true }
);
