import { ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import { userState, syncSession, useUser } from "@/store/user";
import { goToProfile } from "@/store/nav";

/**
 * 认证页（登录 / 注册 / 找回密码）守卫。
 * 已登录用户访问这些页面时，自动 replace 到「我的」，避免停留在认证页、且返回键不会带回登录页。
 *
 * 用法（页面 <script setup>）：
 *   const { ready, guard } = useAuthGuard();
 *   onLoad(() => guard());
 * 模板以 v-if="ready" 包裹表单内容，未就绪时显示占位 spinner。
 *
 * 防闪烁 / 防 hydration mismatch：
 *   - ready 初始为 false，首帧不渲染任何认证表单，仅占位 spinner；
 *   - 已登录（内存态或本地可恢复 session）立即跳转，用户不会看到表单一闪；
 *   - 未登录才置 ready=true 渲染表单。
 *   该门控使「服务端 / 客户端首帧」都渲染 ready=false 占位，天然避免 SSR hydration mismatch。
 */
export function useAuthGuard() {
  const ready = ref(false);
  const redirecting = ref(false); // 重入保护：guard() 可能被 onLoad + onShow 并发触发，
  // 仅允许发起一次跳转，避免多次 goToProfile 互相取消导致「Navigation cancelled」未捕获报错。
  useUser(); // 确保登录态监听已就绪（幂等，不重复注册）

  async function guard() {
    if (redirecting.value) return; // 另一条 onLoad/onShow 路径已发起跳转（或正在跳转）
    // 1) 内存态已登录：最快路径，立即跳转
    if (userState.loggedIn) {
      redirecting.value = true;
      goToProfile();
      return;
    }
    // 2) 兜底：本地会话可能尚未恢复到内存态（App 刚启动 / onAuthChange 异步触发），
    //    主动读一次本地会话；已登录则跳转。
    const ok = await syncSession();
    if (redirecting.value) return; // await 期间另一条路径已跳转，放弃本次
    if (ok && userState.loggedIn) {
      redirecting.value = true;
      goToProfile();
      return;
    }
    // 3) 确认未登录：放行渲染认证表单
    ready.value = true;
  }

  // onLoad + onShow 双重拦截：
  // - onLoad 覆盖正常进入场景；
  // - onShow 兜底页面「重新显示」类进入（如浏览器前进/后退、keep-alive 缓存复用），
  //   避免 onLoad 未触发导致已登录仍能停留在认证页。
  // （页面自身无需再注册 onLoad，避免 guard() 被重复调用）
  onLoad(() => guard());
  onShow(() => guard());

  return { ready, guard };
}
