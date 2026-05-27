<template>
  <div class="prompts-shell">

    <!-- ── Top bar ─────────────────────────────────────────────── -->
    <div class="prompts-topbar">
      <div class="topbar-left">
        <h1 class="topbar-title"><span class="accent-line" />Prompt 调试</h1>
        <p class="topbar-sub">编辑 · 查看占位符 · 恢复默认</p>
      </div>
      <div class="topbar-actions" v-if="current">
        <button class="btn" style="gap:5px;" @click="fetchPrompts" :disabled="loading">
          <DsIcon name="refresh" :size="13" />刷新
        </button>
        <button
          class="btn"
          :disabled="current.saving || !getDefault(current.key) || current.savedValue === getDefault(current.key)"
          @click="resetToDefault(current)"
        >
          恢复默认
        </button>
        <button
          class="btn btn-accent"
          :disabled="current.saving || current.value === current.savedValue"
          @click="savePrompt(current)"
        >
          {{ current.saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>

    <!-- ── Three-column layout ───────────────────────────────────── -->
    <div class="prompts-layout">

      <!-- Left: module list -->
      <aside class="prompts-sidebar">
        <template v-for="mod in MODULE_DEFS" :key="mod.id">
          <!-- Group header -->
          <div class="sidebar-group-label">
            {{ mod.label }}
            <span v-if="mod.soon" class="badge-soon">soon</span>
          </div>

          <!-- Items in this module -->
          <div
            v-for="item in mod.items"
            :key="item.key ?? item.label"
            class="sidebar-item"
            :class="{
              active:   current?.key === item.key,
              soon:     mod.soon || !item.key,
            }"
            @click="item.key && !mod.soon && selectByKey(item.key)"
          >
            <span
              class="sidebar-dot"
              :class="item.key ? {
                'dot-custom': promptByKey(item.key)?.savedValue !== getDefault(item.key) && !!getDefault(item.key),
                'dot-dirty':  promptByKey(item.key)?.value !== promptByKey(item.key)?.savedValue,
              } : 'dot-placeholder'"
            />
            <div class="sidebar-text">
              <div class="sidebar-name">{{ item.label }}</div>
              <div class="sidebar-sub">{{ item.key ?? '敬请期待' }}</div>
            </div>
            <span
              v-if="item.key && promptByKey(item.key)?.value !== promptByKey(item.key)?.savedValue"
              class="sidebar-unsaved"
              title="有未保存更改"
            />
          </div>
        </template>
      </aside>

      <!-- Center: editor -->
      <div class="prompts-center">
        <template v-if="current">
          <!-- Editor header -->
          <div class="editor-head">
            <div class="editor-head-left">
              <span class="editor-module">{{ PROMPT_META[current.key]?.label }}</span>
              <span
                class="editor-badge"
                :class="current.savedValue === getDefault(current.key) ? 'badge-default' : 'badge-custom'"
              >
                {{ current.savedValue === getDefault(current.key) ? '默认' : '已自定义' }}
              </span>
            </div>
            <div class="editor-head-right">
              <span class="editor-stats">字符 {{ currentCharCount }} · ~{{ currentTokenEst }} tok</span>
            </div>
          </div>

          <!-- Textarea -->
          <textarea
            v-model="current.value"
            class="editor-textarea"
            spellcheck="false"
            :placeholder="'在此输入 ' + (PROMPT_META[current.key]?.label ?? '') + ' 指令…'"
            @keydown.ctrl.s.prevent="savePrompt(current)"
            @keydown.meta.s.prevent="savePrompt(current)"
          />

          <!-- Editor footer -->
          <div class="editor-foot">
            <div class="foot-vars" v-if="currentVars.length">
              <span class="foot-label">变量</span>
              <code v-for="v in currentVars" :key="v" class="foot-var">{{ v }}</code>
            </div>
            <div class="foot-right">
              <span v-if="current.value !== current.savedValue" class="status-unsaved">
                <span class="dot-blink" />未保存
              </span>
              <span v-else class="status-saved">✓ 已同步</span>
            </div>
          </div>
        </template>

        <!-- Empty / placeholder state -->
        <div v-else class="editor-empty">
          <DsIcon name="prompt" :size="36" style="opacity:0.15; display:block; margin:0 auto 12px;" />
          <span>{{ loading ? '加载中…' : '从左侧选择模块' }}</span>
        </div>
      </div>

      <!-- Right: context panel -->
      <aside class="prompts-context" v-if="current">

        <div class="ctx-block">
          <div class="ctx-block-title">模块说明</div>
          <p class="ctx-block-body">{{ PROMPT_META[current.key]?.description }}</p>
        </div>

        <div class="ctx-block" v-if="PROMPT_META[current.key]?.xmlNote">
          <div class="ctx-block-title">注入方式</div>
          <p class="ctx-block-body">{{ PROMPT_META[current.key].xmlNote }}</p>
        </div>

        <div class="ctx-block" v-if="currentVars.length">
          <div class="ctx-block-title">占位符说明</div>
          <div v-for="v in currentVars" :key="v" class="ctx-var-row">
            <code class="ctx-var-chip">{{ v }}</code>
            <span class="ctx-var-desc">{{ PLACEHOLDER_DESC[v] ?? '' }}</span>
          </div>
        </div>

        <div class="ctx-block" v-if="PROMPT_META[current.key]?.hint">
          <div class="ctx-block-title">调优提示</div>
          <p class="ctx-block-body ctx-hint">{{ PROMPT_META[current.key].hint }}</p>
        </div>

        <div class="ctx-block ctx-status-block">
          <div class="ctx-block-title">状态</div>
          <div class="ctx-stat-row">
            <span class="ctx-stat-key">版本来源</span>
            <span class="ctx-stat-val" :class="current.savedValue === getDefault(current.key) ? 'val-ok' : 'val-custom'">
              {{ current.savedValue === getDefault(current.key) ? '内置默认' : '管理员自定义' }}
            </span>
          </div>
          <div class="ctx-stat-row" v-if="current.value !== current.savedValue">
            <span class="ctx-stat-key">未保存差异</span>
            <span class="ctx-stat-val val-warn">
              {{ current.value.length > current.savedValue.length ? '+' : '' }}{{ current.value.length - current.savedValue.length }} 字符
            </span>
          </div>
          <div class="ctx-stat-row">
            <span class="ctx-stat-key">保存快捷键</span>
            <code class="ctx-stat-val ctx-kbd">Ctrl+S</code>
          </div>
        </div>

      </aside>

      <!-- Right panel: soon placeholder -->
      <aside class="prompts-context ctx-soon" v-else-if="!loading">
        <div class="ctx-soon-inner">
          <DsIcon name="clock" :size="28" style="opacity:0.2; display:block; margin:0 auto 10px;" />
          <p>该模块尚未开放</p>
          <p class="ctx-soon-sub">对应游戏功能上线后<br>Prompt 将在此处配置</p>
        </div>
      </aside>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import DsIcon from '@/components/DsIcon.vue'
