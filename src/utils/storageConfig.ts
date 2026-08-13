// 本地配置持久化的通用读写（消除各 chart store 重复的 load/落盘样板）
// uni.getStorageSync 多数端返回「对象」而非字符串（底层已序列化），
// 因此 loadConfig 兼容「字符串(解析)」与「对象(直接用)」两种形态，避免读不到已存设置。
import { watch } from "vue";

export function loadConfig<T extends object>(key: string, defaults: () => T): T {
  const base = defaults();
  try {
    const raw = uni.getStorageSync(key);
    if (raw == null) return base;
    const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<T>;
    if (parsed && typeof parsed === "object") {
      return { ...base, ...parsed };
    }
  } catch {
    /* noop */
  }
  return base;
}

// 配置变化即时落盘（仅持久化已知字段，忽略多余脏字段）
export function persistConfig<T extends object>(state: T, key: string): void {
  try {
    uni.setStorageSync(key, { ...state });
  } catch {
    /* noop */
  }
}

// 响应式配置变化即落盘（deep watch）
export function watchPersist<T extends object>(state: T, key: string): void {
  watch(state as object, () => persistConfig(state, key), { deep: true });
}
