<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { initTheme } from "@/utils/theme";
import { isSupabaseConfigured } from "@/config/app";
onLaunch(() => {
  // 应用启动即套用用户保存的主题（深色默认）
  initTheme();
  // 诊断：后端未配置时明确告知缺哪个环境变量，方便排查 Vercel 等托管平台的注入问题
  if (!isSupabaseConfigured) {
    console.warn(
      "[guanlan] 后端未配置：构建时未注入 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。" +
        "请在托管平台（如 Vercel）Settings → Environment Variables 添加这两个变量" +
        "（须含 VITE_ 前缀、作用域勾选 Production）后重新部署。",
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
