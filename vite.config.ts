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
});
