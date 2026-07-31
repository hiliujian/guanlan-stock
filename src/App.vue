<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { initTheme } from "@/utils/theme";
onLaunch(() => {
  // 应用启动即套用用户保存的主题（深色默认）
  initTheme();
});
</script>

<style>
@import "./styles/global.css";
</style>
