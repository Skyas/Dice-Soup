<template>
  <div class="page">
    <!-- Header -->
    <div class="page-head">
      <div>
        <h1 class="page-title"><span class="accent-line" />{{ t('puzzles.title') }}</h1>
        <p class="page-sub">{{ t('puzzles.sub', { n: total }) }}</p>
      </div>
      <div class="page-head-actions">
        <n-select
          v-model:value="filterState"
          :options="stateOptions"
          :placeholder="t('puzzles.filter.state')"
          clearable
          size="small"
          style="width: 110px;"
          @update:value="loadPuzzles"
        />
        <n-select
          v-model:value="filterDifficulty"
          :options="difficultyOptions"
          :placeholder="t('puzzles.filter.difficulty')"
          clearable
          size="small"
          style="width: 100px;"
          @update:value="loadPuzzles"
        />
        <button class="btn" @click="loadPuzzles">
          <DsIcon name="refresh" :size="13" /> {{ t('puzzles.refresh') }}
        </button>
        <button class="btn primary" @click="openCreateModal">
          <DsIcon name="plus" :size="13" /> {{ t('puzzles.newPuzzle') }}
        </button>
      </div>
    </div>

    <!-- 卡片网格 -->
    <div v-if="loading" class="grid c3">
      <div v-for="i in 6" :key="i" class="puzzle-card" style="min-height:180px; opacity:0.4;" />
    </div>

    <div v-else-if="puzzles.length === 0" class="ds-card" style="text-align:center; padding:48px; color:var(--fg-muted);">
      <DsIcon name="soup" :size="32" style="opacity:0.3; display:block; margin:0 auto 12px;" />
      <div style="font-size:14px;">{{ t('puzzles.empty') }}</div>
    </div>

    <div v-else class="grid c3">
      <div v-for="puzzle in puzzles" :key="puzzle.id" class="puzzle-card">
        <!-- Card head: pips + state -->
        <div class="card-head">
          <div class="pips">
            <span
              v-for="n in 5"
              :key="n"
              class="pip"
              :class="{ on: n <= puzzle.difficulty }"
            />
          </div>
          <span class="state-badge" :class="puzzle.state">{{ t(`puzzles.states.${puzzle.state}`) || puzzle.state }}</span>
        </div>

        <!-- Title -->
        <div class="card-title" @click="openDetail(puzzle)">{{ puzzle.title }}</div>

        <!-- Tags -->
        <div v-if="puzzle.tags.length" class="card-tags">
          <span v-for="tag in puzzle.tags.slice(0, 4)" :key="tag" class="card-tag">#{{ tag }}</span>
        </div>

        <hr class="hr-fancy" />

        <!-- Stats -->
        <div class="card-stats">
          <div>{{ t('puzzles.card.plays') }} <span class="stat-val">{{ puzzle.playCount }}</span></div>
          <div>{{ t('puzzles.card.keyPoints') }} <span class="stat-val">{{ puzzle.keyPoints.length > 0 ? puzzle.keyPoints.length : t('puzzles.card.keyPointsNone') }}</span></div>
        </div>
        <div class="bar thin">
          <span :style="{ width: puzzle.playCount > 0 ? Math.min(100, puzzle.playCount * 10) + '%' : '0%' }" />
        </div>

        <!-- Actions -->
        <div class="card-actions">
          <button class="btn" style="padding:4px 8px;" :title="t('puzzles.detail.title')" @click="openDetail(puzzle)">
            <DsIcon name="eye" :size="13" />
          </button>
          <button class="btn" style="padding:4px 8px;" :title="t('common.edit')" @click="openEdit(puzzle)">
            <DsIcon name="card" :size="13" />
          </button>
          <button
            v-if="puzzle.state === 'draft'"
            class="btn primary" style="padding:4px 10px; font-size:12px; margin-left:auto;"
            @click="changeState(puzzle.id, 'active')"
          >{{ t('puzzles.card.publish') }}</button>
          <button
            v-else-if="puzzle.state === 'active'"
            class="btn" style="padding:4px 10px; font-size:12px; margin-left:auto;"
            @click="changeState(puzzle.id, 'archived')"
          >{{ t('puzzles.card.archive') }}</button>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="total > pageSize" style="display:flex; justify-content:center; margin-top:8px;">
      <n-pagination
        v-model:page="page"
        :page-count="Math.ceil(total / pageSize)"
        @update:page="handlePageChange"
      />
    </div>

    <!-- 新建/编辑弹窗 -->
    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="editingId ? '编辑题目' : '新建题目'"
      style="width: 720px; max-height: 90vh; overflow-y: auto;"
      :mask-closable="false"
    >
      <n-form ref="formRef" :model="form" label-placement="left" label-width="80">
        <n-form-item label="标题" path="title" :rule="{ required: true, message: '请填写标题' }">
          <n-input v-model:value="form.title" placeholder="20字以内" maxlength="20" />
        </n-form-item>

        <n-form-item label="难度" path="difficulty" :rule="{ required: true }">
          <n-rate v-model:value="form.difficulty" :count="5" allow-half />
          <n-text style="margin-left: 8px;">{{ form.difficulty }}★</n-text>
        </n-form-item>

        <n-form-item label="标签">
          <n-dynamic-tags v-model:value="form.tags" />
        </n-form-item>

        <n-form-item label="汤面" path="surface" :rule="{ required: true, message: '请填写汤面' }">
          <n-input
            v-model:value="form.surface"
            type="textarea"
            placeholder="玩家看到的谜面（300字以内）"
            :rows="4"
            maxlength="300"
          />
        </n-form-item>

        <n-form-item label="真相" path="truth" :rule="{ required: true, message: '请填写真相' }">
          <n-input
            v-model:value="form.truth"
            type="textarea"
            placeholder="完整真相（500字以内）"
            :rows="5"
            maxlength="500"
          />
        </n-form-item>

        <n-form-item label="提示">
          <n-dynamic-input
            v-model:value="form.hints"
            placeholder="每条提示（100字以内）"
            :max="5"
          />
        </n-form-item>

        <n-form-item label="预计用时">
          <n-input-number v-model:value="form.expectedMinutes" :min="1" :max="120" placeholder="分钟（可选）" />
        </n-form-item>

        <n-form-item label="来源">
          <n-select v-model:value="form.source" :options="sourceOptions" />
        </n-form-item>

        <!-- 关键线索（可选手动录入，留空则创建后用 AI 提取） -->
        <n-form-item label="关键线索">
          <div style="width: 100%;">
            <n-space align="center" style="margin-bottom: 8px;">
              <n-text depth="3" style="font-size: 12px;">可选。留空则保存后点击"提取 metadata"由 AI 自动生成。</n-text>
              <n-button size="tiny" @click="addKeyPoint">+ 添加线索</n-button>
            </n-space>
            <div v-for="(kp, idx) in form.keyPoints" :key="idx" class="kp-card">
              <n-space align="center" style="margin-bottom: 4px;">
                <n-text strong style="font-size: 13px;">线索 {{ idx + 1 }}</n-text>
                <n-checkbox v-model:checked="kp.critical">
                  <n-text type="error" style="font-size: 12px;">必要（critical）</n-text>
                </n-checkbox>
                <n-button size="tiny" type="error" text @click="removeKeyPoint(idx)">删除</n-button>
              </n-space>
              <n-input
                v-model:value="kp.description"
                placeholder="线索描述（如：乘客死亡并被合谋隐瞒）"
                size="small"
                style="margin-bottom: 4px;"
              />
              <n-dynamic-tags v-model:value="kp.keywords" size="small" />
            </div>
          </div>
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="savePuzzle">
            {{ editingId ? '保存' : '创建' }}
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 详情侧边抽屉 -->
    <n-drawer v-model:show="showDetail" :width="480" placement="right">
      <n-drawer-content :title="detailPuzzle?.title ?? '题目详情'" closable>
        <template v-if="detailPuzzle">
          <n-descriptions bordered :column="1" label-placement="left">
            <n-descriptions-item label="ID">
              <n-text code>{{ detailPuzzle.id }}</n-text>
            </n-descriptions-item>
            <n-descriptions-item label="状态">
              <n-tag :type="stateTagType(detailPuzzle.state)">{{ detailPuzzle.state }}</n-tag>
            </n-descriptions-item>
            <n-descriptions-item label="难度">
              {{ '★'.repeat(detailPuzzle.difficulty) + '☆'.repeat(5 - detailPuzzle.difficulty) }}
            </n-descriptions-item>
            <n-descriptions-item label="标签">
              <n-space>
                <n-tag v-for="t in detailPuzzle.tags" :key="t" size="small">{{ t }}</n-tag>
              </n-space>
            </n-descriptions-item>
            <n-descriptions-item label="汤面">{{ detailPuzzle.surface }}</n-descriptions-item>
            <n-descriptions-item label="真相">{{ detailPuzzle.truth }}</n-descriptions-item>
            <n-descriptions-item v-if="detailPuzzle.hints.length" label="提示">
              <n-list bordered>
                <n-list-item v-for="(h, i) in detailPuzzle.hints" :key="i">{{ i+1}}. {{ h }}</n-list-item>
              </n-list>
            </n-descriptions-item>
            <n-descriptions-item label="关键线索">
              <template v-if="detailPuzzle.keyPoints.length === 0">
                <n-text depth="3">（未提取，点击"提取 metadata"）</n-text>
              </template>
              <n-list v-else bordered>
                <n-list-item v-for="kp in detailPuzzle.keyPoints" :key="kp.id">
                  <n-tag v-if="kp.critical" type="error" size="small" style="margin-right:4px;">critical</n-tag>
                  {{ kp.description }}
                  <n-text depth="3">（{{ kp.keywords.join(', ') }}）</n-text>
                </n-list-item>
              </n-list>
            </n-descriptions-item>
            <n-descriptions-item label="敏感词">
              <n-space v-if="detailPuzzle.sensitiveWords.length">
                <n-tag v-for="w in detailPuzzle.sensitiveWords" :key="w" type="warning" size="small">{{ w }}</n-tag>
              </n-space>
              <n-text v-else depth="3">（未提取）</n-text>
            </n-descriptions-item>
            <n-descriptions-item label="游玩次数">{{ detailPuzzle.playCount }}</n-descriptions-item>
          </n-descriptions>

          <!-- 操作区 -->
          <n-space style="margin-top: 16px;" wrap>
            <n-button
              v-if="detailPuzzle.state === 'draft'"
              type="primary"
              @click="changeState(detailPuzzle.id, 'active')"
            >上架激活</n-button>
            <n-button
              v-if="detailPuzzle.state === 'active'"
              @click="changeState(detailPuzzle.id, 'archived')"
            >归档下架</n-button>
            <n-button
              v-if="detailPuzzle.state === 'active' || detailPuzzle.state === 'draft'"
              @click="openEdit(detailPuzzle)"
            >编辑</n-button>
            <n-button
              :loading="extracting"
              @click="extractMetadata(detailPuzzle.id)"
            >🤖 提取 metadata</n-button>
          </n-space>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>


