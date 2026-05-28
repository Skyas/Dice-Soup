<template>
  <div class="page">
    <!-- Header -->
    <div class="page-head">
      <div>
        <h1 class="page-title"><span class="accent-line" />{{ t('gameLogs.title') }}</h1>
      </div>
    </div>

    <n-tabs v-model:value="activeTab" type="line" animated @update:value="handleTabChange">

      <!-- ── 海龟汤 ──────────────────────────────────────────── -->
      <n-tab-pane name="soup" :tab="t('gameLogs.tabs.soup')">
        <!-- Tab filter bar -->
        <div class="tab-filter-bar">
          <span class="tab-sub">{{ t('gameLogs.sub', { n: total }) }}</span>
          <div class="tab-actions">
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

              <!-- 对局时间线 -->
              <div class="detail-section">
                <div class="section-head">
                  对局时间线（{{ buildTimeline(detail).length }} 条
                  <template v-if="(detail.restoreLog?.length ?? 0) > 0">
                    · {{ detail.questionLog.length }} 问 · {{ detail.restoreLog.length }} 次还原
                  </template>）
                </div>
                <div v-if="buildTimeline(detail).length === 0" style="color:var(--fg-muted); font-size:13px;">暂无记录</div>
                <div v-else class="qa-log">
                  <template v-for="(item, i) in buildTimeline(detail)" :key="i">
                    <div v-if="item.kind === 'question'" class="qa-entry" :class="item.data.verdict">
                      <div class="qa-head">
                        <span class="qa-idx mono">Q{{ item.data.questionIndex + 1 }}</span>
                        <span class="qa-player">{{ detail.playerNames[item.data.qq] ?? item.data.qq }}</span>
                        <span class="qa-verdict" :class="item.data.verdict">{{ verdictLabel(item.data.verdict) }}</span>
                        <span v-if="item.data.matchedKeyPoints?.length" class="qa-breakthrough">★ 突破</span>
                        <span class="qa-time mono">{{ formatTime(item.data.at) }}</span>
                      </div>
                      <div class="qa-question">{{ item.data.question ?? '（无问题文本）' }}</div>
                    </div>
                    <div v-else class="qa-entry restore-entry-inline" :class="item.data.passed ? 'restore-pass' : 'restore-fail'">
                      <div class="qa-head">
                        <span class="qa-idx">🔍</span>
                        <span class="qa-player">{{ detail.playerNames[item.data.qq] ?? item.data.qq }}</span>
                        <span class="restore-badge-inline" :class="item.data.passed ? 'passed' : 'failed'">
                          {{ item.data.passed ? '✅ 还原通过' : '❌ 还原未通过' }}
                        </span>
                        <span class="restore-coverage-inline">{{ Math.round(item.data.coverage * 100) }}%</span>
                        <span class="qa-time mono">{{ formatTime(item.data.at) }}</span>
                      </div>
                      <div class="qa-question">{{ item.data.text }}</div>
                      <div v-if="item.data.missingCriticalIds?.length" class="restore-missing-inline">
                        缺少必要要素：{{ item.data.missingCriticalIds.join('、') }}
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </template>
          </div>
        </div>
      </n-tab-pane>

      <!-- ── 谁是卧底 ────────────────────────────────────────── -->
      <n-tab-pane name="undercover" :tab="t('gameLogs.tabs.undercover')">
        <!-- Tab filter bar -->
        <div class="tab-filter-bar">
          <span class="tab-sub">{{ t('undercover.records.sub', { n: ucTotal }) }}</span>
          <div class="tab-actions">
            <n-select
              v-model:value="ucFilterRole"
              :options="ucRoleOptions"
              :placeholder="t('undercover.records.filter.role')"
              clearable
              size="small"
              style="width: 110px;"
              @update:value="() => { ucPage = 1; loadUcRecords() }"
            />
            <n-select
              v-model:value="ucFilterResult"
              :options="ucResultOptions"
              :placeholder="t('undercover.records.filter.result')"
              clearable
              size="small"
              style="width: 100px;"
              @update:value="() => { ucPage = 1; loadUcRecords() }"
            />
            <button class="btn" @click="loadUcRecords">
              <DsIcon name="refresh" :size="13" /> {{ t('common.refresh') }}
            </button>
          </div>
        </div>

        <!-- Undercover stats -->
        <div class="grid c-stat">
          <div class="stat-tile">
            <div class="tile-value">{{ ucStats.totalRecords ?? '--' }}</div>
            <div class="tile-label">{{ t('undercover.records.stats.total') }}</div>
            <div class="tile-delta">{{ t('undercover.records.stats.totalSub') }}</div>
          </div>
          <div class="stat-tile">
            <div class="tile-value" style="color:var(--accent)">{{ ucStats.civWins ?? '--' }}</div>
            <div class="tile-label">{{ t('undercover.records.stats.civWin') }}</div>
          </div>
          <div class="stat-tile">
            <div class="tile-value" style="color:var(--warning)">{{ ucStats.ucWins ?? '--' }}</div>
            <div class="tile-label">{{ t('undercover.records.stats.ucWin') }}</div>
          </div>
          <div class="stat-tile">
            <div class="tile-value" style="color:var(--fg-muted)">{{ ucStats.blankWins ?? '--' }}</div>
            <div class="tile-label">{{ t('undercover.records.stats.blankWin') }}</div>
          </div>
        </div>

        <!-- Records table -->
        <div class="ds-card flush">
          <div v-if="ucLoading" style="padding:40px; text-align:center; color:var(--fg-muted);">
            {{ t('common.loading') }}
          </div>
          <div v-else-if="ucItems.length === 0" style="padding:48px; text-align:center; color:var(--fg-muted);">
            <DsIcon name="scroll" :size="28" style="opacity:0.3; display:block; margin:0 auto 12px;" />
            <div style="font-size:14px;">{{ t('undercover.records.empty') }}</div>
          </div>
          <template v-else>
            <div class="uc-table">
              <div class="uc-thead">
                <div>{{ t('undercover.records.cols.player') }}</div>
                <div>{{ t('undercover.records.cols.role') }}</div>
                <div>{{ t('undercover.records.cols.result') }}</div>
                <div>{{ t('undercover.records.cols.words') }}</div>
                <div>{{ t('undercover.records.cols.rounds') }}</div>
                <div>{{ t('undercover.records.cols.time') }}</div>
              </div>
              <div v-for="item in ucItems" :key="item.id" class="uc-trow">
                <div class="mono" style="font-size:12px; color:var(--fg-muted)">{{ item.playerQQ }}</div>
                <div>
                  <span class="role-badge" :class="item.role">{{ ucRoleLabel(item.role) }}</span>
                </div>
                <div>
                  <span class="result-badge" :class="item.result">{{ ucResultLabel(item.result) }}</span>
                </div>
                <div class="uc-words">
                  <template v-if="item.normalWord || item.undercoverWord">
                    <span class="uc-word-normal">{{ item.normalWord ?? '—' }}</span>
                    <span style="color:var(--fg-muted); opacity:.4; margin:0 3px">↔</span>
                    <span class="uc-word-under">{{ item.undercoverWord ?? '—' }}</span>
                  </template>
                  <span v-else style="color:var(--fg-muted)">—</span>
                </div>
                <div style="font-size:13px">{{ item.survivedRounds ?? '—' }}</div>
                <div class="mono" style="font-size:12px; color:var(--fg-muted)">{{ formatDate(item.createdAt) }}</div>
              </div>
            </div>
            <div v-if="ucTotal > ucPageSize" style="padding:12px; display:flex; justify-content:center; border-top:1px solid var(--line);">
              <n-pagination
                v-model:page="ucPage"
                :page-count="Math.ceil(ucTotal / ucPageSize)"
                size="small"
                @update:page="handleUcPageChange"
              />
            </div>
          </template>
        </div>
      </n-tab-pane>

    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NTag, NPagination, NSelect, NTabs, NTabPane, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import DsIcon from '@/components/DsIcon.vue'
