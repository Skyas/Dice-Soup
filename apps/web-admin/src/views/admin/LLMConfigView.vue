<template>
  <div class="page">
    <!-- Header -->
    <div class="page-head">
      <div>
        <h1 class="page-title"><span class="accent-line" />{{ t('llmConfig.title') }}</h1>
        <p class="page-sub">{{ t('llmConfig.sub') }}</p>
      </div>
      <div class="page-head-actions">
        <button class="btn" :disabled="loading" @click="loadAll">
          <DsIcon name="refresh" :size="13" /> {{ t('common.refresh') }}
        </button>
        <button class="btn" style="color:var(--warning); border-color:var(--warning-soft);" @click="restartModal.show = true">
          <DsIcon name="refresh" :size="13" /> {{ t('llmConfig.restart.btn') }}
        </button>
      </div>
    </div>

    <div v-if="loading" style="text-align:center; padding:40px; color:var(--fg-muted);">
      <DsIcon name="clock" :size="24" style="opacity:0.4; display:block; margin:0 auto 8px;" />
      {{ t('common.loading') }}
    </div>

    <!-- ── 重启 overlay ───────────────────────────────────────── -->
    <div v-if="restartState !== 'idle'" class="restart-overlay">
      <div class="restart-box">
        <div class="restart-spinner" />
        <div class="restart-label">
          <span v-if="restartState === 'triggering'">{{ t('llmConfig.restart.triggering') }}</span>
          <span v-else-if="restartState === 'waiting'">{{ t('llmConfig.restart.waiting') }}</span>
          <span v-else-if="restartState === 'reconnecting'">{{ t('llmConfig.restart.reconnecting', { s: reconnectSeconds }) }}</span>
        </div>
      </div>
    </div>

    <template v-else>
      <!-- ── Provider 配置 ─────────────────────────────────────── -->
      <div class="ds-card flush">
        <div class="ds-card-head">
          <DsIcon name="lightning" :size="15" style="color:var(--accent);" />
          <div class="title">{{ t('llmConfig.providers.title') }}</div>
          <div class="sub">{{ t('llmConfig.providers.sub') }}</div>
          <div class="spacer" />
          <button class="btn primary" style="padding:4px 12px; font-size:12px;" @click="openAddProvider">
            + {{ t('llmConfig.providers.add') }}
          </button>
        </div>

        <!-- Default provider selector -->
        <div class="default-row">
          <div style="flex:1;">
            <div style="font-size:13px; font-weight:500; color:var(--fg-primary);">{{ t('llmConfig.providers.defaultLabel') }}</div>
            <div style="font-size:11px; color:var(--fg-muted); font-family:var(--font-mono); margin-top:2px;">llm.default_provider</div>
          </div>
          <n-select
            v-model:value="defaultProvider"
            :options="providerSelectOptions"
            size="small"
            style="width:180px;"
            @update:value="saveDefaultProvider"
          />
        </div>

        <!-- Provider list -->
        <div v-if="providers.length === 0" style="padding:28px; text-align:center; color:var(--fg-muted); font-size:13px;">
          {{ t('llmConfig.providers.empty') }}
        </div>
        <div
          v-for="p in providers"
          :key="p.id"
          class="provider-row"
          :class="{ 'is-default': defaultProvider === p.id }"
        >
          <!-- Icon -->
          <div class="provider-icon-wrap">
            <DsIcon name="bot" :size="16" />
          </div>

          <!-- Name + ID -->
          <div style="width:140px; flex-shrink:0;">
            <div style="font-size:13px; font-weight:600; color:var(--fg-primary); display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              {{ p.name }}
              <span v-if="defaultProvider === p.id" class="state-badge active" style="font-size:10px;">{{ t('llmConfig.providers.isDefault') }}</span>
              <span v-if="!p.enabled" class="state-badge archived" style="font-size:10px;">disabled</span>
            </div>
            <div style="font-size:11px; color:var(--fg-faint); font-family:var(--font-mono); margin-top:1px;">{{ p.id }}</div>
          </div>

          <!-- Models -->
          <div style="flex:1; font-size:11.5px; color:var(--fg-muted); min-width:0;">
            <span style="color:var(--fg-faint);">{{ t('llmConfig.providers.models') }}：</span>
            <span v-for="m in p.models" :key="m" class="card-tag" style="margin-right:4px;">{{ m }}</span>
          </div>

          <!-- API Key status -->
          <div class="key-status" :class="maskedKeys[p.id] ? 'has-key' : 'no-key'">
            <DsIcon :name="maskedKeys[p.id] ? 'shield' : 'warning'" :size="12" />
            <span v-if="maskedKeys[p.id]">{{ maskedKeys[p.id] }}</span>
            <span v-else>{{ t('llmConfig.providers.apiKeyNotSet') }}</span>
          </div>

          <!-- Actions -->
          <div style="display:flex; gap:6px; flex-shrink:0;">
            <button class="btn" style="padding:3px 10px; font-size:12px;" @click="openSetKey(p)">
              {{ t('llmConfig.providers.setKey') }}
            </button>
            <button class="btn" style="padding:3px 10px; font-size:12px;" @click="openEditProvider(p)">{{ t('common.edit') }}</button>
            <button class="btn" style="padding:3px 10px; font-size:12px; color:var(--danger); border-color:var(--danger-soft);" @click="openDeleteConfirm(p.id)">{{ t('common.delete') }}</button>
          </div>
        </div>
      </div>

      <!-- ── 任务路由 ──────────────────────────────────────────── -->
      <div class="ds-card flush">
        <div class="ds-card-head">
          <DsIcon name="stats" :size="15" style="color:var(--accent);" />
          <div class="title">{{ t('llmConfig.routing.title') }}</div>
          <div class="sub">{{ t('llmConfig.routing.sub') }}</div>
          <div class="spacer" />
          <button class="btn primary" style="padding:4px 12px; font-size:12px;" @click="saveAllRouting">
            {{ t('llmConfig.routing.saveAll') }}
          </button>
        </div>

        <div style="padding:0 0 8px;">
          <div
            v-for="task in TASK_TYPES"
            :key="task"
            class="routing-row"
          >
            <div class="routing-task">
              <div class="routing-task-name">{{ t(`llmConfig.tasks.${task}`) }}</div>
              <div class="routing-task-key">{{ task }}</div>
            </div>
            <div class="routing-desc">{{ t(`llmConfig.taskDescs.${task}`) }}</div>
            <div class="routing-model">
              <n-input
                v-model:value="taskRouting[task]"
                size="small"
                :placeholder="t('llmConfig.routing.placeholder')"
                style="width:200px;"
              />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ── Set API Key Modal ───────────────────────────────────── -->
    <n-modal v-model:show="keyModal.show" preset="dialog" :title="t('llmConfig.providers.keyModalTitle', { name: keyModal.providerName })" style="width:480px;">
      <div style="margin-bottom:12px; font-size:12.5px; color:var(--fg-muted);">
        <span v-if="keyModal.currentMasked" style="display:flex; align-items:center; gap:6px;">
          <DsIcon name="shield" :size="13" style="color:var(--success);" />
          当前：{{ keyModal.currentMasked }}
        </span>
        <span v-else style="display:flex; align-items:center; gap:6px; color:var(--warning);">
          <DsIcon name="warning" :size="13" />
          {{ t('llmConfig.providers.apiKeyNotSet') }}
        </span>
      </div>
      <n-form label-placement="top">
        <n-form-item :label="t('llmConfig.providers.keyField')">
          <n-input
            v-model:value="keyModal.apiKey"
            type="password"
            show-password-on="click"
            :placeholder="t('llmConfig.providers.keyPlaceholder')"
            style="font-family:var(--font-mono);"
          />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button v-if="keyModal.currentMasked" style="color:var(--danger);" @click="deleteKey(keyModal.providerId)">
          {{ t('common.delete') }}
        </n-button>
        <n-button @click="keyModal.show = false">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="keyModal.saving" :disabled="!keyModal.apiKey" @click="saveKey">{{ t('common.save') }}</n-button>
      </template>
    </n-modal>

    <!-- ── Add / Edit Provider Modal ──────────────────────────── -->
    <n-modal
      v-model:show="providerModal.show"
      preset="dialog"
      :title="providerModal.isEdit ? t('llmConfig.providers.editTitle') : t('llmConfig.providers.addTitle')"
      style="width:520px;"
    >
      <n-form label-placement="top">
        <n-form-item :label="t('llmConfig.providers.form.fieldId')">
          <n-input
            v-model:value="providerModal.form.id"
            :disabled="providerModal.isEdit"
            :placeholder="t('llmConfig.providers.form.idPlaceholder')"
          />
        </n-form-item>
        <n-form-item :label="t('llmConfig.providers.form.fieldName')">
          <n-input v-model:value="providerModal.form.name" :placeholder="t('llmConfig.providers.form.namePlaceholder')" />
        </n-form-item>
        <n-form-item :label="t('llmConfig.providers.form.fieldBaseUrl')">
          <n-input v-model:value="providerModal.form.baseUrl" :placeholder="t('llmConfig.providers.form.baseUrlPlaceholder')" />
        </n-form-item>
        <n-form-item :label="t('llmConfig.providers.form.fieldModels')">
          <n-input v-model:value="providerModal.form.modelsStr" :placeholder="t('llmConfig.providers.form.modelsPlaceholder')" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="providerModal.show = false">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="providerModal.saving" @click="saveProvider">{{ t('common.save') }}</n-button>
      </template>
    </n-modal>

    <!-- ── Delete Confirm Modal ────────────────────────────────── -->
    <n-modal v-model:show="deleteConfirm.show" preset="dialog" type="warning" :title="t('llmConfig.providers.deleteTitle')" style="width:400px;">
      <p style="color:var(--fg-secondary); font-size:13px; margin:0;">
        {{ t('llmConfig.providers.deleteConfirm', { id: deleteConfirm.id }) }}
      </p>
      <template #action>
        <n-button @click="deleteConfirm.show = false">{{ t('common.cancel') }}</n-button>
        <n-button type="error" :loading="deleteConfirm.deleting" @click="doDeleteProvider">{{ t('common.delete') }}</n-button>
      </template>
    </n-modal>

    <!-- ── Restart Server Modal ───────────────────────────────── -->
    <n-modal v-model:show="restartModal.show" preset="dialog" type="warning" :title="t('llmConfig.restart.modalTitle')" style="width:460px;">
      <p style="color:var(--fg-secondary); font-size:13px; margin:0 0 14px;">
        {{ t('llmConfig.restart.modalContent') }}
      </p>
      <n-form label-placement="top">
        <n-form-item :label="t('llmConfig.restart.reasonLabel')">
          <n-input v-model:value="restartModal.reason" :placeholder="t('llmConfig.restart.reasonPlaceholder')" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-button @click="restartModal.show = false">{{ t('common.cancel') }}</n-button>
        <n-button type="warning" :loading="restartModal.loading" @click="doRestart">
          {{ t('llmConfig.restart.confirm') }}
        </n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { NSelect, NInput, NModal, NForm, NFormItem, NButton, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import DsIcon from '@/components/DsIcon.vue'
import { apiGet, apiPut, apiDelete, apiPost } from '@/api/client'

const { t } = useI18n()
const message = useMessage()
const loading = ref(false)

const TASK_TYPES = [
  'soup_judge',
  'soup_restore',
  'puzzle_extract_metadata',
  'intent_parse',
  'dice_nl_parse',
  'game_arbitrate',
  'trpg_narrate',
  'trpg_npc',
  'summary',
] as const

interface Provider {
  id: string
  name: string
  baseUrl: string
  models: string[]
  enabled: boolean
}

const providers     = ref<Provider[]>([])
const defaultProvider = ref('deepseek')
const taskRouting   = ref<Record<string, string>>({})
/** 脱敏后的 API Key 展示值，key = provider id */
const maskedKeys    = ref<Record<string, string>>({})

const providerSelectOptions = computed(() =>
  providers.value.map((p) => ({ label: p.name, value: p.id })),
)

// ── 数据加载 ───────────────────────────────────────────────────
async function loadAll() {
  loading.value = true
  try {
    const [configRes, keysRes] = await Promise.all([
      apiGet<{ items: { key: string; value: unknown }[] }>('/api/admin/config'),
      apiGet<{ keys: Record<string, string> }>('/api/admin/secrets/provider-keys').catch(() => ({ keys: {} })),
    ])

    const items = configRes.items
    const provItem  = items.find((i) => i.key === 'llm.providers')
    const defItem   = items.find((i) => i.key === 'llm.default_provider')
    const routItem  = items.find((i) => i.key === 'llm.task_routing')

    providers.value = (provItem?.value as Provider[]) ?? []
    maskedKeys.value = keysRes.keys ?? {}

    if (defItem) defaultProvider.value = defItem.value as string

    const routing = (routItem?.value as Record<string, string>) ?? {}
    const merged: Record<string, string> = {}
    for (const task of TASK_TYPES) {
      merged[task] = routing[task] ?? 'deepseek-v4-flash'
    }
    taskRouting.value = merged
  } catch (err: any) {
    message.error(t('llmConfig.messages.loadError', { msg: err.message }))
  } finally {
    loading.value = false
  }
}

async function saveDefaultProvider(val: string) {
  try {
    await apiPut('/api/admin/config/llm.default_provider', { value: val })
    message.success(t('llmConfig.messages.defaultSuccess', { id: val }))
  } catch (err: any) {
    message.error(t('llmConfig.messages.defaultError', { msg: err.message }))
  }
}

async function saveAllRouting() {
  try {
    await apiPut('/api/admin/config/llm.task_routing', { value: { ...taskRouting.value } })
    message.success(t('llmConfig.routing.saveAllSuccess'))
  } catch (err: any) {
    message.error(t('llmConfig.routing.error', { msg: err.message }))
  }
}

// ── Set API Key Modal ──────────────────────────────────────────
const keyModal = ref({
  show: false,
  providerId: '',
  providerName: '',
  currentMasked: '',
  apiKey: '',
  saving: false,
})

function openSetKey(p: Provider) {
  keyModal.value = {
    show: true,
    providerId: p.id,
    providerName: p.name,
    currentMasked: maskedKeys.value[p.id] ?? '',
    apiKey: '',
    saving: false,
  }
}

async function saveKey() {
  const { providerId, providerName, apiKey } = keyModal.value
  if (!apiKey.trim()) return
  keyModal.value.saving = true
  try {
    await apiPut(`/api/admin/secrets/provider-keys/${encodeURIComponent(providerId)}`, { apiKey: apiKey.trim() })
    message.success(t('llmConfig.providers.keySetSuccess', { name: providerName }))
    keyModal.value.show = false
    // 刷新脱敏 key 展示
    const res = await apiGet<{ keys: Record<string, string> }>('/api/admin/secrets/provider-keys')
    maskedKeys.value = res.keys
  } catch (err: any) {
    message.error(t('llmConfig.providers.keyError', { msg: err.message }))
  } finally {
    keyModal.value.saving = false
  }
}

async function deleteKey(providerId: string) {
  const p = providers.value.find((x) => x.id === providerId)
  try {
    await apiDelete(`/api/admin/secrets/provider-keys/${encodeURIComponent(providerId)}`)
    message.success(t('llmConfig.providers.keyDeleteSuccess', { name: p?.name ?? providerId }))
    keyModal.value.show = false
    const res = await apiGet<{ keys: Record<string, string> }>('/api/admin/secrets/provider-keys')
    maskedKeys.value = res.keys
  } catch (err: any) {
    message.error(t('llmConfig.providers.keyError', { msg: err.message }))
  }
}

// ── Provider CRUD ──────────────────────────────────────────────
const EMPTY_FORM = () => ({ id: '', name: '', baseUrl: '', modelsStr: '' })
const providerModal = ref({
  show: false,
  isEdit: false,
  saving: false,
  form: EMPTY_FORM(),
})

function openAddProvider() {
  providerModal.value = { show: true, isEdit: false, saving: false, form: EMPTY_FORM() }
}

function openEditProvider(p: Provider) {
  providerModal.value = {
    show: true,
    isEdit: true,
    saving: false,
    form: { id: p.id, name: p.name, baseUrl: p.baseUrl, modelsStr: p.models.join(',') },
  }
}

async function saveProvider() {
  const f = providerModal.value.form
  if (!f.id.trim() || !f.name.trim()) {
    message.warning('Provider ID 和显示名不能为空')
    return
  }
  const models = f.modelsStr.split(',').map((m) => m.trim()).filter(Boolean)
  const newProvider: Provider = {
    id: f.id.trim(),
    name: f.name.trim(),
    baseUrl: f.baseUrl.trim(),
    models,
    enabled: true,
  }

  let updated: Provider[]
  if (providerModal.value.isEdit) {
    updated = providers.value.map((p) => (p.id === newProvider.id ? newProvider : p))
  } else {
    if (providers.value.some((p) => p.id === newProvider.id)) {
      message.error(`Provider ID「${newProvider.id}」已存在`)
      return
    }
    updated = [...providers.value, newProvider]
  }

  providerModal.value.saving = true
  try {
    await apiPut('/api/admin/config/llm.providers', { value: updated })
    providers.value = updated
    message.success(t('llmConfig.providers.saveSuccess'))
    providerModal.value.show = false
  } catch (err: any) {
    message.error(t('llmConfig.providers.saveError', { msg: err.message }))
  } finally {
    providerModal.value.saving = false
  }
}

const deleteConfirm = ref({ show: false, id: '', deleting: false })

function openDeleteConfirm(id: string) {
  deleteConfirm.value = { show: true, id, deleting: false }
}

async function doDeleteProvider() {
  const id = deleteConfirm.value.id
  const updated = providers.value.filter((p) => p.id !== id)
  deleteConfirm.value.deleting = true
  try {
    await apiPut('/api/admin/config/llm.providers', { value: updated })
    providers.value = updated
    message.success(t('llmConfig.providers.deleteSuccess', { id }))
    deleteConfirm.value.show = false
    if (defaultProvider.value === id && updated.length > 0) {
      defaultProvider.value = updated[0].id
      await saveDefaultProvider(defaultProvider.value)
    }
  } catch (err: any) {
    message.error(t('llmConfig.providers.deleteError', { msg: err.message }))
  } finally {
    deleteConfirm.value.deleting = false
  }
}

// ── Restart Server ─────────────────────────────────────────────
const restartModal = ref({ show: false, reason: '', loading: false })
type RestartState = 'idle' | 'triggering' | 'waiting' | 'reconnecting'
const restartState = ref<RestartState>('idle')
const reconnectSeconds = ref(0)
let reconnectTimer: ReturnType<typeof setInterval> | null = null
let reconnectElapsed = 0
const MAX_WAIT_SECS = 90

function clearReconnectTimer() {
  if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null }
}

