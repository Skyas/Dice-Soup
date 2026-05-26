<template>
  <div class="page">
    <!-- Header -->
    <div class="page-head">
      <div>
        <h1 class="page-title"><span class="accent-line" />{{ t('gameLogs.title') }}</h1>
        <p class="page-sub">{{ t('gameLogs.sub', { n: total }) }}</p>
      </div>
      <div class="page-head-actions">
        <n-select
          v-model:value="filterState"
          :options="stateOptions"
          :placeholder="t('gameLogs.filterState')"
          clearable
          size="small"
          style="width: 110px;"
          @update:value="loadLogs"
        />
        <button class="btn" @click="loadLogs">
          <DsIcon name="refresh" :size="13" /> {{ t('common.refresh') }}
        </button>
      </div>
    </div>

    <!-- KPI tiles -->
    <div class="grid c-stat">
      <div class="stat-tile">
        <div class="tile-label"><span class="tile-ico"><DsIcon name="scroll" :size="13" /></span>{{ t('gameLogs.tiles.total') }}</div>
        <div class="tile-value">{{ stats.totalSessions ?? '--' }}</div>
        <div class="tile-delta">{{ t('gameLogs.tiles.totalSub') }}</div>
      </div>
      <div class="stat-tile">
        <div class="tile-label"><span class="tile-ico"><DsIcon name="plus" :size="13" /></span>{{ t('gameLogs.tiles.monthNew') }}</div>
        <div class="tile-value">{{ stats.thisMonth ?? '--' }}</div>
        <div class="tile-delta">{{ t('gameLogs.tiles.monthSub') }}</div>
      </div>
      <div class="stat-tile">
        <div class="tile-label"><span class="tile-ico"><DsIcon name="clock" :size="13" /></span>{{ t('gameLogs.tiles.avgLength') }}</div>
        <div class="tile-value">{{ stats.avgDurationMinutes != null ? stats.avgDurationMinutes : '--' }}</div>
        <div class="tile-delta">{{ t('gameLogs.tiles.avgLengthUnit') }}</div>
      </div>
    </div>

    <!-- 主体：列表 + 详情 -->
    <div class="logs-layout" :class="{ 'has-detail': !!selectedLog }">
      <!-- Log 列表 -->
      <div class="ds-card flush logs-list">
        <div v-if="loading" style="padding:40px; text-align:center; color:var(--fg-muted);">
          {{ t('common.loading') }}
        </div>
        <div v-else-if="items.length === 0" style="padding:48px; text-align:center; color:var(--fg-muted);">
          <DsIcon name="scroll" :size="28" style="opacity:0.3; display:block; margin:0 auto 12px;" />
          <div style="font-size:14px;">{{ t('gameLogs.empty') }}</div>
        </div>
        <template v-else>
          <div
            v-for="item in items"
            :key="item.id"
            class="log-row"
            :class="{ active: selectedLog?.id === item.id }"
            @click="openDetail(item)"
          >
            <div class="log-row-main">
              <DsIcon name="scroll" :size="15" style="color:var(--accent); opacity:0.7; flex-shrink:0;" />
              <div class="log-info">
                <div class="log-title">{{ item.puzzleTitle }}</div>
                <div class="log-meta">
                  <span class="mono">{{ formatDate(item.createdAt) }}</span>
                  <span class="sep">·</span>
                  <span>{{ item.playerCount }} 人</span>
                  <span class="sep">·</span>
                  <span>{{ item.questionCount }} 问</span>
                  <span v-if="item.durationSeconds" class="sep">·</span>
                  <span v-if="item.durationSeconds">{{ formatDuration(item.durationSeconds) }}</span>
                </div>
              </div>
              <n-tag :type="resultTagType(item.endReason, item.state)" size="small" style="flex-shrink:0;">
                {{ formatResult(item.endReason, item.state) }}
              </n-tag>
            </div>
            <div v-if="item.playerNames.length" class="log-players">
              <span v-for="name in item.playerNames" :key="name" class="player-chip">{{ name }}</span>
            </div>
          </div>
        </template>

        <!-- 分页 -->
        <div v-if="total > pageSize" style="padding:12px; display:flex; justify-content:center; border-top:1px solid var(--line);">
          <n-pagination
            v-model:page="page"
            :page-count="Math.ceil(total / pageSize)"
            size="small"
            @update:page="handlePageChange"
          />
        </div>
      </div>

      <!-- 详情面板 -->
      <div v-if="selectedLog" class="ds-card flush logs-detail">
        <div class="card-head detail-head">
          <DsIcon name="scroll" :size="14" style="color:var(--accent);" />
          <span class="title" style="flex:1; font-weight:500;">{{ selectedLog.puzzleTitle }}</span>
          <n-tag :type="resultTagType(selectedLog.endReason, selectedLog.state)" size="small">
            {{ formatResult(selectedLog.endReason, selectedLog.state) }}
          </n-tag>
          <button class="icon-btn" style="margin-left:8px;" @click="selectedLog = null">
            <DsIcon name="close" :size="14" />
          </button>
        </div>

        <!-- 元信息 -->
        <div class="detail-meta-bar">
          <div class="meta-tile">
            <div class="meta-label">日期</div>
            <div class="meta-val mono">{{ selectedLog.startedAt ? formatDate(selectedLog.startedAt) : formatDate(selectedLog.createdAt) }}</div>
          </div>
          <div class="meta-tile">
            <div class="meta-label">用时</div>
            <div class="meta-val">{{ selectedLog.durationSeconds ? formatDuration(selectedLog.durationSeconds) : '—' }}</div>
          </div>
          <div class="meta-tile">
            <div class="meta-label">提问数</div>
            <div class="meta-val">{{ selectedLog.questionCount }}</div>
          </div>
          <div class="meta-tile">
            <div class="meta-label">玩家数</div>
            <div class="meta-val">{{ selectedLog.playerCount }}</div>
          </div>
        </div>

        <!-- 加载详情中 -->
        <div v-if="detailLoading" style="padding:40px; text-align:center; color:var(--fg-muted);">
          {{ t('common.loading') }}
        </div>
        <template v-else-if="detail">
          <!-- 题目信息 -->
          <div v-if="detail.puzzle" class="detail-section">
            <div class="section-head">题目</div>
            <div class="puzzle-surface">{{ detail.puzzle.surface }}</div>
            <details class="truth-spoiler">
              <summary>查看真相</summary>
              <div class="puzzle-truth">{{ detail.puzzle.truth }}</div>
            </details>
          </div>

          <!-- 玩家得分 -->
          <div v-if="detail.playerScores.length" class="detail-section">
            <div class="section-head">玩家战绩</div>
            <div class="scores-grid">
              <div
                v-for="(ps, idx) in detail.playerScores.slice().sort((a, b) => (b.contributionScore ?? 0) - (a.contributionScore ?? 0))"
                :key="ps.qq"
                class="score-row"
              >
                <span class="rank-medal">{{ ['🥇','🥈','🥉'][idx] ?? `#${idx+1}` }}</span>
                <span class="score-name">{{ ps.displayName }}</span>
                <span class="score-result" :class="ps.result">{{ formatPlayerResult(ps.result) }}</span>
                <span class="score-val">{{ ps.contributionScore != null ? ps.contributionScore.toFixed(1) : '—' }} 分</span>
                <span class="score-meta">{{ ps.breakthroughCount }} 突破 · {{ ps.questionsAsked }} 问</span>
              </div>
            </div>
          </div>

          <!-- Q&A 提问记录 -->
          <div class="detail-section">
            <div class="section-head">提问记录（{{ detail.questionLog.length }} 条）</div>
            <div v-if="detail.questionLog.length === 0" style="color:var(--fg-muted); font-size:13px;">暂无记录</div>
            <div v-else class="qa-log">
              <div
                v-for="(entry, i) in detail.questionLog"
                :key="i"
                class="qa-entry"
                :class="entry.verdict"
              >
                <div class="qa-head">
                  <span class="qa-player">{{ detail.playerNames[entry.qq] ?? entry.qq }}</span>
                  <span class="qa-verdict" :class="entry.verdict">{{ verdictLabel(entry.verdict) }}</span>
                  <span v-if="entry.matchedKeyPoints?.length" class="qa-breakthrough">★ 关键突破</span>
                  <span class="qa-time mono">{{ formatTime(entry.at) }}</span>
                </div>
                <div v-if="entry.question" class="qa-question">{{ entry.question }}</div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NTag, NPagination, NSelect, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import DsIcon from '@/components/DsIcon.vue'
