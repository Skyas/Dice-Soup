<template>
  <div class="page">
    <!-- Header -->
    <div class="page-head">
      <div>
        <h1 class="page-title"><span class="accent-line" />{{ t('undercover.words.title') }}</h1>
        <p class="page-sub">{{ t('undercover.words.sub', { n: total }) }}</p>
      </div>
      <div class="page-head-actions">
        <n-select
          v-model:value="filterState"
          :options="stateOptions"
          :placeholder="t('undercover.words.filter.state')"
          clearable
          size="small"
          style="width: 100px;"
          @update:value="() => { page = 1; loadWords() }"
        />
        <n-select
          v-model:value="filterCategory"
          :options="categoryOptions"
          :placeholder="t('undercover.words.filter.category')"
          clearable
          size="small"
          style="width: 110px;"
          @update:value="() => { page = 1; loadWords() }"
        />
        <n-select
          v-model:value="filterDifficulty"
          :options="difficultyOptions"
          :placeholder="t('undercover.words.filter.difficulty')"
          clearable
          size="small"
          style="width: 100px;"
          @update:value="() => { page = 1; loadWords() }"
        />
        <button class="btn" @click="loadWords">
          <DsIcon name="refresh" :size="13" /> {{ t('undercover.words.refresh') }}
        </button>
        <button class="btn primary" @click="openCreate">
          <DsIcon name="plus" :size="13" /> {{ t('undercover.words.newPair') }}
        </button>
      </div>
    </div>

    <!-- Stats tiles -->
    <div class="grid c-stat">
      <div class="stat-tile">
        <div class="tile-label"><span class="tile-ico"><DsIcon name="card" :size="13" /></span>{{ t('undercover.words.stats.total') }}</div>
        <div class="tile-value">{{ stats.totalWords }}</div>
      </div>
      <div class="stat-tile">
        <div class="tile-label"><span class="tile-ico"><DsIcon name="plus" :size="13" /></span>{{ t('undercover.words.stats.active') }}</div>
        <div class="tile-value">{{ stats.activeWords }}</div>
      </div>
      <div class="stat-tile">
        <div class="tile-label"><span class="tile-ico"><DsIcon name="settings" :size="13" /></span>{{ t('undercover.words.stats.categories') }}</div>
        <div class="tile-value">{{ stats.categories.length }}</div>
      </div>
      <div class="stat-tile">
        <div class="tile-label"><span class="tile-ico"><DsIcon name="scroll" :size="13" /></span>{{ t('undercover.words.stats.played') }}</div>
        <div class="tile-value">{{ stats.totalRecords }}</div>
      </div>
    </div>

    <!-- Word pair grid -->
    <div v-if="loading" class="grid c3">
      <div v-for="i in 6" :key="i" class="word-card" style="min-height: 140px; opacity: 0.4;" />
    </div>

    <div
      v-else-if="words.length === 0"
      class="ds-card"
      style="text-align: center; padding: 48px; color: var(--fg-muted);"
    >
      <DsIcon name="card" :size="32" style="opacity: 0.3; display: block; margin: 0 auto 12px;" />
      <div style="font-size: 14px;">{{ t('undercover.words.empty') }}</div>
    </div>

    <div v-else class="grid c3">
      <div v-for="word in words" :key="word.id" class="word-card">
        <!-- Card head: difficulty + state -->
        <div class="card-head">
          <span class="diff-badge" :class="word.difficulty">
            {{ t(`undercover.words.difficulties.${word.difficulty}`) }}
          </span>
          <span class="state-badge" :class="word.state">
            {{ t(`undercover.words.states.${word.state}`) }}
          </span>
        </div>

        <!-- Word pair -->
        <div class="word-pair">
          <div class="word-item">
            <span class="word-label">{{ t('undercover.words.card.normal') }}</span>
            <span class="word-val">{{ word.normalWord }}</span>
          </div>
          <div class="word-sep">⇄</div>
          <div class="word-item">
            <span class="word-label uc">{{ t('undercover.words.card.undercover') }}</span>
            <span class="word-val uc">{{ word.undercoverWord }}</span>
          </div>
        </div>

        <!-- Category -->
        <div class="card-category">
          <span class="card-tag">#{{ word.category }}</span>
        </div>

        <!-- Actions -->
        <div class="card-actions">
          <button class="btn" style="padding: 4px 8px;" @click="openEdit(word)">
            <DsIcon name="card" :size="13" />
          </button>
          <button
            v-if="word.state === 'active'"
            class="btn"
            style="padding: 4px 10px; font-size: 12px; margin-left: auto;"
            @click="toggleState(word)"
          >{{ t('undercover.words.card.deactivate') }}</button>
          <button
            v-else
            class="btn primary"
            style="padding: 4px 10px; font-size: 12px; margin-left: auto;"
            @click="toggleState(word)"
          >{{ t('undercover.words.card.activate') }}</button>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="total > pageSize" style="display: flex; justify-content: center; margin-top: 8px;">
      <n-pagination
        v-model:page="page"
        :page-count="Math.ceil(total / pageSize)"
        @update:page="(n) => { page = n; loadWords() }"
      />
    </div>

    <!-- Create / Edit modal -->
    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="editingId ? t('undercover.words.form.editTitle') : t('undercover.words.form.createTitle')"
      style="width: 480px;"
      :mask-closable="false"
    >
      <n-form ref="formRef" :model="form" label-placement="left" label-width="80">
        <n-form-item
          :label="t('undercover.words.form.normalWord')"
          path="normalWord"
          :rule="{ required: true, message: '请填写平民词' }"
        >
          <n-input
            v-model:value="form.normalWord"
            :placeholder="t('undercover.words.form.normalPlaceholder')"
            maxlength="20"
          />
        </n-form-item>

        <n-form-item
          :label="t('undercover.words.form.undercoverWord')"
          path="undercoverWord"
          :rule="{ required: true, message: '请填写卧底词' }"
        >
          <n-input
            v-model:value="form.undercoverWord"
            :placeholder="t('undercover.words.form.undercoverPlaceholder')"
            maxlength="20"
          />
        </n-form-item>

        <n-form-item
          :label="t('undercover.words.form.category')"
          path="category"
          :rule="{ required: true, message: '请填写分类' }"
        >
          <n-auto-complete
            v-model:value="form.category"
            :options="stats.categories"
            :placeholder="t('undercover.words.form.categoryPlaceholder')"
          />
        </n-form-item>

        <n-form-item :label="t('undercover.words.form.difficulty')" path="difficulty">
          <n-radio-group v-model:value="form.difficulty">
            <n-radio value="easy">{{ t('undercover.words.difficulties.easy') }}</n-radio>
            <n-radio value="medium">{{ t('undercover.words.difficulties.medium') }}</n-radio>
            <n-radio value="hard">{{ t('undercover.words.difficulties.hard') }}</n-radio>
          </n-radio-group>
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showModal = false">{{ t('undercover.words.form.cancel') }}</n-button>
          <n-button type="primary" :loading="saving" @click="saveWord">
            {{ editingId ? t('undercover.words.form.save') : t('undercover.words.form.create') }}
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  NButton, NModal, NForm, NFormItem, NInput, NSelect, NPagination,
  NSpace, NRadioGroup, NRadio, NAutoComplete,
  useMessage,
} from 'naive-ui'
import { useI18n } from 'vue-i18n'
import DsIcon from '@/components/DsIcon.vue'
import { apiGet, apiPost, apiPut } from '@/api/client'