async function doRestart() {
  restartModal.value.loading = true
  restartState.value = 'triggering'

  try {
    await apiPost('/api/admin/server/restart', { reason: restartModal.value.reason || undefined })
  } catch {
    // Server exits immediately, fetch may throw — that's expected
  }

  restartModal.value.show = false
  restartModal.value.loading = false
  restartState.value = 'waiting'
  reconnectElapsed = 0
  reconnectSeconds.value = 0

  // Wait 3 seconds before starting to poll (server needs time to exit + restart)
  await new Promise((r) => setTimeout(r, 3000))
  restartState.value = 'reconnecting'

  clearReconnectTimer()
  reconnectTimer = setInterval(async () => {
    reconnectElapsed++
    reconnectSeconds.value = reconnectElapsed

    if (reconnectElapsed > MAX_WAIT_SECS) {
      clearReconnectTimer()
      restartState.value = 'idle'
      message.error(t('llmConfig.restart.failed'))
      return
    }

    try {
      const res = await fetch('/health')
      if (res.ok) {
        clearReconnectTimer()
        restartState.value = 'idle'
        message.success(t('llmConfig.restart.success'))
        await loadAll()
      }
    } catch {
      // still down, keep polling
    }
  }, 1500)
}

onMounted(loadAll)
onUnmounted(clearReconnectTimer)
</script>

