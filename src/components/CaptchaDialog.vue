<template>
  <!-- 人机验证弹窗（本地图形验证码，防登录爆破 / 验证码接口滥用）。
       用法：const captcha = ref(); await captcha.verify() → 通过 true / 取消 false。
       纯前端校验：验证码仅在本机生成与比对，用于抬高自动化脚本的批量攻击成本；
       真正的限流兜底仍由后端（Supabase Auth 自带限流）承担。 -->
  <view v-if="visible" class="cap-mask" @touchmove.stop.prevent>
    <view class="cap-card" @click.stop>
      <text class="cap-title">人机验证</text>
      <text class="cap-desc">请输入下图中的字符，完成验证后继续</text>

      <view class="cap-imgrow">
        <!-- 图形验证码：本地随机生成（字符旋转 + 干扰线 + 噪点），点击可刷新 -->
        <svg
          viewBox="0 0 132 44"
          class="cap-svg"
          fill="none"
          v-html="captchaSvg"
          @click="regen"
        />
        <view class="cap-refresh flex-center" role="button" aria-label="换一张" @click="regen">
          <OutlineIcon type="refresh" :size="30" color="var(--text-2)" />
        </view>
      </view>

      <input
        v-model="input"
        class="cap-input"
        :class="{ err: inputErr }"
        type="text"
        maxlength="4"
        placeholder="输入验证码"
        :focus="visible"
        @confirm="confirm"
      />
      <text v-if="inputErr" class="cap-err">{{ inputErr }}</text>

      <view class="cap-btns">
        <view class="cap-btn ghost" role="button" @click="cancel">取消</view>
        <view class="cap-btn primary" role="button" @click="confirm">验证</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import OutlineIcon from "@/components/OutlineIcon.vue";

const visible = ref(false);
const input = ref("");
const inputErr = ref("");
const code = ref("");
const captchaSvg = ref("");
// resolve 由 verify() 注入：确认 → true；取消/遮罩 → false
let settle: ((ok: boolean) => void) | null = null;

// 去除易混字符（0/O、1/I/L），降低用户辨识失败率
const CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
// 深色字符色板（浅色卡底上保证可读），干扰元素统一用低透明度
const INKS = ["#334155", "#7c3aed", "#0e7490", "#b45309", "#4d7c0f", "#be185d"];
const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(arr: T[]): T => arr[rand(arr.length)];

/** 重新生成验证码（字符 + 对应 SVG） */
function regen() {
  code.value = Array.from({ length: 4 }, () => CHARS[rand(CHARS.length)]).join("");
  const chars = code.value.split("").map((ch, i) => {
    const rot = rand(41) - 20; // -20° ~ 20° 随机旋转
    const dy = rand(7) - 3; // 轻微上下错位
    const fill = pick(INKS);
    const size = 21 + rand(6);
    return `<text x="${16 + i * 28}" y="${28 + dy}" transform="rotate(${rot} ${16 + i * 28} ${24})" fill="${fill}" font-size="${size}" font-weight="600" font-family="monospace">${ch}</text>`;
  }).join("");
  // 干扰：两条折线 + 散点，透明度低不抢主体
  const line = (pts: string) =>
    `<polyline points="${pts}" stroke="${pick(INKS)}" stroke-opacity="0.35" stroke-width="1.5" fill="none"/>`;
  const dots = Array.from({ length: 8 }, () => {
    const c = pick(INKS);
    return `<circle cx="${rand(132)}" cy="${rand(44)}" r="1.4" fill="${c}" fill-opacity="0.4"/>`;
  }).join("");
  captchaSvg.value =
    chars +
    line(`${rand(20)},${rand(44)} ${60 + rand(30)},${rand(44)} ${110 + rand(20)},${rand(44)}`) +
    line(`${rand(20)},${rand(44)} ${60 + rand(30)},${rand(44)} ${110 + rand(20)},${rand(44)}`) +
    dots;
}

/** 弹出验证：resolve(true)=校验通过；resolve(false)=用户取消 */
function verify(): Promise<boolean> {
  regen();
  input.value = "";
  inputErr.value = "";
  visible.value = true;
  return new Promise((resolve) => {
    settle = resolve;
  });
}

function close(ok: boolean) {
  visible.value = false;
  settle?.(ok);
  settle = null;
}

function cancel() {
  close(false);
}

function confirm() {
  const v = input.value.trim().toUpperCase();
  if (!v) {
    inputErr.value = "请输入验证码";
    return;
  }
  if (v !== code.value) {
    inputErr.value = "验证码不正确，请重试";
    regen(); // 错误即换码，防止穷举
    input.value = "";
    return;
  }
  close(true);
}

defineExpose({ verify });
</script>

<style scoped>
.cap-mask {
  position: fixed;
  inset: 0;
  z-index: 9999; /* 盖过 PeekSheet / 底栏等一切浮层 */
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}
.cap-card {
  width: 560rpx;
  background: var(--bg);
  border-radius: var(--radius);
  padding: 36rpx 32rpx 28rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.cap-title {
  font-size: var(--font-lg);
  color: var(--text);
  text-align: center;
}
.cap-desc {
  font-size: var(--font-xs);
  color: var(--text-2);
  text-align: center;
}
.cap-imgrow {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.cap-svg {
  flex: 1;
  height: 88rpx;
  border-radius: var(--radius-sm);
  background: var(--bg-2);
  cursor: pointer;
}
.cap-refresh {
  flex: none;
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: var(--card-2);
  cursor: pointer;
}
.cap-input {
  height: 76rpx;
  border: 2rpx solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 20rpx;
  font-size: var(--font-md);
  color: var(--text);
  letter-spacing: 4rpx;
}
.cap-input.err {
  border-color: var(--danger);
}
.cap-err {
  font-size: var(--font-xs);
  color: var(--danger);
  margin-top: -8rpx;
}
.cap-btns {
  display: flex;
  gap: 16rpx;
}
.cap-btn {
  flex: 1;
  height: 76rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-md);
  cursor: pointer;
}
.cap-btn.ghost {
  background: var(--card-2);
  color: var(--text-2);
}
.cap-btn.primary {
  background: var(--primary);
  color: #fff;
}
</style>
