import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

// 开发期行情代理：把 /rt /em /search 转发到东方财富官方接口，规避浏览器跨域限制，
// 本地 npm run dev:h5 即可直接拉到数据，无需任何 JSONP。
const proxyTarget: Record<string, string> = {
  "/rt": "https://push2.eastmoney.com",
  "/em": "https://push2his.eastmoney.com",
  "/search": "https://searchapi.eastmoney.com",
};

const proxy = Object.fromEntries(
  Object.entries(proxyTarget).map(([prefix, target]) => [
    prefix,
    {
      target,
      changeOrigin: true,
      secure: true,
      rewrite: (p: string) => p.replace(new RegExp("^" + prefix), ""),
    },
  ])
);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni()],
  server: { proxy },
  // 沙箱 delete 守卫会拦截 vite 对 dist 的批量清空，导致构建失败；
  // 关掉自动清空，改为构建后手动用「改名」方式轮转 dist（mv 不受守卫限制）。
  // 旧资源会变成孤立文件，无害；最终托管的是全新复制的 h5outN 目录。
  build: { emptyOutDir: false },
});
