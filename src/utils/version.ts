// 应用版本唯一来源（规范化）。
// manifest.json 的 versionName / versionCode 需与本文件保持一致：
//   - 应用尚未发布，取最低基线版本 1.0.0 / build 1。
//   - H5 运行时无法可靠读取 plus.runtime，故在此集中定义并展示。
export const APP_VERSION = "1.0.0";
export const APP_VERSION_CODE = 1;

// 展示用：版本号 + 构建号，例如 "1.0.0 (1)"
export const APP_VERSION_DISPLAY = `${APP_VERSION} (${APP_VERSION_CODE})`;
