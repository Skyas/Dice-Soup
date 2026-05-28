<template>
  <div class="page">
    <!-- Header -->
    <div class="page-head">
      <div>
        <h1 class="page-title"><span class="accent-line" />{{ t('undercover.records.title') }}</h1>
        <p class="page-sub">{{ t('undercover.records.sub', { n: total }) }}</p>
      </div>
      <div class="page-head-actions">
        <n-select
          v-model:value="filterRole"
          :options="roleOptions"
          :placeholder="t('undercover.records.filter.role')"
          clearable
          size="small"
          style="width: 110px;"
          @update:value="() => { page = 1; loadRecords() }"
        />
        <n-select
          v-model:value="filterResult"
          :options="resultOptions"
          :placeholder="t('undercover.records.filter.result')"
          clearable
          size="small"
          style="width: 100px;"
          @update:value="() => { page = 1; loadRecords() }"
        />
        <button class="btn" @click="loadRecords">
          <DsIcon name="refresh" :size="13" /> {{ t('undercover.records.refresh') }}
        </button>
      </div>
    </div>

    <!-- Stats tiles -->
    <div class="stat-tiles">
      <div class="stat-tile">
        <div class="tile-val">{{ stats.totalRecords ?? '--' }}</div>
        <div class="tile-label">{{ t('undercover.records.stats.total') }}</div>
        <div class="tile-sub">{{ t('undercover.records.stats.totalSub') }}</div>
      </div>
      <div class="stat-tile">
        <div class="tile-val accent">{{ stats.civWins ?? '--' }}</div>
        <div class="tile-label">{{ t('undercover.records.stats.civWin') }}</div>
      </div>
      <div class="stat-tile">
        <div class="tile-val warn">{{ stats.ucWins ?? '--' }}</div>
        <div class="tile-label">{{ t('undercover.records.stats.ucWin') }}</div>
      </div>
      <div class="stat-tile">
        <div class="tile-val muted">{{ stats.blankWins ?? '--' }}</div>
        <div class="tile-label">{{ t('undercover.records.stats.blankWin') }}</div>
      </div>
    </div>

    <!-- Records table -->
    <div class="ds-card flush">
      <div v-if="loading" class="empty-state">{{ t('common.loading') }}</div>
      <div v-else-if="items.length === 0" class="empty-state">
        <DsIcon name="scroll" :size="28" style="opacity:0.3; display:block; margin:0 auto 12px;" />
        <div>{{ t('undercover.records.empty') }}</div>
      </div>
      <template v-else>
        <div class="records-table">
          <div class="table-head">
            <div class="col-player">{{ t('undercover.records.cols.player') }}</div>
            <div class="col-role">{{ t('undercover.records.cols.role') }}</div>
            <div class="col-result">{{ t('undercover.records.cols.result') }}</div>
            <div class="col-words">{{ t('undercover.records.cols.words') }}</div>
            <div class="col-rounds">{{ t('undercover.records.cols.rounds') }}</div>
            <div class="col-time">{{ t('undercover.records.cols.time') }}</div>
          </div>
          <div v-for="item in items" :key="item.id" class="table-row">
            <div class="col-player">
              <span class="player-qq mono">{{ item.playerQQ }}</span>
            </div>
            <div class="col-role">
              <span class="role-badge" :class="item.role">
                {{ roleLabel(item.role) }}
              </span>
            </div>
            <div class="col-result">
              <span class="result-badge" :class="item.result">
                {{ resultLabel(item.result) }}
              </span>
            </div>
            <div class="col-words">
              <template v-if="item.normalWord || item.undercoverWord">
                <span class="word-pair">
                  <span class="word-normal">{{ item.normalWord ?? '—' }}</span>
                  <span class="word-sep">↔</span>
                  <span class="word-under">{{ item.undercoverWord ?? '—' }}</span>
                </span>
              </template>
              <span v-else class="text-muted">—</span>
            </div>
            <div class="col-rounds">{{ item.survivedRounds ?? '—' }}</div>
            <div class="col-time mono">{{ formatDate(item.createdAt) }}</div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="total > pageSize" class="pager">
          <n-pagination
            v-model:page="page"
            :page-count="Math.ceil(total / pageSize)"
            size="small"
            @update:page="handlePageChange"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NSelect, NPagination, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import DsIcon from '@/components/DsIcon.vue'
import { apiGet } from '@/api/client'

const { t } = useI18n()
const message = useMessage()

// ── State ─────────────────────────────────────────────────────────────────────