<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  NButton, NModal, NForm, NFormItem,
  NInput, NInputNumber, NSelect, NRate, NDynamicTags, NDynamicInput,
  NDrawer, NDrawerContent, NDescriptions, NDescriptionsItem,
  NPagination,
  NTag, NText, NList, NListItem, NCheckbox, NSpace,
  useMessage,
} from 'naive-ui'
import { useI18n } from 'vue-i18n'
import DsIcon from '@/components/DsIcon.vue'
import { apiGet, apiPost, apiPut } from '@/api/client'

const { t } = useI18n()


interface KeyPoint {
  id: string
  description: string
  keywords: string[]
  critical: boolean
  weight: number
}

interface Puzzle {
  id: string
  title: string
  surface: string
  truth: string
  hints: string[]
  difficulty: number
  tags: string[]
  expectedMinutes: number | null
  keyPoints: KeyPoint[]
  sensitiveWords: string[]
  state: string
  source: string
  createdBy: string | null
  createdAt: number
  playCount: number
}

const message = useMessage()

const puzzles = ref<Puzzle[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)

const filterState = ref<string | null>(null)
const filterDifficulty = ref<number | null>(null)

// ── 弹窗 ──────────────────────────────────────────────────────────────────────

const showModal = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const formRef = ref()

interface KeyPointDraft {
  description: string
  keywords: string[]
  critical: boolean
  weight: number
}

