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
          Phase 3
        </div>
        <div class="tile-delta">谁是卧底开发中</div>
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
          <span style="font-size: 11px; color: var(--fg-muted); font-family: var(--font-mono);">Phase 3 · 进行中</span>
        </div>
        <div style="padding: 10px 14px; display: flex; flex-direction: column; gap: 4px;">
          <template v-for="phase in phases" :key="phase.id">
            <!-- Phase header row -->
            <div class="phase-head" :class="phase.state">
              <span class="phase-head-dot" :class="phase.state" />
              <span class="phase-head-title">{{ phase.title }}</span>
              <span class="phase-head-badge" :class="phase.state">{{ phase.badge }}</span>
            </div>
            <!-- Sub-items (only shown when phase has items) -->
            <div
              v-for="item in phase.items"
              :key="item.label"
              class="phase-item phase-sub"
            >
              <span class="phase-dot" :class="item.done ? 'done' : 'pending'" />
              <span :style="{ color: item.done ? 'var(--fg-primary)' : 'var(--fg-muted)' }">{{ item.label }}</span>
            </div>
            <!-- Spacer between phases -->
            <div style="height: 4px;" />
          </template>
        </div>
      </div>

      <!-- Quick links -->
      <div class="ds-card">
        <div class="ds-card-head">
          <span class="title">快捷操作</span>
        </div>
        <div style="padding: 14px; display: flex; flex-direction: column; gap: 8px;">
          <button class="quick-btn" @click="$router.push('/system-logs')">
            <DsIcon name="terminal" :size="15" />
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

interface PhaseItem { label: string; done: boolean }
interface Phase {
  id: string
  title: string
  badge: string
  state: 'done' | 'active' | 'pending'
  items: PhaseItem[]
}

const phases: Phase[] = [
  {
    id: 'p1',
    title: 'Phase 1 · 基础平台',
    badge: '已完成',
    state: 'done',
    items: [],   // 细节折叠，仅显示 phase 行
  },
  {
    id: 'p2',
    title: 'Phase 2 · 海龟汤',
    badge: '已完成',
    state: 'done',
    items: [
      { label: '题目管理 & AI 元数据提取', done: true },
      { label: 'LLM 判题（是 / 否 / 部分 / 无关）', done: true },
      { label: '还原尝试 & 计分系统', done: true },
      { label: '对局记录 & Web 管理后台', done: true },
    ],
  },
  {
    id: 'p3',
    title: 'Phase 3 · 谁是卧底',
    badge: '进行中',
    state: 'active',
    items: [
      { label: '词库管理 & Web 管理后台', done: true },
      { label: '游戏核心逻辑（分配 / 投票 / 发言轮）', done: true },
      { label: '对局记录', done: true },
      { label: '规则完善与边界测试', done: false },
    ],
  },
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
/* Phase group header */
.phase-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0 2px;
  border-top: 1px solid var(--line);
}
.phase-head:first-of-type { border-top: none; padding-top: 2px; }

.phase-head-dot {
  width: 9px; height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}
.phase-head-dot.done    { background: var(--success); }
.phase-head-dot.active  { background: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.phase-head-dot.pending { background: var(--fg-faint); }

.phase-head-title {
  font-size: 13px;
  font-weight: 600;
  flex: 1;
}
.phase-head.done   .phase-head-title { color: var(--fg-primary); }
.phase-head.active .phase-head-title { color: var(--accent); }
.phase-head.pending .phase-head-title { color: var(--fg-muted); }

.phase-head-badge {
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 4px;
  font-family: var(--font-mono);
  flex-shrink: 0;
}
.phase-head-badge.done    { background: var(--success-soft); color: var(--success); }
.phase-head-badge.active  { background: var(--accent-soft);  color: var(--accent); }
.phase-head-badge.pending { background: var(--bg-hover);     color: var(--fg-muted); }

/* Sub-items under a phase */
.phase-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--fg-secondary);
}
.phase-sub { padding-left: 17px; }

.phase-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--success);
}
.phase-dot.done    { background: var(--success); }
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
