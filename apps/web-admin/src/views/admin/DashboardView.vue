<template>
  <div>
    <n-h2>仪表盘</n-h2>
    <n-grid :cols="3" :x-gap="16" :y-gap="16">
      <n-grid-item>
        <n-card>
          <n-statistic label="Bot 连接状态">
            <template #prefix>
              <span :style="{ color: health.onebot?.connected ? '#18a058' : '#d03050' }">
                {{ health.onebot?.connected ? '✅ 已连接' : '❌ 未连接' }}
              </span>
            </template>
          </n-statistic>
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card>
          <n-statistic label="服务状态" :value="health.status === 'ok' ? '运行中' : '异常'" />
        </n-card>
      </n-grid-item>
      <n-grid-item>
        <n-card>
          <n-statistic label="运行时长" :value="uptimeText" />
        </n-card>
      </n-grid-item>
    </n-grid>

    <n-card style="margin-top: 16px;" title="第一大阶段进度">
      <n-space vertical>
        <n-text>✅ Monorepo 脚手架</n-text>
        <n-text>✅ 数据库 Schema（Phase 1 所有表）</n-text>
        <n-text>✅ OneBot v11 Adapter（反向 WS）</n-text>
        <n-text>✅ 指令系统骨架（含占位指令）</n-text>
        <n-text>✅ 配置中心（DB 热更新）</n-text>
        <n-text>✅ 审计日志服务</n-text>
        <n-text>✅ 越狱检测器（关键词三级）</n-text>
        <n-text>✅ Web 管理后台（Log Viewer + 配置中心）</n-text>
        <n-text depth="3">⏳ 第二大阶段：海龟汤</n-text>
      </n-space>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { NH2, NGrid, NGridItem, NCard, NStatistic, NSpace, NText } from 'naive-ui'
import { apiGet } from '@/api/client'

interface HealthData {
  status: string
  uptime: number
  onebot?: { connected: boolean }
}

const health = ref<HealthData>({ status: 'unknown', uptime: 0 })
let timer: ReturnType<typeof setInterval>

const uptimeText = computed(() => {
  const s = Math.floor(health.value.uptime)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}h ${m}m ${sec}s`
})

async function fetchHealth() {
  try {
    health.value = await apiGet<HealthData>('/health', { noAuth: true })
  } catch {
    health.value = { status: 'error', uptime: 0 }
  }
}

onMounted(() => {
  fetchHealth()
  timer = setInterval(fetchHealth, 5000)
})
onUnmounted(() => clearInterval(timer))
</script>