const defaultForm = () => ({
  title: '',
  surface: '',
  truth: '',
  hints: [] as string[],
  difficulty: 3,
  tags: [] as string[],
  expectedMinutes: null as number | null,
  source: 'admin_input',
  keyPoints: [] as KeyPointDraft[],
})

function addKeyPoint() {
  form.value.keyPoints.push({ description: '', keywords: [], critical: false, weight: 1 })
}

function removeKeyPoint(idx: number) {
  form.value.keyPoints.splice(idx, 1)
}

const form = ref(defaultForm())

// ── 详情抽屉 ──────────────────────────────────────────────────────────────────

const showDetail = ref(false)
const detailPuzzle = ref<Puzzle | null>(null)
const extracting = ref(false)

// ── 选项 ──────────────────────────────────────────────────────────────────────

const stateOptions = computed(() => [
  { label: t('puzzles.states.draft'),           value: 'draft' },
  { label: t('puzzles.states.active'),          value: 'active' },
  { label: t('puzzles.states.archived'),        value: 'archived' },
  { label: t('puzzles.states.rejected'),        value: 'rejected' },
  { label: t('puzzles.states.extractionFailed'), value: 'extraction_failed' },
])

const difficultyOptions = [1, 2, 3, 4, 5].map((n) => ({
  label: '★'.repeat(n) + '☆'.repeat(5 - n),
  value: n,
}))