import { apiGet } from '@/api/client'

const { t } = useI18n()
const message = useMessage()

// ── 状态 ──────────────────────────────────────────────────────────────────────

const loading = ref(false)
const detailLoading = ref(false)
const page = ref(1)
const pageSize = 20
const total = ref(0)
const items = ref<LogItem[]>([])
const stats = ref<Stats>({ totalSessions: null, thisMonth: null, avgDurationMinutes: null })
const filterState = ref<string | null>(null)
const selectedLog = ref<LogItem | null>(null)
const detail = ref<LogDetail | null>(null)

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface LogItem {
  id: string
  puzzleId: string | null
  puzzleTitle: string
  gameType: string
  state: string
  endReason: string | null
  createdAt: number
  startedAt: number | null
  endedAt: number | null
  durationSeconds: number | null
  playerCount: number
  playerNames: string[]
  questionCount: number
}

interface Stats {
  totalSessions: number | null
  thisMonth: number | null
  avgDurationMinutes: number | null
}

interface QAEntry {
  qq: string
  questionIndex: number
  verdict: string
  matchedKeyPoints: string[]
  at: number
  question?: string
}

interface PlayerScore {
  qq: string
  displayName: string
  result: string
  contributionScore: number | null
  breakthroughCount: number
  questionsAsked: number
}

