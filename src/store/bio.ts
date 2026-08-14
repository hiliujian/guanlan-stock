// =====================================================================
// 个人简介（本地存储，不持久化到数据库）
// ---------------------------------------------------------------------
// 用户要求「个人简介」不写入后端数据库（避免数据库列 / 迁移维护成本），
// 故仅以本机 localStorage 留存（同设备刷新后保留，跨设备 / 社区不同步）。
// 默认空串；空态由 UI 用系统灰色字展示引导文案（见 ProfileView / edit）。
// =====================================================================
import { ref } from "vue";

/** 个人简介最大字数（与编辑页 textarea maxlength 一致） */
export const BIO_MAX = 50;
/** 空态引导文案（点击「我的」页头部进入资料页编辑）；使用系统灰色字（--text-2）展示 */
export const BIO_PLACEHOLDER = "点击添加简介，让大家认识你";

const STORAGE_KEY = "guanlan_bio";

const bio = ref<string>("");
try {
  const v = uni.getStorageSync(STORAGE_KEY);
  if (typeof v === "string") bio.value = v.slice(0, BIO_MAX);
} catch {
  /* 存储不可用时静默降级为空简介 */
}

export function useBio() {
  return bio;
}

/** 写入个人简介（去首尾空白、截断上限）并同步本机存储；空值则清除存储项 */
export function setBio(value: string): void {
  const next = value.trim().slice(0, BIO_MAX);
  bio.value = next;
  try {
    if (next) uni.setStorageSync(STORAGE_KEY, next);
    else uni.removeStorageSync(STORAGE_KEY);
  } catch {
    /* 存储不可用时仅更新内存态 */
  }
}
