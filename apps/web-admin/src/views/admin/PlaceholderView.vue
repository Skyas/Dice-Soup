<template>
  <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60vh; gap: 16px;">
    <n-h2 style="margin: 0;">{{ title }}</n-h2>
    <n-result
      status="info"
      :title="`将于第 ${phase} 大阶段开放`"
      :description="`${title} 功能尚未实现，敬请期待。`"
    />
  </div>
</template>

<script setup lang="ts">
import { NH2, NResult } from 'naive-ui'

defineProps<{ title: string; phase: number }>()
</script>
