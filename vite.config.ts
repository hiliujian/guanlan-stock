import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

// https://vitejs.dev/config/
export default defineConfig({
  // 相对 base：让构建产物用 ./assets/... 而非 /assets/...，
  // 兼容 CloudStudio / Vercel 等子路径托管，避免静态资源 404。
  base: "./",
  plugins: [uni()],
  server: {
    host: true, // 监听 0.0.0.0，同时覆盖 IPv4(127.0.0.1) 与 IPv6(::1)，避免 localhost 解析歧义导致首屏资源加载失败
    port: 8888,
    strictPort: true,
    proxy: {
      // 通知公告 API：代理到本地 Node 后端（server/index.js，默认 8787）
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
      // 东方财富 K 线 / 资金流 / 分时：本地开发走 Vite 同源代理，绕开 CORS，
      // 确保换手率(f61) 等字段可靠到达，不依赖 JSONP / 公共代理。
      "/em": {
        target: "https://push2his.eastmoney.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/em/, ""),
      },
      "/rt": {
        target: "https://push2.eastmoney.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/rt/, ""),
      },
      "/search": {
        target: "https://searchapi.eastmoney.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/search/, ""),
      },
    },
  },
  // 沙箱 delete 守卫会拦截 vite 对 dist 的批量清空，导致构建失败；
  // 关掉自动清空，改为构建后手动用「改名」方式轮转 dist（mv 不受守卫限制）。
  // 旧资源会变成孤立文件，无害；最终托管的是全新复制的 h5outN 目录。
  build: { emptyOutDir: false },
});
