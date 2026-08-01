<template>
  <view class="agree">
    <text class="agree-text">
      <text>{{ action }}即表示同意</text>
      <text class="lk" @click.stop="open('user')">《用户协议》</text>
      <text>与</text>
      <text class="lk" @click.stop="open('privacy')">《隐私政策》</text>
    </text>
  </view>
</template>

<script setup lang="ts">
// 主流做法：使用即视为已同意，不再要求手动勾选。
// 文案统一为「使用即表示同意」，三页一致；action 仅作兜底，默认即为「使用」。
const props = defineProps<{
  action?: string;
}>();

function open(_kind: "user" | "privacy") {
  // 条款页尚未上线：临时以 toast 占位，待补充 H5 静态条款页后可替换为跳转
  uni.showToast({ title: "条款页即将上线", icon: "none" });
}

// 默认兜底为「使用」，避免漏传时文案缺失；三页现已统一传「使用」
const action = props.action ?? "使用";
</script>