const sourceOptions = [
  { label: '管理员录入', value: 'admin_input' },
  { label: '原创', value: 'original' },
  { label: '社区投稿', value: 'community' },
  { label: '公开题库', value: 'public_unverified' },
]

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function stateTagType(state: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  return ({ draft: 'info', active: 'success', archived: 'default', rejected: 'error', extraction_failed: 'warning' }[state] ?? 'default') as any
}

// ── 数据加载 ──────────────────────────────────────────────────────────────────

async function loadPuzzles() {
  loading.value = true
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize.value) })
    if (filterState.value) params.set('state', filterState.value)
    if (filterDifficulty.value) params.set('difficulty', String(filterDifficulty.value))

    const result = await apiGet<{ items: Puzzle[]; total: number }>(`/api/admin/puzzles?${params}`)
    puzzles.value = result.items
    total.value = result.total
  } catch (e: any) {
    message.error(`加载失败：${e.message}`)
  } finally {
    loading.value = false
  }
}

function handlePageChange(newPage: number) {
  page.value = newPage
  loadPuzzles()
}

// ── 弹窗操作 ──────────────────────────────────────────────────────────────────

function openCreateModal() {
  editingId.value = null
  form.value = defaultForm()
  showModal.value = true
}

function openEdit(puzzle: Puzzle) {
  editingId.value = puzzle.id
  form.value = {
    title: puzzle.title,
    surface: puzzle.surface,
    truth: puzzle.truth,
    hints: [...puzzle.hints],
    difficulty: puzzle.difficulty,
    tags: [...puzzle.tags],
    expectedMinutes: puzzle.expectedMinutes,
    source: puzzle.source,
    keyPoints: puzzle.keyPoints.map((kp) => ({
      description: kp.description,
      keywords: [...kp.keywords],
      critical: kp.critical,
      weight: kp.weight,
    })),
  }
  showModal.value = true
}

async function savePuzzle() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    // keyPoints 需要 id 字段（如果用户手动填写了）
    const kpWithIds = form.value.keyPoints
      .filter((kp) => kp.description.trim())
      .map((kp, i) => ({
        id: `kp${i + 1}`,
        description: kp.description.trim(),
        keywords: kp.keywords,
        critical: kp.critical,
        weight: kp.weight,
      }))

    const payload = {
      ...form.value,
      keyPoints: kpWithIds.length > 0 ? kpWithIds : undefined,
    }

    if (editingId.value) {
      await apiPut(`/api/admin/puzzles/${editingId.value}`, payload)
      message.success('保存成功')
    } else {
      await apiPost('/api/admin/puzzles', payload)
      message.success('创建成功')
    }
    showModal.value = false
    await loadPuzzles()
  } catch (e: any) {
    message.error(`操作失败：${e.message}`)
  } finally {
    saving.value = false
  }
}

// ── 详情抽屉 ──────────────────────────────────────────────────────────────────

function openDetail(puzzle: Puzzle) {
  detailPuzzle.value = puzzle
  showDetail.value = true
}

async function changeState(id: string, state: string) {
  try {
    const updated = await apiPost<Puzzle>(`/api/admin/puzzles/${id}/state`, { state })
    message.success(`状态已切换为 ${state}`)
    // 更新列表和详情
    const idx = puzzles.value.findIndex((p) => p.id === id)
    if (idx !== -1) puzzles.value[idx] = updated
    if (detailPuzzle.value?.id === id) detailPuzzle.value = updated
  } catch (e: any) {
    message.error(`切换失败：${e.message}`)
  }
}

async function extractMetadata(id: string) {
  extracting.value = true
  try {
    const updated = await apiPost<Puzzle>(`/api/admin/puzzles/${id}/extract`, {})
    message.success(`metadata 提取成功（${updated.keyPoints?.length ?? 0} 个关键线索）`)
    const idx = puzzles.value.findIndex((p) => p.id === id)
    if (idx !== -1) puzzles.value[idx] = updated
    if (detailPuzzle.value?.id === id) detailPuzzle.value = updated
  } catch (e: any) {
    message.error(`提取失败：${e.message}`)
  } finally {
    extracting.value = false
  }
}

// ── 初始化 ────────────────────────────────────────────────────────────────────

onMounted(() => loadPuzzles())
</script>

<style scoped>
.kp-card {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.03);
}
</style>
