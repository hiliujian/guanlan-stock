<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { initTheme } from "@/utils/theme";
import { isSupabaseConfigured } from "@/config/app";
import { initAppConfig } from "@/store/appConfig";
import { initPageAccess } from "@/store/access";
import { installNavGuards } from "@/store/guard";
import { startAnomalyMonitor } from "@/store/anomaly";
onLaunch(() => {
  // 应用启动即套用用户保存的主题（深色默认）
  initTheme();
  // 拉取 Supabase app_config 远程配置（菜单显隐 / 数据源顺序），失败维持本地默认
  initAppConfig();
  // 拉取页面白名单（page_access）并注册全局导航拦截器：
  // 未授权页面 + 未登录用户 一律跳转登录页（详情见 src/store/guard.ts）
  initPageAccess();
  installNavGuards();
  // 启动盘口异动监测（应用级心跳，开市期间轮询自选股实时快照）
  startAnomalyMonitor();
  // 诊断：后端未配置时明确告知缺哪个环境变量，方便排查 Vercel 等托管平台的注入问题
  if (!isSupabaseConfigured) {
    console.warn(
      "[guanlan] 后端未配置：构建时未注入 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。请在托管平台（如 Vercel）Settings -> Environment Variables 添加这两个变量（须带 VITE_ 前缀、作用域勾选 Production）后重新部署。",
      {
        urlInjected: !!import.meta.env.VITE_SUPABASE_URL,
        keyInjected: !!import.meta.env.VITE_SUPABASE_ANON_KEY,
      }
    );
  }
});
</script>

<style>
@import "./styles/global.css";
</style>