interface LogDetail {
  id: string
  puzzleTitle: string
  puzzle: { title: string; surface: string; truth: string; difficulty: number } | null
  questionLog: QAEntry[]
  playerNames: Record<string, string>
  playerScores: PlayerScore[]
  memberCount: number
  durationSeconds: number | null
}

// ── 选项 ──────────────────────────────────────────────────────────────────────

const stateOptions = [
  { label: '已完成', value: 'ended' },
  { label: '已中止', value: 'aborted' },
]

// ── 数据加载 ──────────────────────────────────────────────────────────────────

async function loadLogs() {
  loading.value = true
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize) })
    if (filterState.value) params.set('state', filterState.value)
    const result = await apiGet<{
      items: LogItem[]
      total: number
      stats: { totalSessions: number; thisMonth: number; avgDurationMinutes: number }
    }>(`/api/admin/game-logs?${params}`)
    items.value = result.items
    total.value = result.total
    stats.value = result.stats
  } catch (e: any) {
    message.error(`加载失败：${e.message}`)
  } finally {
    loading.value = false
  }
}

async function openDetail(item: LogItem) {
  selectedLog.value = item
  detail.value = null
  detailLoading.value = true
  try {
    const d = await apiGet<LogDetail>(`/api/admin/game-logs/${item.id}`)
    detail.value = d
  } catch (e: any) {
    message.error(`加载详情失败：${e.message}`)
  } finally {
    detailLoading.value = false
  }
}

function handlePageChange(newPage: number) {
  page.value = newPage
  loadLogs()
}

onMounted(loadLogs)

// ── 格式化工具 ────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  const d = new Date(ts * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}h${m % 60}min`
  }
  return `${m}min${s > 0 ? ` ${s}s` : ''}`
}

function formatResult(endReason: string | null, state: string): string {
  if (state === 'aborted') {
    const abortMap: Record<string, string> = {
      setup_timeout: 'setup 超时',
      server_restart_stale: '重启清理',
      admin_stop: '管理员停止',
    }
    return abortMap[endReason ?? ''] ?? '中止'
  }
  const map: Record<string, string> = {
    restored: '通关',
    win: '通关',
    giveup: '放弃',
    timeout: '超时',
    change_failed: '换题失败',
  }
  return map[endReason ?? ''] ?? endReason ?? state
}

function formatPlayerResult(result: string): string {
  const map: Record<string, string> = {
    win: '通关',
    giveup: '放弃',
    timeout: '超时',
    aborted: '中止',
    change_failed: '换题',
  }
  return map[result] ?? result
}

function resultTagType(endReason: string | null, state: string): 'success' | 'warning' | 'error' | 'default' {
  if (state === 'aborted') return 'default'
  const map: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    restored: 'success',
    win: 'success',
    giveup: 'warning',
    timeout: 'warning',
    change_failed: 'default',
  }
  return map[endReason ?? ''] ?? 'default'
}