import { apiGet, apiPut } from '@/api/client'

const message = useMessage()

// ── Types ─────────────────────────────────────────────────────────────────────

interface PromptItem {
  key: string
  value: string
  savedValue: string
  description: string
  saving: boolean
}

// ── Module & item definitions (sidebar structure) ─────────────────────────────

interface ModuleItemDef {
  key: string | null   // null = placeholder (not yet in DB)
  label: string
}

interface ModuleDef {
  id: string
  label: string
  soon?: boolean       // true = whole module not yet implemented
  items: ModuleItemDef[]
}

const MODULE_DEFS: ModuleDef[] = [
  {
    id: 'soup',
    label: '海龟汤',
    items: [
      { key: 'soup.prompt.judge',            label: '汤底判定' },
      { key: 'soup.prompt.restore',          label: '还原评判' },
      { key: 'soup.prompt.extract_metadata', label: '元数据提取' },
      { key: 'soup.prompt.summary',          label: '对局总结' },
    ],
  },
  {
    id: 'dice',
    label: '骰子',
    soon: true,
    items: [
      { key: null, label: '指令解析' },
    ],
  },
  {
    id: 'board-game',
    label: '桌游仲裁',
    soon: true,
    items: [
      { key: null, label: '规则仲裁' },
      { key: null, label: '结果播报' },
    ],
  },
  {
    id: 'trpg',
    label: '跑团',
    soon: true,
    items: [
      { key: null, label: '场景叙事' },
      { key: null, label: 'NPC 对话' },
    ],
  },
]

