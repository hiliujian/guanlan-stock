// 主题状态：浅色（默认）/ 深色，跨端统一，持久化到 localStorage。
// 通过给 <html> 加 .theme-light 类切换 CSS 变量；图表读取 isDark 做主题适配。
import { ref, computed } from "vue";

type ThemeMode = "dark" | "light";

const KEY = "guanlan-theme";

function readStored(): ThemeMode {
  if (typeof localStorage === "undefined") return "light";
  const v = localStorage.getItem(KEY);
  return v === "dark" ? "dark" : "light";
}

const theme = ref<ThemeMode>(readStored());

export const isDark = computed(() => theme.value === "dark");

function apply() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("theme-light", theme.value === "light");
  root.classList.toggle("theme-dark", theme.value === "dark");
  // 同步给 <meta name="theme-color">，移动端地址栏跟随
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme.value === "dark" ? "#05080f" : "#eef1f6");
}

export function initTheme() {
  apply();
}

export function setTheme(t: ThemeMode) {
  theme.value = t;
  if (typeof localStorage !== "undefined") localStorage.setItem(KEY, t);
  apply();
}