import { apiGet } from '@/api/client'

const { t } = useI18n()
const message = useMessage()

// ── 海龟汤状态 ────────────────────────────────────────────────────────────────

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

// ── 谁是卧底状态 ──────────────────────────────────────────────────────────────

const ucLoading = ref(false)
const ucPage = ref(1)
const ucPageSize = 20
const ucTotal = ref(0)
const ucItems = ref<UcRecord[]>([])
const ucStats = ref<UcStats>({ totalRecords: null, civWins: null, ucWins: null, blankWins: null })
const ucFilterRole = ref<string | null>(null)
const ucFilterResult = ref<string | null>(null)
const ucLoaded = ref(false)

// ── Tab ───────────────────────────────────────────────────────────────────────

const activeTab = ref('soup')

function handleTabChange(tab: string) {
  if (tab === 'undercover' && !ucLoaded.value) {
    loadUcRecords()
  }
}

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
  question?: string
  verdict: string
  matchedKeyPoints: string[]
  at: number
}

interface RestoreEntry {
  qq: string
  text: string
  passed: boolean
  coverage: number
  missingCriticalIds: string[]
  at: number
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
  restoreLog: RestoreEntry[]
  playerNames: Record<string, string>
  playerScores: PlayerScore[]
  memberCount: number
  durationSeconds: number | null
}