// ── Static metadata ───────────────────────────────────────────────────────────

interface PromptMeta {
  label: string
  description: string
  hint?: string
  xmlNote?: string
}

const PROMPT_META: Record<string, PromptMeta> = {
  'soup.prompt.judge': {
    label: '汤底判定',
    description: '判断玩家提问是 yes / no / partial / irrelevant 的核心规则。此段文本拼接在题目 XML 之后，发送给 LLM。',
    hint: '重点关注 no 与 irrelevant 的区分：只要掌握完整真相可以明确回答"否"，就应判 no 而非 irrelevant。常见误判场景："有人死了吗"（没人死→no）、"他在锻炼吗"（不是→no）。',
    xmlNote: '代码会将 <puzzle> XML（含 surface / truth / key_points）注入在此段文本之前，无需在此重复定义题目格式。',
  },
  'soup.prompt.restore': {
    label: '还原评判',
    description: '评估玩家的还原文本是否通过，计算 coverage 与 key_point 命中情况。',
    hint: 'passed 由代码层双重校验（coverage ≥ 0.7 且所有 critical key_point 全命中）。此 Prompt 主要影响 coverage 的宽严程度。',
    xmlNote: '代码会将 <puzzle> XML（含 key_points 定义）注入在此段文本之前。',
  },
  'soup.prompt.extract_metadata': {
    label: '元数据提取',
    description: '从题目文本中提取 key_points（关键线索）与 sensitive_words（敏感词），在新题目开局时自动调用。',
    hint: '关键点独立性至关重要——每个 key_point 应代表独立认知突破，不可把同一事实拆成两条（如"他是矮子"和"他按不到按钮"应合并为一条）。若两个 key_point 会被同一问题同时命中，必须合并。',
  },
  'soup.prompt.summary': {
    label: '对局总结',
    description: '游戏结束后生成点评文字和高光时刻。使用 {{占位符}} 注入游戏数据，最终作为 system prompt 发送。',
    hint: '点评不超过 100 字，最多 3 个高光时刻，内容须基于真实提问记录，不要让 LLM 编造过程。',
  },
}

const PLACEHOLDER_DESC: Record<string, string> = {
  '{{puzzle_title}}':   '题目标题',
  '{{surface}}':        '汤面（谜面文字）',
  '{{result}}':         '"通关成功" 或 "未通关"',
  '{{duration}}':       '对局用时，如 "12分30秒"',
  '{{score_text}}':     '玩家得分排名文字',
  '{{question_count}}': '本局总提问数',
  '{{question_log}}':   '最近 30 条提问记录（含原文和判定）',
}

// ── State ─────────────────────────────────────────────────────────────────────

const loading    = ref(false)
const prompts    = ref<PromptItem[]>([])
const current    = ref<PromptItem | null>(null)
const codeDefaults = ref<Record<string, string>>({})

// ── Helpers ───────────────────────────────────────────────────────────────────

function promptByKey(key: string | null): PromptItem | undefined {
  if (!key) return undefined
  return prompts.value.find((p) => p.key === key)
}

function selectByKey(key: string) {
  const item = promptByKey(key)
  if (item) current.value = item
}

function getDefault(key: string): string {
  return codeDefaults.value[key] ?? ''
}

// ── Computed ──────────────────────────────────────────────────────────────────

const currentCharCount = computed(() => current.value?.value.length ?? 0)
const currentTokenEst  = computed(() => Math.ceil(currentCharCount.value / 1.3))

const currentVars = computed((): string[] => {
  if (!current.value) return []
  const matches = current.value.value.match(/\{\{(\w+)\}\}/g) ?? []
  return [...new Set(matches)]
})

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchCodeDefaults() {
  try {
    const res = await apiGet<Record<string, string>>('/api/admin/config/prompt-defaults')
    codeDefaults.value = res
  } catch { /* non-fatal */ }
}

