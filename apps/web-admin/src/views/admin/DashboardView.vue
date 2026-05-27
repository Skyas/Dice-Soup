<template>
  <div class="page">
    <!-- Page header -->
    <div class="page-head">
      <div>
        <h1 class="page-title">
          <span class="accent-line" />
          Dashboard
        </h1>
        <p class="page-sub">{{ subline }}</p>
      </div>
    </div>

    <!-- KPI tiles -->
    <div class="grid c-stat">
      <div class="stat-tile">
        <div class="tile-label">
          <span class="tile-ico"><DsIcon name="bot" :size="13" /></span>
          Bot 状态
        </div>
        <div class="tile-value" :style="{ color: health.onebot?.connected ? 'var(--success)' : 'var(--danger)' }">
          {{ health.onebot?.connected ? '在线' : '离线' }}
        </div>
        <div class="tile-delta">
          {{ health.onebot?.connected ? 'NapCat 已连接' : '请检查 NapCat 进程' }}
        </div>
      </div>

      <div class="stat-tile">
        <div class="tile-label">
          <span class="tile-ico"><DsIcon name="shield" :size="13" /></span>
          服务状态
        </div>
        <div class="tile-value" :style="{ color: health.status === 'ok' ? 'var(--success)' : 'var(--warning)' }">
          {{ health.status === 'ok' ? '正常' : health.status === 'unknown' ? '--' : '异常' }}
        </div>
        <div class="tile-delta">{{ health.status === 'ok' ? 'Fastify 运行中' : '服务状态未知' }}</div>
      </div>

      <div class="stat-tile">
        <div class="tile-label">
          <span class="tile-ico"><DsIcon name="clock" :size="13" /></span>
          运行时长
        </div>
        <div class="tile-value" style="font-size: 28px;">{{ uptimeText }}</div>
        <div class="tile-delta">自上次重启</div>
      </div>

      <div class="stat-tile">
        <div class="tile-label">
          <span class="tile-ico"><DsIcon name="lightning" :size="13" /></span>
          LLM 状态
        </div>
        <div class="tile-value" style="font-size: 28px; color: var(--accent);">
          Phase 2
        </div>
        <div class="tile-delta">海龟汤开发中</div>
      </div>

      <div class="stat-tile">
        <div class="tile-label">
          <span class="tile-ico"><DsIcon name="soup" :size="13" /></span>
          题库
        </div>
        <div class="tile-value">{{ puzzleCount }}</div>
        <div class="tile-delta">已录入海龟汤</div>
      </div>
    </div>

    <!-- System overview -->
    <div class="grid c-2" style="align-items: start;">
      <!-- Phase progress -->
      <div class="ds-card ornate">
        <div class="ds-card-head">
          <span class="title">开发进度</span>
          <span class="spacer" />
          <span style="font-size: 11px; color: var(--fg-muted); font-family: var(--font-mono);">Phase 1 · 完成</span>
        </div>
        <div style="padding: 14px; display: flex; flex-direction: column; gap: 8px;">
          <div v-for="item in phaseItems" :key="item.label" class="phase-item">
            <span class="phase-dot" :class="item.done ? 'done' : 'pending'" />
            <span :style="{ color: item.done ? 'var(--fg-primary)' : 'var(--fg-muted)' }">{{ item.label }}</span>
          </div>
          <div style="margin-top: 8px; padding-top: 10px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px;">
            <div class="phase-item">
              <span class="phase-dot pending" style="background: var(--accent); opacity: 0.5;" />
              <span style="color: var(--accent);">Phase 2 · 海龟汤 — 进行中</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick links -->
      <div class="ds-card">
        <div class="ds-card-head">
          <span class="title">快捷操作</span>
        </div>
        <div style="padding: 14px; display: flex; flex-direction: column; gap: 8px;">
          <button class="quick-btn" @click="$router.push('/logs')">
            <DsIcon name="log" :size="15" />
            <span>查看实时日志</span>
            <DsIcon name="chevron" :size="13" style="margin-left: auto; color: var(--fg-faint);" />
          </button>
          <button class="quick-btn" @click="$router.push('/puzzles')">
            <DsIcon name="soup" :size="15" />
            <span>管理海龟汤题库</span>
            <DsIcon name="chevron" :size="13" style="margin-left: auto; color: var(--fg-faint);" />
          </button>
          <button class="quick-btn" @click="$router.push('/config')">
            <DsIcon name="settings" :size="15" />
            <span>配置中心</span>
            <DsIcon name="chevron" :size="13" style="margin-left: auto; color: var(--fg-faint);" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { apiGet } from '@/api/client'
import DsIcon from '@/components/DsIcon.vue'

interface HealthData {
  status: string
  uptime: number
  onebot?: { connected: boolean }
}

const health = ref<HealthData>({ status: 'unknown', uptime: 0 })
const puzzleCount = ref<number | string>('--')
let timer: ReturnType<typeof setInterval>

const uptimeText = computed(() => {
  const s = Math.floor(health.value.uptime)
  if (s < 60) return `${s}s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
})

const subline = computed(() => {
  const parts: string[] = []
  if (health.value.onebot?.connected) parts.push('Bot 在线')
  else parts.push('Bot 离线')
  return parts.join(' · ')
})

const phaseItems = [
  { label: 'Monorepo 脚手架', done: true },
  { label: '数据库 Schema', done: true },
  { label: 'OneBot v11 适配器', done: true },
  { label: '指令系统骨架', done: true },
  { label: '配置中心（DB 热更新）', done: true },
  { label: '审计日志服务', done: true },
  { label: '越狱检测器', done: true },
  { label: 'LLM Router', done: true },
  { label: 'Web 管理后台', done: true },
]

async function fetchHealth() {
  try {
    health.value = await apiGet<HealthData>('/health', { noAuth: true })
  } catch {
    health.value = { status: 'error', uptime: 0 }
  }
}

async function fetchPuzzleCount() {
  try {
    const data = await apiGet<{ total: number }>('/api/admin/puzzles?pageSize=1')
    puzzleCount.value = data.total ?? '--'
  } catch {
    puzzleCount.value = '--'
  }
}

onMounted(() => {
  fetchHealth()
  fetchPuzzleCount()
  timer = setInterval(fetchHealth, 5000)
})
onUnmounted(() => clearInterval(timer))
</script>

<style scoped>
.phase-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg-secondary);
}
.phase-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--success);
}
.phase-dot.done { background: var(--success); }
.phase-dot.pending { background: var(--fg-faint); }

.quick-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  font-size: 13px;
  color: var(--fg-secondary);
  background: none;
  border: 1px solid var(--line);
  cursor: pointer;
  transition: background 120ms, color 120ms, border-color 120ms;
  text-align: left;
}
.quick-btn:hover {
  background: var(--bg-hover);
  color: var(--fg-primary);
  border-color: var(--line-strong);
}
</style>
