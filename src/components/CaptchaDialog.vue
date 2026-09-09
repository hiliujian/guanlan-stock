<template>
  <!-- 人机验证弹窗（本地图形验证码，防登录爆破 / 验证码接口滥用）。
       用法：const captcha = ref(); await captcha.verify() → 通过 true / 取消 false。
       壳样式与遮罩直接复用 global.css 的 .modal-* 弹窗家族（与「设置持仓」完全同款）；
       teleport 到 body —— 避免被任何 transform/backdrop-filter 祖先改变定位基准。
       纯前端校验：验证码仅在本机生成与比对，用于抬高自动化脚本的批量攻击成本；
       真正的限流兜底仍由后端（Supabase Auth 自带限流）承担。 -->
  <teleport to="body">
    <view v-if="visible" class="modal-mask" @click.self="cancel">
      <view class="modal-card">
        <view class="modal-head">
          <text class="modal-title">人机验证</text>
          <view class="modal-close" @click="cancel" role="button" aria-label="关闭">
            <OutlineIcon type="close" :size="26" color="var(--text-3)" />
          </view>
        </view>
        <text class="cap-desc">请输入下图中的字符，完成验证后继续</text>

        <!-- 图形验证码 + 换一张：一体容器（刷新按钮浮层内嵌图片右上角），点击图片/按钮均可刷新 -->
        <view class="cap-box" role="button" aria-label="验证码图片，点击换一张" @click="regen">
          <svg
            viewBox="0 0 132 44"
            class="cap-svg"
            fill="none"
            v-html="captchaSvg"
          />
          <view class="cap-refresh flex-center" role="button" aria-label="换一张" @click.stop="regen">
            <OutlineIcon type="refresh" :size="28" color="var(--text-2)" />
          </view>
        </view>

        <!-- 验证码标签 + 输入框：一体容器（标签内嵌输入框左侧，同「发送验证码内嵌输入框」风格） -->
        <view class="cap-field" :class="{ err: inputErr }">
          <text class="cap-k">验证码</text>
          <input
            v-model="input"
            class="cap-in"
            type="text"
            maxlength="4"
            placeholder="不区分大小写"
            :focus="visible"
            @confirm="confirm"
          />
        </view>
        <text v-if="inputErr" class="cap-err">{{ inputErr }}</text>

        <view class="modal-actions">
          <view class="modal-btn ghost" @click="cancel" role="button">取消</view>
          <view class="modal-btn ok" @click="confirm" role="button">验证</view>
        </view>
      </view>
    </view>
  </teleport>
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
/* 壳/标题/按钮复用 global.css .modal-*（与设置持仓同款），此处仅留验证码专属样式 */
.cap-desc {
  font-size: var(--font-xs);
  color: var(--text-2);
  text-align: center;
}
/* 验证码图片 + 换一张：一体容器，刷新按钮浮层内嵌右侧 */
.cap-box {
  position: relative;
  height: 88rpx;
  border-radius: 12rpx;
  background: var(--card-2);
  overflow: hidden;
  cursor: pointer;
}
.cap-svg {
  display: block;
  width: 100%;
  height: 100%;
}
.cap-refresh {
  position: absolute;
  right: 10rpx;
  top: 50%;
  transform: translateY(-50%);
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: var(--card);
  box-shadow: var(--shadow);
}
/* 验证码标签 + 输入框：一体容器（标签左侧内嵌 + 分隔线），外观对齐 .modal-in */
.cap-field {
  display: flex;
  align-items: center;
  gap: 12rpx;
  height: 72rpx;
  padding: 0 20rpx 0 16rpx;
  background: var(--card-2);
  border-radius: 12rpx;
}
.cap-field:focus-within {
  background: var(--card);
  box-shadow: 0 0 0 2rpx var(--primary-soft);
}
.cap-field.err {
  box-shadow: 0 0 0 2rpx var(--danger);
}
.cap-k {
  flex: none;
  font-size: var(--font-sm);
  color: var(--text-2);
  padding-right: 12rpx;
  border-right: 1rpx solid var(--border);
}
.cap-in {
  flex: 1;
  min-width: 0;
  height: 100%;
  font-size: var(--font-sm);
  color: var(--text);
  letter-spacing: 4rpx;
}
.cap-err {
  font-size: var(--font-xs);
  color: var(--danger);
  margin-top: -8rpx;
}
</style>
