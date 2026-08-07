<template>
  <!-- 共用头像：URL 优先，否则显示「字」头像（按 username 稳定渐变 + 首字）
       统一数据来源：avatar_url 来自 user store，缺失则回退到字头像。
       这样所有展示头像的场景（个人资料、社区、个人中心等）都从同一处读，
       上传后自动同步，无需在多处重复读 user.profile.avatar_url。 -->
  <image
    v-if="url"
    :src="url"
    class="ua-img"
    :style="{ width: sizeCss, height: sizeCss, borderRadius: radiusCss }"
    mode="aspectFill"
  />
  <view
    v-else
    class="ua-char"
    :style="{
      width: sizeCss,
      height: sizeCss,
      borderRadius: radiusCss,
      background: bg,
      fontSize: fontCss,
    }"
  >{{ ch }}</view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { avatarGradient, avatarChar } from "@/utils/avatar";

const props = withDefaults(
  defineProps<{
    /** 上传后的头像 URL；为空时回退到「字」头像 */
    url?: string;
    /** 头像种子（用户名/昵称等），仅在无 url 时用于计算底色与首字 */
    seed?: string;
    /** 头像尺寸（rpx），默认 88 */
    size?: number;
    /** 圆角（rpx 字符串），默认 50%（圆），可改为小圆角头像卡片 */
    radius?: number;
  }>(),
  {
    url: "",
    seed: "",
    size: 88,
    radius: -1, // -1 表示完全圆形
  }
);

const sizeCss = computed(() => `${props.size}rpx`);
const radiusCss = computed(() => (props.radius < 0 ? "50%" : `${props.radius}rpx`));
// 首字号 ≈ size * 0.46（视觉上「字」头像与真头像视觉重心一致）
const fontCss = computed(() => `${Math.round(props.size * 0.46)}rpx`);
const bg = computed(() => avatarGradient(props.seed || "?"));
const ch = computed(() => avatarChar(props.seed || "?"));
</script>

<style scoped>
.ua-img,
.ua-char {
  display: block;
  flex: none;
  overflow: hidden;
}
.ua-char {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0;
  /* 主色兼容：渐变底已带辨识度，无需文本阴影 */
}
</style>