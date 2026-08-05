<template>
  <view style="overflow: visible">
    <!-- 单一字段容器：图标 + 输入框 + 右附（发送验证码，内嵌）+ 密码眼睛切换，全部融为一体 -->
    <view
      class="auth-field"
      :class="{ 'auth-field-err': !!error }"
      style="overflow: visible"
    >
      <OutlineIcon v-if="icon" :type="icon" :size="20" color="var(--text-2)" />
      <input
        class="auth-input"
        :value="modelValue"
        type="text"
        :password="masked"
        :placeholder="placeholder"
        :disabled="disabled"
        :maxlength="maxlength"
        :adjust-position="true"
        placeholder-class="ph"
        @input="onInput"
        @blur="onBlur"
      />
      <!-- 右附（发送验证码等）：内嵌在字段右侧，与输入框融为一体 -->
      <slot name="suffix" />
      <!-- 内置密码可见性切换（showToggle 时启用） -->
      <view
        v-if="showToggle"
        class="auth-pwd-toggle"
        role="button"
        :aria-label="revealed ? '隐藏密码' : '显示密码'"
        @click="revealed = !revealed"
      >
        <OutlineIcon :type="revealed ? 'eye-off' : 'eye'" :size="22" color="var(--text-2)" />
      </view>
    </view>

    <view v-if="error" class="auth-field-tip err">{{ error }}</view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import OutlineIcon from "./OutlineIcon.vue";

const props = defineProps<{
  modelValue: string;
  icon?: string;
  placeholder?: string;
  password?: boolean;
  showToggle?: boolean;
  maxlength?: number;
  disabled?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: string): void;
  (e: "input"): void;
  (e: "blur"): void;
}>();

const revealed = ref(false);
const masked = computed(() =>
  props.showToggle ? !revealed.value : !!props.password
);

function onInput(e: any) {
  const v = (e?.detail?.value ?? "") as string;
  emit("update:modelValue", v);
  emit("input");
}

function onBlur() {
  emit("blur");
}
</script>
