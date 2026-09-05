// =====================================================================
// 字体偏好 store（本地持久化）
// - fontConfig.font：用户选择的字体方案 key（见 FONT_OPTIONS，默认 system）；
// - setFont 即时生效：把 --font-app 字体栈写到根节点，global.css 的 page 根规则
//   以 font-family: var(--font-app) 引用；变量不存在时按规范回落为继承值，
//   即系统默认字体（与项目「默认不指定 font-family」的既有约定兼容）。
// - 栈序约定：英文/数字字体在前（拉丁字形优先命中），中文字体随后（命中 CJK），
//   尾部兜底系统栈；设备未装对应字体时自动落到下一项，不会白屏/豆腐块。
// =====================================================================
import { reactive } from "vue";
import { loadConfig, watchPersist } from "@/utils/storageConfig";

interface FontOption {
  key: string;
  label: string; // 设置页分段控件文案
  en: string[]; // 英文/数字字体（栈首）
  cn: string[]; // 中文字体（随后）
  desc: string; // 设置页说明
}

export const FONT_OPTIONS: FontOption[] = [
  {
    key: "system",
    label: "系统",
    en: [],
    cn: [],
    desc: "跟随系统默认。",
  },
  {
    key: "sans",
    label: "无衬线",
    en: ["MiSans", "HarmonyOS Sans SC", "SF Pro Text", "Segoe UI"],
    cn: ["MiSans", "HarmonyOS Sans SC", "PingFang SC", "Noto Sans SC", "Microsoft YaHei"],
    desc: "现代圆润黑体。",
  },
  {
    key: "serif",
    label: "衬线",
    en: ["Georgia", "Times New Roman"],
    cn: ["Songti SC", "STSong", "SimSun", "Noto Serif SC"],
    desc: "经典书卷感。",
  },
];

const STORAGE_KEY = "gl_font";

interface FontState {
  font: string;
}
function defaultFont(): FontState {
  return { font: "system" };
}

// 组合字体栈：含空格的族名加引号；英文段在前、中文段随后、系统栈兜底
function buildStack(opt: FontOption): string {
  return [...opt.en, ...opt.cn, "-apple-system", "Segoe UI", "Roboto", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", "sans-serif"]
    .map((f) => (f.includes(" ") ? `"${f}"` : f))
    .join(", ");
}

function applyFont(key: string): void {
  // 非 H5 端无 DOM（小程序/App 由系统字体渲染），静默跳过
  if (typeof document === "undefined") return;
  const opt = FONT_OPTIONS.find((o) => o.key === key);
  const root = document.documentElement;
  if (!opt || !opt.cn.length) {
    root.style.removeProperty("--font-app");
    return;
  }
  root.style.setProperty("--font-app", buildStack(opt));
}

export const fontConfig = reactive<FontState>(loadConfig(STORAGE_KEY, defaultFont));

export function setFont(key: string): void {
  fontConfig.font = key;
  applyFont(key);
}

// 应用启动（本模块随 App.vue 导入）即恢复已保存的偏好
applyFont(fontConfig.font);

// 配置变化即时落盘
watchPersist(fontConfig, STORAGE_KEY);
