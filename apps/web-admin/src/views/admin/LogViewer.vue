<template>
  <div class="page" style="height: 100%; padding-bottom: 0;">
    <!-- Header -->
    <div class="page-head" style="flex-shrink: 0;">
      <div>
        <h1 class="page-title"><span class="accent-line" />{{ t('systemLogs.title') }}</h1>
        <p class="page-sub">{{ t('systemLogs.sub') }}</p>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="log-toolbar" style="flex-shrink: 0;">
      <n-select
        v-model:value="filterLevel"
        :options="levelOptions"
        clearable
        :placeholder="t('systemLogs.filter.level')"
        size="small"
        style="width: 130px;"
      />
      <n-select
        v-model:value="filterModule"
        :options="moduleOptions"
        clearable
        filterable
        :placeholder="t('systemLogs.filter.module')"
        size="small"
        style="width: 150px;"
      />
      <n-input
        v-model:value="filterKeyword"
        clearable
        :placeholder="t('systemLogs.filter.keyword')"
        size="small"
        style="width: 200px;"
      />
      <div style="flex: 1;" />
      <div class="status-dot" :class="wsConnected ? 'connected' : 'disconnected'" style="cursor: default;">
        <span class="dot" :class="{ 'dot-pulse': wsConnected }" />
        <span>{{ wsConnected ? t('systemLogs.ws.live') : t('systemLogs.ws.disconnected') }}</span>
      </div>
      <n-switch v-model:value="autoScroll" size="small">
        <template #checked>{{ t('systemLogs.autoScroll') }}</template>
        <template #unchecked>{{ t('systemLogs.paused') }}</template>
      </n-switch>
      <button class="btn" @click="clearLogs">{{ t('systemLogs.clear') }}</button>
      <button class="btn" @click="exportLogs">
        <DsIcon name="download" :size="13" /> {{ t('systemLogs.exportJson') }}
      </button>
    </div>

    <!-- 日志列表 -->
    <div ref="logContainer" class="log-container" @scroll="handleScroll">
      <div
        v-for="(entry, idx) in filteredLogs"
        :key="idx"
        :class="['log-entry', `level-${entry.level ?? 30}`]"
      >
        <span class="log-time">{{ formatTime(entry.time) }}</span>
        <span class="log-level">{{ levelLabel(entry.level) }}</span>
        <span class="log-module">{{ entry.module ?? '-' }}</span>
        <span class="log-msg">{{ entry.msg ?? JSON.stringify(entry) }}</span>
      </div>
      <div v-if="filteredLogs.length === 0" class="log-empty">
        <DsIcon name="terminal" :size="20" style="opacity: 0.3;" />
        <span>{{ t('systemLogs.empty') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { NSelect, NInput, NSwitch } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import DsIcon from '@/components/DsIcon.vue'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()

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
.log-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md) var(--r-md) 0 0;
  flex-wrap: wrap;
}

.log-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: var(--log-bg);
  border: 1px solid var(--line);
  border-top: none;
  border-radius: 0 0 var(--r-md) var(--r-md);
  padding: 6px 0;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
  /* stretch to fill remaining height in page */
  height: calc(100vh - 260px);
}

.log-entry {
  display: flex;
  gap: 10px;
  padding: 1px 12px;
  border-bottom: 1px solid var(--log-border);
  transition: background 80ms;
}
.log-entry:hover { background: var(--log-hover); }

.log-time   { color: var(--fg-faint); min-width: 88px; flex-shrink: 0; }
.log-level  { min-width: 48px; flex-shrink: 0; font-weight: 600; }
.log-module { color: var(--role-pl); min-width: 120px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log-msg    { color: var(--fg-secondary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.level-30 .log-level { color: var(--success); }
.level-40 .log-level { color: var(--warning); }
.level-50 .log-level { color: var(--danger); }
.level-60 .log-level { color: #ff4444; }
.level-20 .log-level { color: var(--fg-muted); }
.level-10 .log-level { color: var(--fg-faint); }

.level-50 .log-msg,
.level-60 .log-msg { color: var(--log-msg-error); }
.level-40 .log-msg  { color: var(--log-msg-warn); }

.log-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 120px;
  color: var(--fg-muted);
  font-family: var(--font-mono);
  font-size: 12px;
}
</style>