function verdictLabel(verdict: string): string {
  const map: Record<string, string> = {
    yes: '是',
    no: '否',
    irrelevant: '无关',
    partial: '部分',
  }
  return map[verdict] ?? verdict
}
</script>

<style scoped>
/* 主布局：列表 + 详情并排 */
.logs-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  min-height: 0;
}
.logs-layout.has-detail {
  grid-template-columns: 380px 1fr;
}

/* Log 行 */
.log-row {
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  transition: background 0.12s;
}
.log-row:last-child { border-bottom: none; }
.log-row:hover { background: var(--bg-hover, rgba(0,0,0,.03)); }
.log-row.active { background: var(--bg-elevated); border-left: 2px solid var(--accent); }

.log-row-main {
  display: flex;
  align-items: center;
  gap: 10px;
}
.log-info { flex: 1; min-width: 0; }
.log-title {
  font-weight: 500;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.log-meta {
  font-size: 12px;
  color: var(--fg-muted);
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.log-meta .sep { opacity: 0.5; }

.log-players {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 6px;
  margin-left: 25px;
}
.player-chip {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 10px;
  background: var(--bg-tag, rgba(0,0,0,.06));
  color: var(--fg-muted);
}

/* 详情面板 */
.logs-detail {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: calc(100vh - 220px);
}
.detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.detail-meta-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.meta-tile {
  flex: 1;
  padding: 10px 14px;
  border-right: 1px solid var(--line);
}
.meta-tile:last-child { border-right: none; }
.meta-label { font-size: 11px; color: var(--fg-muted); text-transform: uppercase; letter-spacing: .08em; }
.meta-val { font-size: 14px; font-weight: 500; margin-top: 2px; }

.detail-section {
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
  overflow-y: auto;
  flex-shrink: 0;
}
.detail-section:last-child {
  flex: 1;
  overflow-y: auto;
}
.section-head {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: var(--fg-muted);
  margin-bottom: 10px;
}

.puzzle-surface {
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}
.truth-spoiler {
  margin-top: 8px;
  font-size: 13px;
}
.truth-spoiler summary {
  cursor: pointer;
  color: var(--fg-muted);
  user-select: none;
}
.puzzle-truth {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--fg-muted);
}

/* 得分列表 */
.scores-grid { display: flex; flex-direction: column; gap: 6px; }
.score-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.rank-medal { font-size: 15px; width: 22px; text-align: center; }
.score-name { flex: 1; font-weight: 500; }
.score-result {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--bg-tag);
}
.score-result.win { background: #dcfce7; color: #16a34a; }
.score-result.giveup { background: #fef9c3; color: #ca8a04; }
.score-val { font-weight: 500; width: 60px; text-align: right; }
.score-meta { font-size: 11px; color: var(--fg-muted); }

/* Q&A 记录 */
.qa-log { display: flex; flex-direction: column; gap: 6px; }
.qa-entry {
  padding: 7px 10px;
  border-radius: 6px;
  border-left: 3px solid var(--line);
  background: var(--bg-card, #fff);
  font-size: 13px;
}
.qa-entry.yes { border-left-color: var(--success, #16a34a); }
.qa-entry.no { border-left-color: var(--danger, #dc2626); }
.qa-entry.partial { border-left-color: #f59e0b; }
.qa-entry.irrelevant { border-left-color: var(--line); opacity: 0.7; }

.qa-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.qa-player { font-weight: 500; }
.qa-verdict {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--bg-tag);
}
.qa-verdict.yes { background: #dcfce7; color: #16a34a; }
.qa-verdict.no { background: #fee2e2; color: #dc2626; }
.qa-verdict.partial { background: #fef9c3; color: #ca8a04; }
.qa-breakthrough {
  font-size: 11px;
  color: var(--accent);
  font-weight: 500;
}
.qa-time { margin-left: auto; font-size: 11px; color: var(--fg-muted); }
.qa-question {
  margin-top: 3px;
  color: var(--fg-muted);
  font-size: 12px;
  font-style: italic;
}

/* KPI 格 */
.c-stat {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
</style>
