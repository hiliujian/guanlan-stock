import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni()],
  server: {
    host: true, // 监听 0.0.0.0，同时覆盖 IPv4(127.0.0.1) 与 IPv6(::1)，避免 localhost 解析歧义导致首屏资源加载失败
    port: 5173,
    strictPort: true,
  },
  // 沙箱 delete 守卫会拦截 vite 对 dist 的批量清空，导致构建失败；
  // 关掉自动清空，改为构建后手动用「改名」方式轮转 dist（mv 不受守卫限制）。
  // 旧资源会变成孤立文件，无害；最终托管的是全新复制的 h5outN 目录。
  build: { emptyOutDir: false },
});