interface UcRecord {
  id: string
  sessionId: string
  playerQQ: string
  role: string
  result: string
  wordPairId: string | null
  normalWord: string | null
  undercoverWord: string | null
  survivedRounds: number | null
  createdAt: number
}

interface UcStats {
  totalRecords: number | null
  civWins: number | null
  ucWins: number | null
  blankWins: number | null
}

// ── 选项 ──────────────────────────────────────────────────────────────────────

const stateOptions = [
  { label: '已完成', value: 'ended' },
  { label: '已中止', value: 'aborted' },
]

const ucRoleOptions = [
  { label: '平民', value: 'civilian' },
  { label: '卧底', value: 'undercover' },
  { label: '白板', value: 'blank' },
]

const ucResultOptions = [
  { label: '胜利', value: 'win' },
  { label: '失败', value: 'lose' },
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

async function loadUcRecords() {
  ucLoading.value = true
  try {
    const params = new URLSearchParams({ page: String(ucPage.value), pageSize: String(ucPageSize) })
    if (ucFilterRole.value) params.set('role', ucFilterRole.value)
    if (ucFilterResult.value) params.set('result', ucFilterResult.value)
    const res = await apiGet<{ items: UcRecord[]; total: number; stats: UcStats }>(
      `/api/admin/undercover/records?${params}`
    )
    ucItems.value = res.items
    ucTotal.value = res.total
    ucStats.value = res.stats ?? ucStats.value
    ucLoaded.value = true
  } catch (e: any) {
    message.error(`加载失败：${e.message}`)
  } finally {
    ucLoading.value = false
  }
}

function handlePageChange(newPage: number) {
  page.value = newPage
  loadLogs()
}

function handleUcPageChange(newPage: number) {
  ucPage.value = newPage
  loadUcRecords()
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
  const map: Record<string, string> = { yes: '是', no: '否', irrelevant: '无关', partial: '部分' }
  return map[verdict] ?? verdict
}

function ucRoleLabel(role: string): string {
  const map: Record<string, string> = { civilian: '平民', undercover: '卧底', blank: '白板' }
  return map[role] ?? role
}

function ucResultLabel(result: string): string {
  return result === 'win' ? '胜利' : '失败'
}

type TimelineItem =
  | { kind: 'question'; data: QAEntry }
  | { kind: 'restore'; data: RestoreEntry }

function buildTimeline(d: LogDetail): TimelineItem[] {
  const items: TimelineItem[] = [
    ...d.questionLog.map(e => ({ kind: 'question' as const, data: e })),
    ...(d.restoreLog ?? []).map(e => ({ kind: 'restore' as const, data: e })),
  ]
  return items.sort((a, b) => a.data.at - b.data.at)
}
</script>

<style scoped>
/* Tab filter bar */
.tab-filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.tab-sub {
  font-size: 13px;
  color: var(--fg-muted);
  flex: 1;
}
.tab-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 主布局：列表 + 详情并排 */
.logs-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  align-items: start;
}
.logs-layout.has-detail {
  grid-template-columns: 380px 1fr;
}

/* 两侧面板统一高度 + 各自独立滚动 */
.logs-list,
.logs-detail {
  max-height: calc(100vh - 260px);
  overflow-y: auto;
}

/* Log 行 */
.log-row {
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  transition: background 0.12s;
}
.log-row:last-child { border-bottom: none; }
.log-row:hover { background: var(--bg-hover); }
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
  background: var(--bg-hover);
  color: var(--fg-muted);
}