const { t } = useI18n()
const message = useMessage()

interface WordPair {
  id: string
  normalWord: string
  undercoverWord: string
  category: string
  difficulty: 'easy' | 'medium' | 'hard'
  source: string
  state: string
  createdBy: string
  createdAt: number
}

interface Stats {
  totalWords: number
  activeWords: number
  totalRecords: number
  categories: string[]
}

// ── State ──────────────────────────────────────────────────────────────────

const words = ref<WordPair[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = ref(24)

const filterState = ref<string | null>(null)
const filterCategory = ref<string | null>(null)
const filterDifficulty = ref<string | null>(null)

const stats = ref<Stats>({ totalWords: 0, activeWords: 0, totalRecords: 0, categories: [] })

// ── Modal ──────────────────────────────────────────────────────────────────

const showModal = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const formRef = ref()

const defaultForm = () => ({
  normalWord: '',
  undercoverWord: '',
  category: '',
  difficulty: 'medium' as 'easy' | 'medium' | 'hard',
})
const form = ref(defaultForm())

// ── Options ────────────────────────────────────────────────────────────────

const stateOptions = computed(() => [
  { label: t('undercover.words.states.active'),   value: 'active' },
  { label: t('undercover.words.states.inactive'), value: 'inactive' },
])

const difficultyOptions = computed(() => [
  { label: t('undercover.words.difficulties.easy'),   value: 'easy' },
  { label: t('undercover.words.difficulties.medium'), value: 'medium' },
  { label: t('undercover.words.difficulties.hard'),   value: 'hard' },
])

const categoryOptions = computed(() =>
  stats.value.categories.map((c) => ({ label: c, value: c }))
)

// ── Data loading ───────────────────────────────────────────────────────────

async function loadStats() {
  try {
    stats.value = await apiGet<Stats>('/api/admin/undercover/stats')
  } catch { /* non-critical */ }
}

async function loadWords() {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      pageSize: String(pageSize.value),
    })
    if (filterState.value) params.set('state', filterState.value)
    if (filterCategory.value) params.set('category', filterCategory.value)
    if (filterDifficulty.value) params.set('difficulty', filterDifficulty.value)

    const result = await apiGet<{ items: WordPair[]; total: number }>(
      `/api/admin/undercover/words?${params}`
    )
    words.value = result.items
    total.value = result.total
  } catch (e: any) {
    message.error(t('undercover.words.messages.loadError', { msg: e.message }))
  } finally {
    loading.value = false
  }
}