<style scoped>
/* ── Restart overlay ── */
.restart-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}
.restart-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 40px 48px;
  background: var(--bg-surface);
  border: 1px solid var(--line-accent);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
}
.restart-spinner {
  width: 44px;
  height: 44px;
  border: 3px solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.restart-label {
  font-size: 14px;
  color: var(--fg-secondary);
  font-family: var(--font-mono);
}

.default-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 14px;
  padding: 10px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
}

.provider-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-top: 1px solid var(--line);
  transition: background 120ms;
}
.provider-row:hover { background: var(--bg-hover); }
.provider-row.is-default { background: var(--accent-soft); }

.provider-icon-wrap {
  width: 30px;
  height: 30px;
  border-radius: var(--r-sm);
  background: var(--accent-soft);
  color: var(--accent);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.key-status {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 4px;
  font-size: 11px;
  font-family: var(--font-mono);
  flex-shrink: 0;
  white-space: nowrap;
}
.key-status.has-key {
  background: var(--success-soft);
  color: var(--success);
}
.key-status.no-key {
  background: var(--warning-soft);
  color: var(--warning);
}

.routing-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  transition: background 120ms;
}
.routing-row:last-child { border-bottom: 0; }
.routing-row:hover { background: var(--bg-hover); }

.routing-task { width: 130px; flex-shrink: 0; }
.routing-task-name { font-size: 13px; font-weight: 500; color: var(--fg-primary); }
.routing-task-key  { font-size: 10.5px; color: var(--fg-faint); font-family: var(--font-mono); margin-top: 1px; }

.routing-desc { flex: 1; font-size: 12px; color: var(--fg-muted); }
.routing-model { flex-shrink: 0; }
</style>
