<template>
  <!-- 共用头像：URL 优先，否则显示「字」头像（按 username 稳定渐变 + 首字）
       统一数据来源：avatar_url 来自 user store，缺失则回退到字头像。
       这样所有展示头像的场景（个人资料、社区、个人中心等）都从同一处读，
       上传后自动同步，无需在多处重复读 user.profile.avatar_url。

       frame：头像框 id（'' = 无边框）。非空时在头像外侧叠加一圈渐变描边光环
       （.ua-frame，仅留边框、不挡头像），炫彩 / 极光带旋转动画，会员 / 钻石为静态金 / 钻光。
       光环向外延展 8rpx，因此父容器请勿设置 overflow:hidden 以免裁掉边框。 -->
  <view class="ua-root" :class="frameCls" :style="{ width: sizeCss, height: sizeCss }">
    <image
      v-if="url && !failed"
      :src="url"
      class="ua-img"
      :style="{ borderRadius: radiusCss }"
      mode="aspectFill"
      @error="onImgError"
    />
    <view
      v-else
      class="ua-char"
      :style="{ borderRadius: radiusCss, background: bg, fontSize: fontCss }"
    >{{ ch }}</view>
    <view v-if="frameCls" class="ua-frame" aria-hidden="true" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { avatarGradient, avatarChar } from "@/utils/avatar";
import { frameClass } from "@/utils/avatarFrame";

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
    /** 头像框 id（'' / 空 = 无边框）；可选值见 src/utils/avatarFrame.ts */
    frame?: string;
  }>(),
  {
    url: "",
    seed: "",
    size: 88,
    radius: -1, // -1 表示完全圆形
    frame: "",
  }
);

const sizeCss = computed(() => `${props.size}rpx`);
const radiusCss = computed(() => (props.radius < 0 ? "50%" : `${props.radius}rpx`));
// 首字号 ≈ size * 0.46（视觉上「字」头像与真头像视觉重心一致）
const fontCss = computed(() => `${Math.round(props.size * 0.46)}rpx`);
const bg = computed(() => avatarGradient(props.seed || "?"));
const ch = computed(() => avatarChar(props.seed || "?"));
const frameCls = computed(() => frameClass(props.frame));

// 头像加载失败兜底：断图 / 404 / 跨域失败时回退到「字」头像，避免空白。
// url 变化（如切换用户）时重置，避免沿用上一张图的失败态。
const failed = ref(false);
function onImgError() {
  failed.value = true;
}
watch(
  () => props.url,
  () => {
    failed.value = false;
  }
);
</script>

<style scoped>
.ua-root {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.ua-img,
.ua-char {
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  flex: none;
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

/* 头像框光环：绝对定位、向外延展 8rpx，用 mask 只保留一圈渐变描边（不挡头像）。
   padding = 环厚（6rpx），mask 的 content-box 挖空内部，仅留边框环。 */
.ua-frame {
  position: absolute;
  left: -8rpx;
  top: -8rpx;
  right: -8rpx;
  bottom: -8rpx;
  border-radius: 50%;
  padding: 6rpx;
  pointer-events: none;
  background: transparent;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}

/* 炫彩：流动彩虹环 */
.af-rainbow .ua-frame {
  background: conic-gradient(
    from 0deg,
    #ff5f6d, #ffc371, #47e0a0, #4facfe, #b06ab3, #ff5f6d
  );
  animation: af-spin 4s linear infinite;
}
/* 会员：静态金框 */
.af-member .ua-frame {
  background: linear-gradient(135deg, #f9d423, #ff8008);
}
/* 极光：青紫绿流动环 */
.af-aurora .ua-frame {
  background: conic-gradient(
    from 0deg,
    #00c6ff, #7b2ff7, #00ffa3, #00c6ff
  );
  animation: af-spin 6s linear infinite;
}
/* 钻石：冷调钻光（静态） */
.af-diamond .ua-frame {
  background: linear-gradient(135deg, #a8edea, #fed6e3 45%, #ffffff 55%, #c2e9fb);
}

@keyframes af-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
