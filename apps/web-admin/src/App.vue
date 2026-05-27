<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <router-view />
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { NConfigProvider, NMessageProvider, zhCN, dateZhCN } from 'naive-ui'
import { useTheme } from '@/composables/useTheme'

const { naiveTheme, themeOverrides } = useTheme()
</script>