// ── Modal actions ──────────────────────────────────────────────────────────

function openCreate() {
  editingId.value = null
  form.value = defaultForm()
  showModal.value = true
}

function openEdit(word: WordPair) {
  editingId.value = word.id
  form.value = {
    normalWord: word.normalWord,
    undercoverWord: word.undercoverWord,
    category: word.category,
    difficulty: word.difficulty,
  }
  showModal.value = true
}

async function saveWord() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    if (editingId.value) {
      await apiPut(`/api/admin/undercover/words/${editingId.value}`, form.value)
      message.success(t('undercover.words.messages.saveSuccess'))
    } else {
      await apiPost('/api/admin/undercover/words', form.value)
      message.success(t('undercover.words.messages.createSuccess'))
    }
    showModal.value = false
    await Promise.all([loadWords(), loadStats()])
  } catch (e: any) {
    message.error(t('undercover.words.messages.saveError', { msg: e.message }))
  } finally {
    saving.value = false
  }
}

async function toggleState(word: WordPair) {
  const newState = word.state === 'active' ? 'inactive' : 'active'
  try {
    const updated = await apiPost<WordPair>(
      `/api/admin/undercover/words/${word.id}/state`,
      { state: newState }
    )
    message.success(t('undercover.words.messages.stateSuccess', { state: newState }))
    const idx = words.value.findIndex((w) => w.id === word.id)
    if (idx !== -1) words.value[idx] = updated
    await loadStats()
  } catch (e: any) {
    message.error(t('undercover.words.messages.stateError', { msg: e.message }))
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

onMounted(async () => {
  await Promise.all([loadWords(), loadStats()])
})
</script>

<style scoped>
/* ── Word card ─────────────────────────────────────────── */

.word-card {
  background: var(--bg-surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: border-color 0.15s;
}

.word-card:hover {
  border-color: var(--accent);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.diff-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  letter-spacing: 0.03em;
}

.diff-badge.easy   { background: var(--success-soft); color: var(--success); }
.diff-badge.medium { background: var(--warning-soft); color: var(--warning); }
.diff-badge.hard   { background: var(--danger-soft);  color: var(--danger); }

.state-badge {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: var(--r-xs);
  margin-left: auto;
}

.state-badge.active   { background: var(--success-soft); color: var(--success); }
.state-badge.inactive { background: var(--bg-hover); color: var(--fg-muted); }

.word-pair {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-elevated);
  border-radius: 7px;
  padding: 10px 12px;
}

.word-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 3px;
}

.word-label {
  font-size: 10px;
  color: var(--fg-muted);
  letter-spacing: 0.05em;
}

.word-label.uc { color: var(--accent); }

.word-val {
  font-size: 16px;
  font-weight: 600;
  color: var(--fg-primary);
}

.word-val.uc { color: var(--accent); }

.word-sep {
  font-size: 14px;
  color: var(--fg-muted);
  flex-shrink: 0;
}

.card-category {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.card-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--r-xs);
  background: var(--bg-hover);
  color: var(--fg-muted);
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
}
</style>
