<template>
  <div>
    <!-- 头部操作栏 -->
    <n-space justify="space-between" align="center" style="margin-bottom: 16px;">
      <n-space>
        <n-select
          v-model:value="filterState"
          :options="stateOptions"
          placeholder="状态筛选"
          clearable
          style="width: 120px;"
          @update:value="loadPuzzles"
        />
        <n-select
          v-model:value="filterDifficulty"
          :options="difficultyOptions"
          placeholder="难度筛选"
          clearable
          style="width: 120px;"
          @update:value="loadPuzzles"
        />
        <n-button @click="loadPuzzles">刷新</n-button>
      </n-space>
      <n-button type="primary" @click="openCreateModal">
        + 新建题目
      </n-button>
    </n-space>

    <!-- 题目列表 -->
    <n-data-table
      :columns="columns"
      :data="puzzles"
      :loading="loading"
      :pagination="{ page, pageSize, itemCount: total, onUpdatePage: handlePageChange }"
      striped
    />

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
import { ref, h, onMounted } from 'vue'
import {
  NButton, NSpace, NDataTable, NModal, NForm, NFormItem,
  NInput, NInputNumber, NSelect, NRate, NDynamicTags, NDynamicInput,
  NDrawer, NDrawerContent, NDescriptions, NDescriptionsItem,
  NTag, NText, NList, NListItem,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { apiGet, apiPost, apiPut } from '@/api/client'

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

const defaultForm = () => ({
  title: '',
  surface: '',
  truth: '',
  hints: [] as string[],
  difficulty: 3,
  tags: [] as string[],
  expectedMinutes: null as number | null,
  source: 'admin_input',
})

const form = ref(defaultForm())

// ── 详情抽屉 ──────────────────────────────────────────────────────────────────

const showDetail = ref(false)
const detailPuzzle = ref<Puzzle | null>(null)
const extracting = ref(false)

// ── 选项 ──────────────────────────────────────────────────────────────────────

const stateOptions = [
  { label: '草稿', value: 'draft' },
  { label: '激活', value: 'active' },
  { label: '归档', value: 'archived' },
  { label: '拒绝', value: 'rejected' },
  { label: '提取失败', value: 'extraction_failed' },
]

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

// ── 表格列 ────────────────────────────────────────────────────────────────────

const columns: DataTableColumns<Puzzle> = [
  {
    title: '标题',
    key: 'title',
    render: (row) => h(
      NButton,
      { text: true, onClick: () => openDetail(row) },
      { default: () => row.title },
    ),
  },
  {
    title: '难度',
    key: 'difficulty',
    width: 100,
    render: (row) => '★'.repeat(row.difficulty) + '☆'.repeat(5 - row.difficulty),
  },
  {
    title: '标签',
    key: 'tags',
    render: (row) =>
      h(NSpace, {}, {
        default: () => row.tags.slice(0, 3).map((t) => h(NTag, { size: 'small' }, { default: () => t })),
      }),
  },
  {
    title: '状态',
    key: 'state',
    width: 90,
    render: (row) => h(NTag, { type: stateTagType(row.state), size: 'small' }, { default: () => row.state }),
  },
  {
    title: '关键线索',
    key: 'keyPoints',
    width: 80,
    render: (row) => row.keyPoints.length > 0 ? `${row.keyPoints.length}个` : h(NText, { depth: 3 }, { default: () => '未提取' }),
  },
  {
    title: '游玩次数',
    key: 'playCount',
    width: 80,
  },
  {
    title: '操作',
    key: 'actions',
    width: 160,
    render: (row) =>
      h(NSpace, {}, {
        default: () => [
          h(NButton, { size: 'small', onClick: () => openEdit(row) }, { default: () => '编辑' }),
          row.state === 'draft'
            ? h(NButton, { size: 'small', type: 'primary', onClick: () => changeState(row.id, 'active') }, { default: () => '上架' })
            : row.state === 'active'
              ? h(NButton, { size: 'small', onClick: () => changeState(row.id, 'archived') }, { default: () => '归档' })
              : null,
        ].filter(Boolean),
      }),
  },
]

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function stateTagType(state: string): 'default' | 'info' | 'success' | 'warning' | 'error' {
  return { draft: 'info', active: 'success', archived: 'default', rejected: 'error', extraction_failed: 'warning' }[state] as any ?? 'default'
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
    if (editingId.value) {
      await apiPut(`/api/admin/puzzles/${editingId.value}`, form.value)
      message.success('保存成功')
    } else {
      await apiPost('/api/admin/puzzles', form.value)
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