const loading = ref(false)
const page = ref(1)
const pageSize = 20
const total = ref(0)
const items = ref<RecordItem[]>([])
const stats = ref<Stats>({ totalRecords: null, civWins: null, ucWins: null, blankWins: null })
const filterRole = ref<string | null>(null)
const filterResult = ref<string | null>(null)

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecordItem {
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

interface Stats {
  totalRecords: number | null
  civWins: number | null
  ucWins: number | null
  blankWins: number | null
}

// ── Options ───────────────────────────────────────────────────────────────────

const roleOptions = [
  { label: t('undercover.records.roles.civilian'), value: 'civilian' },
  { label: t('undercover.records.roles.undercover'), value: 'undercover' },
  { label: t('undercover.records.roles.blank'), value: 'blank' },
]

const resultOptions = [
  { label: t('undercover.records.results.win'), value: 'win' },
  { label: t('undercover.records.results.lose'), value: 'lose' },
]

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadRecords() {
  loading.value = true
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize) })
    if (filterRole.value) params.set('role', filterRole.value)
    if (filterResult.value) params.set('result', filterResult.value)
    const res = await apiGet<{
      items: RecordItem[]
      total: number
      stats: Stats
    }>(`/api/admin/undercover/records?${params}`)
    items.value = res.items
    total.value = res.total
    stats.value = res.stats ?? stats.value
  } catch (e: any) {
    message.error(t('undercover.records.messages.loadError', { msg: e.message }))
  } finally {
    loading.value = false
  }
}

function handlePageChange(newPage: number) {
  page.value = newPage
  loadRecords()
}

onMounted(loadRecords)

// ── Helpers ───────────────────────────────────────────────────────────────────

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    civilian: t('undercover.records.roles.civilian'),
    undercover: t('undercover.records.roles.undercover'),
    blank: t('undercover.records.roles.blank'),
  }
  return map[role] ?? role
}

function resultLabel(result: string): string {
  const map: Record<string, string> = {
    win: t('undercover.records.results.win'),
    lose: t('undercover.records.results.lose'),
  }
  return map[result] ?? result
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<style scoped>
.stat-tiles {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.stat-tile {
  background: var(--bg-card);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 16px 20px;
}

.tile-val {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--fg-primary);
}
.tile-val.accent { color: var(--accent); }
.tile-val.warn { color: #f59e0b; }
.tile-val.muted { color: var(--fg-muted); }

.tile-label {
  font-size: 12px;
  color: var(--fg-muted);
  margin-top: 6px;
}

.tile-sub {
  font-size: 11px;
  color: var(--fg-subtle, var(--fg-muted));
  opacity: 0.7;
  margin-top: 2px;
}

/* Table */
.records-table { width: 100%; }

.table-head {
  display: grid;
  grid-template-columns: var(--col-widths);
  padding: 8px 16px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: var(--fg-muted);
  border-bottom: 1px solid var(--line);
  --col-widths: 130px 80px 80px 1fr 80px 140px;
}

.table-row {
  display: grid;
  grid-template-columns: var(--col-widths);
  padding: 10px 16px;
  font-size: 13px;
  align-items: center;
  border-bottom: 1px solid var(--line);
  transition: background 0.1s;
  --col-widths: 130px 80px 80px 1fr 80px 140px;
}
.table-row:last-child { border-bottom: none; }
.table-row:hover { background: var(--bg-hover, rgba(0,0,0,.03)); }

.player-qq {
  font-size: 12px;
  color: var(--fg-muted);
}

.role-badge {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--bg-tag, rgba(0,0,0,.06));
  color: var(--fg-muted);
  font-weight: 500;
}
.role-badge.civilian { background: #dbeafe; color: #1d4ed8; }
.role-badge.undercover { background: #fee2e2; color: #dc2626; }
.role-badge.blank { background: #f3f4f6; color: #6b7280; }

.result-badge {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}
.result-badge.win { background: #dcfce7; color: #16a34a; }
.result-badge.lose { background: #fee2e2; color: #dc2626; }

.word-pair {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.word-normal { color: #1d4ed8; font-weight: 500; }
.word-sep { color: var(--fg-muted); opacity: 0.5; }
.word-under { color: #dc2626; font-weight: 500; }

.text-muted { color: var(--fg-muted); }

.empty-state {
  padding: 48px;
  text-align: center;
  color: var(--fg-muted);
  font-size: 14px;
}

.pager {
  padding: 12px;
  display: flex;
  justify-content: center;
  border-top: 1px solid var(--line);
}
</style>