/* 详情面板 */
.logs-detail { display: block; }
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
}
.detail-section:last-child { border-bottom: none; }
.section-head {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: var(--fg-muted);
  margin-bottom: 10px;
}

.puzzle-surface { font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
.truth-spoiler { margin-top: 8px; font-size: 13px; }
.truth-spoiler summary { cursor: pointer; color: var(--fg-muted); user-select: none; }
.puzzle-truth { margin-top: 6px; font-size: 13px; line-height: 1.6; white-space: pre-wrap; color: var(--fg-muted); }

.scores-grid { display: flex; flex-direction: column; gap: 6px; }
.score-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.rank-medal { font-size: 15px; width: 22px; text-align: center; }
.score-name { flex: 1; font-weight: 500; }
.score-result { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--bg-hover); }
.score-result.win { background: var(--success-soft); color: var(--success); }
.score-result.giveup { background: var(--warning-soft); color: var(--warning); }
.score-val { font-weight: 500; width: 60px; text-align: right; }
.score-meta { font-size: 11px; color: var(--fg-muted); }

.qa-log { display: flex; flex-direction: column; gap: 6px; }
.qa-entry { padding: 7px 10px; border-radius: 6px; border-left: 3px solid var(--line); background: var(--bg-elevated); font-size: 13px; }
.qa-entry.yes { border-left-color: var(--success); }
.qa-entry.no { border-left-color: var(--danger); }
.qa-entry.partial { border-left-color: var(--warning); }
.qa-entry.irrelevant { border-left-color: var(--line); opacity: 0.7; }
.qa-head { display: flex; align-items: center; gap: 8px; }
.qa-player { font-weight: 500; }
.qa-verdict { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--bg-hover); }
.qa-verdict.yes { background: var(--success-soft); color: var(--success); }
.qa-verdict.no { background: var(--danger-soft); color: var(--danger); }
.qa-verdict.partial { background: var(--warning-soft); color: var(--warning); }
.qa-breakthrough { font-size: 11px; color: var(--accent); font-weight: 500; }
.qa-time { margin-left: auto; font-size: 11px; color: var(--fg-muted); }
.qa-idx { font-size: 11px; color: var(--fg-muted); min-width: 28px; }
.qa-question { margin-top: 4px; font-size: 13px; line-height: 1.5; color: var(--fg-secondary); }

.restore-entry-inline.restore-pass { border-left-color: var(--success); background: var(--success-soft); }
.restore-entry-inline.restore-fail { border-left-color: var(--danger); background: var(--danger-soft); }
.restore-badge-inline { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--bg-hover); font-weight: 500; }
.restore-badge-inline.passed { background: var(--success-soft); color: var(--success); }
.restore-badge-inline.failed { background: var(--danger-soft); color: var(--danger); }
.restore-coverage-inline { font-size: 11px; color: var(--fg-muted); font-variant-numeric: tabular-nums; }
.restore-missing-inline { margin-top: 4px; font-size: 11px; color: var(--danger); opacity: 0.8; }

/* Undercover table */
.uc-table { width: 100%; }
.uc-thead {
  display: grid;
  grid-template-columns: 130px 80px 80px 1fr 70px 140px;
  padding: 8px 16px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: var(--fg-muted);
  border-bottom: 1px solid var(--line);
}
.uc-trow {
  display: grid;
  grid-template-columns: 130px 80px 80px 1fr 70px 140px;
  padding: 10px 16px;
  font-size: 13px;
  align-items: center;
  border-bottom: 1px solid var(--line);
  transition: background 0.1s;
}
.uc-trow:last-child { border-bottom: none; }
.uc-trow:hover { background: var(--bg-hover); }

.role-badge {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
  background: var(--bg-hover);
  color: var(--fg-muted);
}
.role-badge.civilian { background: var(--info-soft); color: var(--info); }
.role-badge.undercover { background: var(--danger-soft); color: var(--danger); }
.role-badge.blank { background: var(--bg-hover); color: var(--fg-muted); }

.result-badge {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}
.result-badge.win { background: var(--success-soft); color: var(--success); }
.result-badge.lose { background: var(--danger-soft); color: var(--danger); }

.uc-words { display: flex; align-items: center; font-size: 12px; }
.uc-word-normal { color: var(--info); font-weight: 500; }
.uc-word-under { color: var(--accent); font-weight: 500; }
</style>