async function fetchPrompts() {
  loading.value = true
  try {
    const res = await apiGet<{ items: Array<{ key: string; value: unknown; category: string; description?: string }> }>('/api/admin/config')
    const filtered = res.items.filter((i) => i.category === 'prompt')

    const prev = Object.fromEntries(prompts.value.map((p) => [p.key, p.value]))
    const prevKey = current.value?.key

    prompts.value = filtered.map((i) => {
      const strVal = typeof i.value === 'string' ? i.value : String(i.value ?? '')
      return {
        key:         i.key,
        value:       prev[i.key] ?? strVal,
        savedValue:  strVal,
        description: i.description ?? '',
        saving:      false,
      }
    })

    // Restore or default to first soup item
    if (prevKey) {
      current.value = prompts.value.find((p) => p.key === prevKey) ?? prompts.value[0] ?? null
    } else {
      current.value = prompts.value[0] ?? null
    }
  } catch (err: any) {
    message.error(err.message ?? '加载失败')
  } finally {
    loading.value = false
  }
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function savePrompt(item: PromptItem) {
  item.saving = true
  try {
    await apiPut(`/api/admin/config/${encodeURIComponent(item.key)}`, { value: item.value })
    item.savedValue = item.value
    message.success(`「${PROMPT_META[item.key]?.label ?? item.key}」已保存`)
  } catch (err: any) {
    message.error(err.message ?? '保存失败')
  } finally {
    item.saving = false
  }
}

// ── Reset ─────────────────────────────────────────────────────────────────────

async function resetToDefault(item: PromptItem) {
  const def = getDefault(item.key)
  if (!def) return
  item.value = def
  await savePrompt(item)
}

// ── Init ──────────────────────────────────────────────────────────────────────

onMounted(() => {
  Promise.all([fetchCodeDefaults(), fetchPrompts()])
})
</script>

<style scoped>
/* ── Shell & layout ─────────────────────────────────────────── */

.prompts-shell {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 56px);
  overflow: hidden;
}

.prompts-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 64px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--line);
  background: var(--bg-base);
}

.topbar-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.topbar-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--fg-primary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.topbar-sub {
  font-size: 11.5px;
  color: var(--fg-muted);
  margin: 0;
  padding-left: 18px;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-accent {
  background: var(--accent);
  color: #fff;
  border-color: transparent;
}
.btn-accent:hover:not(:disabled) { opacity: 0.88; }
.btn-accent:disabled { opacity: 0.38; cursor: default; }

.prompts-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 220px 1fr 260px;
  overflow: hidden;
}

/* ── Left sidebar ───────────────────────────────────────────── */

.prompts-sidebar {
  border-right: 1px solid var(--line);
  overflow-y: auto;
  padding: 10px 8px 16px;
  background: var(--bg-elevated);
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.sidebar-group-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--fg-faint);
  padding: 10px 8px 5px;
  margin-top: 4px;
}
.sidebar-group-label:first-child { margin-top: 0; }

.badge-soon {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: .04em;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--bg-hover);
  color: var(--fg-faint);
  border: 1px solid var(--line);
  text-transform: lowercase;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: var(--r-md);
  cursor: pointer;
  transition: background 120ms, color 120ms;
  position: relative;
}
.sidebar-item:hover:not(.soon) { background: var(--bg-hover); }
.sidebar-item.active {
  background: var(--accent-soft);
}
.sidebar-item.soon {
  cursor: default;
  opacity: 0.45;
}

.sidebar-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--fg-faint);
  transition: background 150ms;
}
.sidebar-item.active .sidebar-dot { background: var(--accent); }
.dot-custom      { background: var(--warning, #d97706); }
.dot-dirty       { background: var(--accent); animation: pulse 1.4s ease-in-out infinite; }
.dot-placeholder { background: var(--line); }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}

.sidebar-text { flex: 1; min-width: 0; }

.sidebar-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--fg-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sidebar-item.active .sidebar-name { color: var(--accent); }
.sidebar-item.soon .sidebar-name   { color: var(--fg-muted); }

.sidebar-sub {
  font-size: 10.5px;
  color: var(--fg-faint);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-unsaved {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}

/* ── Center editor ──────────────────────────────────────────── */

.prompts-center {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-base);
}

.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
  background: var(--bg-elevated);
  gap: 12px;
}

