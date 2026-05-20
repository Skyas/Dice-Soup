<template>
  <div style="display: flex; flex-direction: column; height: calc(100vh - 108px);">
    <n-h2>Log Viewer</n-h2>

    <!-- 工具栏 -->
    <n-space style="margin-bottom: 12px; flex-shrink: 0;" wrap>
      <!-- 级别过滤 -->
      <n-select
        v-model:value="filterLevel"
        :options="levelOptions"
        clearable
        placeholder="日志级别"
        style="width: 140px;"
      />
      <!-- 模块过滤 -->
      <n-select
        v-model:value="filterModule"
        :options="moduleOptions"
        clearable
        filterable
        placeholder="模块"
        style="width: 160px;"
      />
      <!-- 关键字搜索 -->
      <n-input
        v-model:value="filterKeyword"
        clearable
        placeholder="关键字搜索"
        style="width: 200px;"
      />
      <n-divider vertical />
      <!-- 自动滚动 -->
      <n-switch v-model:value="autoScroll">
        <template #checked>自动滚动</template>
        <template #unchecked>已暂停</template>
      </n-switch>
      <!-- 清空 -->
      <n-button size="small" @click="clearLogs">清空</n-button>
      <!-- 导出 -->
      <n-button size="small" @click="exportLogs">导出 JSON</n-button>
      <!-- 连接状态 -->
      <n-tag :type="wsConnected ? 'success' : 'error'" size="small">
        {{ wsConnected ? '● 实时' : '○ 断线' }}
      </n-tag>
    </n-space>

    <!-- 日志列表 -->
    <div
      ref="logContainer"
      class="log-container"
      @scroll="handleScroll"
    >
      <div
        v-for="(entry, idx) in filteredLogs"
        :key="idx"
        :class="['log-entry', `level-${entry.level ?? 'info'}`]"
      >
        <span class="log-time">{{ formatTime(entry.time) }}</span>
        <span class="log-level">{{ levelLabel(entry.level) }}</span>
        <span class="log-module">{{ entry.module ?? '-' }}</span>
        <span class="log-msg">{{ entry.msg ?? JSON.stringify(entry) }}</span>
      </div>
      <div v-if="filteredLogs.length === 0" style="color: #666; padding: 20px;">
        暂无日志
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  NH2, NSpace, NSelect, NInput, NSwitch, NButton, NTag, NDivider,
} from 'naive-ui'
import { useAuthStore } from '@/stores/auth'

interface LogEntry {
  time?: number
  level?: number
  module?: string
  msg?: string
  [key: string]: unknown
}

const auth = useAuthStore()
const logs = ref<LogEntry[]>([])
const logContainer = ref<HTMLDivElement>()
const autoScroll = ref(true)
const wsConnected = ref(false)
let ws: WebSocket | null = null

// 过滤
const filterLevel = ref<number | null>(null)
const filterModule = ref<string | null>(null)
const filterKeyword = ref('')

const LEVEL_MAP: Record<number, string> = { 10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal' }
const levelOptions = [
  { label: 'TRACE', value: 10 },
  { label: 'DEBUG', value: 20 },
  { label: 'INFO',  value: 30 },
  { label: 'WARN',  value: 40 },
  { label: 'ERROR', value: 50 },
  { label: 'FATAL', value: 60 },
]

const seenModules = ref(new Set<string>())
const moduleOptions = computed(() =>
  Array.from(seenModules.value).map((m) => ({ label: m, value: m })),
)

const filteredLogs = computed(() => {
  return logs.value.filter((e) => {
    if (filterLevel.value != null && (e.level ?? 30) < filterLevel.value) return false
    if (filterModule.value && e.module !== filterModule.value) return false
    if (filterKeyword.value) {
      const kw = filterKeyword.value.toLowerCase()
      const text = JSON.stringify(e).toLowerCase()
      if (!text.includes(kw)) return false
    }
    return true
  })
})

function formatTime(ms?: number): string {
  if (!ms) return '-'
  const d = new Date(ms);
  return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function levelLabel(level?: number): string {
  if (!level) return 'INFO'
  return (LEVEL_MAP[level] ?? String(level)).toUpperCase().padEnd(5)
}

function addLog(entry: LogEntry) {
  if (entry.module) seenModules.value.add(entry.module)
  logs.value.push(entry)
  // 最多保留 2000 条，防止内存膨胀
  if (logs.value.length > 2000) logs.value.splice(0, logs.value.length - 2000)
  if (autoScroll.value) {
    nextTick(() => {
      logContainer.value?.scrollTo({ top: logContainer.value.scrollHeight })
    })
  }
}

function handleScroll() {
  const el = logContainer.value
  if (!el) return
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
  if (!atBottom && autoScroll.value) autoScroll.value = false
}

watch(autoScroll, (val) => {
  if (val) {
    nextTick(() => {
      logContainer.value?.scrollTo({ top: logContainer.value!.scrollHeight })
    })
  }
})

function connectWs() {
  const token = auth.token ?? ''
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${proto}://${location.host}/api/admin/logs/stream?token=${token}`)

  ws.onopen = () => {
    wsConnected.value = true
  }
  ws.onmessage = (event) => {
    try {
      const entry = JSON.parse(event.data) as LogEntry
      addLog(entry)
    } catch {
      // 忽略解析失败
    }
  }
  ws.onclose = () => {
    wsConnected.value = false
    // 3 秒后重连
    setTimeout(connectWs, 3000)
  }
  ws.onerror = () => {
    ws?.close()
  }
}

function clearLogs() {
  logs.value = []
}

function exportLogs() {
  const data = JSON.stringify(filteredLogs.value, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `dice-soup-logs-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(() => {
  connectWs()
})
onUnmounted(() => {
  ws?.close()
})
</script>

<style scoped>
.log-container {
  flex: 1;
  overflow-y: auto;
  background: #0d1117;
  border-radius: 6px;
  padding: 8px;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 12px;
  line-height: 1.6;
}
.log-entry {
  display: flex;
  gap: 8px;
  padding: 1px 0;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.log-time   { color: #666;    min-width: 90px; flex-shrink: 0; }
.log-level  { min-width: 50px; flex-shrink: 0; font-weight: bold; }
.log-module { color: #7c8cf8; min-width: 120px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log-msg    { color: #e6edf3; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.level-30 .log-level { color: #3fb950; }  /* info */
.level-40 .log-level { color: #d29922; }  /* warn */
.level-50 .log-level { color: #f85149; }  /* error */
.level-60 .log-level { color: #ff0000; }  /* fatal */
.level-20 .log-level { color: #8b949e; }  /* debug */
.level-10 .log-level { color: #484f58; }  /* trace */
</style>