.editor-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.editor-module {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--fg-primary);
}

.editor-badge {
  font-size: 10.5px;
  padding: 1px 7px;
  border-radius: 10px;
  font-weight: 500;
}
.badge-default {
  background: var(--bg-elevated);
  color: var(--fg-muted);
  border: 1px solid var(--line);
}
.badge-custom {
  background: rgba(217, 119, 6, 0.1);
  color: var(--warning, #d97706);
  border: 1px solid rgba(217, 119, 6, 0.25);
}

.editor-stats {
  font-size: 11.5px;
  color: var(--fg-faint);
  font-family: var(--font-mono);
}

.editor-textarea {
  flex: 1;
  width: 100%;
  box-sizing: border-box;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--fg-primary);
  background: var(--bg-base);
  border: none;
  outline: none;
  resize: none;
  padding: 16px 18px;
  transition: background 120ms;
}
.editor-textarea:focus { background: var(--bg-elevated); }

.editor-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 14px;
  border-top: 1px solid var(--line);
  background: var(--bg-elevated);
  flex-shrink: 0;
  gap: 8px;
  min-height: 36px;
}

.foot-vars {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.foot-label {
  font-size: 10.5px;
  color: var(--fg-faint);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: .05em;
}

.foot-var {
  font-family: var(--font-mono);
  font-size: 10.5px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent);
  border: 1px solid rgba(99, 102, 241, 0.2);
}

.foot-right { flex-shrink: 0; }

.status-unsaved {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--warning, #d97706);
}
.dot-blink {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--warning, #d97706);
  display: inline-block;
  animation: pulse 1.2s ease-in-out infinite;
}
.status-saved {
  font-size: 11.5px;
  color: var(--success, #16a34a);
}

.editor-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--fg-muted);
  font-size: 13px;
  gap: 4px;
}

/* ── Right context panel ────────────────────────────────────── */

.prompts-context {
  border-left: 1px solid var(--line);
  overflow-y: auto;
  background: var(--bg-elevated);
  display: flex;
  flex-direction: column;
}

.ctx-block {
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
}
.ctx-block:last-child { border-bottom: none; }

.ctx-block-title {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--fg-faint);
  margin-bottom: 7px;
}

.ctx-block-body {
  font-size: 12px;
  color: var(--fg-muted);
  line-height: 1.6;
  margin: 0;
}

.ctx-hint { font-style: italic; }

.ctx-var-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 7px;
}
.ctx-var-row:last-child { margin-bottom: 0; }

.ctx-var-chip {
  font-family: var(--font-mono);
  font-size: 10.5px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent);
  flex-shrink: 0;
  white-space: nowrap;
}

.ctx-var-desc {
  font-size: 11.5px;
  color: var(--fg-muted);
  line-height: 1.5;
  padding-top: 2px;
}

.ctx-status-block { background: var(--bg-base); }

.ctx-stat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.ctx-stat-row:last-child { margin-bottom: 0; }

.ctx-stat-key { font-size: 11.5px; color: var(--fg-muted); }
.ctx-stat-val { font-size: 11.5px; font-weight: 500; }
.val-ok     { color: var(--success, #16a34a); }
.val-custom { color: var(--warning, #d97706); }
.val-warn   { color: var(--accent); }

.ctx-kbd {
  font-family: var(--font-mono);
  font-size: 10.5px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  color: var(--fg-muted);
}

/* ── Soon placeholder (right panel) ────────────────────────── */

.ctx-soon {
  border-left: 1px solid var(--line);
  background: var(--bg-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ctx-soon-inner {
  text-align: center;
  padding: 24px 20px;
}

.ctx-soon-inner p {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--fg-muted);
}

.ctx-soon-sub {
  font-size: 11.5px !important;
  color: var(--fg-faint) !important;
  line-height: 1.6;
}
</style>
